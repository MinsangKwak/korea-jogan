"""보도일·예보일과 지역이 확인되는 호만 날씨 지면에 싣는다."""
from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dev/pipeline/build"))
import build_weather as weather

WEB = ROOT / "dev/web"


def issue(day):
    return json.loads((WEB / f"data/issues/{day}.json").read_text(encoding="utf-8"))


class EditionWeatherTest(unittest.TestCase):
    def setUp(self):
        self.latest = issue("2026-11-23")
        self.report = weather.editorial_weather(self.latest)
        self.row = next(row for row in self.latest["national"]["items"] if row["url"] == self.report["url"])
        self.latest["national"]["items"] = [self.row]

    def test_matches_forecast_within_the_edition(self):
        self.assertEqual(self.report["headline"], self.row["title"])
        self.assertEqual(self.report["region"], "전국")
        self.assertEqual(self.report["facts"], ["강원 북부 산지 1~5㎝", "수도권 5~20㎜"])
        self.assertIsNone(weather.editorial_weather(issue("2026-11-11")))
        yesterday = weather.editorial_weather(issue("2026-11-22"))
        self.assertIn("22일 전국", yesterday["headline"])
        self.assertNotIn("내일", yesterday["headline"])

    def test_outside_date_or_unverified_source_is_omitted(self):
        for field, value in [
            ("date", "2026-11-24"), ("date", "2026-11-01"), ("body_read", False),
            ("url", "javascript:void(0)"), ("summary", "기상청은 24일 전국에 눈이 오겠다고 예보했습니다."),
            ("summary", "기상청은 12월 23일 전국에 눈이 오겠다고 예보했습니다."),
            ("summary", "기상청은 23일 전국 방재기관과 추위 대비 예보 업무를 점검했습니다."),
            ("summary", "행안부는 23일 기상청과 재난 회의를 열었습니다."),
        ]:
            with self.subTest(field=field, value=value):
                self.latest["national"]["items"] = [dict(self.row, **{field: value})]
                self.assertIsNone(weather.editorial_weather(self.latest))

    def test_repeat_build_replaces_or_removes_static_report(self):
        template = (WEB / "index.html").read_text(encoding="utf-8")
        report = dict(self.report, headline="비 <눈> & 바람", facts=["서울 < 3도"])
        first = weather.with_spread(template, self.latest["date"], report)
        self.assertEqual(first, weather.with_spread(first, self.latest["date"], report))
        visible = ET.fromstring(weather.SPREAD.search(first)[0])
        self.assertNotIn("hidden", visible.attrib)
        self.assertEqual(visible.find('.//*[@class="weather-spread__summary"]').text, report["headline"])
        self.assertEqual([node.get("datetime") for node in visible.iter("time")], ["2026-11-23", "2026-11-22"])
        self.assertEqual(next(visible.iter("a")).get("href"), report["url"])
        last = weather.with_spread(first, "2026-11-11", None)
        hidden = ET.fromstring(weather.SPREAD.search(last)[0])
        self.assertIn("hidden", hidden.attrib)
        self.assertFalse(next(hidden.iter("a")).get("href"))
        self.assertNotIn("파이낸셜뉴스", "".join(hidden.itertext()))
