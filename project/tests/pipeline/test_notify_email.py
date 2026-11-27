"""이메일 발송이 새로 공개한 호에만, 키가 있을 때만 나가고 실패해도 발행을 막지 않는지 본다. 실제 메일은 보내지 않는다."""
from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend-python/pipeline" / "publish"))
sys.path.insert(0, str(REPO / "backend-python/pipeline" / "build"))

import notify_email  # noqa: E402
import reader_panel  # noqa: E402

DATE = "2026-11-17"
ENV = {"BUTTONDOWN_API_KEY": "bd-SECRET"}


def issue(status="published", auto=True):
    data = {
        "date": DATE, "status": status,
        "lead": {"headline": "코스피 <3%> 하락", "standfirst": "첫 문단입니다.\n\n둘째 문단입니다."},
        "briefs": [{"k": f"숫자 {i}", "m": "설명"} for i in range(8)],
        "nums": [{"k": f"지표 {i}", "v": str(i), "d": "−1"} for i in range(6)],
        "national": {"items": [{"title": f"전국 기사 {i}", "outlet": "언론사", "url": f"https://news.example/{i}"} for i in range(8)]
                     + [{"title": "위험 링크", "url": "javascript:alert(1)"}]},
    }
    if status != "draft":
        data["review"] = {"auto": auto}
    return data


class Response:
    def __init__(self, status=200, payload=b""):
        self.status = status
        self.payload = payload

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class NotifyEmailTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "test")
        self.requests = []

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True, text=True).stdout.strip()

    def commit(self, data, latest=DATE):
        folder = self.root / notify_email.ISSUES
        folder.mkdir(parents=True, exist_ok=True)
        if data is not None:
            (folder / f"{data['date']}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        (folder / "index.json").write_text(json.dumps({"latest": latest, "issues": [latest]}), encoding="utf-8")
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", "c")
        return self.git("rev-parse", "HEAD")

    def opener(self, request, timeout=0):
        self.requests.append(request)
        if request.get_method() == "POST":
            return Response(201, b'{"id": "em_1"}')
        return Response()

    def run_once(self, before, after, env=ENV, opener=None):
        return notify_email.run(before, after, root=self.root, env=env, opener=opener or self.opener, pause=lambda _: None, wait=0)

    def api(self):
        return [r for r in self.requests if r.get_method() in ("POST", "PATCH")]

    def test_subject_and_body_escape_and_limit_content(self):
        self.assertEqual(notify_email.subject(issue()), "[대한민국 조간 11/17(화)] 코스피 <3%> 하락")
        text = notify_email.body(issue())
        self.assertIn("코스피 &lt;3%&gt; 하락", text)
        self.assertNotIn("<3%>", text)
        self.assertIn("첫 문단입니다.", text)
        self.assertNotIn("둘째 문단", text)
        self.assertEqual(text.count("<strong>숫자 "), notify_email.BRIEFS)
        self.assertEqual(text.count("전국 기사 "), notify_email.NATIONAL)
        self.assertNotIn("javascript:", text)
        self.assertIn("https://korea-jogan.com/2026-11-17?utm_source=newsletter&amp;utm_medium=email", text)
        self.assertIn("사람의 원문 확인 전", text)
        self.assertNotIn("사람의 원문 확인 전", notify_email.body(issue(auto=False)))

    def test_creates_draft_then_sends_once_when_issue_becomes_public(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())
        self.assertIn("발송", self.run_once(before, after))
        post, patch = self.api()
        self.assertEqual(post.get_method(), "POST")
        self.assertEqual(post.full_url, notify_email.API)
        self.assertEqual(post.get_header("Authorization"), "Token bd-SECRET")
        payload = json.loads(post.data)
        self.assertEqual(payload["status"], "draft")
        self.assertIn("코스피", payload["subject"])
        self.assertEqual(patch.full_url, notify_email.API + "/em_1")
        self.assertEqual(json.loads(patch.data), {"status": "about_to_send"})

    def test_skips_recheck_runs_drafts_and_missing_key(self):
        public = self.commit(issue())
        self.assertIn("건너뜀", self.run_once(public, public))
        draft = self.commit(issue("draft"))
        self.assertIn("건너뜀", self.run_once(public, draft))
        first = self.commit(issue("draft"))
        second = self.commit(issue())
        self.assertIn("설정이 없어", self.run_once(first, second, env={}))
        self.assertEqual(self.requests, [])

    def test_does_not_send_before_the_public_page_opens(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())

        def closed(request, timeout=0):
            self.requests.append(request)
            raise urllib.error.HTTPError(request.full_url, 404, "Not Found", {}, io.BytesIO())

        self.assertIn("보내지 않음", self.run_once(before, after, opener=closed))
        self.assertEqual(self.api(), [])

    def test_failed_draft_does_not_send_and_never_prints_the_key(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())

        def broken(request, timeout=0):
            self.requests.append(request)
            if request.get_method() == "HEAD":
                return Response()
            raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, io.BytesIO())

        out = io.StringIO()
        saved, sys.stdout = sys.stdout, out
        try:
            result = self.run_once(before, after, opener=broken)
            self.assertEqual(notify_email.main(["--before", "no-such-ref", "--after", "no-such-ref"]), 0)
        finally:
            sys.stdout = saved
        self.assertIn("실패", result)
        self.assertEqual([r.get_method() for r in self.api()], ["POST"])
        self.assertNotIn("SECRET", out.getvalue() + result)


class ReaderPanelTest(unittest.TestCase):
    def test_email_form_appears_only_with_a_valid_username(self):
        plain = reader_panel.markup("https://korea-jogan.com/", newsletter="")
        self.assertNotIn("readerEmail", plain)
        self.assertIn("이메일이나 회원가입 없이 이용합니다.", plain)
        with_form = reader_panel.markup("https://korea-jogan.com/", newsletter="korea-jogan")
        self.assertIn('action="https://buttondown.com/api/emails/embed-subscribe/korea-jogan"', with_form)
        self.assertIn('type="email"', with_form)
        self.assertIn('id="readerFeed"', with_form)
        self.assertEqual(reader_panel.newsletter_name({"NEWSLETTER_USERNAME": "bad\"name"}), "")
        self.assertEqual(reader_panel.newsletter_name({"NEWSLETTER_USERNAME": " korea-jogan "}), "korea-jogan")
        self.assertEqual(reader_panel.newsletter_name({}), "")


if __name__ == "__main__":
    unittest.main()
