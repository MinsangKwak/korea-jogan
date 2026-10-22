"""호별 검색 페이지와 IndexNow 알림 내용을 임시 폴더에서 만들어 본다.

사용: python -m unittest discover -s dev/tests
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
# 스크립트는 역할별 폴더(dev/pipeline/collect·build·publish)에 있다
for _d in ("collect", "build", "publish"):
    sys.path.insert(0, str(REPO / "dev" / "pipeline" / _d))

import build_pages  # noqa: E402
import indexnow  # noqa: E402

DATE = "2026-10-19"


class PagesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        shutil.copytree(REPO / "dev" / "web", self.tmp / "dev" / "web")
        self.issues = self.tmp / "dev" / "web" / "data" / "issues"
        (self.issues / "index.json").write_text(json.dumps({"latest": DATE, "issues": [DATE]}), encoding="utf-8")
        self.saved = (build_pages.PUBLIC, build_pages.ISSUES)
        build_pages.PUBLIC, build_pages.ISSUES = self.tmp / "dev" / "web", self.issues
        self.issue = json.loads((self.issues / f"{DATE}.json").read_text(encoding="utf-8"))

    def tearDown(self):
        build_pages.PUBLIC, build_pages.ISSUES = self.saved
        shutil.rmtree(self.tmp)

    def ld(self, page):
        return json.loads(build_pages.LDJSON.search(page).group(1))

    def test_issue_page_has_own_head_and_digest(self):
        build_pages.build()
        page = (self.tmp / "dev" / "web" / f"{DATE}.html").read_text(encoding="utf-8")
        url = build_pages.SITE + DATE
        headline = self.issue["lead"]["headline"]
        self.assertIn(f'<link rel="canonical" href="{url}">', page)
        self.assertIn(f'<meta name="kj-date" content="{DATE}">', page)
        self.assertIn("<title>" + build_pages.esc(headline) + " | 2026년 10월 19일 대한민국 조간</title>", page)
        self.assertIn('id="seoDigest"', page)
        self.assertIn(build_pages.esc(self.issue["nums"][0]["k"]), page)
        article = [g for g in self.ld(page)["@graph"] if g["@type"] == "NewsArticle"]
        self.assertEqual(len(article), 1)
        self.assertEqual(article[0]["url"], url)
        self.assertLessEqual(len(re.search(r'<meta name="description" content="([^"]*)">', page).group(1)), build_pages.DESC_MAX + 20)

    def test_home_keeps_search_title_and_is_idempotent(self):
        before = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        title = re.search(r"<title>.*?</title>", before).group(0)
        build_pages.build()
        once = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        build_pages.build()
        twice = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        self.assertEqual(once, twice)
        self.assertIn(title, once)
        self.assertEqual(once.count('id="seoDigest"'), 1)
        self.assertEqual(sum(g["@type"] == "NewsArticle" for g in self.ld(once)["@graph"]), 1)

    def test_text_is_escaped(self):
        self.issue["lead"]["headline"] = '<script>alert(1)</script> "따옴표"'
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        page = (self.tmp / "dev" / "web" / f"{DATE}.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>alert(1)</script>", page)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)

    def test_drafts_are_skipped(self):
        self.issue["status"] = "draft"
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        self.assertFalse((self.tmp / "dev" / "web" / f"{DATE}.html").exists())


class IndexNowTest(unittest.TestCase):
    def test_payload_lists_home_and_recent_issues(self):
        body = indexnow.payload("abc12345", [{"date": "2026-10-22"}, {"date": "2026-10-21"}, {"date": "2026-10-20"}])
        site = indexnow.build_feed.SITE
        self.assertEqual(body["urlList"], [site, site + "2026-10-22", site + "2026-10-21"])
        self.assertEqual(body["keyLocation"], site + "abc12345.txt")

    def test_key_file_is_published(self):
        key = indexnow.find_key()
        self.assertEqual((REPO / "dev" / "web" / f"{key}.txt").read_text(encoding="utf-8").strip(), key)


if __name__ == "__main__":
    unittest.main()
