"""공개 호와 추적 기록을 지난 호·사안·지표별 정적 본문으로 묶는다."""
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
    if not isinstance(value, str) or any(ord(char) <= 32 or ord(char) == 127 for char in value):
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


def source_link(url, label) -> str:
    href = safe_url(url)
    if not href:
        return esc(label)
    return f'<a href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(label)}</a>'


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
    content += '<p class="discovery-links"><a href="/topics/">다른 이슈 읽기</a> · <a href="/">오늘의 조간 읽기</a></p>'
    return page(f'topics/{item["id"]}/index.html', f"{name} 진행 상황·일정·관련 기사", item["summary"], content, updated, "topic")


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
    return result
