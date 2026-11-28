"""방문 숫자(visits.json) 생성기를 가짜 GA4 응답으로 돌려 본다.

사용: python -m unittest discover -s project/tests
"""
from __future__ import annotations

import datetime as dt
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend-python/pipeline/build"))

import build_visits  # noqa: E402

# KST 2026-11-28 06:05에 돌면 어제(11-27)까지 담는다
NOW = dt.datetime(2026, 11, 28, 6, 5, tzinfo=build_visits.KST)


def row(dims, *metrics):
    return {"dimensionValues": [{"value": d} for d in dims], "metricValues": [{"value": str(m)} for m in metrics]}


RESPONSE = {"reports": [
    {"rows": [row(["20261127"], 120, 40, 55), row(["20261126"], 80, 30, 33)]},
    {"rows": [row(["/"], 70), row(["/2026-11-27"], 30)]},
]}


class BuildVisitsTest(unittest.TestCase):
    def test_daily_rows_cover_30_days_and_fill_gaps(self):
        visits = build_visits.to_visits(RESPONSE, NOW)
        self.assertEqual(visits["through"], "2026-11-27")
        self.assertEqual(len(visits["days"]), 30)
        self.assertEqual(visits["days"][0]["date"], "2026-10-29")
        self.assertEqual(visits["days"][-1], {"date": "2026-11-27", "views": 120, "users": 40, "sessions": 55})
        self.assertEqual(visits["days"][-3], {"date": "2026-11-25", "views": 0, "users": 0, "sessions": 0})
        self.assertEqual(visits["topPagesYesterday"][0], {"path": "/", "views": 70})

    def test_reports_filter_production_host(self):
        for request in build_visits.report_body()["requests"]:
            self.assertEqual(request["dimensionFilter"]["filter"]["stringFilter"]["value"], "korea-jogan.com")

    def test_reuse_skips_ga4_when_yesterday_is_published(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "visits.json"
            fresh = build_visits.to_visits(RESPONSE, NOW)
            with redirect_stdout(io.StringIO()):
                self.assertFalse(build_visits.reuse(NOW, lambda: fresh, out))
            self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["through"], "2026-11-27")

    def test_reuse_asks_ga4_on_a_new_day_but_keeps_old_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "visits.json"
            old = build_visits.to_visits(RESPONSE, NOW - dt.timedelta(days=1))
            with redirect_stdout(io.StringIO()):
                self.assertTrue(build_visits.reuse(NOW, lambda: old, out))
            self.assertTrue(out.exists())
            with redirect_stdout(io.StringIO()):
                self.assertTrue(build_visits.reuse(NOW, lambda: None, Path(tmp) / "none.json"))
            self.assertFalse((Path(tmp) / "none.json").exists())


if __name__ == "__main__":
    unittest.main()
