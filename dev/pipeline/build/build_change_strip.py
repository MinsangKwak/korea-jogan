"""최신 지면에서 실제 사건 날짜순으로 이슈별 변화를 정적 링크로 제공한다."""
from __future__ import annotations

import re

from build_discovery import SLUG, date_value, esc


STRIP = re.compile(r'<!-- CHANGE_STRIP_START -->.*?<!-- CHANGE_STRIP_END -->', re.S)
CARDS = re.compile(r'(<!-- CHANGE_CARDS_START -->).*?(<!-- CHANGE_CARDS_END -->)', re.S)


def latest_changes(trackers: dict, issue_date: str) -> list[dict]:
    changes = []
    seen = set()
    for item in (trackers or {}).get("items", []):
        if not isinstance(item, dict):
            continue
        slug = item.get("id")
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in seen:
            continue
        if not item.get("title") or not item.get("summary"):
            continue
        seen.add(slug)
        latest = None
        for step in item.get("steps") or []:
            if not isinstance(step, dict) or step.get("done") is not True or step.get("contextOnly"):
                continue
            date = date_value(step.get("d"))
            if date and date <= issue_date and step.get("t") and (latest is None or date >= latest["d"]):
                latest = step
        if latest:
            changes.append({
                "id": slug, "title": item.get("shortTitle") or item["title"],
                "date": latest["d"], "text": latest.get("brief") or latest["t"],
            })
    return sorted(changes, key=lambda item: item["date"], reverse=True)[:3]


def card(change: dict) -> str:
    date = change["date"]
    return (
        f'<li><a class="change-strip__card" href="/topics/{change["id"]}/">'
        f'<time datetime="{date}">{date.replace("-", ".")}</time>'
        f'<h3>{esc(change["title"])}</h3><p>{esc(change["text"])}</p></a></li>'
    )


def inject_change_strip(markup: str, trackers: dict, issue_date: str, *, current: bool) -> str:
    def render(match: re.Match) -> str:
        changes = latest_changes(trackers, issue_date) if current and date_value(issue_date) else []
        section = CARDS.sub(lambda m: m[1] + "".join(map(card, changes)) + m[2], match[0])
        state = (f' data-change-edition="{issue_date}"' if current and date_value(issue_date)
                 else ' data-change-archive=""')
        if not changes:
            state += " hidden"

        def attributes(tag: re.Match) -> str:
            old = re.sub(r' (?:hidden\b|data-change-(?:edition|archive)="[^"]*")', "", tag[0])
            return old[:-1] + state + ">"

        return re.sub(r'<section\b[^>]*\bid="changeStrip"[^>]*>', attributes, section, count=1)

    return STRIP.sub(render, markup, count=1)
