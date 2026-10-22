"""사람이 머리기사와 핵심 숫자를 확인한 뒤 초안 호를 공개(published)로 바꾼다.

사용: python3 scripts/approve.py 2026-10-20 --by 홍길동
승인 전에 화면에서 머리기사(lead), 핵심 숫자(nums), 기준이 갈린 숫자(themes[].diffs)를 원문과 대조한다.

python3 scripts/approve.py 2026-10-20 --auto
06시까지 사람이 승인하지 않은 초안을 아침 발행 워크플로가 자동으로 공개할 때 쓴다.
누가 확인했다고 적지 않고 review.auto를 남겨, 화면이 '편집자 확인' 대신 '자동 발행'으로 보여 준다.
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


AUTO_BY = "자동 발행"


def approve(date: str, by: str, now: dt.datetime | None = None, auto: bool = False) -> Path:
    path = ISSUES / f"{date}.json"
    if not path.exists():
        raise FileNotFoundError(f"{path.relative_to(ROOT)} 없음")
    issue = json.loads(path.read_text(encoding="utf-8"))
    if issue.get("status") != "draft":
        raise ValueError(f"{date}호 상태가 '{issue.get('status')}'입니다. 초안(draft)만 승인합니다")
    at = (now or dt.datetime.now(KST)).isoformat(timespec="minutes")
    issue["status"] = "published"
    if auto:
        issue["review"] = {"by": AUTO_BY, "at": at, "scope": [], "auto": True}
    else:
        issue["review"] = {"by": by, "at": at, "scope": ["lead", "nums", "themes.diffs"]}
    path.write_text(json.dumps(issue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="초안 호를 사람이 확인한 공개 호로 바꾼다")
    parser.add_argument("date", help="YYYY-MM-DD")
    who = parser.add_mutually_exclusive_group(required=True)
    who.add_argument("--by", help="확인한 사람 이름")
    who.add_argument("--auto", action="store_true", help="사람 확인 없이 자동 발행(아침 발행 워크플로 전용)")
    args = parser.parse_args()
    try:
        path = approve(args.date, (args.by or "").strip(), auto=args.auto)
    except (FileNotFoundError, ValueError) as e:
        print(e)
        return 1
    print(f"승인: {path.relative_to(ROOT)} → python3 scripts/validate.py --deploy 로 확인한 뒤 올립니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
