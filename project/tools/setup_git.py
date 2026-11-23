"""Prepare local ignores and commit hooks for a contributor checkout."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]
HOOKS = "project/tools/githooks"


def git(*args, check=True):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=check
    )


def main():
    exclude = ROOT / git("rev-parse", "--git-path", "info/exclude").stdout.strip()
    exclude.parent.mkdir(parents=True, exist_ok=True)
    existing = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
    shared = (ROOT / "project" / ".gitignore").read_text().splitlines()
    missing = [rule for rule in shared if rule and rule not in existing.splitlines()]
    if missing:
        with exclude.open("a", encoding="utf-8") as file:
            if existing and not existing.endswith("\n"):
                file.write("\n")
            file.write("\n".join(missing) + "\n")

    hooks = git("config", "--get", "core.hooksPath", check=False).stdout.strip()
    if hooks in ("", "tools/githooks", HOOKS):
        git("config", "--local", "core.hooksPath", HOOKS)
        print(f"커밋 훅 경로를 설정했습니다. {HOOKS}")
    else:
        print(f"사용자 지정 커밋 훅 경로를 유지했습니다. {hooks}")
    print("로컬 Git 제외 규칙을 적용했습니다.")


if __name__ == "__main__":
    main()
