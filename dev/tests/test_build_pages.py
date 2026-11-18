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
        # 손으로 build_pages를 돌려 둔 호별 페이지가 남아 있어도 시험 결과가 달라지지 않게 지운다
        for stale in (self.tmp / "dev" / "web").glob("20??-??-??.html"):
            stale.unlink()
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

    def test_reader_tools_are_static_unique_and_keep_site_origin(self):
        build_pages.build()
        home = (build_pages.PUBLIC / 'index.html').read_text(encoding='utf-8')
        past = (build_pages.PUBLIC / f'{DATE}.html').read_text(encoding='utf-8')
        topic = (build_pages.PUBLIC / 'topics/index.html').read_text(encoding='utf-8')
        for page in (home, past, topic):
            self.assertEqual(page.count('data-reader-tools '), 1)
            self.assertIn('value="https://korea-jogan.com/feed.xml"', page)
            self.assertIn('href="/topics/"', page)
            self.assertIn('href="/indicators/"', page)
            self.assertIn('id="readerFeedCopy" disabled', page)
        self.assertEqual(build_pages.with_reader_tools(home), home)

    def test_lead_heading_is_static_single_and_escaped(self):
        self.issue["lead"]["headline"] = '코스피 <b>5,000</b> & "환율"'
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        build_pages.build()
        for name in ("index.html", f"{DATE}.html"):
            page = (build_pages.PUBLIC / name).read_text(encoding="utf-8")
            self.assertEqual(len(re.findall(r"<h1\b", page)), 1, name)
            self.assertIn('<h1 id="leadH">코스피 &lt;b&gt;5,000&lt;/b&gt; &amp; &quot;환율&quot;</h1>', page)

    def test_lead_heading_is_emptied_when_nothing_is_published(self):
        build_pages.build()
        self.issue["status"] = "draft"
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        self.assertIn('<h1 id="leadH"></h1>', (build_pages.PUBLIC / "index.html").read_text(encoding="utf-8"))

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

    def test_embeds_issue_and_archive_index(self):
        build_pages.build()
        page = (build_pages.PUBLIC / "index.html").read_text(encoding="utf-8")
        for element_id, expected in [("issue-data", self.issue), ("issue-index", {"latest": DATE, "issues": [DATE]})]:
            match = re.search(r'<script type="application/json" id="' + element_id + r'">(.*?)</script>', page, re.S)
            self.assertEqual(json.loads(match.group(1)), expected)

    def test_embedded_data_cannot_close_script(self):
        self.issue["lead"]["headline"] = "</script><script>bad()</script>"
        template = (build_pages.PUBLIC / "index.html").read_text(encoding="utf-8")
        page = build_pages.embed_data(template, self.issue, {"latest": DATE, "issues": [DATE]})
        body = re.search(r'<script type="application/json" id="issue-data">(.*?)</script>', page, re.S).group(1)
        self.assertNotIn("<", body)
        self.assertEqual(json.loads(body)["lead"]["headline"], self.issue["lead"]["headline"])

    def test_home_title_names_today_summary_and_is_idempotent(self):
        build_pages.build()
        once = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        build_pages.build()
        twice = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        self.assertEqual(once, twice)
        # 2026-10-19는 월요일. 매체 이름 없이 치는 말과 그날 날짜를 제목·설명·보이는 한 줄에 함께 둔다
        self.assertIn("<title>오늘 뉴스 요약 · 10월 19일(월) 한국 주요 뉴스와 경제 숫자 | 대한민국 조간</title>", once)
        desc = re.search(r'<meta name="description" content="([^"]*)">', once).group(1)
        self.assertTrue(desc.startswith("10월 19일 오늘의 한국 뉴스 요약. "))
        self.assertLessEqual(len(desc), 160)
        self.assertIn('<p class="kj-lead__today" id="leadToday">오늘의 한국 뉴스 요약 · 10월 19일</p>', once)
        self.assertIn("오늘 우리나라 주요 뉴스와 경제 숫자를 한 페이지로 요약합니다", once)
        self.assertIn("오늘 우리나라 뉴스", re.search(r'<meta name="keywords" content="([^"]*)">', once).group(1))
        self.assertIn("오늘 뉴스 요약", self.ld(once)["@graph"][0]["alternateName"])
        past = (self.tmp / "dev" / "web" / f"{DATE}.html").read_text(encoding="utf-8")
        self.assertIn('<p class="kj-lead__today" id="leadToday">10월 19일 한국 뉴스 요약</p>', past)
        self.assertNotIn("<title>오늘 뉴스 요약", past)
        self.assertEqual(once.count('id="seoDigest"'), 1)
        self.assertEqual(sum(g["@type"] == "NewsArticle" for g in self.ld(once)["@graph"]), 1)

    def test_keywords_cover_date_regions_and_stay_bounded(self):
        build_pages.build()
        page = (self.tmp / "dev" / "web" / f"{DATE}.html").read_text(encoding="utf-8")
        words = re.search(r'<meta name="keywords" content="([^"]*)">', page).group(1).split(", ")
        self.assertIn("10월 19일 뉴스", words)
        self.assertIn("10월 19일 월요일 뉴스", words)
        self.assertLessEqual(len(words), build_pages.KEYWORD_MAX)
        self.assertEqual(len(words), len(set(words)))
        article = next(g for g in self.ld(page)["@graph"] if g["@type"] == "NewsArticle")
        self.assertIn("머리기사", article["articleSection"])
        home = (self.tmp / "dev" / "web" / "index.html").read_text(encoding="utf-8")
        home_words = re.search(r'<meta name="keywords" content="([^"]*)">', home).group(1).split(", ")
        for word in ("오늘 뉴스 요약", "오늘 뉴스", "광고 없는 뉴스", "데이터 기반 뉴스", "10월 19일 뉴스"):
            self.assertIn(word, home_words)
        self.assertLessEqual(len(home_words), build_pages.KEYWORD_MAX)

    def test_text_is_escaped(self):
        self.issue["lead"]["headline"] = '<script>alert(1)</script> "따옴표"'
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        page = (self.tmp / "dev" / "web" / f"{DATE}.html").read_text(encoding="utf-8")
        self.assertNotIn("<script>alert(1)</script>", page)
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", page)

    def test_embedded_index_skips_unapproved_draft(self):
        # 오늘 호가 초안인 아침에도 화면이 공개 전 초안을 내려받지 않아야 한다
        draft = "2026-10-20"
        issue = json.loads(json.dumps(self.issue))
        issue.update(date=draft, status="draft")
        issue.pop("review", None)
        (self.issues / f"{draft}.json").write_text(json.dumps(issue, ensure_ascii=False), encoding="utf-8")
        (self.issues / "index.json").write_text(json.dumps({"latest": draft, "issues": [DATE, draft]}), encoding="utf-8")
        build_pages.build()
        page = (build_pages.PUBLIC / "index.html").read_text(encoding="utf-8")
        embedded = {}
        for element_id in ("issue-data", "issue-index"):
            match = re.search(r'<script type="application/json" id="' + element_id + r'">(.*?)</script>', page, re.S)
            embedded[element_id] = json.loads(match.group(1))
        self.assertEqual(embedded["issue-index"], {"latest": DATE, "issues": [DATE]})
        self.assertEqual(embedded["issue-data"]["date"], DATE)
        self.assertFalse((build_pages.PUBLIC / f"{draft}.html").exists())

    def test_drafts_are_skipped(self):
        self.issue["status"] = "draft"
        (self.issues / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")
        build_pages.build()
        self.assertFalse((self.tmp / "dev" / "web" / f"{DATE}.html").exists())


class IndexNowTest(unittest.TestCase):
    def test_discovery_notification_stays_on_our_site(self):
        site = indexnow.build_feed.SITE
        body = indexnow.payload("abc12345", [], [site + "topics/", site + "topics/", "https://example.com/topics/"])
        self.assertEqual(body["urlList"], [site, site + "topics/"])

    def test_payload_lists_home_and_recent_issues(self):
        body = indexnow.payload("abc12345", [{"date": "2026-10-22"}, {"date": "2026-10-21"}, {"date": "2026-10-20"}])
        site = indexnow.build_feed.SITE
        self.assertEqual(body["urlList"], [site, site + "2026-10-22", site + "2026-10-21"])
        self.assertEqual(body["keyLocation"], site + "abc12345.txt")

    def test_hub_notification_names_only_our_feed_and_never_raises(self):
        seen = []

        class Response:
            status = 204

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        def opener(request, timeout=0):
            seen.append(request)
            return Response()

        self.assertEqual(indexnow.notify_hub(opener), "WebSub 204: https://korea-jogan.com/feed.xml")
        self.assertEqual(seen[0].full_url, indexnow.build_feed.HUB)
        self.assertEqual(seen[0].data.decode("utf-8"), "hub.mode=publish&hub.url=https%3A%2F%2Fkorea-jogan.com%2Ffeed.xml")

        def broken(request, timeout=0):
            raise OSError("down")

        self.assertIn("WebSub 알림 실패", indexnow.notify_hub(broken))

    def test_key_file_is_published(self):
        key = indexnow.find_key()
        self.assertEqual((REPO / "dev" / "web" / f"{key}.txt").read_text(encoding="utf-8").strip(), key)


if __name__ == "__main__":
    unittest.main()
