"""발행 전 데이터 검사. 하나라도 실패하면 종료 코드 1로 배포를 멈춘다.

--deploy를 붙이면 배포 규칙을 더한다. 사람이 승인하지 않은 초안(draft) 호가 목록에 있으면 실패한다.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ISSUES = ROOT / "public" / "data" / "issues"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REGIONS = {
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기",
    "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
}
KST = dt.timezone(dt.timedelta(hours=9))
STATUSES = ("prototype", "draft", "published")
# 00시 발행 호는 이 시각(발행일 한국 시간) 뒤에 모은 자료를 담지 않는다
COLLECT_DEADLINE = dt.time(6, 0)
CORRECTION_KEYS = ("date", "issue", "section", "before", "after", "reason")
REQUIRED = ("date", "lead", "briefs", "nums", "themes", "items", "industries", "trade", "debt", "fiscal", "nps", "agenda", "limits")


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
        return errors

    errors.extend(check_status(name, issue))

    # 핵심 숫자는 모두 출처 기관과 원문 링크가 있어야 한다
    for i, m in enumerate(issue["nums"]):
        src = m.get("src") or {}
        if not src.get("name") or not str(src.get("url", "")).startswith("https://"):
            errors.append(f"{name}: nums[{i}] '{m.get('k')}' 출처 누락")
        if m.get("dir") not in ("up", "down", "flat"):
            errors.append(f"{name}: nums[{i}] 방향 값은 up/down/flat만 허용")

    # 주제마다 AI 요약과 기사 링크가 있어야 한다
    for t in issue["themes"]:
        if not t.get("summary") or not t.get("articles") or not t.get("keywords"):
            errors.append(f"{name}: 주제 '{t.get('title')}' 요약·기사·키워드 누락")
        for j, a in enumerate(t.get("articles", [])):
            if not str(a.get("url", "")).startswith("https://"):
                errors.append(f"{name}: 주제 '{t.get('title')}' 기사[{j}] 링크 누락")

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

    # 전국·지역 뉴스는 기사 링크와 요약이 있어야 하고, 지역은 17개 시도 이름만 쓴다
    for i, it in enumerate(issue.get("national", {}).get("items", [])):
        if not str(it.get("url", "")).startswith("https://") or not it.get("summary"):
            errors.append(f"{name}: national[{i}] 링크·요약 누락")
    for i, it in enumerate(issue.get("regions", {}).get("items", [])):
        if it.get("region") not in REGIONS:
            errors.append(f"{name}: regions[{i}] 시도 이름 오류 '{it.get('region')}'")
        if not str(it.get("url", "")).startswith("https://") or not it.get("summary"):
            errors.append(f"{name}: regions[{i}] 링크·요약 누락")

    return errors


def check_status(name: str, issue: dict) -> list[str]:
    """호 상태와 승인 기록, 수집 시각을 본다."""
    errors: list[str] = []
    status = issue.get("status")
    if status not in STATUSES:
        errors.append(f"{name}: status는 {'/'.join(STATUSES)} 중 하나여야 함")
        return errors
    if status != "published":
        return errors

    # 공개 호는 누가 언제 머리기사와 핵심 숫자를 확인했는지 남아 있어야 한다
    review = issue.get("review") or {}
    if not str(review.get("by", "")).strip():
        errors.append(f"{name}: published 호에 review.by(승인한 사람) 없음")
    try:
        dt.datetime.fromisoformat(str(review.get("at")))
    except ValueError:
        errors.append(f"{name}: published 호의 review.at이 ISO 8601 시각이 아님")

    try:
        collected = dt.datetime.fromisoformat(str(issue.get("collectedAt")))
    except ValueError:
        errors.append(f"{name}: published 호의 collectedAt이 ISO 8601 시각이 아님")
        return errors
    if collected.tzinfo is None:
        errors.append(f"{name}: collectedAt에 시간대(+09:00)가 없음")
        return errors
    deadline = dt.datetime.combine(dt.date.fromisoformat(issue["date"]), COLLECT_DEADLINE, KST)
    if collected > deadline:
        errors.append(f"{name}: collectedAt이 발행일 {COLLECT_DEADLINE:%H:%M}(한국 시간)보다 늦음. 조간에는 그날 장중 자료를 넣지 않음")
    return errors


def check_corrections(dates: list[str]) -> list[str]:
    """정정 기록은 항목마다 무엇을 왜 고쳤는지가 있고, 있는 호를 가리켜야 한다."""
    path = ROOT / "public" / "data" / "corrections.json"
    if not path.exists():
        return ["corrections.json 파일 없음"]
    errors: list[str] = []
    data = json.loads(path.read_text(encoding="utf-8"))
    for i, c in enumerate(data.get("items", [])):
        missing = [k for k in CORRECTION_KEYS if not str(c.get(k, "")).strip()]
        if missing:
            errors.append(f"corrections.json: items[{i}] {', '.join(missing)} 없음")
            continue
        if not DATE_RE.match(c["date"]) or c["issue"] not in dates:
            errors.append(f"corrections.json: items[{i}] 날짜 형식 오류이거나 없는 호 '{c['issue']}'")
    return errors


def main(argv: list[str] | None = None) -> int:
    deploy = "--deploy" in (argv if argv is not None else sys.argv[1:])
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
        if deploy and json.loads(path.read_text(encoding="utf-8")).get("status") == "draft":
            errors.append(f"{date}.json: 승인 전 초안(draft)은 배포하지 않음. scripts/approve.py로 승인한 뒤 올림")
    errors.extend(check_corrections(index["issues"]))

    if errors:
        print("검사 실패")
        for e in errors:
            print(" -", e)
        return 1
    print(f"검사 통과: {len(index['issues'])}개 호" + (" (배포 규칙 포함)" if deploy else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
