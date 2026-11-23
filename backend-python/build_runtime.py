"""현재 배포 커밋에서 Python 함수에 포함할 SQLite 데이터베이스를 만든다."""
from contextlib import closing
from pathlib import Path
import sqlite3

from edition_api import SCHEMA, catalog_index, sync_editions


def main():
    root = Path(__file__).resolve().parent
    database = root / "var" / "articles.sqlite3"
    database.parent.mkdir(parents=True, exist_ok=True)
    issues = root.parent / "frontend-vanilla-js/data/issues"
    with closing(sqlite3.connect(database, timeout=60)) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA)
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            sync_editions(connection, issues)
        index = catalog_index(connection)
    print(f"기사 저장소 준비 완료 · {index['latest']}호 · 공개 호 {len(index['editions'])}개")


if __name__ == "__main__":
    main()
