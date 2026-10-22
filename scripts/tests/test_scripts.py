"""검사·승인·RSS·ECOS 변환 스크립트를 임시 폴더에서 돌려 본다.

사용: python -m unittest discover -s scripts/tests
"""
from __future__ import annotations

import datetime as dt
import io
import json
import shutil
import sys
import tempfile
import unittest
import xml.dom.minidom
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))

import approve  # noqa: E402
import build_feed  # noqa: E402
import build_tokens  # noqa: E402
import ecos_nums  # noqa: E402
import validate  # noqa: E402

DATE = "2026-10-19"


class Site(unittest.TestCase):
    """지금 호를 임시 폴더로 복사하고 스크립트들이 그 폴더를 보게 한다."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(REPO / "public", self.tmp / "public")
        self.issues = self.tmp / "public" / "data" / "issues"
        # 매일 새 호(초안 포함)가 쌓여도 시험 결과가 바뀌지 않게, 목록을 기준 호 하나로 고정한다
        (self.issues / "index.json").write_text(json.dumps({"latest": DATE, "issues": [DATE]}), encoding="utf-8")
        self.saved = (validate.ROOT, validate.ISSUES, approve.ISSUES, build_feed.PUBLIC, build_feed.ISSUES)
        validate.ROOT, validate.ISSUES = self.tmp, self.issues
        approve.ISSUES = self.issues
        build_feed.PUBLIC, build_feed.ISSUES = self.tmp / "public", self.issues

    def tearDown(self):
        validate.ROOT, validate.ISSUES, approve.ISSUES, build_feed.PUBLIC, build_feed.ISSUES = self.saved
        shutil.rmtree(self.tmp)

    def edit(self, fn, date=DATE):
        path = self.issues / f"{date}.json"
        issue = json.loads(path.read_text(encoding="utf-8"))
        fn(issue)
        path.write_text(json.dumps(issue, ensure_ascii=False), encoding="utf-8")

    def run_validate(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = validate.main(list(args))
        return code, buf.getvalue()


class ValidateTest(Site):
    def test_current_issue_passes(self):
        self.assertEqual(self.run_validate()[0], 0)
        self.assertEqual(self.run_validate("--deploy")[0], 0)

    def test_draft_blocked_only_on_deploy(self):
        self.edit(lambda i: i.update(status="draft"))
        self.assertEqual(self.run_validate()[0], 0)
        code, out = self.run_validate("--deploy")
        self.assertEqual(code, 1)
        self.assertIn("draft", out)

    def test_published_needs_review(self):
        self.edit(lambda i: i.update(status="published", collectedAt="2026-10-19T00:20:00+09:00"))
        code, out = self.run_validate()
        self.assertEqual(code, 1)
        self.assertIn("review.by", out)

    def test_published_rejects_late_collection(self):
        def late(i):
            i.update(status="published", review={"by": "검토자", "at": "2026-10-19T07:00+09:00"})
        self.edit(late)
        code, out = self.run_validate()
        self.assertEqual(code, 1)
        self.assertIn("collectedAt", out)

    def test_unknown_status(self):
        self.edit(lambda i: i.update(status="final"))
        self.assertEqual(self.run_validate()[0], 1)

    def test_corrections(self):
        path = self.tmp / "public" / "data" / "corrections.json"
        good = {"date": "2026-10-20", "issue": DATE, "section": "경제", "before": "1", "after": "2", "reason": "오기"}
        path.write_text(json.dumps({"items": [good]}), encoding="utf-8")
        self.assertEqual(self.run_validate()[0], 0)
        path.write_text(json.dumps({"items": [dict(good, issue="2026-01-01")]}), encoding="utf-8")
        self.assertEqual(self.run_validate()[0], 1)
        path.write_text(json.dumps({"items": [dict(good, reason="")]}), encoding="utf-8")
        self.assertEqual(self.run_validate()[0], 1)


class ApproveTest(Site):
    def test_draft_becomes_published_and_passes_deploy(self):
        self.edit(lambda i: i.update(status="draft", collectedAt="2026-10-19T00:20:00+09:00"))
        now = dt.datetime(2026, 10, 19, 7, 40, tzinfo=approve.KST)
        approve.approve(DATE, "검토자", now)
        issue = json.loads((self.issues / f"{DATE}.json").read_text(encoding="utf-8"))
        self.assertEqual(issue["status"], "published")
        self.assertEqual(issue["review"]["by"], "검토자")
        self.assertEqual(self.run_validate("--deploy")[0], 0)

    def test_auto_publish_is_marked_not_reviewed(self):
        self.edit(lambda i: i.update(status="draft", collectedAt="2026-10-19T00:20:00+09:00"))
        now = dt.datetime(2026, 10, 19, 6, 0, tzinfo=approve.KST)
        approve.approve(DATE, "", now, auto=True)
        issue = json.loads((self.issues / f"{DATE}.json").read_text(encoding="utf-8"))
        self.assertEqual(issue["status"], "published")
        self.assertEqual((issue["review"]["by"], issue["review"]["auto"], issue["review"]["scope"]), ("자동 발행", True, []))
        self.assertEqual(self.run_validate("--deploy")[0], 0)

    def test_only_drafts(self):
        with self.assertRaises(ValueError):
            approve.approve(DATE, "검토자")


class FeedTest(Site):
    def test_feed_is_valid_and_skips_drafts(self):
        doc = xml.dom.minidom.parseString(build_feed.build().encode("utf-8"))
        items = doc.getElementsByTagName("item")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].getElementsByTagName("link")[0].firstChild.data, build_feed.SITE + DATE)
        self.edit(lambda i: i.update(status="draft"))
        doc = xml.dom.minidom.parseString(build_feed.build().encode("utf-8"))
        self.assertEqual(len(doc.getElementsByTagName("item")), 0)

    def test_sitemap_lists_home_and_skips_drafts(self):
        doc = xml.dom.minidom.parseString(build_feed.build_sitemap().encode("utf-8"))
        locs = [n.firstChild.data for n in doc.getElementsByTagName("loc")]
        self.assertEqual(locs, [build_feed.SITE, build_feed.SITE + DATE])
        self.assertEqual(doc.getElementsByTagName("lastmod")[0].firstChild.data, DATE)
        self.edit(lambda i: i.update(status="draft"))
        doc = xml.dom.minidom.parseString(build_feed.build_sitemap().encode("utf-8"))
        self.assertEqual(len(doc.getElementsByTagName("lastmod")), 0)


def ecos(*pairs):
    return {"StatisticSearch": {"list_total_count": len(pairs), "row": [{"TIME": t, "DATA_VALUE": v} for t, v in pairs]}}


class EcosTest(unittest.TestCase):
    def test_change_and_direction(self):
        n = ecos_nums.to_num("usdkrw", ecos(("20261016", "1,470.5"), ("20261015", "1465.0")))
        self.assertEqual(n["v"], "1,470.5원")
        self.assertEqual(n["dir"], "up")
        self.assertEqual(n["d"], "+5.5원 (+0.38%)")
        self.assertEqual(n["src"]["base"], "2026-10-16")
        self.assertTrue(n["src"]["url"].startswith("https://"))

    def test_down_and_flat(self):
        down = ecos_nums.to_num("kospi", ecos(("20261015", "5800"), ("20261016", "5668.05")))
        self.assertEqual((down["dir"], down["v"]), ("down", "5,668.05"))
        self.assertTrue(down["d"].startswith("−131.95"))
        flat = ecos_nums.to_num("base_rate", ecos(("20261015", "2.5"), ("20261016", "2.5")))
        self.assertEqual((flat["dir"], flat["v"]), ("flat", "2.50%"))

    def test_error_response_is_skipped(self):
        raw = {"series": {"kospi": {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}, "usdkrw": ecos(("20261016", "1470"))}}
        nums = ecos_nums.convert(raw)
        self.assertEqual([n["k"] for n in nums], ["원·달러 환율"])
        self.assertEqual(nums[0]["dir"], "flat")


class TokensTest(unittest.TestCase):
    def test_committed_css_matches_tokens(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(build_tokens.main(["--check"]), 0)

    def test_themes_and_aliases(self):
        css = build_tokens.build({
            "name": "t",
            "color": {"themes": [{"id": "light"}, {"id": "dark"}], "tokens": [
                {"name": "brand", "value": {"light": "#0047a0", "dark": "#86aeea"}},
                {"name": "focus", "value": "{brand}"},
            ]},
            "type": {"families": {"sans": "sans-serif"}},
            "radius": {"tokens": [{"name": "radius-md", "value": "8px"}]},
        })
        self.assertIn("--focus: var(--brand);", css)
        self.assertIn("--radius-md: 8px;", css)
        self.assertIn("--font-sans: sans-serif;", css)
        # 다크 값은 기기 설정과 data-theme 두 곳에 들어간다
        self.assertEqual(css.count("--brand: #86aeea;"), 2)
        self.assertIn(':root:not([data-theme="light"])', css)


if __name__ == "__main__":
    unittest.main()
