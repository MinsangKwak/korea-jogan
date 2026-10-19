"""발행 전 데이터 검사. 하나라도 실패하면 종료 코드 1로 배포를 멈춘다."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ISSUES = ROOT / "public" / "data" / "issues"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REQUIRED = ("date", "lead", "briefs", "nums", "media", "diffs", "views", "items", "industries", "trade", "debt", "fiscal", "nps", "agenda", "limits")


def check_issue(path: Path) -> list[str]:
    errors: list[str] = []
    issue = json.loads(path.read_text(encoding="utf-8"))
    name = path.name

    for key in REQUIRED:
        if key not in issue:
            errors.append(f"{name}: 필수 항목 '{key}' 없음")
    if errors:
        return errors

    if not DATE_RE.match(issue["date"]) or f"{issue['date']}.json" != name:
        errors.append(f"{name}: date 값과 파일 이름이 맞지 않음")

    # 핵심 숫자는 모두 출처 기관과 원문 링크가 있어야 한다
    for i, m in enumerate(issue["nums"]):
        src = m.get("src") or {}
        if not src.get("name") or not str(src.get("url", "")).startswith("https://"):
            errors.append(f"{name}: nums[{i}] '{m.get('k')}' 출처 누락")
        if m.get("dir") not in ("up", "down", "flat"):
            errors.append(f"{name}: nums[{i}] 방향 값은 up/down/flat만 허용")

    # 출처 명시 수치가 전체 추출 수치보다 많을 수 없다
    for i, m in enumerate(issue["media"]):
        if not str(m.get("u", "")).startswith("https://"):
            errors.append(f"{name}: media[{i}] '{m.get('o')}' 기사 링크 누락")
        if not (0 <= m.get("s", -1) <= m.get("n", -1)):
            errors.append(f"{name}: media[{i}] '{m.get('o')}' 수치 개수(s<=n) 오류")

    for i, it in enumerate(issue["items"]):
        if not isinstance(it.get("v"), (int, float)) or it["v"] <= 0:
            errors.append(f"{name}: items[{i}] '{it.get('k')}' 금액 오류")

    # 국가채무는 연도 오름차순, 금액·비율은 상식 범위 안이어야 한다
    years = [row[0] for row in issue["debt"]]
    if years != sorted(years):
        errors.append(f"{name}: debt 연도 순서 오류")
    for row in issue["debt"]:
        year, amount, ratio, _kind = row
        if not (100 <= amount <= 5000) or not (10 <= ratio <= 150):
            errors.append(f"{name}: debt {year} 값이 정상 범위를 벗어남")

    return errors


def main() -> int:
    index = json.loads((ISSUES / "index.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    if index["latest"] not in index["issues"]:
        errors.append("index.json: latest가 issues 목록에 없음")
    for date in index["issues"]:
        path = ISSUES / f"{date}.json"
        if not path.exists():
            errors.append(f"index.json: {date}.json 파일 없음")
            continue
        errors.extend(check_issue(path))

    if errors:
        print("검사 실패")
        for e in errors:
            print(" -", e)
        return 1
    print(f"검사 통과: {len(index['issues'])}개 호")
    return 0


if __name__ == "__main__":
    sys.exit(main())
