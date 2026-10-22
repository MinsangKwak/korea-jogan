"""한국은행 ECOS에서 오늘까지 나온 최신 공식 숫자를 받아 public/data/live.json을 만든다.

사용: python scripts/build/build_live.py
배포 워크플로가 평일 낮에 1시간마다 돌린다. 저장소에는 올리지 않고 배포 파일에만 넣는다.

원칙
- 승인된 조간과 별개인 '자동 갱신' 숫자다. 화면은 '사람 확인 전'으로 구분해 보여 준다.
- ECOS는 장중 시세를 주지 않는다. 일별 확정값(종가·매매기준율)이 나오면 다음 실행 때 반영된다.
- ECOS_API_KEY가 없으면 아무것도 만들지 않고 0으로 끝난다. 화면은 파일이 없으면 띠를 숨긴다.
- 받은 항목이 하나도 없으면 1로 끝나되, 지난 파일을 지우지 않는다.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
from pathlib import Path

# 수집기(scripts/collect)를 그대로 불러 쓴다
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "collect"))

import ecos_nums  # noqa: E402
import fetch_ecos  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "live.json"
KST = dt.timezone(dt.timedelta(hours=9))
# 조간의 '전 거래일 종가'와 달리 자동 갱신 띠는 그날 값일 수 있어 이름을 바꾼다
LABELS = {"kospi": "코스피 종가", "kosdaq": "코스닥 종가"}
# 띠에 보이는 순서
ORDER = ("kospi", "kosdaq", "usdkrw", "base_rate")
LOOKBACK_DAYS = 21


def build(fetch, now: dt.datetime) -> dict:
    """fetch(stat, cycle, item, start, end)로 받은 원본을 live.json 꼴로 바꾼다."""
    end = now.date()
    start = end - dt.timedelta(days=LOOKBACK_DAYS)
    items, missing = [], []
    for name in ORDER:
        stat, cycle, item = fetch_ecos.SERIES[name]
        try:
            raw = fetch(stat, cycle, item, start.strftime("%Y%m%d"), end.strftime("%Y%m%d"))
        except Exception as e:
            missing.append(f"{name}: {type(e).__name__}")
            continue
        num = ecos_nums.to_num(name, raw)
        if num is None:
            result = raw.get("RESULT", {}) if isinstance(raw, dict) else {}
            missing.append(f"{name}: {result.get('CODE', '값 없음')}")
            continue
        num["k"] = LABELS.get(name, num["k"])
        num["id"] = name
        items.append(num)
    return {
        "updatedAt": now.isoformat(timespec="minutes"),
        "source": "한국은행 경제통계시스템(ECOS)",
        "note": "자동 갱신 · 사람 확인 전. 승인된 조간 숫자와 다를 수 있습니다.",
        "items": items,
        "missing": missing,
    }


def main() -> int:
    key = os.environ.get("ECOS_API_KEY")
    if not key:
        print("ECOS_API_KEY가 없어 최신 숫자를 만들지 않습니다.")
        return 0
    live = build(lambda *a: fetch_ecos.fetch(key, *a), dt.datetime.now(KST))
    for m in live["missing"]:
        print(" - 받지 못함", m)
    if not live["items"]:
        print("받은 항목이 없어 live.json을 바꾸지 않습니다.")
        return 1
    OUT.write_text(json.dumps(live, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    shown = OUT.relative_to(ROOT) if OUT.is_relative_to(ROOT) else OUT
    print(f"저장: {shown} · {len(live['items'])}개 항목")
    return 0


if __name__ == "__main__":
    sys.exit(main())
