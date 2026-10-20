"""최신 공식 숫자(live.json) 생성기를 가짜 ECOS 응답으로 돌려 본다.

사용: python -m unittest discover -s scripts/tests
"""
from __future__ import annotations

import datetime as dt
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import build_live  # noqa: E402
import fetch_ecos  # noqa: E402

NOW = dt.datetime(2026, 10, 20, 16, 17, tzinfo=build_live.KST)
# 통계표 코드로 어떤 원본인지 고른다
BY_ITEM = {code[2]: name for name, code in fetch_ecos.SERIES.items()}
VALUES = {
    "kospi": [("20261019", "5768.01"), ("20261020", "5801.10")],
    "kosdaq": [("20261019", "808.89"), ("20261020", "800.00")],
    "usdkrw": [("20261019", "1330.3"), ("20261020", "1330.3")],
    "base_rate": [("20261020", "2.50")],
}


def ecos(pairs):
    return {"StatisticSearch": {"row": [{"TIME": t, "DATA_VALUE": v} for t, v in pairs]}}


def fake_fetch(stat, cycle, item, start, end):
    return ecos(VALUES[BY_ITEM[item]])


class BuildTest(unittest.TestCase):
    def test_items_in_order_with_live_labels(self):
        live = build_live.build(fake_fetch, NOW)
        self.assertEqual([i["id"] for i in live["items"]], ["kospi", "kosdaq", "usdkrw", "base_rate"])
        kospi = live["items"][0]
        self.assertEqual((kospi["k"], kospi["v"], kospi["dir"]), ("코스피 종가", "5,801.10", "up"))
        self.assertEqual(live["items"][1]["dir"], "down")
        self.assertEqual(live["items"][2]["dir"], "flat")
        self.assertEqual(kospi["src"]["base"], "2026-10-20")
        self.assertEqual(live["updatedAt"], "2026-10-20T16:17+09:00")
        self.assertEqual(live["missing"], [])

    def test_range_ends_today(self):
        seen = []
        build_live.build(lambda *a: seen.append(a) or ecos(VALUES["kospi"]), NOW)
        self.assertTrue(all(a[4] == "20261020" and a[3] == "20260929" for a in seen))

    def test_missing_series_are_reported_not_fatal(self):
        def partly(stat, cycle, item, start, end):
            name = BY_ITEM[item]
            if name == "kosdaq":
                raise OSError("연결 끊김")
            if name == "base_rate":
                return {"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}
            return ecos(VALUES[name])
        live = build_live.build(partly, NOW)
        self.assertEqual([i["id"] for i in live["items"]], ["kospi", "usdkrw"])
        self.assertEqual(live["missing"], ["kosdaq: OSError", "base_rate: INFO-200"])


class MainTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "live.json"
        self.patch = mock.patch.object(build_live, "OUT", self.out)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()

    def run_main(self, env):
        with mock.patch.dict(os.environ, env, clear=False), redirect_stdout(io.StringIO()):
            return build_live.main()

    def test_no_key_writes_nothing(self):
        with mock.patch.dict(os.environ, {}, clear=True), redirect_stdout(io.StringIO()):
            self.assertEqual(build_live.main(), 0)
        self.assertFalse(self.out.exists())

    def test_all_failed_keeps_old_file(self):
        self.out.write_text("이전 파일", encoding="utf-8")
        with mock.patch.object(fetch_ecos, "fetch", side_effect=OSError("막힘")):
            self.assertEqual(self.run_main({"ECOS_API_KEY": "x"}), 1)
        self.assertEqual(self.out.read_text(encoding="utf-8"), "이전 파일")

    def test_writes_file_with_key(self):
        with mock.patch.object(fetch_ecos, "fetch", side_effect=lambda key, *a: fake_fetch(*a)):
            self.assertEqual(self.run_main({"ECOS_API_KEY": "x"}), 0)
        self.assertIn("코스피 종가", self.out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
