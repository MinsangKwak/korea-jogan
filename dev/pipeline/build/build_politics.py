"""정치 질문과 호별 정치 기사를 원본 날짜와 고정 주소로 연결한다."""
from __future__ import annotations

import datetime as dt
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import build_discovery as discovery
from build_discovery import date_html, date_value, esc, heading, safe_url
from question_recall import render_recall


KINDS = {"issue": "이슈 추적", "policy": "생활 정책", "term": "뉴스 속 용어"}
CONNECTIONS = {"/law/": "law", "/law/calendar/": "calendar"}
FRONT = re.compile(r"(<!-- politics-front:start -->)(.*?)(<!-- politics-front:end -->)", re.S)
KST = dt.timezone(dt.timedelta(hours=9))


def today() -> str:
    return dt.datetime.now(KST).date().isoformat()


def load(public: Path) -> list[dict]:
    path = public / "data" / "political-questions.json"
    if not path.exists():
        return []
    rows = json.loads(path.read_text(encoding="utf-8"))["questions"]
    ids, paths = set(), set()
    for row in rows:
        slug, tracker = row["id"], row.get("trackerId")
        if not discovery.SLUG.fullmatch(slug) or (tracker is not None and not discovery.SLUG.fullmatch(tracker)):
            raise ValueError(f"정치 질문 주소 오류: {slug}")
        if slug in ids or route(row) in paths or row["kind"] not in KINDS:
            raise ValueError(f"정치 질문 구분 또는 주소 중복: {slug}")
        ids.add(slug)
        paths.add(route(row))
        if not date_value(row["checkedAt"]) or (row.get("changedAt") and
                (not date_value(row["changedAt"]) or row["changedAt"] > row["checkedAt"])):
            raise ValueError(f"정치 질문 날짜 오류: {slug}")
        seen_checks = set()
        for version in [row, *row.get("pastEditions", [])]:
            checked = version["checkedAt"]
            first_edition = version.get("editionFrom", checked)
            if (not date_value(checked) or checked > row["checkedAt"] or checked in seen_checks
                    or not date_value(first_edition) or first_edition < checked):
                raise ValueError(f"정치 질문 판본 날짜 오류: {slug}")
            seen_checks.add(checked)
            if not version["answer"] or not version["sources"] or any(
                    not safe_url(s["url"]) or not s["label"] for s in version["sources"]):
                raise ValueError(f"정치 질문 답 또는 출처 오류: {slug}")
        if any(c["path"] not in CONNECTIONS for c in row.get("connections", [])):
            raise ValueError(f"정치 질문 내부 링크 오류: {slug}")
    for row in rows:
        if set(row["related"]) - ids:
            raise ValueError(f"연결할 정치 질문을 찾을 수 없음: {row['id']}")
    return sorted(rows, key=lambda q: q["checkedAt"], reverse=True)


def route(row: dict) -> str:
    if row.get("trackerId"):
        return f'/topics/{row["trackerId"]}/'
    return f'/politics/{row["id"]}/'


def question_link(row: dict) -> str:
    action = ' data-question-action="term"' if row["kind"] == "term" else ""
    return f'<a href="{route(row)}"{action}>{esc(row["question"])}</a>'


def hub(rows: list[dict]) -> dict:
    lead = "궁금한 질문을 고르면 한 줄 답과 근거 원문을 읽을 수 있습니다."
    content = heading("오늘 정치 한 장", "정치 뉴스, 무엇이 궁금하세요?", lead)
    for kind, label in KINDS.items():
        group = [row for row in rows if row["kind"] == kind]
        if not group:
            continue
        content += f'<section aria-labelledby="kind-{kind}"><h2 id="kind-{kind}">{label}</h2><ul class="discovery-grid">'
        for row in group:
            content += (
                f'<li class="discovery-card"><h3>{question_link(row)}</h3><p>{esc(row["answer"])}</p>'
                f'<p class="discovery-meta">확인 {date_html(row["checkedAt"])}</p></li>'
            )
        content += '</ul></section>'
    return discovery.page("politics/index.html", "정치 뉴스 질문 모음 · 생활 정책과 시사용어", lead, content,
                          max(row["checkedAt"] for row in rows), "politics")


def question_page(row: dict, by_id: dict, tracker: dict | None, tracker_date: str) -> dict:
    content = heading(row["eyebrow"], row["question"], row["answer"], "마지막 확인 " + date_html(row["checkedAt"]))
    changed = row.get("changedAt")
    label = "마지막으로 달라진 일" if changed else "사례로 읽기"
    content += '<section aria-labelledby="question-change"><h2 id="question-change">' + label + '</h2>'
    if changed:
        content += f'<p class="discovery-meta">{date_html(changed)}</p>'
    content += f'<p>{esc(row["change"])}</p></section>'
    for section in row["sections"]:
        content += f'<section><h2>{esc(section["title"])}</h2><p>{esc(section["text"])}</p></section>'
    content += f'<section><h2>다음에 확인할 것</h2><p>{esc(row["next"])}</p></section>'
    content += '<section aria-labelledby="question-sources"><h2 id="question-sources">답의 근거</h2><ul>'
    for source in row["sources"]:
        when = " · " + date_html(source["date"]) if source.get("date") else ""
        content += f'<li><a href="{esc(source["url"])}" data-question-action="source">{esc(source["label"])}</a>{when}</li>'
    content += '</ul></section>' + render_recall(row["id"])
    links = [question_link(by_id[slug]) for slug in row["related"] if slug in by_id]
    for conn in row.get("connections", []):
        links.append(f'<a href="{conn["path"]}" data-question-action="{CONNECTIONS[conn["path"]]}">{esc(conn["label"])}</a>')
    links.append('<a href="/politics/">다른 정치 질문 보기</a>')
    content += '<nav class="question-related" aria-label="이어서 읽기"><h2>이어서 읽기</h2><ul>'
    content += ''.join('<li>' + link + '</li>' for link in links) + '</ul></nav>'
    if tracker:
        content += discovery.topic_records(tracker)
    path = route(row).lstrip("/") + "index.html"
    result = discovery.page(path, row["question"], row["answer"], content,
                            max(row["checkedAt"], tracker_date if tracker else ""), "topic" if tracker else "question")
    result["body"] = result["body"].replace('<main ', f'<main data-question-id="{row["id"]}" ', 1)
    result["questionId"] = row["id"]
    return result


def pages(issues: list[dict], trackers: dict, questions: list[dict]) -> list[dict]:
    result = discovery.pages(issues, trackers)
    if not result:
        return []
    by_path = {spec["path"]: spec for spec in result}
    by_tracker = {item["id"]: item for item in trackers.get("items", []) if isinstance(item, dict) and "id" in item}
    available = [q for q in questions if q["checkedAt"] <= today() and
                 (not q.get("trackerId") or route(q).lstrip("/") + "index.html" in by_path)]
    if available:
        guide = hub(available)
        by_path[guide["path"]] = guide
    by_id = {row["id"]: row for row in available}
    for row in available:
        spec = question_page(row, by_id, by_tracker.get(row.get("trackerId")), date_value(trackers.get("updated")))
        by_path[spec["path"]] = spec
    return list(by_path.values())


def edition_story(issue: dict) -> dict | None:
    for item in (issue.get("national") or {}).get("items", []):
        if (item.get("cat") in ("정치", "정치·국회", "안보·외교") and item.get("title") and safe_url(item.get("url"))
                and date_value(item.get("date")) and item["date"] <= issue["date"]):
            return item
    return None


def front_version(row: dict, cutoff: str, dated: bool) -> dict | None:
    versions = [row, *row.get("pastEditions", [])]
    available = (v for v in versions if (v.get("editionFrom", v["checkedAt"]) if dated else v["checkedAt"]) <= cutoff)
    version = max(available, key=lambda v: v["checkedAt"], default=None)
    return {**row, **version} if version else None


def with_front(markup: str, issue: dict, questions: list[dict], cutoff: str, *, dated: bool = False) -> str:
    match = FRONT.search(markup)
    if not match:
        return markup
    fragment = re.sub(r' hidden(?=[\s>])', ' hidden="hidden"', match[2].strip())
    root = ET.fromstring(fragment)
    nodes = {el.get("id"): el for el in root.iter() if el.get("id")}
    root.attrib.pop("hidden", None)
    root.set("data-issue-date", issue.get("date", ""))
    root.set("data-front-view", "edition" if dated else "home")
    # 재빌드에서도 지난 호의 제목과 주소가 감춰진 채로 남지 않게 초기화한다.
    for name in ("frontQuestion", "frontAnswer", "frontChecked", "frontSource", "frontEditionLabel", "frontEditionStory"):
        nodes[name].text = ""
    for name in ("frontSource", "frontDetail", "frontPolicy", "frontTerm", "frontEditionStory"):
        nodes[name].attrib.pop("href", None)
    nodes["frontChecked"].attrib.pop("datetime", None)
    nodes["frontSource"].attrib.pop("aria-label", None)
    nodes["frontEyebrow"].text = "정치 이슈"
    for name in ("politicsFront", "frontPolicyItem", "frontTermItem", "frontEdition"):
        nodes[name].set("hidden", "hidden")
    selected = {}
    for question in sorted(questions, key=lambda q: q["id"]):
        row = front_version(question, cutoff, dated)
        if row and (row["kind"] not in selected or row["checkedAt"] > selected[row["kind"]]["checkedAt"]):
            selected[row["kind"]] = row
    for kind, field in (("policy", "frontPolicy"), ("term", "frontTerm")):
        row = selected.get(kind)
        nodes[field].find("strong").text = row["question"] if row else ""
        if row:
            nodes[field].set("href", route(row))
            nodes[field + "Item"].attrib.pop("hidden", None)
    lead = selected.get("issue")
    if lead:
        root.attrib.pop("hidden", None)
        nodes["frontEyebrow"].text = lead["eyebrow"]
        nodes["frontQuestion"].text = lead["question"]
        nodes["frontAnswer"].text = lead["answer"]
        nodes["frontChecked"].text = lead["checkedAt"].replace("-", ".") + "."
        nodes["frontChecked"].set("datetime", lead["checkedAt"])
        nodes["frontDetail"].set("href", route(lead))
        nodes["frontSource"].set("href", lead["sources"][0]["url"])
        nodes["frontSource"].text = "근거 원문 보기"
        nodes["frontSource"].set("aria-label", "근거 원문 보기 · " + lead["sources"][0]["label"])
        story = edition_story(issue)
        if story:
            day = dt.date.fromisoformat(issue["date"])
            nodes["frontEdition"].attrib.pop("hidden", None)
            nodes["frontEditionLabel"].text = f"{day.month}월 {day.day}일호 정치·외교"
            nodes["frontEditionStory"].text = story["title"]
            nodes["frontEditionStory"].set("href", story["url"])
    html = ET.tostring(root, encoding="unicode", method="html")
    return markup[:match.start(2)] + "\n    " + html + "\n    " + markup[match.end(2):]
