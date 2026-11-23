"""Git에 기록된 발행 자료를 해당 커밋의 디렉터리 구조로 찾는다."""
from pathlib import Path
import subprocess


FRONTEND = "frontend-vanilla-js"
LEGACY_FRONTEND = "dev/web"


def frontend_at(root: Path, ref: str) -> str:
    result = subprocess.run(
        ["git", "ls-tree", "--name-only", ref, "--", FRONTEND, LEGACY_FRONTEND],
        cwd=root, check=True, capture_output=True, text=True, timeout=30,
    )
    entries = result.stdout.splitlines()
    return LEGACY_FRONTEND if LEGACY_FRONTEND in entries and FRONTEND not in entries else FRONTEND
