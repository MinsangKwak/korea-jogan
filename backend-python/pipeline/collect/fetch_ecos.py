"""한국은행 ECOS에서 환율·기준금리·주가지수를 받아 dev/pipeline/collect/raw/ecos/에 원본 그대로 저장한다.

환경변수 ECOS_API_KEY가 필요하다. 키는 GitHub Secrets에만 두고 코드·페이지에 넣지 않는다.
통계표·항목 코드는 ECOS '통계코드검색'에서 한 번 더 확인한 뒤 쓴다.
사용: python dev/pipeline/collect/fetch_ecos.py [--date YYYY-MM-DD]  (발행일. 없으면 한국 시간 오늘)
조간 기준에 맞춰 발행일 전날까지의 값만 받는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "dev" / "pipeline" / "collect" / "raw" / "ecos"
BASE = "https://ecos.bok.or.kr/api/StatisticSearch"

# 이름: (통계표 코드, 주기, 항목 코드)
SERIES = {
    "usdkrw": ("731Y001", "D", "0000001"),
    "base_rate": ("722Y001", "D", "0101000"),
    "kospi": ("802Y001", "D", "0001000"),
    "kosdaq": ("802Y001", "D", "0089000"),
}
KST = dt.timezone(dt.timedelta(hours=9))


def fetch(key: str, stat: str, cycle: str, item: str, start: str, end: str) -> dict:
    url = f"{BASE}/{key}/json/kr/1/100/{stat}/{cycle}/{start}/{end}/{item}"
    with urllib.request.urlopen(url, timeout=30) as res:
        return json.load(res)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="발행일 YYYY-MM-DD")
    args = parser.parse_args()
    key = os.environ.get("ECOS_API_KEY")
    if not key:
        print("ECOS_API_KEY가 없습니다.")
        return 1
    issue = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(KST).date()
    # 조간은 전날까지 발표된 값만 담는다
    last = issue - dt.timedelta(days=1)
    start = (last - dt.timedelta(days=21)).strftime("%Y%m%d")
    end = last.strftime("%Y%m%d")

    result = {"collectedAt": dt.datetime.now(KST).isoformat(timespec="seconds"), "issue": issue.isoformat(), "series": {}}
    failed = []
    for name, (stat, cycle, item) in SERIES.items():
        data = fetch(key, stat, cycle, item, start, end)
        # ECOS는 오류도 200으로 돌려주고 RESULT에 코드를 담는다
        if "RESULT" in data:
            failed.append(f"{name}: {data['RESULT'].get('CODE')} {data['RESULT'].get('MESSAGE')}")
        result["series"][name] = data

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{issue.isoformat()}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"저장: {path.relative_to(ROOT)}")
    for f in failed:
        print(" - 받지 못함", f)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
