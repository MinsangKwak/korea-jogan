"""검색엔진이 읽을 수 있게 호마다 정적 페이지를 만든다. 배포 워크플로가 올리기 직전에 돌린다.

사용: python dev/pipeline/build/build_pages.py
- 첫 화면(dev/web/index.html): 최신 호 요약을 본문에 미리 넣고 NewsArticle 구조화 데이터를 더한다.
- 호별 페이지(dev/web/YYYY-MM-DD.html → 주소 /YYYY-MM-DD): 그 호의 제목·설명·대표 주소·요약을 넣는다.

화면은 JavaScript가 JSON을 읽어 그리므로, 이 요약은 JavaScript를 실행하지 않는 검색 로봇과
불러오기에 실패한 경우를 위한 것이다. 화면이 그려지면 지운다(index.html의 seoDigest).
승인 전 초안(draft)은 만들지 않는다. 여러 번 돌려도 결과가 같다.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "dev" / "web"
ISSUES = PUBLIC / "data" / "issues"
SITE = "https://korea-jogan.com/"
DIGEST = re.compile(r"<!-- kj:digest -->.*?<!-- /kj:digest -->", re.S)
LDJSON = re.compile(r'<script type="application/ld\+json">\n(.*?)\n</script>', re.S)
# 요약에 넣을 목록 길이. 검색 로봇이 읽기에 충분하고 페이지가 지나치게 길지 않게
NEWS_MAX = 12
REGION_MAX = 17
DESC_MAX = 150


def esc(s) -> str:
    return html.escape(str(s or ""), quote=True)


def clip(s: str, n: int = DESC_MAX) -> str:
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def long_date(date: str) -> str:
    y, m, d = (int(x) for x in date.split("-"))
    return f"{y}년 {m}월 {d}일"


def published_at(issue: dict) -> str:
    review = issue.get("review") or {}
    return review.get("at") or f"{issue['date']}T06:00+09:00"


def keywords(issue: dict) -> list[str]:
    words = ["대한민국 조간", f"{long_date(issue['date'])} 뉴스", "오늘의 경제 숫자"]
    words += [n["k"] for n in issue.get("nums", [])]
    for t in issue.get("themes", []):
        words += t.get("keywords", [])
    seen, out = set(), []
    for w in words:
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return out[:20]


def digest(issue: dict) -> str:
    """JavaScript 없이도 읽히는 그 호의 요약 HTML."""
    lead = issue.get("lead", {})
    parts = [
        '<section class="kj-wrap kj-digest" id="seoDigest" aria-label="이 호 요약">',
        f'  <p class="kj-digest__date"><time datetime="{esc(issue["date"])}">{esc(long_date(issue["date"]))}</time> 대한민국 조간</p>',
        f"  <h2>{esc(lead.get('headline') or issue.get('headline'))}</h2>",
        f"  <p>{esc(lead.get('standfirst'))}</p>",
    ]
    facts = lead.get("facts", [])
    if facts:
        parts.append("  <ul>" + "".join(f"<li>{esc(f['t'])}: {esc(f['v'])}</li>" for f in facts) + "</ul>")
    briefs = issue.get("briefs", [])
    if briefs:
        parts.append("  <h3>오늘 꼭 볼 숫자</h3>")
        parts.append("  <ul>" + "".join(f"<li><b>{esc(b['k'])}</b> {esc(b['m'])}</li>" for b in briefs) + "</ul>")
    nums = issue.get("nums", [])
    if nums:
        parts.append("  <h3>핵심 숫자</h3>")
        parts.append("  <ul>" + "".join(f"<li>{esc(n['k'])} {esc(n['v'])} ({esc(n['d'])}) · {esc(n.get('ref'))}</li>" for n in nums) + "</ul>")
    themes = issue.get("themes", [])
    if themes:
        parts.append("  <h3>언론 보도 비교</h3>")
        rows = []
        for t in themes:
            summary = " ".join(t.get("summary", []))
            qs = " / ".join(d["q"] for d in t.get("diffs", []))
            rows.append(f"<li><b>{esc(t['title'])}</b> {esc(clip(summary, 200))}" + (f" 기준이 갈린 숫자: {esc(qs)}" if qs else "") + "</li>")
        parts.append("  <ul>" + "".join(rows) + "</ul>")
    news = (issue.get("national") or {}).get("items", [])
    if news:
        parts.append("  <h3>전국 뉴스</h3>")
        parts.append("  <ul>" + "".join(
            f"<li>[{esc(n.get('cat'))}] <a href=\"{esc(n['url'])}\" rel=\"noopener\">{esc(n['title'])}</a> · {esc(n.get('outlet'))} — {esc(n.get('summary'))}</li>"
            for n in news[:NEWS_MAX]) + "</ul>")
    regions = (issue.get("regions") or {}).get("items", [])
    if regions:
        parts.append("  <h3>17개 시도 소식</h3>")
        # 시도마다 첫 기사 하나씩
        seen, rows = set(), []
        for r in regions:
            if r["region"] in seen:
                continue
            seen.add(r["region"])
            rows.append(f"<li>{esc(r['region'])}: <a href=\"{esc(r['url'])}\" rel=\"noopener\">{esc(r['title'])}</a> · {esc(r.get('outlet'))}</li>")
        parts.append("  <ul>" + "".join(rows[:REGION_MAX]) + "</ul>")
    parts.append("</section>")
    return "<!-- kj:digest -->\n  " + "\n  ".join(parts) + "\n  <!-- /kj:digest -->"


def article_ld(issue: dict, url: str, desc: str) -> dict:
    lead = issue.get("lead", {})
    return {
        "@type": "NewsArticle",
        "@id": url + "#article",
        "url": url,
        "mainEntityOfPage": url,
        "headline": clip(lead.get("headline") or issue.get("headline"), 110),
        "description": desc,
        "datePublished": published_at(issue),
        "dateModified": published_at(issue),
        "inLanguage": "ko-KR",
        "image": [SITE + "assets/images/og.png"],
        "keywords": keywords(issue),
        "isAccessibleForFree": True,
        "author": {"@id": SITE + "#org"},
        "publisher": {"@id": SITE + "#org"},
    }


def set_attr(page: str, pattern: str, value: str) -> str:
    """태그 하나의 content·href 값을 바꾼다. 태그가 없으면 실패로 알린다."""
    rx = re.compile(pattern)
    if not rx.search(page):
        raise ValueError(f"index.html에서 찾지 못함: {pattern}")
    return rx.sub(lambda m: m.group(1) + esc(value) + m.group(2), page, count=1)


def with_article(page: str, issue: dict, url: str, desc: str) -> str:
    m = LDJSON.search(page)
    if not m:
        raise ValueError("index.html에서 구조화 데이터(ld+json)를 찾지 못함")
    data = json.loads(m.group(1))
    data["@graph"] = [g for g in data["@graph"] if g.get("@type") != "NewsArticle"] + [article_ld(issue, url, desc)]
    # 데이터 안의 '</script>'가 태그를 닫지 못하게 '<'를 유니코드 이스케이프로 바꾼다
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("<", "\\u003c")
    block = '<script type="application/ld+json">\n' + body + "\n</script>"
    return page[: m.start()] + block + page[m.end():]


def home_page(template: str, issue: dict) -> str:
    desc = clip(re.search(r'<meta name="description" content="([^"]*)">', template).group(1))
    page = DIGEST.sub(lambda _: digest(issue), template, count=1)
    return with_article(page, issue, SITE, desc)


def issue_page(template: str, issue: dict) -> str:
    date = issue["date"]
    url = SITE + date
    headline = (issue.get("lead") or {}).get("headline") or issue.get("headline", "")
    title = f"{headline} | {long_date(date)} 대한민국 조간"
    desc = clip(f"{long_date(date)} 대한민국 조간. " + (issue.get("lead") or {}).get("standfirst", ""))
    page = re.sub(r"<title>.*?</title>", lambda _: f"<title>{esc(title)}</title>", template, count=1)
    page = set_attr(page, r'(<meta name="description" content=")[^"]*(">)', desc)
    page = set_attr(page, r'(<meta name="keywords" content=")[^"]*(">)', ", ".join(keywords(issue)))
    page = set_attr(page, r'(<link rel="canonical" href=")[^"]*(">)', url)
    page = set_attr(page, r'(<meta property="og:type" content=")[^"]*(">)', "article")
    page = set_attr(page, r'(<meta property="og:title" content=")[^"]*(">)', title)
    page = set_attr(page, r'(<meta property="og:description" content=")[^"]*(">)', desc)
    page = set_attr(page, r'(<meta property="og:url" content=")[^"]*(">)', url)
    page = set_attr(page, r'(<meta name="twitter:title" content=")[^"]*(">)', title)
    page = set_attr(page, r'(<meta name="twitter:description" content=")[^"]*(">)', desc)
    # 화면 스크립트가 이 날짜의 호를 열게 하고, 기사 발행 시각을 알린다
    extra = f'<meta name="kj-date" content="{esc(date)}">\n<meta property="article:published_time" content="{esc(published_at(issue))}">\n'
    page = page.replace('<link rel="canonical"', extra + '<link rel="canonical"', 1)
    page = DIGEST.sub(lambda _: digest(issue), page, count=1)
    return with_article(page, issue, url, desc)


def published() -> list[dict]:
    index = json.loads((ISSUES / "index.json").read_text(encoding="utf-8"))
    out = []
    for date in index["issues"]:
        issue = json.loads((ISSUES / f"{date}.json").read_text(encoding="utf-8"))
        if issue.get("status") != "draft":
            out.append(issue)
    return sorted(out, key=lambda x: x["date"], reverse=True)


def build() -> list[Path]:
    home = PUBLIC / "index.html"
    # 이미 한 번 돌린 index.html이어도 요약·기사 정보만 바뀌므로 그대로 틀로 쓴다
    template = home.read_text(encoding="utf-8")
    issues = published()
    written = []
    for issue in issues:
        out = PUBLIC / f"{issue['date']}.html"
        out.write_text(issue_page(template, issue), encoding="utf-8")
        written.append(out)
    if issues:
        home.write_text(home_page(template, issues[0]), encoding="utf-8")
        written.append(home)
    return written


def main() -> int:
    written = build()
    print(f"호별 페이지 {len(written) - 1}개와 첫 화면 요약을 만들었습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
