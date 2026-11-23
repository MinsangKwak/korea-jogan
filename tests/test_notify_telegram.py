"""텔레그램 알림이 새로 공개한 호에만, 설정이 있을 때만 나가고 실패해도 발행을 막지 않는지 본다."""
from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend-python/pipeline" / "publish"))

import notify_telegram  # noqa: E402

DATE = "2026-11-17"
ENV = {"TELEGRAM_BOT_TOKEN": "123:SECRET", "TELEGRAM_CHAT_ID": "@jogan"}


def issue(status="published", auto=True):
    data = {
        "date": DATE, "status": status,
        "lead": {"headline": "코스피 3%대 하락", "standfirst": "첫 문단입니다.\n\n둘째 문단입니다."},
        "briefs": [{"k": f"숫자 {i}", "m": "설명"} for i in range(6)],
        "nums": [{"k": f"지표 {i}", "v": str(i), "d": "−1"} for i in range(6)],
    }
    if status != "draft":
        data["review"] = {"auto": auto}
    return data


class Response:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class NotifyTest(unittest.TestCase):
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
        folder = self.root / notify_telegram.ISSUES
        folder.mkdir(parents=True, exist_ok=True)
        if data is not None:
            (folder / f"{data['date']}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        (folder / "index.json").write_text(json.dumps({"latest": latest, "issues": [latest]}), encoding="utf-8")
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", "c")
        return self.git("rev-parse", "HEAD")

    def opener(self, request, timeout=0):
        self.requests.append(request)
        return Response()

    def run_once(self, before, after, env=ENV, opener=None):
        return notify_telegram.run(before, after, root=self.root, env=env, opener=opener or self.opener, pause=lambda _: None, wait=0)

    def sent(self):
        return [r for r in self.requests if r.get_method() == "POST"]

    def test_message_is_short_and_keeps_headline_link_and_review_state(self):
        text = notify_telegram.message(issue())
        self.assertIn("대한민국 조간 · 11월 17일(화)", text)
        self.assertIn("코스피 3%대 하락", text)
        self.assertIn("첫 문단입니다.", text)
        self.assertNotIn("둘째 문단", text)
        self.assertEqual(text.count("· 숫자"), notify_telegram.BRIEFS)
        self.assertEqual(text.count("· 지표"), notify_telegram.NUMS)
        self.assertIn("https://korea-jogan.com/2026-11-17?utm_source=telegram&utm_medium=social&utm_campaign=202611_readership", text)
        self.assertIn("자동 발행 · 사람의 원문 확인 전", text)
        self.assertNotIn("사람의 원문 확인 전", notify_telegram.message(issue(auto=False)))
        long = issue()
        long["lead"]["standfirst"] = "가" * 5000
        cut = notify_telegram.message(long)
        self.assertLessEqual(len(cut), notify_telegram.LIMIT)
        self.assertIn("전체 읽기: https://korea-jogan.com/2026-11-17", cut)

    def test_sends_once_when_draft_becomes_public(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())
        self.assertIn("전송", self.run_once(before, after))
        posts = self.sent()
        self.assertEqual(len(posts), 1)
        body = urllib.parse.parse_qs(posts[0].data.decode("utf-8"))
        self.assertEqual(body["chat_id"], ["@jogan"])
        self.assertIn("코스피 3%대 하락", body["text"][0])
        self.assertIn("123:SECRET", posts[0].full_url)

    def test_sends_when_issue_file_is_new(self):
        before = self.commit(None, latest="2026-11-16")
        after = self.commit(issue())
        self.assertIn("전송", self.run_once(before, after))

    def test_skips_recheck_runs_drafts_and_missing_settings(self):
        public = self.commit(issue())
        self.assertIn("건너뜀", self.run_once(public, public))
        draft = self.commit(issue("draft"))
        self.assertIn("건너뜀", self.run_once(public, draft))
        self.assertEqual(self.sent(), [])
        first = self.commit(issue("draft"))
        second = self.commit(issue())
        for env in ({}, {"TELEGRAM_BOT_TOKEN": "x"}, {"TELEGRAM_CHAT_ID": "@jogan"}):
            self.assertIn("설정이 없어", self.run_once(first, second, env=env))
        self.assertEqual(self.requests, [])

    def test_does_not_send_before_the_public_page_opens(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())

        def closed(request, timeout=0):
            self.requests.append(request)
            if request.get_method() == "HEAD":
                raise urllib.error.HTTPError(request.full_url, 404, "Not Found", {}, io.BytesIO())
            return Response()

        self.assertIn("보내지 않음", self.run_once(before, after, opener=closed))
        self.assertEqual(self.sent(), [])

    def test_failure_never_raises_or_prints_the_token(self):
        before = self.commit(issue("draft"))
        after = self.commit(issue())

        def broken(request, timeout=0):
            if request.get_method() == "HEAD":
                return Response()
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, io.BytesIO())

        out = io.StringIO()
        saved, sys.stdout = sys.stdout, out
        try:
            result = self.run_once(before, after, opener=broken)
            self.assertEqual(notify_telegram.main(["--before", "no-such-ref", "--after", "no-such-ref"]), 0)
        finally:
            sys.stdout = saved
        self.assertIn("실패", result)
        self.assertNotIn("SECRET", out.getvalue() + result)


if __name__ == "__main__":
    unittest.main()
