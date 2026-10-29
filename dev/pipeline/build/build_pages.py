"""검색엔진이 읽을 수 있게 호마다 정적 페이지를 만든다. 배포 워크플로가 올리기 직전에 돌린다.

사용: python dev/pipeline/build/build_pages.py
- 첫 화면(dev/web/index.html): 최신 호 요약을 본문에 미리 넣고 NewsArticle 구조화 데이터를 더한다.
- 호별 페이지(dev/web/YYYY-MM-DD.html → 주소 /YYYY-MM-DD): 그 호의 제목·설명·대표 주소·요약을 넣는다.

화면은 JavaScript가 JSON을 읽어 그리므로, 이 요약은 JavaScript를 실행하지 않는 검색 로봇과
불러오기에 실패한 경우를 위한 것이다. 화면이 그려지면 지운다(index.html의 seoDigest).
승인 전 초안(draft)은 만들지 않는다. 여러 번 돌려도 결과가 같다.
"""
from __future__ import annotations

import datetime as dt
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


# 첫 화면에 늘 싣는 검색어. 사람들이 실제로 치는 꼴(오늘 ~, ~ 요약)로 적는다
BASE_KEYWORDS = [
    "대한민국 조간", "오늘의 뉴스", "오늘 뉴스 요약", "아침 뉴스", "경제 뉴스 요약",
    "오늘 코스피", "코스피 종가", "원달러 환율", "오늘 환율", "기준금리", "국가채무", "국민연금",
    "수출입 동향", "지역 뉴스", "17개 시도 뉴스", "언론 보도 비교", "숫자 팩트체크",
    "오늘의 주요 뉴스", "조간 신문", "아침 신문", "모닝 브리핑", "뉴스 브리핑", "오늘 경제 지표",
    "국가부채", "나라빚", "시도별 뉴스",
    "오늘 뉴스", "오늘 주요 뉴스", "오늘 아침 뉴스", "오늘 경제 뉴스", "오늘의 경제 뉴스", "오늘 신문",
    "오늘의 조간", "오늘 헤드라인",
    # 광고·회원 없이 공식 숫자로 쓰는 신문이라는 점을 찾는 말
    "광고 없는 뉴스", "광고없는 뉴스", "데이터 기반 뉴스", "데이터 뉴스", "숫자로 보는 뉴스", "통계로 보는 뉴스",
    "팩트 기반 뉴스",
]
WEEKDAYS = "월화수목금토일"
KEYWORD_MAX = 60
THEME_KEYWORDS = 5


def keywords(issue: dict) -> list[str]:
    """그 호의 검색어. 날짜 변형 → 숫자 → 분야·지역 → 언론 주제 순으로, 겹치는 말은 한 번만."""
    y, m, d = (int(x) for x in issue["date"].split("-"))
    day = WEEKDAYS[dt.date(y, m, d).weekday()]
    words = [
        "대한민국 조간", f"{long_date(issue['date'])} 뉴스", f"{m}월 {d}일 뉴스", f"{m}월 {d}일 {day}요일 뉴스",
        f"{m}월 {d}일 주요 뉴스", f"{m}월 {d}일 뉴스 요약", f"{m}월 {d}일 경제 뉴스", f"{m}월 {d}일 코스피",
        f"{m}월 {d}일 환율", "오늘의 경제 숫자",
    ]
    # 핵심 숫자는 '오늘 ○○'과 '○○ 종가'처럼 검색하는 꼴을 함께 둔다
    for n in issue.get("nums", []):
        name = (n.get("k") or "").strip()
        if name:
            words += [name, f"오늘 {name}"]
    cats = {item.get("cat") for item in (issue.get("national") or {}).get("items", []) if item.get("cat")}
    words += [f"{c} 뉴스" for c in sorted(cats)]
    regions = []
    for item in (issue.get("regions") or {}).get("items", []):
        if item.get("region") and item["region"] not in regions:
            regions.append(item["region"])
    words += [f"{r} 뉴스" for r in regions]
    # 언론 주제 키워드는 주제마다 앞의 몇 개만 둬 한 주제가 자리를 다 차지하지 않게 한다
    for t in issue.get("themes", []):
        words += t.get("keywords", [])[:THEME_KEYWORDS]
    seen, out = set(), []
    for w in words:
        w = " ".join(str(w or "").split())
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return out[:KEYWORD_MAX]


def sections(issue: dict) -> list[str]:
    """구조화 데이터의 articleSection. 그 호에 실제로 내용이 있는 섹션만 적는다."""
    has = [
        ("언론 보도 비교", issue.get("themes")), ("머리기사", issue.get("lead")),
        ("전국 뉴스", (issue.get("national") or {}).get("items")), ("지역 뉴스", (issue.get("regions") or {}).get("items")),
        ("경제 숫자", issue.get("nums")), ("산업·수출입", issue.get("trade") or issue.get("industries")),
        ("국가 재정", issue.get("fiscal") or issue.get("debt")),
    ]
    return [name for name, value in has if value]


def digest(issue: dict) -> str:
    """JavaScript 없이도 읽히는 그 호의 요약 HTML."""
    lead = issue.get("lead", {})
    # 소제목 앞에 '10월 26일'을 붙여 날짜로 찾는 검색어와 맞춘다
    _, m, d = (int(x) for x in issue["date"].split("-"))
    md = f"{m}월 {d}일"
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
        parts.append(f"  <h3>{esc(md)} 오늘 꼭 볼 숫자</h3>")
        parts.append("  <ul>" + "".join(f"<li><b>{esc(b['k'])}</b> {esc(b['m'])}</li>" for b in briefs) + "</ul>")
    nums = issue.get("nums", [])
    if nums:
        parts.append(f"  <h3>{esc(md)} 코스피·환율·기준금리 핵심 숫자</h3>")
        parts.append("  <ul>" + "".join(f"<li>{esc(n['k'])} {esc(n['v'])} ({esc(n['d'])}) · {esc(n.get('ref'))}</li>" for n in nums) + "</ul>")
    themes = issue.get("themes", [])
    if themes:
        parts.append(f"  <h3>{esc(md)} 언론 보도 비교</h3>")
        rows = []
        for t in themes:
            summary = " ".join(t.get("summary", []))
            qs = " / ".join(d["q"] for d in t.get("diffs", []))
            rows.append(f"<li><b>{esc(t['title'])}</b> {esc(clip(summary, 200))}" + (f" 기준이 갈린 숫자: {esc(qs)}" if qs else "") + "</li>")
        parts.append("  <ul>" + "".join(rows) + "</ul>")
    news = (issue.get("national") or {}).get("items", [])
    if news:
        parts.append(f"  <h3>{esc(md)} 전국 주요 뉴스</h3>")
        parts.append("  <ul>" + "".join(
            f"<li>[{esc(n.get('cat'))}] <a href=\"{esc(n['url'])}\" rel=\"noopener\">{esc(n['title'])}</a> · {esc(n.get('outlet'))} — {esc(n.get('summary'))}</li>"
            for n in news[:NEWS_MAX]) + "</ul>")
    regions = (issue.get("regions") or {}).get("items", [])
    if regions:
        parts.append(f"  <h3>{esc(md)} 17개 시도 지역 뉴스</h3>")
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
        "articleSection": sections(issue),
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


def embed_data(page: str, issue: dict, index: dict) -> str:
    for element_id, data in (("issue-data", issue), ("issue-index", index)):
        body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
        pattern = re.compile(r'(<script type="application/json" id="' + element_id + r'">).*?(</script>)', re.S)
        page = pattern.sub(lambda match: match[1] + body + match[2], page, count=1)
    return page


def home_page(template: str, issue: dict, index: dict) -> str:
    desc = clip(re.search(r'<meta name="description" content="([^"]*)">', template).group(1))
    page = DIGEST.sub(lambda _: digest(issue), template, count=1)
    merged = list(dict.fromkeys(BASE_KEYWORDS + keywords(issue)))[:KEYWORD_MAX]
    page = set_attr(page, r'(<meta name="keywords" content=")[^"]*(">)', ", ".join(merged))
    return embed_data(with_article(page, issue, SITE, desc), issue, index)


def issue_page(template: str, issue: dict, index: dict) -> str:
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
    return embed_data(with_article(page, issue, url, desc), issue, index)


def published() -> list[dict]:
    index = json.loads((ISSUES / "index.json").read_text(encoding="utf-8"))
    out = []
    for date in index["issues"]:
        issue = json.loads((ISSUES / f"{date}.json").read_text(encoding="utf-8"))
        if issue.get("status") != "draft":
            out.append(issue)
    return sorted(out, key=lambda x: x["date"], reverse=True)


def published_index(issues: list[dict]) -> dict:
    """화면에 싣는 발행 목록. 아직 공개하지 않은 초안을 가리키지 않게 공개된 호만 담는다.

    index.json에는 오늘 초안이 먼저 올라오므로, 그대로 실으면 화면이 공개 전 초안을 내려받는다.
    배포 검사가 초안을 막지만, 생성한 페이지 자체도 초안을 가리키지 않도록 여기서 한 번 더 거른다.
    """
    dates = [i["date"] for i in issues]
    return {"latest": dates[0], "issues": dates}


def build() -> list[Path]:
    home = PUBLIC / "index.html"
    # 이미 한 번 돌린 index.html이어도 요약·기사 정보만 바뀌므로 그대로 틀로 쓴다
    template = home.read_text(encoding="utf-8")
    issues = published()
    written = []
    if not issues:
        return written
    index = published_index(issues)
    for issue in issues:
        out = PUBLIC / f"{issue['date']}.html"
        out.write_text(issue_page(template, issue, index), encoding="utf-8")
        written.append(out)
    home.write_text(home_page(template, issues[0], index), encoding="utf-8")
    written.append(home)
    return written


def main() -> int:
    written = build()
    print(f"호별 페이지 {len(written) - 1}개와 첫 화면 요약을 만들었습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
