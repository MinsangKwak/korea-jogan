import json
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend-python"))
import edition_api as api


class EditionApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.issues = self.root / "issues"
        self.issues.mkdir()
        self.output = self.root / "public" / "api" / "v1"
        self.db = self.root / "articles.sqlite3"
        self.day = "2026-11-23"

    def article(self, source="news-a", **changes):
        return dict({"title": "기사 제목", "outlet": "언론사", "summary": "조간에 실린 요약",
                     "url": f"https://example.com/{source}", "date": "2026-11-22", "cat": "사회",
                     "body_read": False, "figures": []}, **changes)

    def save_issue(self, day, national=(), regions=(), status="published"):
        api.write_json(self.issues / f"{day}.json", {
            "date": day, "status": status, "national": {"items": national}, "regions": {"items": regions}
        })

    def build(self, dates):
        api.write_json(self.issues / "index.json", {"issues": dates})
        return api.build_catalog(self.issues, self.db, self.output)

    def read(self, relative):
        return api.load_json(self.output / relative)

    def test_preserves_source_provenance_and_lists_only_public_editions(self):
        previous = "2026-11-21"
        article = self.article(figure_source="기관 발표", figures=["1건"])
        self.save_issue(self.day, [article], [dict(article, region="서울")])
        self.save_issue(previous, [article], status="prototype")
        self.save_issue("2026-11-24", [article], status="draft")
        self.save_issue("2026-11-20", [article])
        index = self.build([previous, self.day, "2026-11-24"])
        self.assertEqual(index["latest"], self.day)
        self.assertEqual([item["status"] for item in index["editions"]], ["published", "prototype"])
        self.assertEqual(index["editions"][0]["articleCount"], 2)
        records = self.read(f"editions/{self.day}.json")["articles"]
        self.assertEqual([item["section"] for item in records], ["national", "regions"])
        self.assertEqual(records[0]["date"], "2026-11-22")
        self.assertEqual(records[0]["editionDate"], self.day)
        self.assertIs(records[0]["body_read"], False)
        self.assertEqual(records[0]["figure_source"], "기관 발표")
        self.assertEqual([item["region"] for item in records], [None, "서울"])
        self.assertEqual(len(list((self.output / "articles").glob("*.json"))), 3)
        with closing(sqlite3.connect(self.db)) as db:
            db.row_factory = sqlite3.Row
            for path in self.output.rglob("*.json"):
                relative = path.relative_to(self.output).as_posix()
                self.assertEqual(api.read_resource(db, f"/api/v1/{relative}"), api.load_json(path))
            self.assertIsNone(api.read_resource(db, "/api/v1/editions/2026-11-24.json"))
            self.assertIsNone(api.read_resource(db, "/api/v1/articles/" + "f" * 32 + ".json"))

    def test_corrected_reordered_or_withdrawn_records_are_replaced(self):
        self.save_issue(self.day, [self.article(), self.article("news-b")])
        self.build([self.day])
        path = f"editions/{self.day}.json"
        old = self.read(path)["articles"]
        self.save_issue(self.day, [self.article("news-b"), self.article(title="정정 제목")])
        self.build([self.day])
        corrected = self.read(path)["articles"]
        self.assertEqual([row["id"] for row in corrected], [old[1]["id"], old[0]["id"]])
        self.assertEqual(self.read(f"articles/{old[0]['id']}.json")["title"], "정정 제목")
        snapshot = {p.relative_to(self.output): p.read_bytes() for p in self.output.rglob("*.json")}
        self.build([self.day])
        self.assertEqual(snapshot, {p.relative_to(self.output): p.read_bytes() for p in self.output.rglob("*.json")})
        self.save_issue(self.day, [self.article("news-b")])
        self.build([self.day])
        self.assertFalse((self.output / f"articles/{old[0]['id']}.json").exists())
        self.assertEqual(self.build([]), {"version": 1, "latest": None, "editions": []})
        self.assertEqual(list((self.output / "articles").iterdir()), [])
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM articles").fetchone()[0], 0)

    def test_failed_ingest_preserves_verified_output_and_database(self):
        self.save_issue(self.day, [self.article()])
        self.build([self.day])
        self.save_issue(self.day, [self.article(title="검사 대기 중인 수정")])
        self.save_issue("2026-11-20", [self.article(url="about:blank")])
        with self.assertRaises(ValueError):
            self.build([self.day, "2026-11-20"])
        self.assertEqual(self.read(f"editions/{self.day}.json")["articles"][0]["title"], "기사 제목")
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute("SELECT title FROM articles").fetchone()[0], "기사 제목")

    def test_validates_input_date_and_owned_destination(self):
        self.save_issue(self.day, [self.article()])
        self.build([self.day])
        with self.assertRaises(ValueError):
            self.build([self.day, self.day])
        with self.assertRaises(ValueError):
            self.build(["../other"])
        unrelated = self.output / "articles" / "notes.txt"
        unrelated.write_text("보존")
        with self.assertRaises(ValueError):
            self.build([self.day])
        self.assertEqual(unrelated.read_text(), "보존")


if __name__ == "__main__":
    unittest.main()
