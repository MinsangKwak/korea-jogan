"""배포 후 공개 색인·호 JSON·홈과 실제 빌드 시각까지 같은 발행본인지 확인한다."""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend-python/pipeline/build"))
from build_info import EmbeddedData, valid_date
from check_release import SHA

KST = dt.timezone(dt.timedelta(hours=9))
SITE = "https://korea-jogan.com/"


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


def catalog_matches(index, issue, catalog, edition) -> bool:
    try:
        if (catalog["version"] != 1 or edition["version"] != 1 or catalog["latest"] != issue["date"]
                or [row["date"] for row in catalog["editions"]] != index["issues"]
                or edition["date"] != issue["date"] or edition["status"] != issue["status"]):
            return False
        expected = [(section, row) for section in ("national", "regions") for row in issue[section]["items"]]
        articles = edition["articles"]
        count = next(row["articleCount"] for row in catalog["editions"] if row["date"] == edition["date"])
        if len(articles) != len(expected) or count != len(expected):
            return False
        return all(record["section"] == section and record["editionDate"] == edition["date"]
                   and all(record[key] == row[key] for key in ("url", "title", "outlet", "date", "summary"))
                   for (section, row), record in zip(expected, articles))
    except (KeyError, TypeError, StopIteration):
        return False


def check_once(sha: str, date: str, built_at: str | None = None, deadline: float | None = None) -> bool:
    def read(path: str, as_json: bool = True):
        remaining = 10 if deadline is None else min(10, deadline - time.monotonic())
        if remaining <= 0:
            raise TimeoutError("공개 확인 제한 시간 경과")
        request = urllib.request.Request(SITE + path + "?verify=" + sha + "-" + str(time.time_ns()), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=remaining) as response:
            value = response.read().decode("utf-8")
            return json.loads(value) if as_json else value

    index, issue = read("data/issues/index.json"), read(f"data/issues/{date}.json")
    return (snapshot_matches(index, read("build-info.json"), issue, read("", False), sha, date, built_at)
            and catalog_matches(index, issue, read("api/v1/index.json"), read(f"api/v1/editions/{date}.json")))


def wait_until(sha: str, date: str, built_at: str | None, timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            if check_once(sha, date, built_at, deadline):
                return True
        except (OSError, ValueError):
            pass
        time.sleep(min(10, max(0, deadline - time.monotonic())))
    return False


def today_kst(now: dt.datetime | None = None) -> tuple[str, bool]:
    # 06시 전이면 오늘 호가 아직 없으므로 확인 대상이 아니다
    value = (now or dt.datetime.now(KST)).astimezone(KST)
    return value.date().isoformat(), value.hour >= 6


def release_sha(root: Path = ROOT) -> str:
    # 운영 기준은 main 하나다. 공개본은 원격 main 최신 커밋과 같아야 한다
    output = subprocess.run(["git", "ls-remote", "--exit-code", "origin", "refs/heads/main"],
                            cwd=root, text=True, capture_output=True, check=True, timeout=45).stdout.split()
    if len(output) != 2 or output[1] != "refs/heads/main" or not SHA.fullmatch(output[0]):
        raise ValueError("main 커밋 조회 오류")
    return output[0]


def public_build_info() -> str:
    try:
        request = urllib.request.Request(SITE + "build-info.json?verify=" + str(time.time_ns()), headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=10) as response:
            info = json.loads(response.read().decode("utf-8"))
        return f"{info.get('issueDate')}호 · {info.get('sourceSha')} · {info.get('builtAt')}"
    except (OSError, ValueError, AttributeError) as error:
        return f"읽기 실패({type(error).__name__})"


def expect_today(timeout: int, now: dt.datetime | None = None) -> int:
    date, due = today_kst(now)
    if not due:
        print("06시 전이라 오늘 호 공개 확인을 건너뜁니다")
        return 0
    try:
        sha = release_sha()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"공개 확인 실패: {error}", file=sys.stderr)
        return 1
    if wait_until(sha, date, None, timeout):
        print(f"공개 확인 완료: {date}호 · {sha}")
        return 0
    print(f"공개 확인 실패: {timeout}초 안에 {date}호 · {sha}가 공개되지 않았습니다. 현재 공개 build-info: {public_build_info()}", file=sys.stderr)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "frontend-vanilla-js/build-info.json")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--expect-today", action="store_true", help="오늘(KST) 호와 원격 main SHA가 공개됐는지 확인")
    args = parser.parse_args(argv)
    if args.expect_today:
        if not 1 <= args.timeout <= 1200:
            print("공개 확인 입력 실패: timeout 범위 오류", file=sys.stderr)
            return 1
        return expect_today(args.timeout)
    try:
        expected = json.loads(args.manifest.read_text(encoding="utf-8"))
        sha, date, stamp = expected["sourceSha"], expected["issueDate"], expected["builtAt"]
        if not SHA.fullmatch(sha) or not valid_date(date) or not stamp or not 1 <= args.timeout <= 300:
            raise ValueError("공개 확인 입력 오류")
        if wait_until(sha, date, stamp, args.timeout):
            print(f"공개 확인 완료: {date}호 · {sha} · {stamp}")
            return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"공개 확인 입력 실패: {type(error).__name__}", file=sys.stderr)
        return 1
    print("공개 확인 실패: 색인·기사 API·호 JSON·홈·빌드 SHA/시각이 배포 결과와 일치하지 않습니다", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
