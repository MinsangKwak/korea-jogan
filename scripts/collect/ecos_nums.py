"""data/raw/ecos/YYYY-MM-DD.json(원본)을 발행 JSON의 nums 항목 꼴로 바꾼다.

사용: python scripts/collect/ecos_nums.py 2026-10-20
결과는 data/raw/ecos/YYYY-MM-DD.nums.json에 저장한다. 일일 작업은 이 값을 기사 검색보다 먼저 쓴다.
값은 발행일 전날까지의 마지막 관측값이고, 변동은 그 직전 관측값과 비교한다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "ecos"
ECOS_URL = "https://ecos.bok.or.kr/"

# 원본 이름: (화면 이름, 단위, 소수 자리, ECOS 통계표 이름)
SPEC = {
    "kospi": ("코스피 전 거래일 종가", "", 2, "주식시장(일) · KOSPI지수"),
    "kosdaq": ("코스닥 전 거래일 종가", "", 2, "주식시장(일) · KOSDAQ지수"),
    "usdkrw": ("원·달러 환율", "원", 1, "주요국 통화의 대원화환율 · 원/미국달러(매매기준율)"),
    "base_rate": ("한국은행 기준금리", "%", 2, "한국은행 기준금리 및 여수신금리"),
}


def rows(data: dict) -> list[tuple[str, float]]:
    """ECOS 응답에서 (YYYYMMDD, 값)을 날짜순으로 꺼낸다. 오류 응답이면 빈 목록."""
    out = []
    for r in data.get("StatisticSearch", {}).get("row", []):
        try:
            out.append((r["TIME"], float(str(r["DATA_VALUE"]).replace(",", ""))))
        except (KeyError, ValueError):
            continue
    return sorted(out)


def fmt(v: float, digits: int) -> str:
    return f"{v:,.{digits}f}"


def to_num(name: str, data: dict) -> dict | None:
    k, unit, digits, table = SPEC[name]
    obs = rows(data)
    if not obs:
        return None
    time, value = obs[-1]
    base = f"{time[:4]}-{time[4:6]}-{time[6:]}"
    entry = {
        "k": k,
        "v": fmt(value, digits) + unit,
        "dir": "flat",
        "d": "변동 없음",
        "ref": f"{base} 기준",
        "grade": "A",
        "src": {"name": "한국은행 경제통계시스템(ECOS)", "title": table, "pub": base, "base": base, "url": ECOS_URL},
    }
    if len(obs) >= 2:
        prev_time, prev = obs[-2]
        diff = value - prev
        if abs(diff) >= 10 ** -digits / 2:
            entry["dir"] = "up" if diff > 0 else "down"
            sign = "+" if diff > 0 else "−"
            pct = f" ({sign}{abs(diff) / prev * 100:.2f}%)" if prev else ""
            entry["d"] = f"{sign}{fmt(abs(diff), digits)}{unit}{pct}"
        entry["ref"] = f"{base} 기준 · 직전 {prev_time[4:6]}/{prev_time[6:]} 대비"
    return entry


def convert(raw: dict) -> list[dict]:
    series = raw.get("series", {})
    return [n for name in SPEC if name in series for n in [to_num(name, series[name])] if n]


def main() -> int:
    if len(sys.argv) != 2:
        print("사용: python scripts/collect/ecos_nums.py YYYY-MM-DD")
        return 2
    src = RAW / f"{sys.argv[1]}.json"
    if not src.exists():
        print(f"{src.relative_to(ROOT)} 없음. 먼저 fetch_ecos.py --date {sys.argv[1]}")
        return 1
    nums = convert(json.loads(src.read_text(encoding="utf-8")))
    out = RAW / f"{sys.argv[1]}.nums.json"
    out.write_text(json.dumps(nums, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"저장: {out.relative_to(ROOT)} ({len(nums)}개)")
    return 0 if nums else 1


if __name__ == "__main__":
    sys.exit(main())
