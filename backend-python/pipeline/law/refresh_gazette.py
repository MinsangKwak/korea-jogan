"""Refresh the next-issue law count from the Republic of Korea's official gazette."""

import argparse
import json
import re
import tempfile
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
from zoneinfo import ZoneInfo


SOURCE = "https://gwanbo.go.kr/user/pblicteNoti/tomorrowOfctt.do"
OUTPUT = Path(__file__).resolve().parents[2] / "web/law/data/gazette-preview.json"


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fragments = []
        self.hidden = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = False

    def handle_data(self, data):
        if not self.hidden:
            self.fragments.append(data)


def parse_preview(html, checked):
    parser = PageText()
    parser.feed(html)
    text = " ".join(" ".join(parser.fragments).split())
    issue = re.search(r"다음호\s*\(\s*(\d+)\s*호\s*\)\s*는\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.", text)
    if not issue:
        raise ValueError("관보 발행예고의 호수와 발행일을 확인할 수 없습니다.")
    number, year, month, day = map(int, issue.groups())
    issue_date = date(year, month, day)
    if issue_date <= checked:
        raise ValueError("다음 발행일의 관보가 아직 예고되지 않았습니다.")
    counts = text[issue.end():].partition("목차")[0]
    laws = re.search(r"법률\s*\(\s*(-|[\d,]+)\s*건\s*\)", counts)
    if not laws:
        raise ValueError("예고 목록의 법률 분류 건수를 확인할 수 없습니다.")
    count = laws.group(1)
    return {
        "issueDate": issue_date.isoformat(),
        "issueNumber": str(number),
        "lawCount": 0 if count == "-" else int(count.replace(",", "")),
        "checkedOn": checked.isoformat(),
        "url": SOURCE,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    with urlopen(SOURCE, timeout=20) as response:
        html = response.read().decode(response.headers.get_content_charset() or "utf-8")
    checked = datetime.now(ZoneInfo("Asia/Seoul")).date()
    preview = parse_preview(html, checked)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output.parent, delete=False) as temp:
        temporary = Path(temp.name)
        try:
            json.dump(preview, temp, ensure_ascii=False, indent=2)
            temp.write("\n")
            temp.close()
            temporary.chmod(0o644)
            temporary.replace(args.output)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
