"""로컬 서버와 Vercel이 공유하는 기사 조회 HTTP 앱."""
from contextlib import closing
from http import HTTPStatus
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs

from edition_api import API_ROOT, encode, read_resource


PUBLIC = Path(__file__).resolve().parent / "public"
SECURITY_HEADERS = [
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
]
DATA_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
DOCS_POLICY = (
    "default-src 'none'; script-src 'self'; script-src-attr 'none'; "
    "style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; "
    "connect-src 'self'; frame-ancestors 'none'; object-src 'none'; "
    "base-uri 'none'; form-action 'none'; frame-src 'none'"
)
JSON_TYPE = "application/json; charset=utf-8"
DOC_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
             ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8",
             ".svg": "image/svg+xml", ".png": "image/png"}


def json_body(record):
    return (encode(record) + "\n").encode("utf-8")


def documentation(path):
    if path == "/api/openapi.json":
        return PUBLIC / "api/openapi.json", JSON_TYPE
    if path in ("/api/docs/", "/api/docs"):
        return PUBLIC / "api/docs/index.html", DOC_TYPES[".html"]
    match = re.fullmatch(r"/api/docs/([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)", path)
    if match:
        file = PUBLIC / "api/docs" / match[1]
        if file.name in ("LICENSE", "NOTICE"):
            return file, DOC_TYPES[".txt"]
        if file.suffix in DOC_TYPES:
            return file, DOC_TYPES[file.suffix]
    return None


def rewritten_path(environ):
    path = environ.get("PATH_INFO", "")
    if path != "/api/articles":
        return path
    try:
        values = parse_qs(environ.get("QUERY_STRING", ""), max_num_fields=8).get("resource", [])
    except ValueError:
        return ""
    return API_ROOT + "/" + values[0] if len(values) == 1 else ""


def make_app(database):
    database_uri = Path(database).resolve().as_uri() + "?mode=ro"

    def app(environ, start_response):
        method = environ.get("REQUEST_METHOD", "")
        path = rewritten_path(environ)
        policy = DATA_POLICY
        headers = list(SECURITY_HEADERS)
        content_type = JSON_TYPE
        if method not in ("GET", "HEAD"):
            status, body = 405, json_body({"error": "GET과 HEAD만 지원합니다"})
            headers.append(("Allow", "GET, HEAD"))
        elif path in ("/", "/docs", "/docs/"):
            status, body = 307, b""
            headers.append(("Location", "/api/docs/"))
        else:
            status, body = 404, json_body({"error": "찾을 수 없는 기사 API 경로입니다"})
            asset = documentation(path)
            if asset:
                try:
                    body = asset[0].read_bytes()
                except FileNotFoundError:
                    pass
                else:
                    status, content_type, policy = 200, asset[1], DOCS_POLICY
            elif path.startswith(API_ROOT + "/"):
                try:
                    with closing(sqlite3.connect(database_uri, uri=True)) as db:
                        db.row_factory = sqlite3.Row
                        db.execute("PRAGMA query_only = ON")
                        db.execute("BEGIN")
                        record = read_resource(db, path)
                    if record is not None:
                        status, body = 200, json_body(record)
                except (sqlite3.Error, ValueError):
                    status, body = 503, json_body({"error": "기사 저장소를 읽을 수 없습니다"})
        headers.extend([
            ("Content-Security-Policy", policy), ("Content-Type", content_type),
            ("Cache-Control", "no-cache" if status < 400 else "no-store"),
            ("Content-Length", str(len(body))),
        ])
        start_response(f"{status} {HTTPStatus(status).phrase}", headers)
        return [] if method == "HEAD" else [body]

    return app
