"""사람이 머리기사와 핵심 숫자를 확인한 뒤 초안 호를 공개(published)로 바꾼다.

사용: python3 scripts/approve.py 2026-10-20 --by 홍길동
승인 전에 화면에서 머리기사(lead), 핵심 숫자(nums), 기준이 갈린 숫자(themes[].diffs)를 원문과 대조한다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ISSUES = ROOT / "public" / "data" / "issues"
KST = dt.timezone(dt.timedelta(hours=9))


def approve(date: str, by: str, now: dt.datetime | None = None) -> Path:
    path = ISSUES / f"{date}.json"
    if not path.exists():
        raise FileNotFoundError(f"{path.relative_to(ROOT)} 없음")
    issue = json.loads(path.read_text(encoding="utf-8"))
    if issue.get("status") != "draft":
        raise ValueError(f"{date}호 상태가 '{issue.get('status')}'입니다. 초안(draft)만 승인합니다")
    at = (now or dt.datetime.now(KST)).isoformat(timespec="minutes")
    issue["status"] = "published"
    issue["review"] = {"by": by, "at": at, "scope": ["lead", "nums", "themes.diffs"]}
    path.write_text(json.dumps(issue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="초안 호를 사람이 확인한 공개 호로 바꾼다")
    parser.add_argument("date", help="YYYY-MM-DD")
    parser.add_argument("--by", required=True, help="확인한 사람 이름")
    args = parser.parse_args()
    try:
        path = approve(args.date, args.by.strip())
    except (FileNotFoundError, ValueError) as e:
        print(e)
        return 1
    print(f"승인: {path.relative_to(ROOT)} → python3 scripts/validate.py --deploy 로 확인한 뒤 올립니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
