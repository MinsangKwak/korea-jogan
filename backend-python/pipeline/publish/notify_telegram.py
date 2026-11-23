"""새로 공개한 최신 호의 요약을 텔레그램 채널에 한 번 보낸다. 아침 발행 워크플로가 발행 직후에 돌린다.

사용: python3 backend-python/pipeline/publish/notify_telegram.py --before <발행 전 main SHA> [--after origin/main] [--dry-run]
- 발행 전 커밋에서 이미 공개 상태였던 호는 다시 보내지 않는다(재확인 실행에서 중복 발송 방지).
- TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID가 없으면 아무것도 보내지 않고 정상 종료한다.
- 알림 실패는 발행을 되돌릴 이유가 아니므로 항상 0으로 끝낸다. 토큰은 출력하지 않는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
ISSUES = "frontend-vanilla-js/data/issues"
SITE = "https://korea-jogan.com/"
API = "https://api.telegram.org/bot{token}/sendMessage"
WEEKDAYS = "월화수목금토일"
# 텔레그램 메시지 한 건의 길이 제한(4096자)보다 넉넉히 짧게 쓴다
LIMIT = 1500
BRIEFS = 4
NUMS = 4


def show(ref: str, path: str, root: Path = ROOT):
    """그 커밋의 JSON 파일. 없거나 읽지 못하면 None."""
    result = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=root, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except ValueError:
        return None


def is_public(issue) -> bool:
    return isinstance(issue, dict) and issue.get("status") not in (None, "draft")


def should_send(before, after) -> bool:
    """발행 전에는 공개가 아니었고 지금은 공개인 호만 보낸다."""
    return is_public(after) and not is_public(before)


def first_paragraph(text) -> str:
    parts = [part.strip() for part in str(text or "").split("\n") if part.strip()]
    return " ".join(parts[0].split()) if parts else ""


def link(date: str) -> str:
    query = urllib.parse.urlencode({"utm_source": "telegram", "utm_medium": "social",
                                    "utm_campaign": date[:4] + date[5:7] + "_readership"})
    return f"{SITE}{date}?{query}"


def message(issue: dict) -> str:
    date = issue["date"]
    year, month, day = (int(part) for part in date.split("-"))
    weekday = WEEKDAYS[dt.date(year, month, day).weekday()]
    lead = issue.get("lead") or {}
    lines = [f"대한민국 조간 · {month}월 {day}일({weekday})", "", lead.get("headline") or issue.get("headline") or ""]
    stand = first_paragraph(lead.get("standfirst"))
    if stand:
        lines += ["", stand]
    briefs = [str(b.get("k", "")).strip() for b in issue.get("briefs", []) if isinstance(b, dict) and str(b.get("k", "")).strip()]
    if briefs:
        lines += ["", "오늘 꼭 볼 숫자"] + [f"· {text}" for text in briefs[:BRIEFS]]
    nums = [n for n in issue.get("nums", []) if isinstance(n, dict) and n.get("k") and n.get("v")]
    if nums:
        lines += ["", "핵심 숫자"] + [f"· {n['k']} {n['v']}" + (f" ({n['d']})" if n.get("d") else "") for n in nums[:NUMS]]
    review = issue.get("review") or {}
    tail = ["", "전체 읽기: " + link(date), "자동 발행 · 사람의 원문 확인 전" if review.get("auto") else "출처와 기준일은 지면에서 확인하세요"]
    body, end = "\n".join(lines), "\n" + "\n".join(tail)
    room = LIMIT - len(end)
    if len(body) > room:
        body = body[: room - 1].rstrip() + "…"
    return body + end


def wait_until_live(date: str, seconds: int, opener=urllib.request.urlopen, pause=time.sleep) -> bool:
    """공개 주소가 열릴 때까지 잠깐 기다린다. 끝내 열리지 않으면 False."""
    deadline = time.monotonic() + seconds
    while True:
        try:
            with opener(urllib.request.Request(SITE + date, method="HEAD"), timeout=15) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, OSError, ValueError):
            pass
        if time.monotonic() >= deadline:
            return False
        pause(15)


def send(text: str, token: str, chat: str, opener=urllib.request.urlopen) -> bool:
    data = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode("utf-8")
    try:
        with opener(urllib.request.Request(API.format(token=token), data=data), timeout=20) as response:
            return response.status == 200
    except urllib.error.HTTPError as error:
        print(f"텔레그램 알림 실패: HTTP {error.code}")
    except (urllib.error.URLError, OSError, ValueError) as error:
        print(f"텔레그램 알림 실패: {type(error).__name__}")
    return False


def run(before: str, after: str, dry_run: bool = False, wait: int = 240, root: Path = ROOT, env=None,
        opener=urllib.request.urlopen, pause=time.sleep) -> str:
    env = os.environ if env is None else env
    index = show(after, f"{ISSUES}/index.json", root)
    date = index.get("latest") if isinstance(index, dict) else None
    if not isinstance(date, str):
        return "최신 호를 찾지 못해 건너뜀"
    path = f"{ISSUES}/{date}.json"
    issue = show(after, path, root)
    if not should_send(show(before, path, root), issue):
        return f"{date}호는 새로 공개한 호가 아니어서 건너뜀"
    text = message(issue)
    if dry_run:
        print(text)
        return f"{date}호 미리보기"
    token, chat = env.get("TELEGRAM_BOT_TOKEN", "").strip(), env.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat:
        return "텔레그램 설정이 없어 건너뜀"
    if not wait_until_live(date, wait, opener, pause):
        return f"{date}호 주소가 아직 열리지 않아 보내지 않음"
    return f"{date}호 텔레그램 알림 " + ("전송" if send(text, token, chat, opener) else "실패")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", default="origin/main")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        print(run(args.before, args.after, args.dry_run))
    except Exception as error:  # 알림 문제로 발행 작업을 실패시키지 않는다
        print(f"텔레그램 알림 건너뜀: {type(error).__name__}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
