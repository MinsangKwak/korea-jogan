"""공개 발행 목록에서 기사 저장소와 v1 읽기 API를 만든다."""

import argparse
from contextlib import closing
from datetime import date
from functools import partial
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit


API_ROOT = "/api/v1"
PUBLIC_STATUSES = {"published", "prototype"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS editions (
    date TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    digest TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    edition_date TEXT NOT NULL REFERENCES editions(date) ON DELETE CASCADE,
    section TEXT NOT NULL,
    position INTEGER NOT NULL,
    region TEXT,
    source_date TEXT NOT NULL,
    outlet TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    category TEXT NOT NULL,
    body_read INTEGER NOT NULL CHECK (body_read IN (0, 1)),
    figures TEXT NOT NULL,
    figure_source TEXT,
    UNIQUE (edition_date, section, position)
);
"""


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def iso_date(value):
    if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
        raise ValueError(f"날짜 형식을 확인해 주세요: {value!r}")
    return value


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def article_row(edition_date, section, position, article):
    url = article["url"]
    parts = urlsplit(url)
    if parts.scheme not in ("https", "http") or not parts.hostname or parts.username or parts.password:
        raise ValueError(f"{edition_date}호 기사 원문 주소를 확인해 주세요")
    for key in ("outlet", "title", "summary", "cat"):
        if not isinstance(article[key], str) or not article[key].strip():
            raise ValueError(f"{edition_date}호의 기사 {key} 값이 비었습니다")
    if not isinstance(article["body_read"], bool):
        raise ValueError(f"{edition_date}호 기사 본문 확인 여부를 확인해 주세요")
    figures = article["figures"]
    if not isinstance(figures, list) or any(not isinstance(item, str) for item in figures):
        raise ValueError(f"{edition_date}호 기사 수치 형식을 확인해 주세요")
    region = article.get("region") or None
    if section == "regions" and not region:
        raise ValueError(f"{edition_date}호 지역 기사에 지역명이 필요합니다")
    identity = [edition_date, section, region if section == "regions" else None, url]
    article_id = sha256(encode(identity).encode()).hexdigest()[:32]
    return (article_id, edition_date, section, position, region, iso_date(article["date"]),
            article["outlet"], url, article["title"], article["summary"], article["cat"],
            int(article["body_read"]), encode(figures), article.get("figure_source"))


def sync_editions(connection, issues_dir):
    issue_dates = load_json(issues_dir / "index.json")["issues"]
    if not isinstance(issue_dates, list) or len(set(issue_dates)) != len(issue_dates):
        raise ValueError("발행 목록에는 중복 없는 날짜 배열이 필요합니다")
    published = set()
    for stamp in issue_dates:
        stamp = iso_date(stamp)
        issue = load_json(issues_dir / f"{stamp}.json")
        if issue["date"] != stamp:
            raise ValueError(f"{stamp}호 파일명과 지면 날짜가 다릅니다")
        status = issue["status"]
        if status not in PUBLIC_STATUSES:
            if status == "draft":
                continue
            raise ValueError(f"{stamp}호에 알 수 없는 발행 상태가 있습니다: {status}")
        published.add(stamp)
        rows = [article_row(stamp, section, index, item)
                for section in ("national", "regions")
                for index, item in enumerate(issue[section]["items"])]
        digest = sha256(encode([status, rows]).encode()).hexdigest()
        stored = connection.execute("SELECT digest FROM editions WHERE date = ?", (stamp,)).fetchone()
        if stored and stored[0] == digest:
            continue
        connection.execute("DELETE FROM editions WHERE date = ?", (stamp,))
        connection.execute("INSERT INTO editions VALUES (?, ?, ?)", (stamp, status, digest))
        connection.executemany("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    for (stamp,) in connection.execute("SELECT date FROM editions").fetchall():
        if stamp not in published:
            connection.execute("DELETE FROM editions WHERE date = ?", (stamp,))


def article_record(row):
    record = {
        "id": row["id"], "editionDate": row["edition_date"], "section": row["section"],
        "region": row["region"], "title": row["title"], "summary": row["summary"],
        "cat": row["category"], "date": row["source_date"], "body_read": bool(row["body_read"]),
        "outlet": row["outlet"], "url": row["url"], "figures": json.loads(row["figures"]),
    }
    if row["figure_source"] is not None:
        record["figure_source"] = row["figure_source"]
    return record


def write_json(path, value):
    path.write_text(encode(value) + "\n", encoding="utf-8")


def catalog_index(connection):
    editions = []
    counts = connection.execute("""
        SELECT e.date, e.status, COUNT(a.id)
        FROM editions AS e LEFT JOIN articles AS a ON a.edition_date = e.date
        GROUP BY e.date, e.status ORDER BY e.date DESC
    """)
    for day, status, count in counts:
        editions.append({"date": day, "status": status, "articleCount": count,
                         "href": f"{API_ROOT}/editions/{day}.json"})
    return {"version": 1, "latest": editions[0]["date"] if editions else None, "editions": editions}


def edition_record(connection, day):
    edition = connection.execute("SELECT status FROM editions WHERE date = ?", (day,)).fetchone()
    if edition is None:
        return None
    rows = connection.execute("SELECT * FROM articles WHERE edition_date = ? ORDER BY section, position", (day,))
    return {"version": 1, "date": day, "status": edition["status"], "articles": [article_record(row) for row in rows]}


def export_snapshot(connection, stage):
    (stage / "editions").mkdir(parents=True)
    (stage / "articles").mkdir()
    index = catalog_index(connection)
    for edition in index["editions"]:
        day = edition["date"]
        detail = edition_record(connection, day)
        write_json(stage / "editions" / f"{day}.json", detail)
        for record in detail["articles"]:
            write_json(stage / "articles" / f"{record['id']}.json", record)
    write_json(stage / "index.json", index)
    return index


def owned_output(output):
    if not output.exists():
        return True
    if not output.is_dir():
        return False
    names = {entry.name for entry in output.iterdir()}
    if not names:
        return True
    if names != {"index.json", "editions", "articles"}:
        return False
    for folder, pattern in (("editions", r"\d{4}-\d{2}-\d{2}\.json"), ("articles", r"[a-f0-9]{32}\.json")):
        directory = output / folder
        if directory.is_symlink() or not directory.is_dir():
            return False
        if any(p.is_symlink() or not p.is_file() or not re.fullmatch(pattern, p.name)
               for p in directory.iterdir()):
            return False
    index = load_json(output / "index.json")
    return isinstance(index, dict) and index.get("version") == 1 and isinstance(index.get("editions"), list)


def build_catalog(issues_dir, database, output):
    issues_dir, database, output = (Path(value).resolve() for value in (issues_dir, database, output))
    if issues_dir == output or issues_dir in output.parents or output in issues_dir.parents:
        raise ValueError("발행 원본과 API 출력 경로는 분리해 주세요")
    if database == output or output in database.parents or database == issues_dir or issues_dir in database.parents:
        raise ValueError("데이터베이스는 원본과 API 출력 디렉터리 밖에 두세요")
    database.parent.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database, timeout=60)) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript(SCHEMA)
        with TemporaryDirectory(prefix=".edition-api-", dir=output.parent) as temporary:
            stage = Path(temporary) / "new"
            previous = Path(temporary) / "previous"
            with db:
                db.execute("BEGIN IMMEDIATE")
                if not owned_output(output):
                    raise ValueError("기존 파일이 있는 경로는 기사 API 출력으로 교체할 수 없습니다")
                sync_editions(db, issues_dir)
                catalog = export_snapshot(db, stage)
                if output.exists():
                    output.rename(previous)
                try:
                    stage.rename(output)
                    db.commit()
                except BaseException:
                    if not stage.exists() and output.exists():
                        output.rename(stage)
                    if previous.exists():
                        previous.rename(output)
                    raise
    return catalog


def read_resource(connection, path):
    if path == f"{API_ROOT}/index.json":
        return catalog_index(connection)
    edition = re.fullmatch(API_ROOT + r"/editions/(\d{4}-\d{2}-\d{2})\.json", path)
    if edition:
        return edition_record(connection, edition[1])
    article = re.fullmatch(API_ROOT + r"/articles/([a-f0-9]{32})\.json", path)
    if article:
        row = connection.execute("SELECT * FROM articles WHERE id = ?", (article[1],)).fetchone()
        return article_record(row) if row else None
    return None


class ArticleHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, database, **kwargs):
        self.database = database
        super().__init__(*args, **kwargs)

    def do_HEAD(self):
        self.send_resource(include_body=False)

    def do_GET(self):
        self.send_resource(include_body=True)

    def send_resource(self, include_body):
        try:
            with closing(sqlite3.connect(self.database, uri=True)) as db:
                db.row_factory = sqlite3.Row
                db.execute("BEGIN")
                record = read_resource(db, self.path.partition("?")[0])
            status = 200 if record is not None else 404
            if record is None:
                record = {"error": "찾을 수 없는 기사 API 경로입니다"}
        except sqlite3.Error:
            status, record = 503, {"error": "기사 저장소를 읽을 수 없습니다"}
        body = (encode(record) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="SQLite를 갱신하고 읽기 API를 출력합니다")
    build.add_argument("--issues", type=Path, required=True)
    build.add_argument("--database", type=Path, required=True)
    build.add_argument("--output", type=Path, required=True)
    serve = commands.add_parser("serve", help="SQLite를 읽는 개발용 HTTP API를 실행합니다")
    serve.add_argument("--database", type=Path, required=True)
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if args.command == "serve":
        if not args.database.is_file():
            parser.error("build로 기사 데이터베이스를 먼저 생성해 주세요")
        handler = partial(ArticleHandler, database=args.database.resolve().as_uri() + "?mode=ro")
        with ThreadingHTTPServer((args.host, args.port), handler) as server:
            print(f"기사 API · http://{args.host}:{server.server_port}{API_ROOT}/index.json", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
        return
    result = build_catalog(args.issues, args.database, args.output)
    count = sum(edition["articleCount"] for edition in result["editions"])
    print(f"기사 API v1 · {len(result['editions'])}개 호 · 기사 {count}건 · 최근 호 {result['latest']}")


if __name__ == "__main__":
    main()
