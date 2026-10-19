"""RSS 수집기를 네트워크 없이 가짜 피드로 돌려 본다.

사용: python -m unittest discover -s scripts/tests
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import fetch_rss  # noqa: E402

RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>가짜 신문</title>
<item><title><![CDATA[코스피 &amp; 환율 <b>급락</b>]]></title><link>https://a.example/1</link>
<pubDate>Sun, 18 Oct 2026 09:30:00 +0900</pubDate>
<description><![CDATA[요약 비밀 문장]]></description><content:encoded><![CDATA[<p>본문 비밀 문장</p>]]></content:encoded></item>
<item><title>전날 밤 기사</title><link>https://a.example/2</link><pubDate>Sat, 17 Oct 2026 15:30:00 GMT</pubDate></item>
<item><title>당일 기사</title><link>https://a.example/3</link><pubDate>Mon, 19 Oct 2026 08:00:00 +0900</pubDate></item>
<item><title>날짜 없는 기사</title><link>https://a.example/4</link></item>
<item><title>링크 없는 기사</title><pubDate>Sun, 18 Oct 2026 10:00:00 +0900</pubDate></item>
<item><title>dc 날짜 기사</title><link>https://a.example/5</link><dc:date>2026-10-18T23:59:00+09:00</dc:date></item>
</channel></rss>"""

ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Fake</title>
<entry><title>Korea exports</title><link rel="alternate" href="https://b.example/x"/><published>2026-10-18T03:00:00Z</published><summary>secret</summary></entry>
<entry><title>Old</title><link href="https://b.example/y"/><updated>2026-10-16T03:00:00Z</updated></entry>
</feed>"""

FEEDS = [
    {"outlet": "가짜신문", "region": "국내", "scope": "전국", "url": "https://a.example/rss"},
    {"outlet": "Fake Times", "region": "해외", "scope": "아시아", "url": "https://b.example/atom"},
]
ISSUE = dt.date(2026, 10, 19)


def fake_fetch(url):
    return {"https://a.example/rss": RSS.encode(), "https://b.example/atom": ATOM.encode()}[url]


class ParseTest(unittest.TestCase):
    def test_rss_keeps_only_title_link_date(self):
        items = fetch_rss.parse_feed(RSS.encode())
        self.assertEqual(items[0]["title"], "코스피 & 환율 급락")
        self.assertEqual(set(items[0]), {"title", "url", "published"})
        self.assertNotIn("비밀", json.dumps(items, default=str, ensure_ascii=False))
        # 링크가 없는 항목은 버린다
        self.assertNotIn("링크 없는 기사", [i["title"] for i in items])

    def test_dates_become_kst(self):
        items = {i["title"]: i["published"] for i in fetch_rss.parse_feed(RSS.encode())}
        self.assertEqual(items["전날 밤 기사"].isoformat(), "2026-10-18T00:30:00+09:00")
        self.assertIsNone(items["날짜 없는 기사"])

    def test_atom(self):
        items = fetch_rss.parse_feed(ATOM.encode())
        self.assertEqual([i["url"] for i in items], ["https://b.example/x", "https://b.example/y"])
        self.assertEqual(items[0]["published"].isoformat(), "2026-10-18T12:00:00+09:00")


class RunTest(unittest.TestCase):
    def run_feeds(self, feeds=FEEDS, allowed=lambda url: True, fetch=fake_fetch, keep_all=False):
        return fetch_rss.run(feeds, ISSUE, keep_all, fetch=fetch, allowed=allowed)

    def test_window_is_previous_day_kst(self):
        result = self.run_feeds()
        titles = [i["title"] for i in result["items"]]
        self.assertEqual(titles, ["dc 날짜 기사", "Korea exports", "코스피 & 환율 급락", "전날 밤 기사"])
        self.assertEqual(result["window"], ["2026-10-18T00:00:00+09:00", "2026-10-19T00:00:00+09:00"])
        status = {s["outlet"]: s for s in result["feeds"]}
        self.assertEqual(status["가짜신문"]["skipped_no_date"], 1)
        self.assertEqual(result["items"][0]["outlet"], "가짜신문")

    def test_all_skips_date_filter(self):
        self.assertEqual(len(self.run_feeds(keep_all=True)["items"]), 6)

    def test_robots_block_and_errors_are_isolated(self):
        def broken(url):
            raise OSError("연결 끊김")
        result = self.run_feeds(allowed=lambda url: "b.example" not in url)
        status = {s["outlet"]: s for s in result["feeds"]}
        self.assertFalse(status["Fake Times"]["ok"])
        self.assertIn("robots", status["Fake Times"]["error"])
        self.assertTrue(status["가짜신문"]["ok"])
        failed = self.run_feeds(fetch=broken)
        self.assertEqual(failed["items"], [])
        self.assertTrue(all("연결 끊김" in s["error"] for s in failed["feeds"]))

    def test_duplicate_links_kept_once(self):
        twice = FEEDS[:1] + [dict(FEEDS[0], outlet="같은신문 다른 피드")]
        result = self.run_feeds(feeds=twice)
        self.assertEqual(len(result["items"]), len({i["url"] for i in result["items"]}))


class FeedListTest(unittest.TestCase):
    def test_feed_list_shape(self):
        feeds = json.loads(fetch_rss.FEEDS.read_text(encoding="utf-8"))["feeds"]
        self.assertGreater(len(feeds), 10)
        for f in feeds:
            self.assertEqual(set(f), {"outlet", "region", "scope", "url"})
            self.assertIn(f["region"], ("국내", "해외"))
            self.assertTrue(f["url"].startswith("https://"))
        self.assertEqual(len({f["url"] for f in feeds}), len(feeds))


if __name__ == "__main__":
    unittest.main()
