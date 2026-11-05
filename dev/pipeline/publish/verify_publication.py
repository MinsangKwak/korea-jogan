"""배포 후 공개 색인·호 JSON·홈과 실제 빌드 시각까지 같은 발행본인지 확인한다."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "dev/pipeline/build"))
from build_info import EmbeddedData, valid_date
from check_release import SHA


def snapshot_matches(index, info, issue, html: str, sha: str, date: str, built_at: str | None = None) -> bool:
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or not valid_date(date):
        return False
    if not all(isinstance(value, dict) for value in (index, info, issue)):
        return False
    if (index.get("latest") != date or not isinstance(index.get("issues"), list) or date not in index["issues"]
            or info.get("environment") != "production" or info.get("sourceSha") != sha
            or info.get("issueDate") != date or issue.get("date") != date or issue.get("status") != "published"):
        return False
    if built_at is not None and info.get("builtAt") != built_at:
        return False
    try:
        parser = EmbeddedData()
        parser.feed(html)
        return json.loads(parser.values["issue-index"]) == index and json.loads(parser.values["issue-data"]) == issue
    except (KeyError, TypeError, ValueError):
        return False


def check_once(sha: str, date: str, built_at: str | None = None, deadline: float | None = None) -> bool:
    def read(path: str, as_json: bool = True):
        remaining = 10 if deadline is None else min(10, deadline - time.monotonic())
        if remaining <= 0:
            raise TimeoutError("공개 확인 제한 시간 경과")
        request = urllib.request.Request("https://korea-jogan.com/" + path + "?verify=" + sha + "-" + str(time.time_ns()), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=remaining) as response:
            value = response.read().decode("utf-8")
            return json.loads(value) if as_json else value

    return snapshot_matches(read("data/issues/index.json"), read("build-info.json"), read(f"data/issues/{date}.json"), read("", False), sha, date, built_at)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "dev/web/build-info.json")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args(argv)
    try:
        expected = json.loads(args.manifest.read_text(encoding="utf-8"))
        sha, date, stamp = expected["sourceSha"], expected["issueDate"], expected["builtAt"]
        if not SHA.fullmatch(sha) or not valid_date(date) or not stamp or not 1 <= args.timeout <= 300:
            raise ValueError("공개 확인 입력 오류")
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            try:
                if check_once(sha, date, stamp, deadline):
                    print(f"공개 확인 완료: {date}호 · {sha} · {stamp}")
                    return 0
            except (OSError, ValueError):
                pass
            time.sleep(min(10, max(0, deadline - time.monotonic())))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"공개 확인 입력 실패: {type(error).__name__}", file=sys.stderr)
        return 1
    print("공개 확인 실패: 색인·호 JSON·홈·빌드 SHA/시각이 배포 결과와 일치하지 않습니다", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
