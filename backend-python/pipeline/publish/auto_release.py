"""main 단일 브랜치의 원격 기준 확인과 GitHub Pages 배포 요청을 맡는다.

기능 코드는 PR(Vercel 미리보기)로 확인한 뒤 main에 병합하면 deploy-pages.yml이 바로 배포한다.
이 모듈은 일일 발행(publish_pending.py)이 GITHUB_TOKEN으로 main에 반영한 뒤
후속 배포가 자동으로 시작되지 않는 경우를 위해 같은 SHA의 배포를 명시적으로 요청한다.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

import check_release
import verify_publication

ROOT = Path(__file__).resolve().parents[3]
REPOSITORY = "MinsangKwak/korea-jogan"
BRANCH = "main"


class ReleaseError(ValueError):
    pass


def command(*args: str, root: Path = ROOT) -> str:
    try:
        result = subprocess.run(args, cwd=root, text=True, capture_output=True, check=True, timeout=90)
    except (OSError, subprocess.SubprocessError) as error:
        raise ReleaseError(f"{args[0]} 실행 실패: {type(error).__name__}") from error
    return result.stdout.strip()


def git(*args: str, root: Path = ROOT) -> str:
    return command("git", *args, root=root)


def api(path: str):
    return json.loads(command("gh", "api", f"repos/{REPOSITORY}/{path}"))


def fetch_refs(root: Path = ROOT) -> dict[str, str]:
    git("fetch", "origin", f"refs/heads/{BRANCH}:refs/remotes/origin/{BRANCH}", root=root)
    return {BRANCH: git("rev-parse", f"origin/{BRANCH}", root=root)}


def ancestor(before: str, after: str, root: Path = ROOT) -> bool:
    result = subprocess.run(["git", "merge-base", "--is-ancestor", before, after], cwd=root, capture_output=True)
    if result.returncode not in (0, 1):
        raise ReleaseError("브랜치 조상 관계 확인 실패")
    return result.returncode == 0


def ensure_deployment(sha: str) -> bool:
    if not isinstance(sha, str) or not check_release.SHA.fullmatch(sha):
        raise ReleaseError("배포 대상 SHA 형식 오류")
    runs = api("actions/workflows/deploy-pages.yml/runs?per_page=100").get("workflow_runs", [])
    active = [run for run in runs if run.get("head_sha") == sha and run.get("head_branch") == BRANCH
              and run.get("event") in ("push", "workflow_dispatch") and run.get("status") != "completed"]
    if active:
        return False
    date = json.loads(git("show", sha + ":dev/web/data/issues/index.json"))["latest"]
    try:
        if verify_publication.check_once(sha, date):
            return False
    except (OSError, ValueError):
        pass
    command("gh", "workflow", "run", "deploy-pages.yml", "--ref", BRANCH, "-f", "source_sha=" + sha)
    return True
