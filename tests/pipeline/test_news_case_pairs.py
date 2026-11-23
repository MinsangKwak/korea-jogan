import json
import unittest
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit


REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "frontend-vanilla-js/data"
LAW = REPO / "frontend-vanilla-js/law/data"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


class NewsCasePairsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pairs = read_json(DATA / "news-case-pairs.json")["pairs"]
        cls.issues = read_json(DATA / "issues/index.json")["issues"]
        themes = read_json(REPO / "backend-python/pipeline/law/themes.json")
        cls.catalogues = {
            key: {case["id"]: case for case in read_json(LAW / spec["file"])}
            for key, spec in themes.items()
        }

    def test_pairs_have_stable_ids_dates_and_editorial_questions(self):
        ids = [pair["id"] for pair in self.pairs]
        self.assertTrue(ids)
        self.assertEqual(len(ids), len(set(ids)))
        issue_dates = [date.fromisoformat(pair["issueDate"]) for pair in self.pairs]
        self.assertEqual(issue_dates, sorted(issue_dates, reverse=True))
        for pair in self.pairs:
            with self.subTest(pair=pair["id"]):
                self.assertRegex(pair["id"], r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
                self.assertTrue(pair["question"].endswith("?"))
                self.assertTrue(pair["context"].strip())
                self.assertGreaterEqual(len(pair["keyword"].strip()), 2)

    def test_news_citation_matches_its_published_issue_and_section(self):
        for pair in self.pairs:
            with self.subTest(pair=pair["id"]):
                self.assertIn(pair["issueDate"], self.issues)
                issue = read_json(DATA / "issues" / (pair["issueDate"] + ".json"))
                self.assertEqual(issue["status"], "published")
                self.assertIn(pair["section"], ("national", "regions"))
                source = urlsplit(pair["articleUrl"])
                self.assertEqual(source.scheme, "https")
                self.assertTrue(source.hostname)
                items = issue[pair["section"]]["items"]
                articles = [item for item in items if item["url"] == pair["articleUrl"]]
                self.assertIn(pair["articleTitle"], [item["title"] for item in articles])

    def test_case_matches_official_record_in_the_linked_theme(self):
        for pair in self.pairs:
            with self.subTest(pair=pair["id"]):
                self.assertIs(type(pair["caseId"]), int)
                record = self.catalogues[pair["theme"]][pair["caseId"]]
                self.assertEqual(record["court"], "대법원")
                self.assertEqual(pair["caseTitle"], record["title"])
                self.assertEqual(pair["caseNumber"], record["number"])
                self.assertEqual(pair["caseDate"], record["date"])
                self.assertLessEqual(date.fromisoformat(pair["caseDate"]), date.fromisoformat(pair["issueDate"]))
