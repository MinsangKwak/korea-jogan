"""생성된 운영 HTML과 실제 체크아웃 커밋을 배포 확인용 JSON으로 기록한다.

사용: python3 dev/pipeline/build/build_info.py --source-sha <git rev-parse HEAD>
GITHUB_SHA는 예약 실행의 main을 가리킬 수 있으므로 소스 식별에 사용하지 않는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "dev" / "web"
SHA = re.compile(r"[0-9a-fA-F]{40}\Z")
DATE = re.compile(r"\d{4}-\d{2}-\d{2}\Z")


class EmbeddedData(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.values: dict[str, str] = {}
        self.current = ""
        self.chunks: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id in ("issue-index", "issue-data"):
            if element_id in self.ids or len(attributes) != len(attrs):
                raise ValueError("빌드 HTML의 발행 데이터 ID 또는 속성이 중복됐습니다")
            self.ids.add(element_id)
            if tag != "script" or attributes.get("type") != "application/json" or "src" in attributes:
                raise ValueError("빌드 HTML의 발행 데이터는 인라인 JSON이어야 합니다")
            self.current = element_id
            self.chunks = []

    def handle_data(self, data):
        if self.current:
            self.chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.current:
            self.values[self.current] = "".join(self.chunks)
            self.current = ""
            self.chunks = []


def valid_date(value) -> bool:
    if not isinstance(value, str) or not DATE.fullmatch(value):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def build(public: Path, source_sha: str, now: dt.datetime | None = None) -> dict:
    if not isinstance(source_sha, str) or not SHA.fullmatch(source_sha):
        raise ValueError("배포 소스에는 고정된 40자리 커밋 SHA가 필요합니다")
    parser = EmbeddedData()
    parser.feed((public / "index.html").read_text(encoding="utf-8"))
    if set(parser.values) != {"issue-index", "issue-data"} or parser.current:
        raise ValueError("먼저 운영 HTML에 발행 자료를 생성해야 합니다")
    index = json.loads(parser.values["issue-index"])
    issue = json.loads(parser.values["issue-data"])
    if not isinstance(index, dict) or not isinstance(issue, dict):
        raise ValueError("빌드 HTML의 발행 자료가 객체가 아닙니다")
    date = index.get("latest")
    dates = index.get("issues")
    if not valid_date(date) or not isinstance(dates, list) or not dates or not all(valid_date(day) for day in dates):
        raise ValueError("빌드 HTML의 발행일 또는 발행 목록이 올바르지 않습니다")
    if len(set(dates)) != len(dates) or date != max(dates):
        raise ValueError("빌드 HTML의 최신 호와 발행 목록이 맞지 않습니다")
    if issue.get("date") != date or issue.get("status") != "published":
        raise ValueError("운영 HTML의 최신 호는 같은 날짜의 공개 상태여야 합니다")
    actual = json.loads((public / "data" / "issues" / f"{date}.json").read_text(encoding="utf-8"))
    if actual != issue:
        raise ValueError("운영 HTML과 공개 호 JSON이 다릅니다. 페이지를 다시 생성해야 합니다")
    stamp = now or dt.datetime.now(dt.timezone.utc)
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("빌드 시각에는 시간대가 필요합니다")
    return {
        "environment": "production",
        "sourceSha": source_sha.lower(),
        "issueDate": date,
        "builtAt": stamp.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args(argv)
    try:
        if not SHA.fullmatch(args.source_sha):
            raise ValueError("고정된 40자리 커밋 SHA가 필요합니다")
        actual = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True, timeout=30).stdout.strip()
        if actual != args.source_sha.lower():
            raise ValueError("입력한 배포 소스가 실제 체크아웃 HEAD와 다릅니다")
        manifest = build(PUBLIC, actual)
        output = PUBLIC / "build-info.json"
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print(f"배포 정보 생성 실패: {exc}")
        return 1
    print(f"운영 배포 정보 저장: {manifest['sourceSha'][:7]} · {manifest['issueDate']}호")
    return 0


if __name__ == "__main__":
    sys.exit(main())
