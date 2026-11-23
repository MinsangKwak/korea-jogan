"""Vercel Python 함수에서 현재 배포의 정제 기사 DB를 읽는다."""
from pathlib import Path

from article_http import make_app


app = make_app(Path(__file__).resolve().parents[1] / "var" / "articles.sqlite3")
