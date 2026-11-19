"""발행 목록으로 RSS 2.0(dev/web/feed.xml), 사이트맵(sitemap.xml), 뉴스 사이트맵(news-sitemap.xml)을 만든다. 배포 워크플로가 올리기 직전에 돌린다.

승인 전 초안(draft)은 넣지 않는다. RSS는 호마다 머리기사, 요약, 그날 갈린 숫자의 질문을 담는다.
사이트맵은 첫 화면과 호별 페이지 주소(/YYYY-MM-DD, build_pages.py가 만든다)를 담는다.
뉴스 사이트맵은 구글 뉴스 규격대로 최근 이틀 안에 공개한 호만 담아 새 호를 빨리 찾게 한다.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape
import build_discovery

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "dev" / "web"
ISSUES = PUBLIC / "data" / "issues"
SITE = "https://korea-jogan.com/"
KST = dt.timezone(dt.timedelta(hours=9))
LIMIT = 30
# 피드가 바뀌면 알려 주는 공개 허브(WebSub). 배포 뒤 indexnow.py가 이 허브에 새 피드를 알린다
HUB = "https://pubsubhubbub.appspot.com/"
# 구글 뉴스 사이트맵은 최근 이틀 안에 게시한 기사만 받는다
NEWS_WINDOW = dt.timedelta(days=2)


def item_xml(issue: dict) -> str:
    date = issue["date"]
    lead = issue.get("lead", {})
    link = f"{SITE}{date}"
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
    # 호별 페이지도 정정으로 바뀔 수 있어 변경 주기는 적지 않는다
    urls += [(f"{SITE}{i['date']}", i["date"], None) for i in issues]
    trackers_file = PUBLIC / "data" / "trackers.json"
    trackers = json.loads(trackers_file.read_text(encoding="utf-8")) if trackers_file.exists() else {"items": []}
    urls += [(SITE + item["path"].removesuffix("index.html"), item["modified"], None)
             for item in build_discovery.pages(issues, trackers)]
    urls += [(SITE + path, None, None) for path in ("law/", "law/calendar/")
             if (PUBLIC / path / "index.html").is_file()]
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


def published_time(issue: dict) -> dt.datetime:
    """그 호를 실제로 공개한 시각. 기록이 없으면 발행일 06시로 본다."""
    stamp = (issue.get("review") or {}).get("at")
    if isinstance(stamp, str):
        try:
            value = dt.datetime.fromisoformat(stamp)
            return value if value.tzinfo else value.replace(tzinfo=KST)
        except ValueError:
            pass
    return dt.datetime.combine(dt.date.fromisoformat(issue["date"]), dt.time(6, 0), KST)


def build_news_sitemap(now: dt.datetime | None = None) -> str:
    now = now or dt.datetime.now(KST)
    rows = ""
    for issue in published():
        at = published_time(issue)
        if not now - NEWS_WINDOW <= at <= now:
            continue
        title = (issue.get("lead") or {}).get("headline") or issue.get("headline") or issue["date"] + "호"
        rows += (
            "  <url>\n"
            f"    <loc>{escape(SITE + issue['date'])}</loc>\n"
            "    <news:news>\n"
            "      <news:publication>\n"
            "        <news:name>대한민국 조간</news:name>\n"
            "        <news:language>ko</news:language>\n"
            "      </news:publication>\n"
            f"      <news:publication_date>{at.isoformat(timespec='seconds')}</news:publication_date>\n"
            f"      <news:title>{escape(title)}</news:title>\n"
            "    </news:news>\n"
            "  </url>\n"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n'
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
        f'    <atom:link href="{HUB}" rel="hub"/>\n'
        f"{items}"
        "  </channel>\n"
        "</rss>\n"
    )


def main() -> int:
    for name, text in (("feed.xml", build()), ("sitemap.xml", build_sitemap()), ("news-sitemap.xml", build_news_sitemap())):
        out = PUBLIC / name
        out.write_text(text, encoding="utf-8")
        print(f"저장: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
