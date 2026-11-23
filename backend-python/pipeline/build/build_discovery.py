"""공개 호와 추적 기록을 지난 호·사안·지표·지역·보도 비교별 정적 본문으로 묶는다."""
from __future__ import annotations

import datetime as dt
import html
import re
from urllib.parse import urlsplit


INDICATORS = (
    ("kospi", "코스피 종가", "코스피 종가"),
    ("kosdaq", "코스닥 종가", "코스닥 종가"),
    ("usd-krw", "원·달러 환율", "원·달러 환율"),
    ("dubai-oil", "두바이유", "두바이유 가격"),
    ("gasoline", "휘발유 전국 평균", "전국 평균 휘발유 가격"),
    ("base-rate", "한국은행 기준금리", "한국은행 기준금리"),
)
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
# 시도 이름은 호 JSON의 regions.items[].region 표기 그대로, 주소는 로마자 표기
REGIONS = (
    ("seoul", "서울"), ("incheon", "인천"), ("gyeonggi", "경기"), ("gangwon", "강원"),
    ("daejeon", "대전"), ("sejong", "세종"), ("chungbuk", "충북"), ("chungnam", "충남"),
    ("busan", "부산"), ("daegu", "대구"), ("gwangju", "광주"), ("ulsan", "울산"),
    ("jeonbuk", "전북"), ("jeonnam", "전남"), ("gyeongbuk", "경북"), ("gyeongnam", "경남"), ("jeju", "제주"),
)
# build_pages.py가 지난 생성물을 정리하는 폴더
FOLDERS = ("archive", "politics", "topics", "indicators", "regions", "compare")
# 지역 페이지 하나에 싣는 호의 수. 오래된 기록은 지난 호에서 읽는다
REGION_ISSUES = 14


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def date_value(value) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return ""
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return ""
    return value


def safe_url(value) -> str:
    if not isinstance(value, str) or "\\" in value or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        return ""
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return ""
        parsed.port
    except ValueError:
        return ""
    return value


def date_html(value) -> str:
    date = date_value(value)
    return f'<time datetime="{date}">{date}</time>' if date else esc(value or "날짜 미기록")


def source_link(url, label, *, new_window=True) -> str:
    href = safe_url(url)
    if not href:
        return esc(label)
    attributes = ' target="_blank" rel="noopener noreferrer"' if new_window else ''
    return f'<a href="{esc(href)}"{attributes}>{esc(label)}</a>'


def review_text(issue: dict) -> str:
    review = issue.get("review") or {}
    if review.get("auto"):
        return "자동 발행 · 사람의 원문 확인 전"
    if review and "nums" in (review.get("scope") or []):
        return "편집자 확인 · 핵심 숫자 포함"
    if review:
        return "편집자 확인 기록 · 숫자 확인 범위 별도 확인"
    return "사람의 원문 확인 기록 없음" if issue.get("status") != "prototype" else "시안 · 사람의 원문 확인 기록 없음"


def description(value) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= 155 else text[:154].rstrip() + "…"


def page(path: str, title: str, summary: str, content: str, modified: str, kind: str) -> dict:
    return {
        "path": path,
        "title": title + " | 대한민국 조간",
        "description": description(summary),
        "body": '<main id="main" class="discovery-main">\n' + content + "\n</main>",
        "modified": modified,
        "kind": kind,
    }


def heading(kicker: str, title: str, lead: str, meta: str = "") -> str:
    return (
        '<header class="discovery-head">'
        f'<p class="discovery-kicker">{esc(kicker)}</p><h1>{esc(title)}</h1>'
        f'<p class="discovery-lead">{esc(lead)}</p>'
        + (f'<p class="discovery-meta">{meta}</p>' if meta else "")
        + "</header>"
    )


def archive(issues: list[dict]) -> dict:
    content = heading(
        "지난 호", "날짜별 대한민국 조간",
        "발행일별 머리기사와 당시의 숫자를 읽습니다. 최신 호와 과거 기록을 구분해 확인하세요.",
        f'공개 호 {len(issues)}개 · 최신 호 {date_html(issues[0]["date"])}',
    )
    cards = []
    for issue in issues:
        lead = issue.get("lead") or {}
        date = issue["date"]
        title = lead.get("headline") or issue.get("headline") or date + "호"
        cards.append(
            '<li class="discovery-card">'
            f'<p class="discovery-meta">{date_html(date)}호 · {esc(review_text(issue))}</p>'
            f'<h2><a href="/{date}">{esc(title)}</a></h2>'
            f'<p>{esc(lead.get("standfirst", ""))}</p></li>'
        )
    content += '<ol class="discovery-grid discovery-archive">' + "".join(cards) + "</ol>"
    return page("archive/index.html", "지난 호 모아보기 · 날짜별 뉴스와 핵심 숫자", "대한민국 조간의 날짜별 머리기사와 경제 숫자, 언론 보도 비교를 당시 기록으로 읽습니다.", content, issues[0]["date"], "archive")


def topic_cards(items: list[dict], updated: str) -> dict:
    lead = "현재 상황과 다음 확인 과제를 먼저 읽고, 날짜별 진행 기록과 근거 기사를 함께 확인합니다."
    content = heading("이슈 추적", "끝까지 확인할 이슈", lead, f'추적 사안 {len(items)}건 · 기록 갱신 {date_html(updated)}')
    cards = []
    for item in items:
        cards.append(
            '<li class="discovery-card">'
            f'<p class="discovery-meta">{esc(item.get("status", ""))}</p>'
            f'<h2><a href="/topics/{item["id"]}/">{esc(item.get("shortTitle") or item["title"])}</a></h2>'
            f'<p>{esc(item["summary"])}</p>'
            f'<p class="discovery-note">{esc(item.get("next", ""))}</p></li>'
        )
    content += '<ul class="discovery-grid">' + "".join(cards) + "</ul>"
    return page("topics/index.html", "이슈 추적 · 현재 상황과 확인 기록", lead, content, updated, "topics")


def topic(item: dict, updated: str) -> dict:
    name = item.get("shortTitle") or item["title"]
    content = heading("이슈 추적", item["title"], item["summary"], f'{esc(item.get("status", ""))} · 기록 갱신 {date_html(updated)}')
    content += topic_records(item)
    content += '<p class="discovery-links"><a href="/topics/">다른 이슈 읽기</a> · <a href="/">오늘의 조간 읽기</a></p>'
    return page(f'topics/{item["id"]}/index.html', f"{name} 진행 상황·일정·관련 기사", item["summary"], content, updated, "topic")


def topic_records(item: dict) -> str:
    content = ""
    keywords = (item.get("trackingKeywords") or {}).get("exact", [])
    if keywords:
        content += f'<p class="discovery-meta"><strong>추적 키워드</strong> {esc(keywords[0])}</p>'
    content += '<p class="discovery-note">보도에 따른 정리입니다. 주장·혐의·예정과 확인된 사실은 아래 근거와 확인 범위를 함께 읽어 주세요.</p>'
    phases = item.get("phases") or []
    index = item.get("phaseIndex")
    if phases and isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(phases):
        states = []
        for number, phase in enumerate(phases):
            state = "이전 단계" if number < index else "현재 확인" if number == index else "후속 확인"
            current = ' aria-current="step"' if number == index else ""
            states.append(f'<li{current}><strong>{esc(phase)}</strong><span>{state}</span></li>')
        content += '<section aria-labelledby="phases"><h2 id="phases">현재 진행 단계</h2><ol class="discovery-phases">' + "".join(states) + '</ol><p class="discovery-meta">단계는 편집상 정리이며 공식 완료율이 아닙니다.</p></section>'
    if item.get("periodUnknown"):
        content += f'<p class="discovery-note">{esc(item.get("label") or "최종 일정 미확정")}</p>'
    elif item.get("start") and item.get("end"):
        content += f'<p class="discovery-meta">{esc(item.get("label") or "기록된 기간")} {date_html(item["start"])} ~ {date_html(item["end"])}</p>'
    if item.get("next"):
        content += '<section aria-labelledby="next"><h2 id="next">다음으로 확인할 내용</h2>' + f'<p>{esc(item["next"])}</p></section>'
    if item.get("note"):
        content += '<section class="discovery-note" aria-labelledby="limits"><h2 id="limits">읽을 때 구분할 점</h2>' + f'<p>{esc(item["note"])}</p></section>'
    steps = [step for step in item.get("steps", []) if isinstance(step, dict) and step.get("t")]
    if steps:
        rows = []
        for step in steps:
            state = "기록" if step.get("done") else "예정·후속 확인"
            when = date_html(step["d"]) if step.get("d") else "일정 미확정"
            rows.append(f'<li><p class="discovery-meta">{when} · {state}</p><p>{esc(step["t"])}</p></li>')
        content += '<section aria-labelledby="timeline"><h2 id="timeline">날짜별 진행 기록</h2><ol class="discovery-timeline">' + "".join(rows) + "</ol></section>"
    links = [link for link in item.get("links", []) if isinstance(link, dict) and link.get("title")]
    if links:
        rows = []
        for link in sorted(links, key=lambda row: str(row.get("date", "")), reverse=True):
            rows.append(
                '<tr><td data-label="보도일·매체">' + date_html(link.get("date"))
                + f'<br>{esc(link.get("outlet", "매체 미기록"))}</td>'
                + '<th scope="row" data-label="기사·원문">' + source_link(link.get("url"), link["title"])
                + (f'<p class="discovery-meta">{esc(link["topic"])}</p>' if link.get("topic") else "") + "</th>"
                + f'<td data-label="핵심 내용·확인 범위"><p>{esc(link.get("summary") or "요약 미기록. 제목만으로 상세 내용을 확정하지 않습니다.")}</p>'
                + f'<p class="discovery-meta">{esc(link.get("verification") or "확인 범위 미기록")}</p></td></tr>'
            )
        content += '<section aria-labelledby="sources"><h2 id="sources">관련 기사와 확인 범위</h2><div class="discovery-table-wrap"><table class="discovery-table"><caption>최신 보도부터 정리한 근거 기사</caption><thead><tr><th scope="col">보도일·매체</th><th scope="col">기사·원문</th><th scope="col">핵심 내용·확인 범위</th></tr></thead><tbody>' + "".join(rows) + "</tbody></table></div></section>"
    return content


def indicator_rows(issues: list[dict], key: str) -> list[tuple[dict, dict]]:
    rows = []
    for issue in issues:
        for number in issue.get("nums", []):
            if isinstance(number, dict) and number.get("k") == key and str(number.get("v", "")).strip():
                rows.append((issue, number))
                break
    return rows


def indicator_cards(series: list[tuple[str, str, list]], modified: str) -> dict:
    lead = "호마다 수록한 값과 자료 기준일을 나란히 확인합니다. 발행일과 시세·통계의 기준일은 서로 다를 수 있습니다."
    content = heading("경제 숫자", "기준일과 출처로 읽는 핵심 지표", lead)
    cards = []
    for slug, title, rows in series:
        issue, number = rows[0]
        source = number.get("src") or {}
        cards.append(
            f'<li class="discovery-card"><h2><a href="/indicators/{slug}/">{esc(title)}</a></h2>'
            f'<p class="discovery-value">{esc(number["v"])}</p><p>{esc(number.get("d", ""))}</p>'
            f'<p class="discovery-meta">자료 기준 {esc(source.get("base") or "미기록")}<br>{date_html(issue["date"])}호 수록 · {len(rows)}개 호 기록</p></li>'
        )
    content += '<ul class="discovery-grid">' + "".join(cards) + "</ul>"
    return page("indicators/index.html", "경제 지표 기록 · 코스피·환율·유가·기준금리", lead, content, modified, "indicators")


def indicator(slug: str, title: str, rows: list[tuple[dict, dict]]) -> dict:
    latest, number = rows[0]
    source = number.get("src") or {}
    lead = f'{latest["date"]}호 수록 값은 {number["v"]}입니다. 자료 기준: {source.get("base") or "미기록"}. 각 호의 근거와 확인 상태를 함께 읽으세요.'
    content = heading("경제 숫자", f"{title} · 기준일별 수록 기록", lead, f'{len(rows)}개 호 · {date_html(rows[-1][0]["date"])} ~ {date_html(latest["date"])} 발행 기록')
    content += '<section class="discovery-card" aria-labelledby="latest-value"><h2 id="latest-value">최신 호에 수록한 값</h2>'
    content += f'<p class="discovery-value">{esc(number["v"])}</p><p>{esc(number.get("d", ""))}</p>'
    content += '<dl class="discovery-facts">'
    content += f'<div><dt>자료 기준</dt><dd>{esc(source.get("base") or "미기록")}</dd></div>'
    content += f'<div><dt>자료 발표일</dt><dd>{date_html(source.get("pub"))}</dd></div>'
    content += f'<div><dt>기록된 출처</dt><dd>{source_link(source.get("url"), source.get("name") or "근거 링크")}</dd></div>'
    content += f'<div><dt>발행 확인 상태</dt><dd>{esc(review_text(latest))}</dd></div></dl>'
    content += f'<p>{esc(number.get("ref", ""))}</p>'
    if source.get("title"):
        content += f'<p class="discovery-meta">근거 설명: {esc(source["title"])}</p>'
    content += "</section>"
    content += '<p class="discovery-note">실시간 시세가 아닌 호별 수록 기록입니다. 같은 기준일의 값이 여러 호에 반복될 수 있으며 연속 거래일 시계열이 아닙니다. 시초가·지난주 종가처럼 항목명이 다른 값은 이 표에 섞지 않습니다. 잠정치·기사 인용 여부와 매체별 차이는 각 근거 설명을 확인하세요.</p>'
    table_rows = []
    for issue, value in rows:
        src = value.get("src") or {}
        detail = []
        if value.get("ref"):
            detail.append(f'<p>{esc(value["ref"])}</p>')
        if src.get("title"):
            detail.append(f'<p>근거 설명: {esc(src["title"])}</p>')
        if value.get("grade"):
            detail.append(f'<p>기록된 출처 등급: {esc(value["grade"])}</p>')
        details = '<details><summary>세부 근거 읽기</summary>' + "".join(detail) + "</details>" if detail else ""
        table_rows.append(
            f'<tr><th scope="row" data-label="발행 호"><a href="/{issue["date"]}">{date_html(issue["date"])}</a></th>'
            f'<td data-label="수록 값·변동"><strong>{esc(value["v"])}</strong><br>{esc(value.get("d", ""))}</td>'
            f'<td data-label="자료 기준·발표">{esc(src.get("base") or "기준 미기록")}<p class="discovery-meta">발표 {date_html(src.get("pub"))}</p></td>'
            f'<td data-label="근거·확인 상태">{source_link(src.get("url"), src.get("name") or "근거 링크")}<p class="discovery-meta">{esc(review_text(issue))}</p>{details}</td></tr>'
        )
    content += '<section aria-labelledby="history"><h2 id="history">호별 값과 자료 기준</h2><div class="discovery-table-wrap"><table class="discovery-table"><caption>최신 호부터 정리한 ' + esc(title) + ' 기록</caption><thead><tr><th scope="col">발행 호</th><th scope="col">수록 값·변동</th><th scope="col">자료 기준·발표</th><th scope="col">근거·확인 상태</th></tr></thead><tbody>' + "".join(table_rows) + "</tbody></table></div></section>"
    content += '<p class="discovery-links"><a href="/indicators/">다른 경제 지표 읽기</a> · <a href="/archive/">지난 호 모아보기</a></p>'
    return page(f"indicators/{slug}/index.html", f"{title} 기록 · 기준일·변동·출처", lead, content, latest["date"], "indicator")


def read_text(flag) -> str:
    return "본문 확인" if flag is True else "제목·링크만 확인"


def region_rows(issues: list[dict], name: str) -> list[tuple[dict, list[dict]]]:
    """그 시도의 기사가 있는 호와 기사 목록을 최신 호부터 돌려준다."""
    rows = []
    for issue in issues:
        items = [item for item in ((issue.get("regions") or {}).get("items") or [])
                 if isinstance(item, dict) and item.get("region") == name and item.get("title")]
        if items:
            rows.append((issue, items))
    return rows


def region_cards(series: list[tuple[str, str, list]], modified: str) -> dict:
    lead = "17개 시도의 소식을 지역별로 모아 날짜순으로 읽습니다. 기사마다 매체와 원문 링크, 본문 확인 여부를 함께 적습니다."
    content = heading("지역 뉴스", "시도별로 읽는 지역 소식", lead, f'{len(series)}개 시도 · 최신 호 {date_html(modified)}')
    cards = []
    for slug, name, rows in series:
        issue, items = rows[0]
        line = ((issue.get("regions") or {}).get("summary") or {}).get(name) or items[0]["title"]
        cards.append(
            f'<li class="discovery-card"><h2><a href="/regions/{slug}/">{esc(name)} 뉴스</a></h2>'
            f'<p>{esc(line)}</p>'
            f'<p class="discovery-meta">{date_html(issue["date"])}호 기준 · {sum(len(group) for _, group in rows)}건 기록</p></li>'
        )
    content += '<ul class="discovery-grid">' + "".join(cards) + "</ul>"
    return page("regions/index.html", "지역 뉴스 · 17개 시도별 주요 소식", lead, content, modified, "regions")


def region(slug: str, name: str, rows: list[tuple[dict, list[dict]]]) -> dict:
    latest, items = rows[0]
    line = ((latest.get("regions") or {}).get("summary") or {}).get(name) or ""
    lead = line or f'{latest["date"]}호에 실린 {name} 소식 {len(items)}건을 포함해 최근 기록을 날짜순으로 정리했습니다.'
    shown = rows[:REGION_ISSUES]
    content = heading("지역 뉴스", f"{name} 뉴스 · 날짜별 주요 소식", lead,
                      f'{len(shown)}개 호 · {date_html(shown[-1][0]["date"])} ~ {date_html(latest["date"])} 발행 기록')
    content += '<p class="discovery-note">각 호는 발행 전날까지 보도된 기사를 요약한 기록입니다. 요약은 원문을 대신하지 않으며, 본문을 읽지 못한 기사는 제목에서 확인되는 내용만 적었습니다.</p>'
    for issue, group in shown:
        date = issue["date"]
        summary = ((issue.get("regions") or {}).get("summary") or {}).get(name)
        content += f'<section aria-labelledby="d{date}"><h2 id="d{date}"><a href="/{date}">{date_html(date)}호</a>에 실린 {esc(name)} 소식</h2>'
        if summary and issue is not latest:
            content += f'<p>{esc(summary)}</p>'
        entries = []
        for item in group:
            figures = [str(f) for f in (item.get("figures") or []) if str(f).strip()]
            entries.append(
                '<li><h3>' + source_link(item.get("url"), item["title"]) + '</h3>'
                + f'<p class="discovery-meta">{esc(item.get("cat") or "분류 미기록")} · {esc(item.get("outlet") or "매체 미기록")} · 보도 {date_html(item.get("date"))} · {read_text(item.get("body_read"))}</p>'
                + (f'<p>{esc(item["summary"])}</p>' if item.get("summary") else "")
                + (f'<p class="discovery-meta">기사에 실린 숫자: {esc(" / ".join(figures))}</p>' if figures else "")
                + '</li>'
            )
        content += '<ul class="discovery-timeline">' + "".join(entries) + '</ul><p class="discovery-meta">' + esc(review_text(issue)) + '</p></section>'
    content += '<p class="discovery-links"><a href="/regions/">다른 시도 읽기</a> · <a href="/archive/">지난 호 모아보기</a> · <a href="/">오늘의 조간 읽기</a></p>'
    return page(f"regions/{slug}/index.html", f"{name} 뉴스 · 날짜별 주요 소식과 원문 링크", lead, content, latest["date"], "region")


def theme_rows(issues: list[dict]) -> list[tuple[dict, dict, str]]:
    """공개 호의 언론 주제를 (호, 주제, 주소 조각)으로 최신 호부터 돌려준다. 주소는 발행일과 주제 ID로 만든다."""
    rows, seen = [], set()
    for issue in issues:
        for theme in issue.get("themes") or []:
            if not isinstance(theme, dict) or not theme.get("title"):
                continue
            ident = theme.get("id")
            if not isinstance(ident, str) or not SLUG.fullmatch(ident):
                continue
            slug = f'{issue["date"]}-{ident}'
            if slug in seen:
                continue
            seen.add(slug)
            rows.append((issue, theme, slug))
    return rows


def diff_tables(theme: dict) -> str:
    out = ""
    for number, diff in enumerate(theme.get("diffs") or []):
        if not isinstance(diff, dict) or not diff.get("q"):
            continue
        cols = [col for col in (diff.get("cols") or [])]
        rows = [row for row in (diff.get("rows") or []) if isinstance(row, list) and len(row) == len(cols)]
        out += f'<section aria-labelledby="q{number}"><h3 id="q{number}">{esc(diff["q"])}</h3>'
        if diff.get("a"):
            out += f'<p>{esc(diff["a"])}</p>'
        if cols and rows:
            head = "".join(f'<th scope="col">{esc(col)}</th>' for col in cols)
            body = "".join(
                "<tr>" + "".join(
                    (f'<th scope="row" data-label="{esc(cols[i])}">{esc(cell)}</th>' if i == 0 else f'<td data-label="{esc(cols[i])}">{esc(cell)}</td>')
                    for i, cell in enumerate(row)) + "</tr>"
                for row in rows)
            out += ('<div class="discovery-table-wrap"><table class="discovery-table"><caption>' + esc(diff["q"])
                    + f'</caption><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')
        out += "</section>"
    return out


def compare_cards(rows: list[tuple[dict, dict, str]]) -> dict:
    lead = "같은 사안을 여러 매체가 어떻게 전했는지, 숫자의 기준이 어디서 갈렸는지 주제별로 읽습니다."
    content = heading("보도 비교", "매체마다 갈린 숫자와 기준", lead, f'주제 {len(rows)}건 · 최신 호 {date_html(rows[0][0]["date"])}')
    cards = []
    for issue, theme, slug in rows:
        questions = [diff["q"] for diff in (theme.get("diffs") or []) if isinstance(diff, dict) and diff.get("q")]
        first = (theme.get("summary") or [""])[0]
        cards.append(
            '<li class="discovery-card">'
            f'<p class="discovery-meta">{date_html(issue["date"])}호 · 기사 {len(theme.get("articles") or [])}건</p>'
            f'<h2><a href="/compare/{slug}/">{esc(theme["title"])}</a></h2>'
            f'<p>{esc(description(first))}</p>'
            + (f'<p class="discovery-meta">기준이 갈린 숫자: {esc(" / ".join(questions))}</p>' if questions else "")
            + '</li>'
        )
    content += '<ol class="discovery-grid discovery-archive">' + "".join(cards) + "</ol>"
    return page("compare/index.html", "언론 보도 비교 · 매체마다 다른 숫자와 기준", lead, content, rows[0][0]["date"], "compare")


def compare(issue: dict, theme: dict, slug: str) -> dict:
    date = issue["date"]
    paragraphs = [text for text in (theme.get("summary") or []) if str(text).strip()]
    lead = paragraphs[0] if paragraphs else theme["title"]
    articles = [a for a in (theme.get("articles") or []) if isinstance(a, dict) and a.get("title")]
    meta = f'<a href="/{date}">{date_html(date)}호</a> 수록 · {esc(theme.get("period") or "기간 미기록")} · {esc(review_text(issue))}'
    content = heading("보도 비교", theme["title"], lead, meta)
    content += '<p class="discovery-note">발행 전날까지의 보도를 정리한 당시 기록입니다. 이후 달라진 사실은 반영하지 않았으며, 주장·추정·전망과 확인된 사실의 구분은 본문 표기를 따릅니다.</p>'
    if len(paragraphs) > 1:
        content += '<section aria-labelledby="summary"><h2 id="summary">정리</h2>' + "".join(f"<p>{esc(text)}</p>" for text in paragraphs[1:]) + "</section>"
    tables = diff_tables(theme)
    if tables:
        content += '<section aria-labelledby="diffs"><h2 id="diffs">기준이 갈린 숫자</h2>' + tables + "</section>"
    if articles:
        rows = "".join(
            f'<tr><td data-label="매체">{esc(a.get("outlet") or "매체 미기록")}<p class="discovery-meta">{esc(a.get("region") or "")}</p></td>'
            f'<th scope="row" data-label="기사·원문">{source_link(a.get("url"), a["title"])}</th>'
            f'<td data-label="보도일·확인 범위">{date_html(a.get("date"))}<p class="discovery-meta">{read_text(a.get("read"))}</p></td></tr>'
            for a in articles)
        content += ('<section aria-labelledby="articles"><h2 id="articles">이 주제를 다룬 기사</h2><div class="discovery-table-wrap"><table class="discovery-table">'
                    f'<caption>{len(articles)}개 기사 · 제목과 링크만 싣습니다</caption><thead><tr><th scope="col">매체</th><th scope="col">기사·원문</th><th scope="col">보도일·확인 범위</th></tr></thead><tbody>'
                    + rows + "</tbody></table></div></section>")
    keywords = [str(word) for word in (theme.get("keywords") or []) if str(word).strip()]
    if keywords:
        content += f'<p class="discovery-meta">관련 검색어: {esc(" · ".join(keywords))}</p>'
    content += f'<p class="discovery-links"><a href="/compare/">다른 보도 비교 읽기</a> · <a href="/{date}">{date}호 전체 읽기</a></p>'
    return page(f"compare/{slug}/index.html", f'{theme["title"]} · {date} 보도 비교', lead, content, date, "theme")


def pages(issues: list[dict], trackers: dict) -> list[dict]:
    """발행 자료만 받아 파일 저장 없이 페이지의 메타 정보와 본문을 돌려준다."""
    published = sorted(
        [issue for issue in issues if isinstance(issue, dict) and issue.get("status") != "draft" and date_value(issue.get("date"))],
        key=lambda issue: issue["date"], reverse=True,
    )
    if not published:
        return []
    result = [archive(published)]
    tracker_data = trackers if isinstance(trackers, dict) else {}
    items, seen = [], set()
    for item in tracker_data.get("items", []):
        if not isinstance(item, dict):
            continue
        slug = item.get("id")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in seen:
            continue
        if not item.get("title") or not item.get("summary") or not (item.get("steps") or item.get("links")):
            continue
        seen.add(slug)
        items.append(item)
    if items:
        updated = date_value(tracker_data.get("updated"))
        if not updated:
            updated = published[0]["date"] if published else ""
        result.append(topic_cards(items, updated))
        result.extend(topic(item, updated) for item in items)
    series = []
    for slug, key, title in INDICATORS:
        rows = indicator_rows(published, key)
        if rows:
            series.append((slug, title, rows))
    if series:
        modified = max(rows[0][0]["date"] for _, _, rows in series)
        result.append(indicator_cards(series, modified))
        result.extend(indicator(slug, title, rows) for slug, title, rows in series)
    areas = []
    for slug, name in REGIONS:
        rows = region_rows(published, name)
        if rows:
            areas.append((slug, name, rows))
    if areas:
        result.append(region_cards(areas, max(rows[0][0]["date"] for _, _, rows in areas)))
        result.extend(region(slug, name, rows) for slug, name, rows in areas)
    themes = theme_rows(published)
    if themes:
        result.append(compare_cards(themes))
        result.extend(compare(issue, theme, slug) for issue, theme, slug in themes)
    return result
