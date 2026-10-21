"""발행 목록으로 RSS 2.0(public/feed.xml)과 사이트맵(public/sitemap.xml)을 만든다. 배포 워크플로가 올리기 직전에 돌린다.

승인 전 초안(draft)은 넣지 않는다. RSS는 호마다 머리기사, 요약, 그날 갈린 숫자의 질문을 담는다.
사이트맵은 최신 호(첫 화면)와 지난 호 주소(?d=YYYY-MM-DD)를 담는다.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
ISSUES = PUBLIC / "data" / "issues"
SITE = "https://minsangkwak.github.io/korea-jogan/"
KST = dt.timezone(dt.timedelta(hours=9))
LIMIT = 30


def item_xml(issue: dict) -> str:
    date = issue["date"]
    lead = issue.get("lead", {})
    link = f"{SITE}?d={date}"
    pub = email.utils.format_datetime(dt.datetime.combine(dt.date.fromisoformat(date), dt.time(0, 0), KST))
    lines = [lead.get("standfirst", "")]
    splits = [d["q"] for t in issue.get("themes", []) for d in t.get("diffs", [])]
    if splits:
        lines.append("오늘 기준이 갈린 숫자: " + " / ".join(splits))
    desc = "\n".join(x for x in lines if x)
    title = f"{date.replace('-', '.')}호 · {lead.get('headline') or issue.get('headline', '')}"
    return (
        "    <item>\n"
        f"      <title>{escape(title)}</title>\n"
        f"      <link>{escape(link)}</link>\n"
        f"      <guid isPermaLink=\"true\">{escape(link)}</guid>\n"
        f"      <pubDate>{pub}</pubDate>\n"
        f"      <description>{escape(desc)}</description>\n"
        "    </item>\n"
    )


def published() -> list[dict]:
    index = json.loads((ISSUES / "index.json").read_text(encoding="utf-8"))
    issues = []
    for date in index["issues"]:
        issue = json.loads((ISSUES / f"{date}.json").read_text(encoding="utf-8"))
        if issue.get("status") == "draft":
            continue
        issues.append(issue)
    return sorted(issues, key=lambda x: x["date"], reverse=True)


def build_sitemap() -> str:
    issues = published()
    # 첫 화면은 최신 호를 보여 주므로 최신 호 날짜를 마지막 수정일로 쓴다
    urls = [(SITE, issues[0]["date"] if issues else None, "daily")]
    # 지난 호도 정정으로 바뀔 수 있어 변경 주기는 적지 않는다
    urls += [(f"{SITE}?d={i['date']}", i["date"], None) for i in issues[1:]]
    rows = "".join(
        f"  <url>\n    <loc>{escape(loc)}</loc>\n"
        + (f"    <lastmod>{mod}</lastmod>\n" if mod else "")
        + (f"    <changefreq>{freq}</changefreq>\n" if freq else "")
        + "  </url>\n"
        for loc, mod, freq in urls
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{rows}"
        "</urlset>\n"
    )


def build() -> str:
    issues = published()
    items = "".join(item_xml(i) for i in issues[:LIMIT])
    built = email.utils.format_datetime(dt.datetime.now(KST))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "  <channel>\n"
        "    <title>대한민국 조간</title>\n"
        f"    <link>{SITE}</link>\n"
        "    <description>공식 통계로 읽는 오늘의 대한민국. 수치의 출처와 기준을 함께 보여 줍니다.</description>\n"
        "    <language>ko</language>\n"
        f"    <lastBuildDate>{built}</lastBuildDate>\n"
        f'    <atom:link href="{SITE}feed.xml" rel="self" type="application/rss+xml"/>\n'
        f"{items}"
        "  </channel>\n"
        "</rss>\n"
    )


def main() -> int:
    for name, text in (("feed.xml", build()), ("sitemap.xml", build_sitemap())):
        out = PUBLIC / name
        out.write_text(text, encoding="utf-8")
        print(f"저장: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
