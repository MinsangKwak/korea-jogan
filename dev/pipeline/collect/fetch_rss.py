"""언론사 RSS(dev/pipeline/collect/feeds.json)에서 발행일 전날 나온 기사의 제목·링크·날짜만 모은다.

사용: python dev/pipeline/collect/fetch_rss.py [--date YYYY-MM-DD] [--all]
결과는 dev/pipeline/collect/raw/rss/YYYY-MM-DD.json. --all이면 날짜로 거르지 않는다(피드 점검용).

원칙
- 제목·링크·날짜·언론사만 남긴다. 피드에 요약(description)이나 본문(content)이 있어도 읽어 들이지 않는다.
  AI 수집을 막은 매체의 본문을 RSS로 돌아서 쓰지 않기 위해서다.
- 피드마다 robots.txt를 먼저 보고, 이 수집기(USER_AGENT)에 막혀 있으면 건너뛴다.
- 피드 하나가 실패해도 나머지는 계속 모은다. 모두 실패하면 종료 코드 1.
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FEEDS = ROOT / "dev" / "pipeline" / "collect" / "feeds.json"
OUT = ROOT / "dev" / "pipeline" / "collect" / "raw" / "rss"
KST = dt.timezone(dt.timedelta(hours=9))
USER_AGENT = "korea-jogan-rss/1.0 (+https://github.com/MinsangKwak/korea-jogan)"
TIMEOUT = 20
ATOM = "{http://www.w3.org/2005/Atom}"
TAG_RE = re.compile(r"<[^>]+>")


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return res.read()


def robots_allows(url: str) -> bool:
    """robots.txt를 못 읽으면(없음·오류) 허용으로 본다. 표준 크롤러와 같은 해석."""
    parts = urllib.parse.urlsplit(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.parse(get(f"{parts.scheme}://{parts.netloc}/robots.txt").decode("utf-8", "replace").splitlines())
    except Exception:
        return True
    return rp.can_fetch(USER_AGENT, url)


def clean(text: str | None) -> str:
    return " ".join(html.unescape(TAG_RE.sub(" ", text or "")).split())


def parse_date(text: str | None) -> dt.datetime | None:
    text = (text or "").strip()
    if not text:
        return None
    try:
        when = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        try:
            when = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    # 시간대가 없는 날짜는 국내 피드 관행대로 한국 시간으로 본다
    if when.tzinfo is None:
        when = when.replace(tzinfo=KST)
    return when.astimezone(KST)


def parse_feed(data: bytes) -> list[dict]:
    """RSS 2.0과 Atom에서 (제목, 링크, 시각)만 꺼낸다."""
    root = ET.fromstring(data)
    out = []
    for item in root.iter("item"):
        out.append({
            "title": clean(item.findtext("title")),
            "url": (item.findtext("link") or item.findtext("guid") or "").strip(),
            "published": parse_date(item.findtext("pubDate") or item.findtext("{http://purl.org/dc/elements/1.1/}date")),
        })
    for entry in root.iter(f"{ATOM}entry"):
        link = entry.find(f"{ATOM}link[@rel='alternate']")
        if link is None:
            link = entry.find(f"{ATOM}link")
        out.append({
            "title": clean(entry.findtext(f"{ATOM}title")),
            "url": (link.get("href") if link is not None else "").strip(),
            "published": parse_date(entry.findtext(f"{ATOM}published") or entry.findtext(f"{ATOM}updated")),
        })
    return [x for x in out if x["title"] and x["url"].startswith(("https://", "http://"))]


def window(issue: dt.date) -> tuple[dt.datetime, dt.datetime]:
    """조간 기준: 발행일 전날 00:00부터 발행일 00:00 전까지(한국 시간)."""
    end = dt.datetime.combine(issue, dt.time(0, 0), KST)
    return end - dt.timedelta(days=1), end


def collect(feed: dict, span: tuple[dt.datetime, dt.datetime] | None, fetch=get, allowed=robots_allows) -> tuple[dict, list[dict]]:
    status = {"outlet": feed["outlet"], "url": feed["url"], "ok": False, "count": 0, "skipped_no_date": 0}
    if not allowed(feed["url"]):
        status["error"] = "robots.txt가 이 수집기를 막음"
        return status, []
    try:
        entries = parse_feed(fetch(feed["url"]))
    except Exception as e:
        status["error"] = f"{type(e).__name__}: {e}"[:200]
        return status, []
    items = []
    for x in entries:
        if x["published"] is None:
            status["skipped_no_date"] += 1
            continue
        if span and not (span[0] <= x["published"] < span[1]):
            continue
        items.append({
            "outlet": feed["outlet"],
            "region": feed["region"],
            "scope": feed["scope"],
            "title": x["title"],
            "url": x["url"],
            "published": x["published"].isoformat(timespec="minutes"),
        })
    status.update(ok=True, count=len(items))
    return status, items


def run(feeds: list[dict], issue: dt.date, keep_all: bool = False, fetch=get, allowed=robots_allows) -> dict:
    span = None if keep_all else window(issue)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda f: collect(f, span, fetch, allowed), feeds))
    seen: set[str] = set()
    items = []
    for _status, found in results:
        for it in found:
            if it["url"] in seen:
                continue
            seen.add(it["url"])
            items.append(it)
    items.sort(key=lambda x: x["published"], reverse=True)
    return {
        "collectedAt": dt.datetime.now(KST).isoformat(timespec="seconds"),
        "issue": issue.isoformat(),
        "window": None if keep_all else [span[0].isoformat(), span[1].isoformat()],
        "feeds": [s for s, _ in results],
        "items": items,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="언론사 RSS에서 제목·링크·날짜를 모은다")
    parser.add_argument("--date", help="발행일 YYYY-MM-DD. 없으면 한국 시간 오늘")
    parser.add_argument("--all", action="store_true", help="날짜로 거르지 않는다")
    args = parser.parse_args()
    issue = dt.date.fromisoformat(args.date) if args.date else dt.datetime.now(KST).date()
    feeds = json.loads(FEEDS.read_text(encoding="utf-8"))["feeds"]

    result = run(feeds, issue, args.all)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{issue.isoformat()}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    ok = [s for s in result["feeds"] if s["ok"]]
    print(f"저장: {path.relative_to(ROOT)} · 피드 {len(ok)}/{len(feeds)} · 기사 {len(result['items'])}건")
    for s in result["feeds"]:
        if not s["ok"]:
            print(f" - 실패 {s['outlet']}: {s['error']}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
