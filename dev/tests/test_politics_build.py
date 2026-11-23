"""질문 원본을 홈, 고정 페이지, 검색 사이트맵에서 같은 기준으로 공개한다."""
from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "pipeline/build"))

import build_feed
import build_pages
import build_politics


class PoliticsBuildTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        public = HERE / "web"
        cls.template = (public / "index.html").read_text()
        cls.rows = build_politics.load(public)
        cls.tracker = json.loads((public / "data/trackers.json").read_text())
        cls.issue = json.loads((public / "data/issues/2026-11-20.json").read_text())

    def test_fixed_question_routes_are_unique_and_searchable_without_scripts(self):
        with patch.object(build_politics, "today", return_value=max(q["checkedAt"] for q in self.rows)):
            pages = build_politics.pages([self.issue], self.tracker, self.rows)
            sitemap = ET.fromstring(build_feed.build_sitemap())
        locs = [node.text for node in sitemap.findall("{*}url/{*}loc")]
        hub = next(p for p in pages if p["path"] == "politics/index.html")
        for q in self.rows:
            route = build_politics.route(q)
            url = build_pages.SITE.rstrip("/") + route
            self.assertEqual(locs.count(url), 1)
            self.assertIn('href="' + route + '"', hub["body"])
            target, = [p for p in pages if p["path"] == route[1:] + "index.html"]
            html = build_pages.discovery_page(self.template, target)
            self.assertIn('<link rel="canonical" href="' + url + '">', html)
            self.assertIn('data-question-id="' + q["id"] + '"', html)
            self.assertEqual(html.count('id="questionPermalink"'), 1)
            self.assertIn(f'id="questionPermalink" type="text" inputmode="url" value="{url}" readonly', html)
            self.assertIn('id="questionCopyStatus" role="status"', html)
            self.assertIn('href="mailto:', html)
            self.assertIn('href="/feed.xml"', html)
            self.assertIn(build_pages.esc(q["answer"]), html)
            self.assertIn(q["checkedAt"], html)
            self.assertIn(build_pages.esc(q["sources"][0]["url"]), html)
        self.assertNotIn(build_pages.SITE + 'politics/lee-jae-myung-trials/', locs)

    def test_future_question_never_leaks_into_previous_edition_on_rebuild(self):
        date = max(row["checkedAt"] for row in self.rows)
        current = build_politics.with_front(self.template, self.issue, self.rows, date)
        self.assertEqual(build_politics.with_front(current, self.issue, self.rows, date), current)
        archive = build_politics.with_front(current, dict(date="2025-01-01"), self.rows, "2025-01-01")
        fragment = build_politics.FRONT.search(archive)[2]
        for row in self.rows:
            self.assertNotIn(row["answer"], fragment)
            self.assertNotIn(row["question"], fragment)
            self.assertNotIn(row["sources"][0]["url"], fragment)
        self.assertIn('data-issue-date="2025-01-01"', fragment)
        self.assertNotIn('href="' + build_politics.route(self.rows[0]) + '"', fragment)

    def test_checked_answer_and_source_follow_the_edition_cutoff(self):
        row = copy.deepcopy(next(q for q in self.rows if q["id"] == "lee-jae-myung-trials"))
        original = next(v for v in row["pastEditions"] if v["checkedAt"] == "2026-11-20")
        row["sources"][0] = {"url": "https://example.com/new-source", "label": "새 판본 근거"}
        checked = row["checkedAt"]
        scenarios = [
            ("2026-11-19", True, None),
            *[(f"2026-11-{day}", True, original) for day in (20, 21, 22, 23)],
            (checked, False, row),
            (row["editionFrom"], True, row),
        ]
        for day, dated, version in scenarios:
            with self.subTest(day=day, dated=dated):
                html = build_politics.with_front(self.template, {"date": day}, [row], day, dated=dated)
                fragment = build_politics.FRONT.search(html)[2]
                if version:
                    self.assertIn(build_pages.esc(version["answer"]), fragment)
                    self.assertIn(f'datetime="{version["checkedAt"]}"', fragment)
                    self.assertIn(f'href="{version["sources"][0]["url"]}"', fragment)
                else:
                    self.assertNotIn(original["answer"], fragment)
                if version is not row:
                    self.assertNotIn(row["sources"][0]["url"], fragment)
                    self.assertNotIn(row["answer"], fragment)

    def test_daily_headline_and_original_date_come_from_that_edition(self):
        issue = copy.deepcopy(self.issue)
        story = build_politics.edition_story(issue)
        self.assertIsNotNone(story)
        html = build_politics.with_front(self.template, issue, self.rows, "2026-11-20")
        self.assertIn(build_pages.esc(story["url"]), build_politics.FRONT.search(html)[2])
        story["date"] = "2099-01-01"
        self.assertIsNot(build_politics.edition_story(issue), story)
        issue["national"]["items"] = [{"cat": "정치", "date": issue["date"], "title": "제목", "url": "javascript:alert(1)"}]
        self.assertIsNone(build_politics.edition_story(issue))

    def test_future_and_missing_tracker_are_excluded_and_markup_is_escaped(self):
        query = copy.deepcopy(next(q for q in self.rows if q["kind"] == "term"))
        query["question"] = '<script>alert("원문")</script>'
        with patch.object(build_politics, "today", return_value=query["checkedAt"]):
            pages = build_politics.pages([self.issue], {}, [query, next(q for q in self.rows if q["kind"] == "issue")])
        guide = next(p for p in pages if p.get("questionId") == query["id"])
        self.assertIn("&lt;script&gt;", guide["body"])
        self.assertNotIn("alert(\"원문\")", guide["body"])
        self.assertNotIn('/topics/lee-jae-myung-trials/', guide["body"])
        with patch.object(build_politics, "today", return_value="2024-01-01"):
            paths = [p["path"] for p in build_politics.pages([self.issue], self.tracker, self.rows)]
        self.assertNotIn("politics/reversal-and-remand/index.html", paths)


if __name__ == "__main__":
    unittest.main()
