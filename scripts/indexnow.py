"""새로 배포한 주소를 IndexNow로 검색엔진(Bing·네이버 등)에 알린다. 배포 워크플로가 배포 직후 돌린다.

사용: python scripts/indexnow.py
키는 비밀값이 아니다. public/<키>.txt 파일로 이 도메인의 소유를 증명한다.
알리지 못해도 배포는 이미 끝났으므로 0으로 끝내고 사유만 남긴다.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_feed  # noqa: E402

PUBLIC = Path(__file__).resolve().parent.parent / "public"
ENDPOINT = "https://api.indexnow.org/indexnow"
HOST = "korea-jogan.com"


def find_key() -> str:
    for p in sorted(PUBLIC.glob("*.txt")):
        text = p.read_text(encoding="utf-8").strip()
        if p.stem == text and len(text) >= 8:
            return text
    raise FileNotFoundError("public/<키>.txt 형태의 IndexNow 키 파일이 없음")


def payload(key: str, issues: list[dict]) -> dict:
    # 첫 화면과 최근 호 페이지만 알린다. 지난 호는 사이트맵으로 충분하다
    urls = [build_feed.SITE] + [build_feed.SITE + i["date"] for i in issues[:2]]
    return {"host": HOST, "key": key, "keyLocation": f"{build_feed.SITE}{key}.txt", "urlList": urls}


def main() -> int:
    body = payload(find_key(), build_feed.published())
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode("utf-8"),
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            print(f"IndexNow {res.status}: {', '.join(body['urlList'])}")
    except Exception as e:  # 알림 실패는 배포를 되돌릴 이유가 아니다
        print(f"IndexNow 알림 실패: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
