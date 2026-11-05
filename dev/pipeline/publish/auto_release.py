"""CI·개발 배포 완료 이벤트로 같은 dev 커밋을 태그와 함께 자동 승격한다."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import check_release
import verify_publication

ROOT = Path(__file__).resolve().parents[3]
REPOSITORY = "MinsangKwak/korea-jogan"
PREVIEW = "https://korea-jogan-dev-git-dev-minsangkwaks-projects.vercel.app/"
KST = dt.timezone(dt.timedelta(hours=9))


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


def api(path: str, pages: bool = False):
    value = json.loads(command("gh", "api", *(("--paginate", "--slurp") if pages else ()), f"repos/{REPOSITORY}/{path}"))
    if pages:
        if not isinstance(value, list) or not all(isinstance(page, list) for page in value):
            raise ReleaseError("GitHub 원본 목록 형식 오류")
        return [item for page in value for item in page]
    return value


def allowed_event(kind: str, event: dict, refs: dict[str, str]) -> bool:
    if not isinstance(event, dict):
        return False
    if kind == "workflow_dispatch":
        return os.environ.get("GITHUB_REF") in ("refs/heads/dev", "refs/heads/main")
    if kind == "push":
        branch = event.get("ref", "").removeprefix("refs/heads/")
        return (branch in ("dev", "main") and event.get("after") == refs.get(branch)
                and (event.get("repository") or {}).get("full_name") == REPOSITORY)
    if kind == "workflow_run":
        run = event.get("workflow_run") or {}
        branch = run.get("head_branch")
        accepted = run.get("conclusion") == "success" or (run.get("name") == "통합 검사와 자동 승격" and run.get("conclusion") == "failure")
        return (accepted and branch in ("dev", "main")
                and run.get("event") in ("push", "workflow_dispatch")
                and (run.get("head_repository") or {}).get("full_name") == REPOSITORY
                and run.get("head_sha") == refs.get(branch))
    if kind == "status":
        return (event.get("state") == "success" and event.get("context") == "Vercel"
                and event.get("sha") == refs["dev"]
                and (event.get("sender") or {}).get("login") == "vercel[bot]")
    return False


def fetch_refs(root: Path = ROOT) -> dict[str, str]:
    git("fetch", "origin", *(f"refs/heads/{name}:refs/remotes/origin/{name}" for name in ("dev", "main", "deploy")), root=root)
    return {name: git("rev-parse", f"origin/{name}", root=root) for name in ("dev", "main", "deploy")}


def ancestor(before: str, after: str, root: Path = ROOT) -> bool:
    result = subprocess.run(["git", "merge-base", "--is-ancestor", before, after], cwd=root, capture_output=True)
    if result.returncode not in (0, 1):
        raise ReleaseError("브랜치 조상 관계 확인 실패")
    return result.returncode == 0


def readiness(sha: str, checks: dict, statuses: list) -> tuple[str, list[str]]:
    errors = check_release.check(sha, sha, checks, statuses)
    if not errors:
        return "ready", []
    if not isinstance(checks, dict) or not isinstance(checks.get("check_runs"), list) or not isinstance(statuses, list):
        return "blocked", errors
    total = checks.get("total_count")
    if type(total) is not int or total != len(checks["check_runs"]):
        return "blocked", errors
    if any(not isinstance(item, dict) or item.get("url") != check_release.STATUS_API + sha for item in statuses):
        return "blocked", errors
    for name in check_release.required_checks(checks, sha):
        item = check_release.latest([item for item in checks["check_runs"] if isinstance(item, dict)
                                    and item.get("name") == name and item.get("head_sha") == sha
                                    and isinstance(item.get("app"), dict) and item["app"].get("slug") == "github-actions"])
        if item and item.get("status") == "completed" and item.get("conclusion") != "success":
            return "blocked", errors
    proofs = [item for item in statuses if isinstance(item.get("creator"), dict)
              and item["creator"].get("login") == "vercel[bot]" and check_release.project_url(item.get("target_url"))]
    proof = check_release.latest(proofs)
    return ("blocked" if proof and proof.get("state") in ("error", "failure") else "pending"), errors


def protected_redirect(status: int, location: str) -> bool:
    try:
        url = urlsplit(location)
        return (status in (302, 303, 307, 308) and url.scheme == "https" and url.hostname == "vercel.com"
                and not url.username and not url.password and url.port in (None, 443)
                and url.path.startswith(("/sso-api", "/login", "/access")))
    except ValueError:
        return False


def verify_preview_access() -> None:
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    for path in ("", "data/issues/index.json", "admin/"):
        request = urllib.request.Request(PREVIEW + path, headers={"Cache-Control": "no-cache"})
        try:
            with opener.open(request, timeout=20) as response:
                valid = protected_redirect(response.status, response.headers.get("Location", ""))
        except urllib.error.HTTPError as response:
            valid = protected_redirect(response.code, response.headers.get("Location", ""))
        if not valid:
            raise ReleaseError("개발 첫 화면·데이터·관리자의 익명 접근 차단이 확인되지 않았습니다")


def tag_name(sha: str, now: dt.datetime | None = None) -> str:
    if not isinstance(sha, str) or not check_release.SHA.fullmatch(sha):
        raise ReleaseError("태그 대상 SHA 형식 오류")
    if now is not None and now.utcoffset() is None:
        raise ReleaseError("릴리스 시각에 시간대가 필요합니다")
    return f"release-{(now or dt.datetime.now(KST)).astimezone(KST):%Y%m%d}-{sha[:7]}"


def publish_refs(expected: dict[str, str], tag: str, root: Path = ROOT) -> None:
    candidate = expected["dev"]
    if fetch_refs(root) != expected:
        raise ReleaseError("검증 후 브랜치가 바뀌어 승격을 중단합니다")
    if not all(ancestor(expected[name], candidate, root) for name in ("main", "deploy")):
        raise ReleaseError("운영 이력을 포함하지 않은 커밋은 승격할 수 없습니다")
    remote = git("ls-remote", "--tags", "origin", "refs/tags/" + tag, root=root)
    if remote:
        git("fetch", "origin", f"refs/tags/{tag}:refs/tags/{tag}", root=root)
        if git("rev-parse", tag + "^{commit}", root=root) != candidate:
            raise ReleaseError("기존 릴리스 태그가 다른 커밋을 가리킵니다")
    else:
        git("tag", tag, candidate, root=root)
    git("push", "--atomic", "origin", f"{candidate}:refs/heads/dev", f"{candidate}:refs/heads/main", f"{candidate}:refs/heads/deploy", f"refs/tags/{tag}:refs/tags/{tag}", root=root)


def synchronize(refs: dict[str, str], root: Path = ROOT) -> str:
    git("config", "user.name", "github-actions[bot]", root=root)
    git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com", root=root)
    if ancestor(refs["dev"], refs["main"], root):
        updated = refs["main"]
    else:
        git("checkout", "--detach", refs["dev"], root=root)
        try:
            git("merge", "--no-ff", "-m", "sync: 최신 안정 이력을 dev 통합 후보에 반영", refs["main"], root=root)
        except ReleaseError:
            git("merge", "--abort", root=root)
            raise
        updated = git("rev-parse", "HEAD", root=root)
    if fetch_refs(root) != refs:
        raise ReleaseError("동기화 중 브랜치가 바뀌었습니다")
    git("push", "origin", f"{updated}:refs/heads/dev", root=root)
    command("gh", "workflow", "run", "integration.yml", "--ref", "dev", "-f", "source_sha=" + updated, root=root)
    return updated


def ensure_deployment(sha: str) -> bool:
    runs = api("actions/workflows/deploy-pages.yml/runs?per_page=100").get("workflow_runs", [])
    active = [run for run in runs if run.get("head_sha") == sha and run.get("head_branch") == "deploy"
              and run.get("event") in ("push", "workflow_dispatch") and run.get("status") != "completed"]
    if active:
        return False
    date = json.loads(git("show", sha + ":dev/web/data/issues/index.json"))["latest"]
    try:
        if verify_publication.check_once(sha, date):
            return False
    except (OSError, ValueError):
        pass
    command("gh", "workflow", "run", "deploy-pages.yml", "--ref", "deploy", "-f", "source_sha=" + sha)
    return True


def initialize_publisher(sha: str) -> bool:
    current = git("rev-parse", sha + ":.github/workflows/publish.yml")
    runs = api("actions/workflows/publish.yml/runs?per_page=1").get("workflow_runs", [])
    if runs:
        previous = runs[0].get("head_sha", "")
        if check_release.SHA.fullmatch(previous):
            saved = api("contents/.github/workflows/publish.yml?ref=" + previous)
            if saved.get("sha") == current:
                return False
    command("gh", "workflow", "run", "publish.yml", "--ref", "main")
    return True


def report(action: str, sha: str, tag: str = "") -> None:
    print(json.dumps({"action": action, "source_sha": sha, "tag": tag}, ensure_ascii=False))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream:
            stream.write(f"자동 승격 상태: **{action}**\n\n커밋: `{sha}` · 태그: `{tag or '해당 없음'}`\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wait-seconds", type=int, default=0)
    args = parser.parse_args(argv)
    try:
        if not 0 <= args.wait_seconds <= 600:
            raise ReleaseError("개발 배포 대기 시간 범위 오류")
        if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
            raise ReleaseError("대상 저장소가 다릅니다")
        refs = fetch_refs()
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        if not allowed_event(os.environ["GITHUB_EVENT_NAME"], event, refs):
            report("오래되거나 대상이 아닌 이벤트", refs["dev"])
            return 0
        if refs["dev"] == refs["main"] == refs["deploy"]:
            requested = ensure_deployment(refs["dev"])
            initialize_publisher(refs["dev"])
            report("기존 승격본의 누락 배포 재요청" if requested else "이미 반영됐거나 배포 진행 중", refs["dev"])
            return 0
        if not ancestor(refs["main"], refs["dev"]):
            report("안정 이력 동기화·새 SHA 검사 요청", synchronize(refs))
            return 0
        sha = refs["dev"]
        deadline = time.monotonic() + args.wait_seconds
        while True:
            checks = api(f"commits/{sha}/check-runs?filter=latest&per_page=100")
            statuses = api(f"commits/{sha}/statuses?per_page=100", pages=True)
            state, errors = readiness(sha, checks, statuses)
            if state != "pending" or time.monotonic() >= deadline:
                break
            if os.environ["GITHUB_EVENT_NAME"] == "workflow_run" and event.get("workflow_run", {}).get("conclusion") == "failure":
                raise ReleaseError("완료된 전체 검사 증거가 없어 복구하지 않습니다")
            time.sleep(min(10, max(0, deadline - time.monotonic())))
        if state != "ready":
            raise ReleaseError(" · ".join(errors))
        verify_preview_access()
        tag = tag_name(sha)
        publish_refs(refs, tag)
        ensure_deployment(sha)
        initialize_publisher(sha)
        report("태그·브랜치 반영 및 배포 요청 완료, 공개 검증은 사이트 배포에서 수행", sha, tag)
        return 0
    except (ReleaseError, OSError, ValueError, KeyError) as error:
        print("자동 승격 중단: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
