"""발행호에서 기준일이 확인되는 기상청 예보 보도만 날씨 지면으로 엮는다."""
from __future__ import annotations

import datetime as dt
import re
import xml.etree.ElementTree as ET

from build_discovery import REGIONS, date_value, safe_url


SPREAD = re.compile(r'<aside id="weatherSpread"[^>]*>.*?</aside>', re.S)
FORECAST = re.compile(r"예보|예상|전망|겠")
WEATHER = re.compile(r"기온|강[수설풍]|추위|한파|비가|눈이|산지|일교차|영하|최저|최고|구름|맑|흐리|흐린|안개|소나기|폭염|더위|장마|폭우|태풍|㎜|㎝")

PLACES = re.compile("|".join(name for _, name in REGIONS) + "|수도권|중부|남부|충청|경상|호남|영남|동해안|서해안|남해안")


def covered_area(row: dict, summary: str) -> str:
    if row.get("region"):
        return row["region"].strip()
    if "전국" in summary:
        return "전국"
    return "·".join(list(dict.fromkeys(PLACES.findall(row["title"] + " " + summary)))[:2])


def editorial_weather(issue: dict) -> dict | None:
    issue_date = date_value(issue.get("date"))
    if not issue_date:
        return None
    day = dt.date.fromisoformat(issue_date)
    target = re.compile(rf"(?<!\d){day.day}일(?!\s*(?:전|간)(?![가-힣]))")
    for row in (issue.get("national") or {}).get("items", []):
        if row.get("cat") != "날씨·재난" or row.get("body_read") is not True:
            continue
        source_date = date_value(row.get("date"))
        url = safe_url(row.get("url"))
        if not source_date or not url or not row.get("outlet") or not row.get("title"):
            continue
        if (day - dt.date.fromisoformat(source_date)).days not in (0, 1):
            continue
        summary = row.get("summary") or ""
        first_sentence = re.split(r"(?<=[.!?])\s+", summary.strip(), maxsplit=1)[0]
        if "기상청" not in summary or not target.search(first_sentence):
            continue
        if not FORECAST.search(first_sentence) or not WEATHER.search(first_sentence):
            continue
        title = row["title"].strip()
        headline = title if target.search(title) else first_sentence
        region = covered_area(row, summary)
        if not region:
            continue
        facts = [
            fact.strip() for fact in (row.get("figures") or [])
            if isinstance(fact, str) and re.search(r"[가-힣]{2,}", fact) and re.search(r"\d", fact) and fact.strip() not in headline
        ]
        return {
            "headline": headline, "region": region,
            "facts": list(dict.fromkeys(facts))[:2], "outlet": row["outlet"].strip(),
            "sourceDate": source_date, "url": url,
        }
    return None


def month_day(value: str) -> str:
    day = dt.date.fromisoformat(value)
    return f"{day.month}월 {day.day}일"


def with_spread(page: str, issue_date: str, weather: dict | None) -> str:
    def fill(match):
        spread = ET.fromstring(match.group())
        spread.set("data-issue-date", issue_date)
        meta = spread.find('.//*[@class="weather-spread__meta"]')
        day = meta.find("time")
        headline = spread.find('.//*[@class="weather-spread__summary"]')
        facts = spread.find('.//*[@class="weather-spread__facts"]')
        source = spread.find('.//*[@class="weather-spread__source"]')
        source_day = source.find("time")
        day.attrib.clear()
        source_day.attrib.clear()
        source.attrib.pop("href", None)
        del facts[:]
        if weather:
            spread.attrib.pop("hidden", None)
            day.set("datetime", issue_date)
            day.text = month_day(issue_date) + "호"
            day.tail = " · " + weather["region"] if weather["region"] else ""
            headline.text = weather["headline"]
            for fact in weather["facts"]:
                ET.SubElement(facts, "li").text = fact
            source.set("href", weather["url"])
            source.text = weather["outlet"] + " 원문 · "
            source_day.set("datetime", weather["sourceDate"])
            source_day.text = month_day(weather["sourceDate"]) + " 보도"
        else:
            spread.set("hidden", "hidden")
            day.text = day.tail = headline.text = source.text = source_day.text = ""
        return ET.tostring(spread, encoding="unicode", short_empty_elements=False)

    return SPREAD.sub(fill, page, count=1)
