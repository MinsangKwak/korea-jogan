"""초안의 문장 편집이 허용된 텍스트와 기존 근거 범위 안에 있는지 대조한다.

사용: python3 dev/pipeline/publish/check_editorial.py --base-ref <40자리 SHA> --date YYYY-MM-DD
새 호: python3 dev/pipeline/publish/check_editorial.py --baseline-file <조사 직후 원본 JSON> --date YYYY-MM-DD
이 검사는 고유명사·주체·인과관계의 정확성을 보장하지 않는다. 편집 전후 원문 대조가 필요하다.
"""
from __future__ import annotations

import argparse
from collections import Counter
import datetime as dt
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
KST = dt.timezone(dt.timedelta(hours=9))
DATE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
COMMIT = re.compile(r"[0-9a-fA-F]{40}\Z")
QUALIFIERS = ("혐의", "추정", "전망", "잠정", "예정", "계획", "주장", "미확정", "미확인", "확인되지", "정부안", "확정안")
UNITS = (
    "%포인트", "%p", "퍼센트포인트", "퍼센트", "포인트", "bp", "%", "조달러", "억달러", "만달러", "천달러", "달러",
    "조원", "억원", "만원", "천원", "백만원", "원", "조", "억", "만", "천", "백", "개월", "분기", "년", "월", "일",
    "시간", "분", "초", "명", "건", "개", "곳", "회", "배", "대", "주", "톤", "kg", "㎏", "km", "㎞", "m", "t", "$",
)
NUMBER = re.compile(
    r"[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
    + r"(?:\s*(?:" + "|".join(re.escape(unit) for unit in sorted(UNITS, key=len, reverse=True)) + r"))?"
)
URL = re.compile(r"https?://[^\s<>\"']+")


def today_kst() -> str:
    return dt.datetime.now(KST).date().isoformat()


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not DATE.fullmatch(value):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def field_name(path: tuple) -> str:
    return "issue" + "".join(f"[{part}]" if isinstance(part, int) else "." + part for part in path)


def writable(path: tuple) -> bool:
    if path in (("headline",), ("lead", "headline"), ("lead", "standfirst")):
        return True
    if len(path) == 3:
        if path[0] == "briefs" and isinstance(path[1], int) and path[2] in ("k", "m"):
            return True
        if path[:2] == ("national", "flow") and isinstance(path[2], int):
            return True
        if path[:2] == ("regions", "summary") and isinstance(path[2], str):
            return True
    if len(path) == 4:
        if path[0] == "themes" and isinstance(path[1], int) and path[2] == "summary" and isinstance(path[3], int):
            return True
        if path[0] in ("national", "regions") and path[1] == "items" and isinstance(path[2], int) and path[3] == "summary":
            return True
    return False


def numbers(text: str) -> Counter:
    return Counter(re.sub(r"\s+", "", match.group()).replace(",", "").replace("−", "-") for match in NUMBER.finditer(text))


def urls(text: str) -> Counter:
    return Counter(match.group().rstrip(".,;:!?)]}〉》」』") for match in URL.finditer(text))


def check(before: dict, after: dict) -> list[str]:
    """허용 경로의 문장만 비교하며, 위반 이유를 필드 경로와 함께 반환한다."""
    errors: list[str] = []
    if not isinstance(before, dict) or not isinstance(after, dict):
        return ["issue: 기준 자료와 편집 자료는 객체여야 합니다"]
    if before.get("status") != "draft" or after.get("status") != "draft":
        errors.append("issue.status: 공개 전 초안(draft)만 문장 편집할 수 있습니다")
    if not valid_date(before.get("date")) or before.get("date") != after.get("date"):
        errors.append("issue.date: 유효한 같은 날짜의 초안이어야 합니다")

    def compare(old, new, path: tuple):
        name = field_name(path)
        if type(old) is not type(new):
            errors.append(f"{name}: 자료 형식을 바꿀 수 없습니다")
            return
        if isinstance(old, dict):
            if old.keys() != new.keys():
                errors.append(f"{name}: 키를 추가하거나 삭제할 수 없습니다")
            for key in old.keys() & new.keys():
                compare(old[key], new[key], path + (key,))
            return
        if isinstance(old, list):
            if len(old) != len(new):
                errors.append(f"{name}: 배열 길이를 바꿀 수 없습니다")
                return
            if old != new and all(isinstance(item, str) for item in old) and Counter(old) == Counter(new):
                errors.append(f"{name}: 배열 순서를 바꿀 수 없습니다")
                return
            for index, (old_item, new_item) in enumerate(zip(old, new)):
                compare(old_item, new_item, path + (index,))
            return
        if old == new:
            return
        if not isinstance(old, str) or not writable(path):
            errors.append(f"{name}: 문장 편집 허용 필드가 아닙니다")
            return
        if not new.strip():
            errors.append(f"{name}: 문장을 비울 수 없습니다")
        if numbers(old) != numbers(new):
            errors.append(f"{name}: 숫자·부호·단위를 추가하거나 바꿀 수 없습니다")
        if urls(old) != urls(new):
            errors.append(f"{name}: 본문 안의 원문 주소를 추가하거나 바꿀 수 없습니다")
        changed = [word for word in QUALIFIERS if old.count(word) != new.count(word)]
        if changed:
            errors.append(f"{name}: 확인 범위 한정어를 유지해야 합니다 ({', '.join(changed)})")

    compare(before, after, ())
    return errors


def read_baseline(base_ref: str, relative: str) -> dict:
    result = subprocess.run(
        ["git", "show", f"{base_ref}:{relative}"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True, timeout=30,
    )
    return json.loads(result.stdout)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    baseline = parser.add_mutually_exclusive_group(required=True)
    baseline.add_argument("--base-ref", help="편집 시작 때 확인한 dev의 40자리 커밋 SHA")
    baseline.add_argument("--baseline-file", type=Path, help="새 호 조사 직후 따로 보관한 편집 전 원본 JSON 경로")
    parser.add_argument("--date", required=True, help="한국 시간 오늘의 초안 날짜")
    args = parser.parse_args(argv)
    if args.base_ref and not COMMIT.fullmatch(args.base_ref):
        print("편집 검사 실패: --base-ref에는 고정된 40자리 커밋 SHA가 필요합니다")
        return 1
    if not valid_date(args.date) or args.date != today_kst():
        print("편집 검사 실패: --date는 한국 시간 오늘의 유효한 날짜여야 합니다")
        return 1
    relative = f"dev/web/data/issues/{args.date}.json"
    try:
        candidate = ROOT / relative
        if args.baseline_file is not None:
            if args.baseline_file.resolve() == candidate.resolve():
                print("편집 검사 실패: 원본 스냅샷과 편집 후보 파일은 서로 달라야 합니다")
                return 1
            before = json.loads(args.baseline_file.read_text(encoding="utf-8"))
        else:
            before = read_baseline(args.base_ref, relative)
        after = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"편집 검사 실패: 기준 또는 편집 JSON을 읽지 못했습니다 ({type(exc).__name__})")
        return 1
    errors = check(before, after)
    if isinstance(before, dict) and before.get("date") != args.date:
        errors.append("issue.date: 기준 자료의 날짜가 --date와 다릅니다")
    if errors:
        print("편집 검사 실패:")
        for error in errors:
            print("- " + error)
        return 1
    print(f"편집 범위 검사 통과: {args.date}호 · 사실관계와 가독성은 원문과 별도 대조합니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
