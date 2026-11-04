"""안정된 main 작업본에 일일 브랜치의 허용된 데이터만 가져온다.

사용: python3 dev/pipeline/publish/prepare_daily.py --date YYYY-MM-DD --source-ref <SHA> --main-ref <SHA>
소스 브랜치의 코드와 과거 호는 실행하거나 복사하지 않는다. 원문 사실 검증은 별도 조사·검토 범위다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
KST = dt.timezone(dt.timedelta(hours=9))
SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")
INDEX = "dev/web/data/issues/index.json"
TRACKERS = "dev/web/data/trackers.json"


class PreparationError(ValueError):
    pass


def today_kst() -> str:
    return dt.datetime.now(KST).date().isoformat()


def valid_date(value) -> bool:
    if not isinstance(value, str) or not DATE.fullmatch(value):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def git(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True, encoding="utf-8", check=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as exc:
        raise PreparationError(f"Git 자료를 확인하지 못했습니다 ({type(exc).__name__})") from exc
    return result.stdout.strip()


def validate_sha(root: Path, value: str) -> str:
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise PreparationError("고정된 40자리 커밋 SHA가 필요합니다")
    resolved = git(root, "rev-parse", "--verify", value + "^{commit}")
    if resolved.lower() != value.lower():
        raise PreparationError("선택한 커밋과 확인된 커밋이 다릅니다")
    return resolved


def blob(root: Path, ref: str, path: str, required: bool = True) -> str | None:
    entry = git(root, "ls-tree", ref, "--", path)
    if not entry:
        if required:
            raise PreparationError(f"원본 파일이 없습니다: {path}")
        return None
    metadata, _, actual = entry.partition("\t")
    if actual != path or not metadata.startswith("100644 blob "):
        raise PreparationError(f"일반 JSON 파일만 가져올 수 있습니다: {path}")
    return git(root, "show", ref + ":" + path)


def decode(text: str, label: str) -> dict:
    def unique(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise PreparationError(f"JSON 키가 중복됐습니다: {label}.{key}")
            out[key] = value
        return out

    try:
        data = json.loads(text, object_pairs_hook=unique)
    except (TypeError, ValueError) as exc:
        raise PreparationError(f"JSON 자료가 올바르지 않습니다: {label}") from exc
    if not isinstance(data, dict):
        raise PreparationError(f"JSON 객체가 필요합니다: {label}")
    return data


def read_json(root: Path, ref: str, path: str) -> dict:
    return decode(blob(root, ref, path), path)


def dates(index: dict, label: str) -> list[str]:
    values = index.get("issues")
    if not isinstance(values, list) or not values or not all(valid_date(day) for day in values):
        raise PreparationError(f"발행 목록의 날짜가 올바르지 않습니다: {label}")
    if len(values) != len(set(values)) or index.get("latest") not in values:
        raise PreparationError(f"발행 목록에 중복 또는 최신 날짜 오류가 있습니다: {label}")
    return values


def require_checks(payload: dict, ref: str) -> None:
    """GitHub Actions가 선택한 일일 커밋의 데이터·브라우저 검사를 마쳤는지 확인한다."""
    if not isinstance(payload, dict) or not isinstance(payload.get("check_runs"), list):
        raise PreparationError("CI 검사 응답이 올바르지 않습니다")
    total = payload.get("total_count")
    if type(total) is not int or total < 0 or total > len(payload["check_runs"]):
        raise PreparationError("CI 검사 응답이 누락되거나 잘려 전체 결과를 확인할 수 없습니다")
    found = {}
    for item in payload["check_runs"]:
        if not isinstance(item, dict) or item.get("head_sha") != ref or (item.get("app") or {}).get("slug") != "github-actions":
            continue
        name = item.get("name")
        if name in ("data", "browser") and isinstance(item.get("id"), int):
            if name not in found or item["id"] > found[name]["id"]:
                found[name] = item
    for name in ("data", "browser"):
        check = found.get(name)
        if not check or check.get("status") != "completed" or check.get("conclusion") != "success":
            raise PreparationError(f"일일 커밋의 {name} CI 성공이 확인되지 않았습니다")


def published_build_matches(index: object, info: object, date: str, source_ref: str) -> bool:
    """호 날짜와 실제 배포 소스가 모두 같을 때만 공개 완료로 본다."""
    return (
        isinstance(index, dict) and isinstance(info, dict)
        and index.get("latest") == date
        and info.get("environment") == "production"
        and info.get("sourceSha") == source_ref
        and info.get("issueDate") == date
    )


def prepare(root: Path, date: str, source_ref: str, main_ref: str) -> dict:
    if not valid_date(date):
        raise PreparationError("유효한 발행일이 필요합니다")
    source_ref = validate_sha(root, source_ref)
    main_ref = validate_sha(root, main_ref)
    if git(root, "rev-parse", "HEAD") != main_ref or git(root, "status", "--porcelain", "--untracked-files=no"):
        raise PreparationError("변경 없는 main 작업본에서만 데이터를 준비할 수 있습니다")
    current_index = read_json(root, main_ref, INDEX)
    current_dates = dates(current_index, "main")
    if any(day > date for day in current_dates):
        raise PreparationError("main 발행 목록에 오늘 이후 날짜가 있습니다")
    issue_path = f"dev/web/data/issues/{date}.json"
    current_issue = blob(root, main_ref, issue_path, required=False)
    if current_issue is not None:
        issue = decode(current_issue, issue_path)
        if issue.get("date") == date and issue.get("status") == "published" and current_index["latest"] == date:
            return {"changed": False, "date": date, "source_sha": source_ref, "paths": []}
    base = git(root, "merge-base", main_ref, source_ref)
    permitted = {issue_path, INDEX, TRACKERS}
    changed = set(git(root, "diff", "--name-only", "--no-renames", "-z", base, source_ref).split("\0")) - {""}
    if not changed or not changed <= permitted:
        raise PreparationError("일일 브랜치에는 오늘 호·색인·추적 자료만 변경할 수 있습니다: " + ", ".join(sorted(changed - permitted)))
    baseline_index = read_json(root, base, INDEX)
    baseline_dates = dates(baseline_index, "시작 기준")
    source_index = read_json(root, source_ref, INDEX)
    source_dates = dates(source_index, "일일 브랜치")
    if source_index["latest"] != date or set(source_dates) != set(baseline_dates) | {date}:
        raise PreparationError("일일 발행 색인은 기존 날짜를 보존하고 오늘 호만 더해야 합니다")
    source_issue_text = blob(root, source_ref, issue_path)
    source_issue = decode(source_issue_text, issue_path)
    if source_issue.get("date") != date or source_issue.get("status") not in ("draft", "published"):
        raise PreparationError("오늘 날짜의 초안 또는 확인된 공개 호만 가져올 수 있습니다")
    if blob(root, base, issue_path, required=False) != current_issue:
        raise PreparationError("main의 오늘 호가 조사 시작 이후 바뀌었습니다")
    replacements = {issue_path: source_issue_text + "\n"}
    if TRACKERS in changed:
        before = blob(root, base, TRACKERS)
        if before != blob(root, main_ref, TRACKERS):
            raise PreparationError("main의 추적 자료가 조사 시작 이후 바뀌었습니다")
        tracker_text = blob(root, source_ref, TRACKERS)
        tracker = decode(tracker_text, TRACKERS)
        baseline_tracker = decode(before, TRACKERS)
        if tracker.get("items") == baseline_tracker.get("items"):
            raise PreparationError("추적 자료의 날짜만 바꿔 새 근거처럼 발행할 수 없습니다")
        if tracker.get("updated") != date:
            raise PreparationError("새 추적 기록의 대조일은 발행일과 같아야 합니다")
        replacements[TRACKERS] = tracker_text + "\n"
    updated_index = dict(current_index)
    updated_index.update(latest=date, issues=sorted(set(current_dates) | {date}, reverse=True))
    replacements[INDEX] = json.dumps(updated_index, ensure_ascii=False, indent=2) + "\n"
    for path, text in replacements.items():
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    return {"changed": True, "date": date, "source_sha": source_ref, "paths": sorted(replacements)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--main-ref", required=True)
    args = parser.parse_args(argv)
    try:
        if args.date != today_kst():
            raise PreparationError("한국 시간 오늘 호만 자동 발행할 수 있습니다")
        result = prepare(ROOT, args.date, args.source_ref, args.main_ref)
    except (OSError, PreparationError) as exc:
        print(f"일일 자료 준비 실패: {exc}")
        return 1
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as target:
            for key in ("changed", "date", "source_sha"):
                value = str(result[key]).lower() if isinstance(result[key], bool) else result[key]
                target.write(f"{key}={value}\n")
    print(f"일일 자료 준비: {args.date}호 · " + (", ".join(result["paths"]) if result["changed"] else "이미 공개된 호 유지"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
