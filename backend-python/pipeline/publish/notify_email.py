"""새로 공개한 최신 호를 이메일 구독자에게 한 번 보낸다. 아침 발행 워크플로가 텔레그램 알림과 같은 자리에서 돌린다.

사용: python3 backend-python/pipeline/publish/notify_email.py --before <발행 전 main SHA> [--after origin/main] [--dry-run]
수동: python3 backend-python/pipeline/publish/notify_email.py --date YYYY-MM-DD [--after origin/main] [--dry-run]
- --date는 이미 공개한 그 날짜 호를 한 번 더 보낸다(newsletter.yml 수동 실행용). 초안은 보내지 않는다.
- 구독자 관리와 발송은 Buttondown(무료 100명까지)이 맡는다. 서버와 DB를 따로 두지 않는다.
- 발행 전 커밋에서 이미 공개 상태였던 호는 다시 보내지 않는다(재확인 실행에서 중복 발송 방지).
- BUTTONDOWN_API_KEY가 없으면 아무것도 보내지 않고 정상 종료한다.
- 초안을 만든 뒤 발송 상태로 바꾸는 두 단계로 보낸다. 발송 단계가 실패하면 초안만 남아 사람이 확인할 수 있다.
- 알림 실패는 발행을 되돌릴 이유가 아니므로 항상 0으로 끝낸다. 키는 출력하지 않는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from history_paths import frontend_at
from notify_telegram import ISSUES, ROOT, SITE, WEEKDAYS, first_paragraph, should_send, show, wait_until_live

API = "https://api.buttondown.com/v1/emails"
BRIEFS = 5
NATIONAL = 5
NUMS = 4


def link(date: str) -> str:
    query = urllib.parse.urlencode({"utm_source": "newsletter", "utm_medium": "email",
                                    "utm_campaign": date[:4] + date[5:7] + "_readership"})
    return f"{SITE}{date}?{query}"


def subject(issue: dict) -> str:
    year, month, day = (int(part) for part in issue["date"].split("-"))
    weekday = WEEKDAYS[dt.date(year, month, day).weekday()]
    lead = issue.get("lead") or {}
    head = lead.get("headline") or issue.get("headline") or "오늘의 조간"
    return f"[대한민국 조간 {month}/{day}({weekday})] {head}"


def items(rows, limit: int) -> list[dict]:
    return [row for row in (rows or []) if isinstance(row, dict)][:limit]


def body(issue: dict) -> str:
    """메일 본문 HTML. 메일 앱마다 CSS 지원이 달라 인라인 스타일만 쓴다."""
    e = html.escape
    date = issue["date"]
    url = e(link(date), quote=True)
    lead = issue.get("lead") or {}
    parts = [f'<h1 style="font-size:22px;line-height:1.35;margin:0 0 12px">{e(lead.get("headline") or issue.get("headline") or "")}</h1>']
    stand = first_paragraph(lead.get("standfirst"))
    if stand:
        parts.append(f'<p style="font-size:16px;line-height:1.6;margin:0 0 20px">{e(stand)}</p>')
    briefs = [b for b in items(issue.get("briefs"), BRIEFS) if str(b.get("k", "")).strip()]
    if briefs:
        parts.append('<h2 style="font-size:17px;margin:24px 0 8px">오늘 꼭 볼 숫자</h2><ul style="padding-left:20px;margin:0">')
        for b in briefs:
            more = f' <span style="color:#555">{e(str(b["m"]))}</span>' if b.get("m") else ""
            parts.append(f'<li style="margin-bottom:8px;line-height:1.55"><strong>{e(str(b["k"]))}</strong>{more}</li>')
        parts.append("</ul>")
    national = (issue.get("national") or {}).get("items") if isinstance(issue.get("national"), dict) else issue.get("national")
    news = [n for n in items(national, NATIONAL) if n.get("title")]
    if news:
        parts.append('<h2 style="font-size:17px;margin:24px 0 8px">전국 주요 뉴스</h2><ul style="padding-left:20px;margin:0">')
        for n in news:
            title = e(str(n["title"]))
            href = str(n.get("url") or "")
            title = f'<a href="{e(href, quote=True)}" style="color:#111">{title}</a>' if href.startswith("https://") else title
            outlet = f' <span style="color:#555">· {e(str(n["outlet"]))}</span>' if n.get("outlet") else ""
            parts.append(f'<li style="margin-bottom:6px;line-height:1.5">{title}{outlet}</li>')
        parts.append("</ul>")
    nums = [n for n in items(issue.get("nums"), NUMS) if n.get("k") and n.get("v")]
    if nums:
        rows = "".join(f'<li style="margin-bottom:4px">{e(str(n["k"]))} <strong>{e(str(n["v"]))}</strong>'
                       + (f' ({e(str(n["d"]))})' if n.get("d") else "") + "</li>" for n in nums)
        parts.append(f'<h2 style="font-size:17px;margin:24px 0 8px">핵심 숫자</h2><ul style="padding-left:20px;margin:0">{rows}</ul>')
    parts.append(f'<p style="margin:28px 0"><a href="{url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:4px;font-weight:700">오늘 지면 전체 읽기</a></p>')
    review = issue.get("review") or {}
    note = "자동 발행 · 사람의 원문 확인 전입니다. 출처와 기준일은 지면에서 확인하세요." if review.get("auto") else "출처와 기준일은 지면에서 확인하세요."
    parts.append(f'<p style="font-size:13px;color:#666;margin:0">{e(note)}</p>')
    return '<div style="max-width:600px;margin:0 auto;font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;color:#111">' + "".join(parts) + "</div>"


def call(method: str, url: str, key: str, payload: dict, opener=urllib.request.urlopen):
    """Buttondown API 호출. 성공하면 응답 JSON, 실패하면 None."""
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method=method, headers={
        "Authorization": f"Token {key}", "Content-Type": "application/json"})
    try:
        with opener(request, timeout=30) as response:
            if 200 <= response.status < 300:
                raw = response.read()
                return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        print(f"이메일 발송 실패: {method} HTTP {error.code}")
    except (urllib.error.URLError, OSError, ValueError) as error:
        print(f"이메일 발송 실패: {type(error).__name__}")
    return None


def send(issue: dict, key: str, opener=urllib.request.urlopen) -> bool:
    draft = call("POST", API, key, {"subject": subject(issue), "body": body(issue), "status": "draft"}, opener)
    if not isinstance(draft, dict) or not draft.get("id"):
        return False
    sent = call("PATCH", f"{API}/{urllib.parse.quote(str(draft['id']))}", key, {"status": "about_to_send"}, opener)
    return sent is not None


def run(before: str, after: str, dry_run: bool = False, wait: int = 240, root: Path = ROOT, env=None,
        opener=urllib.request.urlopen, pause=time.sleep) -> str:
    env = os.environ if env is None else env
    index = show(after, f"{ISSUES}/index.json", root)
    date = index.get("latest") if isinstance(index, dict) else None
    if not isinstance(date, str):
        return "최신 호를 찾지 못해 건너뜀"
    issue = show(after, f"{ISSUES}/{date}.json", root)
    previous = show(before, f"{frontend_at(root, before)}/data/issues/{date}.json", root)
    if not should_send(previous, issue):
        return f"{date}호는 새로 공개한 호가 아니어서 건너뜀"
    if dry_run:
        print(subject(issue))
        print(body(issue))
        return f"{date}호 미리보기"
    key = env.get("BUTTONDOWN_API_KEY", "").strip()
    if not key:
        return "이메일 구독 설정이 없어 건너뜀"
    if not wait_until_live(date, wait, opener, pause):
        return f"{date}호 주소가 아직 열리지 않아 보내지 않음"
    return f"{date}호 이메일 " + ("발송" if send(issue, key, opener) else "실패")


def run_date(date: str, after: str = "origin/main", dry_run: bool = False, root: Path = ROOT, env=None,
             opener=urllib.request.urlopen) -> str:
    """이미 공개한 호를 날짜로 골라 보낸다. 사람이 수동 실행으로만 부른다."""
    env = os.environ if env is None else env
    try:
        dt.date.fromisoformat(date)
    except ValueError:
        return f"날짜 형식이 아니어서 건너뜀: {date}"
    issue = show(after, f"{ISSUES}/{date}.json", root)
    if not isinstance(issue, dict) or issue.get("status") in (None, "draft"):
        return f"{date}호는 공개된 호가 아니어서 건너뜀"
    if dry_run:
        print(subject(issue))
        print(body(issue))
        return f"{date}호 미리보기"
    key = env.get("BUTTONDOWN_API_KEY", "").strip()
    if not key:
        return "이메일 구독 설정이 없어 건너뜀"
    return f"{date}호 이메일 " + ("발송" if send(issue, key, opener) else "실패")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--before")
    group.add_argument("--date")
    parser.add_argument("--after", default="origin/main")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        print(run_date(args.date, args.after, args.dry_run) if args.date else run(args.before, args.after, args.dry_run))
    except Exception as error:  # 메일 문제로 발행 작업을 실패시키지 않는다
        print(f"이메일 발송 건너뜀: {type(error).__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
