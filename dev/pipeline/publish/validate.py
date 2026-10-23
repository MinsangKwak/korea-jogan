"""발행 전 데이터 검사. 하나라도 실패하면 종료 코드 1로 배포를 멈춘다.

--deploy를 붙이면 배포 규칙을 더한다. 사람이 승인하지 않은 초안(draft) 호가 목록에 있으면 실패한다.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ISSUES = ROOT / "dev" / "web" / "data" / "issues"
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


def check_structure(issue: object, name: str) -> list[str]:
    errors: list[str] = []

    def obj(value, path, fields):
        if not isinstance(value, dict):
            errors.append(f"{name}: {path}는 객체여야 함")
            return
        for key, rule in fields.items():
            optional = key.endswith("?")
            key = key.rstrip("?")
            if optional and key not in value:
                continue
            rule(value.get(key), f"{path}.{key}")

    def text(value, path):
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{name}: {path}는 비어 있지 않은 문자열이어야 함")

    def number(value, path):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            errors.append(f"{name}: {path}는 유한한 숫자여야 함")

    def boolean(value, path):
        if not isinstance(value, bool):
            errors.append(f"{name}: {path}는 참/거짓이어야 함")

    def array(rule, minimum=0):
        def check(value, path):
            if not isinstance(value, list) or len(value) < minimum:
                errors.append(f"{name}: {path}는 최소 {minimum}개 항목을 가진 배열이어야 함")
                return
            for i, item in enumerate(value):
                rule(item, f"{path}[{i}]")
        return check

    def record(fields):
        return lambda value, path: obj(value, path, fields)

    def row(rules):
        def check(value, path):
            if not isinstance(value, list) or len(value) != len(rules):
                errors.append(f"{name}: {path}는 {len(rules)}개 값을 가진 행이어야 함")
                return
            for i, rule in enumerate(rules):
                rule(value[i], f"{path}[{i}]")
        return check

    def date(value, path):
        try:
            if not isinstance(value, str) or not DATE_RE.fullmatch(value):
                raise ValueError
            dt.date.fromisoformat(value)
        except ValueError:
            errors.append(f"{name}: {path} 날짜 오류")

    def article_date(value, path):
        if value != "":
            date(value, path)

    def summaries(value, path):
        if not isinstance(value, dict) or any(not isinstance(v, str) for v in value.values()):
            errors.append(f"{name}: {path}는 시도별 문자열 객체여야 함")

    source = record({"name": text, "url": text})
    kv = record({"k": text, "v": text})
    article = record({"title": text, "outlet": text, "url": text, "date": article_date})
    diff = record({"q": text, "a": text, "cols": array(text, 1), "rows": array(array(text, 1), 1)})
    theme = record({"id": text, "title": text, "period": text, "summary": array(text, 1), "keywords": array(text, 1), "articles": array(article, 1), "diffs?": array(diff)})
    news = record({"title": text, "outlet": text, "url": text, "date": date, "summary": text, "cat": text, "figures?": array(text)})
    obj(issue, "issue", {
        "date": date,
        "lead": record({"kicker": text, "headline": text, "standfirst": text, "meta": text, "facts": array(record({"t": text, "v": text, "m": text}), 1)}),
        "briefs": array(record({"k": text, "m": text, "href": text, "dday?": date}), 1),
        "nums": array(record({"k": text, "v": text, "dir": text, "d": text, "ref": text, "grade": text, "src": source}), 1),
        "themes": array(theme, 1),
        "items": array(record({"k": text, "v": number, "y": text}), 1),
        "industries": array(record({"name": text, "sum": text, "f": array(row([text, text, text])), "news": row([text, text, text])})),
        "debt": array(row([number, number, number, text]), 1),
        "trade": record({"intro": text, "stats": array(record({"k": text, "v": text, "d": text, "dir": text}), 1), "src": text, "oct": record({"q": text, "a": text})}),
        "fiscal": record({"monthly": array(kv), "summary": array(kv), "outlook": array(kv), "monthlySrc": text, "outlookSrc": text, "debtSrc": text}),
        "nps": record({"kv": array(kv), "reform": array(kv), "src": text, "reformSrc": text, "alloc": array(record({"a": text, "amt": text, "s": number}), 1)}),
        "agenda": array(record({"day": text, "cat": text, "t": text})),
        "agendaSrc": text,
        "limits": array(text),
        "review?": record({"by": text, "at": text, "auto?": boolean}),
        "national?": record({"flow": array(text), "items": array(news)}),
        "regions?": record({"summary": summaries, "items": array(news)}),
    })
    if errors:
        return errors
    ids = [t["id"] for t in issue["themes"]]
    if len(ids) != len(set(ids)):
        errors.append(f"{name}: themes.id 중복")
    for i, theme in enumerate(issue["themes"]):
        for j, diff in enumerate(theme.get("diffs", [])):
            if any(len(r) != len(diff["cols"]) for r in diff["rows"]):
                errors.append(f"{name}: themes[{i}].diffs[{j}] 열과 행 길이 불일치")
    return errors


def check_issue(path: Path) -> list[str]:
    errors: list[str] = []
    name = path.name
    try:
        issue = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        return [f"{name}: JSON 읽기 실패 ({type(exc).__name__})"]
    errors.extend(check_structure(issue, name))
    if errors:
        return errors

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
    path = ROOT / "dev" / "web" / "data" / "corrections.json"
    if not path.exists():
        return ["corrections.json 파일 없음"]
    errors: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            raise ValueError("items 배열 없음")
    except (ValueError, OSError):
        return ["corrections.json 형식 오류"]
    for i, c in enumerate(data["items"]):
        if not isinstance(c, dict):
            errors.append(f"corrections.json: items[{i}] 객체가 아님")
            continue
        missing = [k for k in CORRECTION_KEYS if not str(c.get(k, "")).strip()]
        if missing:
            errors.append(f"corrections.json: items[{i}] {', '.join(missing)} 없음")
            continue
        if not DATE_RE.match(c["date"]) or c["issue"] not in dates:
            errors.append(f"corrections.json: items[{i}] 날짜 형식 오류이거나 없는 호 '{c['issue']}'")
    return errors


def main(argv: list[str] | None = None) -> int:
    deploy = "--deploy" in (argv if argv is not None else sys.argv[1:])
    try:
        index = json.loads((ISSUES / "index.json").read_text(encoding="utf-8"))
        if not isinstance(index, dict) or not isinstance(index.get("issues"), list) or not index["issues"]:
            raise ValueError("issues 배열 누락")
        for date in [index.get("latest"), *index["issues"]]:
            if not isinstance(date, str) or not DATE_RE.fullmatch(date):
                raise ValueError("호 날짜 형식 오류")
            dt.date.fromisoformat(date)
        if len(index["issues"]) != len(set(index["issues"])):
            raise ValueError("호 날짜 중복")
    except (ValueError, OSError) as exc:
        print(f"검사 실패: index.json ({exc})")
        return 1
    errors: list[str] = []
    if index["latest"] not in index["issues"]:
        errors.append("index.json: latest가 issues 목록에 없음")
    for date in index["issues"]:
        path = ISSUES / f"{date}.json"
        if not path.exists():
            errors.append(f"index.json: {date}.json 파일 없음")
            continue
        issue_errors = check_issue(path)
        errors.extend(issue_errors)
        if deploy and not issue_errors and json.loads(path.read_text(encoding="utf-8")).get("status") == "draft":
            errors.append(f"{date}.json: 승인 전 초안(draft)은 배포하지 않음. dev/pipeline/publish/approve.py로 승인한 뒤 올림")
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
