"""검증한 dev 커밋의 CI와 같은 Vercel 프로젝트의 미리보기 성공을 대조한다.

입력 JSON은 안정된 main의 워크플로가 GitHub API에서 받은 결과여야 한다.
파일 자체나 상태 이름만으로 배포 성공을 증명하지 않는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

SHA = re.compile(r"[0-9a-f]{40}\Z")
TEAM = "minsangkwaks-projects"
PROJECT = "korea-jogan-dev"
REQUIRED_CHECKS = ("data", "browser")


def project_url(value: object, team: str = TEAM, project: str = PROJECT) -> bool:
    if not isinstance(value, str) or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        return False
    try:
        url = urlsplit(value)
        if url.scheme != "https" or url.hostname not in ("vercel.com", "www.vercel.com") or url.username or url.password:
            return False
        if url.port not in (None, 443):
            return False
    except ValueError:
        return False
    parts = url.path.strip("/").split("/")
    return (len(parts) == 3 and parts[:2] == [team, project]
            and bool(re.fullmatch(r"[A-Za-z0-9_-]{6,80}", parts[2]))
            and parts[2] not in ("settings", "domains", "analytics", "deployments", "observability"))


def latest(items: list[dict]) -> dict | None:
    if not items:
        return None
    return max(items, key=lambda item: (item.get("id") if isinstance(item.get("id"), int) else -1, str(item.get("started_at") or item.get("created_at") or "")))


def preview_proof(sha: str, checks: dict, statuses: dict, team: str = TEAM, project: str = PROJECT) -> str:
    candidates = []
    for item in checks.get("check_runs", []):
        if not isinstance(item, dict) or not isinstance(item.get("app"), dict) or item["app"].get("slug") != "vercel" or item.get("head_sha") != sha:
            continue
        url = item.get("details_url")
        if project_url(url, team, project):
            candidates.append({**item, "proof_url": url, "passed": item.get("status") == "completed" and item.get("conclusion") == "success"})
    proof = latest(candidates)
    if proof:
        return proof["proof_url"] if proof["passed"] else ""
    if statuses.get("sha") == sha:
        for item in statuses.get("statuses", []):
            if not isinstance(item, dict) or not isinstance(item.get("creator"), dict) or item["creator"].get("login") != "vercel[bot]":
                continue
            url = item.get("target_url")
            if project_url(url, team, project):
                candidates.append({**item, "proof_url": url, "passed": item.get("state") == "success"})
    proof = latest(candidates)
    return proof["proof_url"] if proof and proof["passed"] else ""


def check(sha: str, dev_sha: str, checks: dict, statuses: dict, team: str = TEAM, project: str = PROJECT) -> list[str]:
    errors = []
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        return ["승격 SHA는 소문자 40자리 커밋이어야 합니다"]
    if sha != dev_sha:
        errors.append("요청한 SHA가 현재 dev와 다릅니다. 새 커밋을 다시 검증해야 합니다")
    if not isinstance(checks, dict) or not isinstance(checks.get("check_runs"), list):
        return errors + ["GitHub check-runs 응답을 읽을 수 없습니다"]
    if not isinstance(statuses, dict) or not isinstance(statuses.get("statuses"), list):
        return errors + ["GitHub combined status 응답을 읽을 수 없습니다"]
    count = checks.get("total_count", len(checks["check_runs"]))
    if not isinstance(count, int) or count < 0 or count > len(checks["check_runs"]):
        errors.append("검사 응답이 잘렸습니다. 전체 최신 검사 결과가 필요합니다")
    if statuses.get("sha") != sha:
        errors.append("결합 상태 응답이 요청한 커밋과 다릅니다")
    for name in REQUIRED_CHECKS:
        candidates = [item for item in checks["check_runs"] if isinstance(item, dict)
                      and item.get("name") == name and item.get("head_sha") == sha
                      and isinstance(item.get("app"), dict) and item["app"].get("slug") == "github-actions"]
        item = latest(candidates)
        if not item or item.get("status") != "completed" or item.get("conclusion") != "success":
            errors.append(f"같은 SHA의 GitHub Actions {name} 검사가 성공하지 않았습니다")
    if not preview_proof(sha, checks, statuses, team, project):
        errors.append(f"같은 SHA의 {team}/{project} Vercel 배포 성공 근거가 없습니다")
    return errors


def deployment_state(sha: str, runs: dict, previous: dict, started_after: str) -> tuple[str, int | None]:
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or not isinstance(runs, dict) or not isinstance(runs.get("workflow_runs"), list) or not isinstance(previous, dict) or not isinstance(previous.get("workflow_runs"), list) or not isinstance(started_after, str):
        raise ValueError("배포 실행 응답 형식 오류")
    start = dt.datetime.fromisoformat(started_after.replace("Z", "+00:00"))
    if start.tzinfo is None:
        raise ValueError("시작 시각에 시간대가 없습니다")
    prior_ids = {item["id"] for item in previous["workflow_runs"] if isinstance(item, dict) and isinstance(item.get("id"), int)}
    candidates = []
    for item in runs["workflow_runs"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), int) or item["id"] in prior_ids:
            continue
        if item.get("head_sha") != sha or item.get("head_branch") != "deploy" or item.get("event") != "workflow_dispatch":
            continue
        if not isinstance(item.get("created_at"), str):
            continue
        try:
            created = dt.datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
            if created.tzinfo is None or created < start:
                continue
        except (KeyError, TypeError, ValueError):
            continue
        candidates.append(item)
    run = latest(candidates)
    if not run:
        return "pending", None
    if run.get("status") != "completed":
        return "pending", run["id"]
    return ("success" if run.get("conclusion") == "success" else "failure"), run["id"]


def manifest_matches(sha: str, manifest: object) -> bool:
    return isinstance(manifest, dict) and manifest.get("environment") == "production" and manifest.get("sourceSha") == sha


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--dev-sha")
    parser.add_argument("--checks", type=Path)
    parser.add_argument("--statuses", type=Path)
    parser.add_argument("--deployment-runs", type=Path)
    parser.add_argument("--previous-runs", type=Path)
    parser.add_argument("--started-after")
    args = parser.parse_args(argv)
    if args.deployment_runs:
        if not args.previous_runs or not args.started_after or args.dev_sha or args.checks or args.statuses:
            parser.error("배포 대기는 --previous-runs와 --started-after만 함께 지정합니다")
        try:
            state, run_id = deployment_state(args.sha, json.loads(args.deployment_runs.read_text(encoding="utf-8")), json.loads(args.previous_runs.read_text(encoding="utf-8")), args.started_after)
        except (OSError, ValueError) as exc:
            print(f"배포 확인 실패: 실행 JSON 또는 시각 오류 ({type(exc).__name__})")
            return 1
        print(f"배포 확인: {state} · 실행 {run_id or '생성 대기'}")
        return 0 if state == "success" else 2 if state == "pending" else 1
    if not args.dev_sha or not args.checks or not args.statuses or args.previous_runs or args.started_after:
        parser.error("승격 검사는 --dev-sha, --checks, --statuses가 필요합니다")
    try:
        checks = json.loads(args.checks.read_text(encoding="utf-8"))
        statuses = json.loads(args.statuses.read_text(encoding="utf-8"))
        errors = check(args.sha, args.dev_sha, checks, statuses)
    except (OSError, ValueError) as exc:
        print(f"승격 검사 실패: 결과 JSON을 읽지 못했습니다 ({type(exc).__name__})")
        return 1
    if errors:
        print("승격 검사 실패:")
        for error in errors:
            print("- " + error)
        return 1
    print(f"승격 검사 통과: {args.sha}")
    print("Vercel 배포 근거: " + preview_proof(args.sha, checks, statuses))
    return 0


if __name__ == "__main__":
    sys.exit(main())
