"""GA4에서 지난 30일 방문 숫자를 받아 frontend-vanilla-js/visits.json을 만든다.

사용
  python backend-python/pipeline/build/build_visits.py --reuse   # 공개 중인 파일이 어제까지면 그대로 다시 싣는다
  GA4_ACCESS_TOKEN=... python backend-python/pipeline/build/build_visits.py --fetch

원칙
- GA4 조회는 하루 한 번만 한다. 배포는 평일 매시 돌지만, 공개 중인 visits.json이 이미 어제까지 담고 있으면 다시 묻지 않는다.
- 저장소에는 올리지 않고 배포 파일에만 넣는다(live.json과 같은 방식).
- 개인을 식별하는 값은 담지 않는다. 날짜별 합계와 어제 많이 본 주소 5개만 둔다.
- 실패해도 조간 배포는 막지 않는다. 워크플로에서 continue-on-error로 돌린다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "frontend-vanilla-js" / "visits.json"
SITE = "https://korea-jogan.com/"
HOST = "korea-jogan.com"
PROPERTY = "559927668"
REPORT_URL = f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY}:batchRunReports"
KST = dt.timezone(dt.timedelta(hours=9))
DAYS = 30


def yesterday(now: dt.datetime) -> str:
    return (now.astimezone(KST).date() - dt.timedelta(days=1)).isoformat()


def report_body() -> dict:
    host = {"filter": {"fieldName": "hostName", "stringFilter": {"matchType": "EXACT", "value": HOST}}}
    metrics = [{"name": "screenPageViews"}, {"name": "activeUsers"}, {"name": "sessions"}]
    return {"requests": [
        {"dateRanges": [{"startDate": f"{DAYS}daysAgo", "endDate": "yesterday"}], "dimensionFilter": host,
         "dimensions": [{"name": "date"}], "metrics": metrics,
         "orderBys": [{"dimension": {"dimensionName": "date"}}], "keepEmptyRows": True, "limit": "100"},
        {"dateRanges": [{"startDate": "yesterday", "endDate": "yesterday"}], "dimensionFilter": host,
         "dimensions": [{"name": "pagePath"}], "metrics": [{"name": "screenPageViews"}],
         "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}], "limit": "5"},
    ]}


def to_visits(data: dict, now: dt.datetime) -> dict:
    """batchRunReports 응답을 visits.json 꼴로 바꾼다. 응답에 빠진 날은 0으로 채운다."""
    daily_report, pages_report = data["reports"]
    found = {}
    for row in daily_report.get("rows", []):
        raw = row["dimensionValues"][0]["value"]
        views, users, sessions = (int(m["value"]) for m in row["metricValues"])
        found[f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"] = {"views": views, "users": users, "sessions": sessions}
    end = dt.date.fromisoformat(yesterday(now))
    days = []
    for back in range(DAYS - 1, -1, -1):
        day = (end - dt.timedelta(days=back)).isoformat()
        days.append({"date": day, **found.get(day, {"views": 0, "users": 0, "sessions": 0})})
    pages = [{"path": row["dimensionValues"][0]["value"], "views": int(row["metricValues"][0]["value"])}
             for row in pages_report.get("rows", [])]
    return {
        "updatedAt": now.astimezone(KST).isoformat(timespec="minutes"),
        "through": end.isoformat(),
        "source": "Google Analytics 4 · korea-jogan.com · 하루 1회 집계",
        "note": "views는 페이지 조회수, users는 활성 사용자, sessions는 방문(세션) 수. 자동화·운영자 브라우저는 세지 않는다.",
        "days": days,
        "topPagesYesterday": pages,
    }


def public_visits() -> dict | None:
    try:
        request = urllib.request.Request(SITE + "visits.json?v=" + str(time.time_ns()), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except Exception as error:
        print("공개 중인 visits.json을 읽지 못했습니다:", type(error).__name__)
        return None


def write(visits: dict, out: Path = OUT) -> None:
    out.write_text(json.dumps(visits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def set_output(need: bool) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"need={'true' if need else 'false'}\n")


def reuse(now: dt.datetime, fetch_public=public_visits, out: Path = OUT) -> bool:
    """공개 중인 파일을 다시 싣고, 오늘 GA4를 새로 물어야 하는지 돌려준다."""
    previous = fetch_public()
    if previous and isinstance(previous.get("days"), list):
        write(previous, out)
    fresh = bool(previous) and previous.get("through") == yesterday(now)
    print("어제까지 담긴 파일을 그대로 씁니다." if fresh else "GA4에서 새로 받아야 합니다.")
    return not fresh


def fetch(token: str) -> dict:
    body = json.dumps(report_body()).encode("utf-8")
    request = urllib.request.Request(REPORT_URL, data=body, method="POST",
                                     headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--reuse", action="store_true")
    mode.add_argument("--fetch", action="store_true")
    args = parser.parse_args(argv)
    now = dt.datetime.now(KST)
    if args.reuse:
        set_output(reuse(now))
        return 0
    token = os.environ.get("GA4_ACCESS_TOKEN")
    if not token:
        print("GA4_ACCESS_TOKEN이 없어 방문 숫자를 만들지 않습니다.")
        return 0
    visits = to_visits(fetch(token), now)
    write(visits)
    last = visits["days"][-1]
    print(f"저장: visits.json · {visits['through']} 조회 {last['views']} · 사용자 {last['users']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
