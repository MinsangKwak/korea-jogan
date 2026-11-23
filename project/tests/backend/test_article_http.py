"""공개 서버의 조회 규약과 파일 경계를 검사한다."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend-python"))
from article_http import make_app
from edition_api import SCHEMA


class ArticleHttpTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = Path(self.temp.name) / "articles.sqlite3"
        with closing(sqlite3.connect(self.database)) as connection:
            connection.executescript(SCHEMA)
            connection.execute("INSERT INTO editions VALUES (?, ?, ?)", ("2026-11-23", "published", "abc"))
            connection.commit()
        self.app = make_app(self.database)

    def request(self, path, method="GET", query=""):
        response = {}

        def capture(status, headers):
            response["status"] = int(status.split()[0])
            response["headers"] = dict(headers)

        body = self.app({"PATH_INFO": path, "REQUEST_METHOD": method, "QUERY_STRING": query}, capture)
        return response["status"], response["headers"], b"".join(body)

    def test_get_head_and_rewritten_resource_return_same_data(self):
        date = "2026-11-23"
        status, headers, data = self.request("/api/v1/index.json")
        self.assertEqual((status, json.loads(data)["latest"]), (200, date))
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertEqual(self.request("/api/v1/index.json", "HEAD"), (200, headers, b""))
        detail = self.request("/api/v1/editions/" + date + ".json")
        self.assertEqual(detail, self.request("/api/articles", query="resource=editions%2F" + date + ".json"))
        self.assertEqual(json.loads(detail[2])["articles"], [])

    def test_methods_and_input_formats_return_generic_errors(self):
        for method in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS"):
            status, headers, body = self.request("/api/v1/index.json", method)
            self.assertEqual(status, 405)
            self.assertEqual(headers["Allow"], "GET, HEAD")
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertEqual(set(json.loads(body)), {"error"})
        for path in ("/api/v1/editions/2026-1-1.json", "/api/v1/articles/none.json", "/var/articles.sqlite3"):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/api/articles", query="resource=index.json&resource=absent")[0], 404)
        self.assertEqual(self.request("/api/v1/articles/" + "0" * 32 + ".json", "HEAD")[2], b"")
        self.database.unlink()
        status, headers, body = self.request("/api/v1/index.json")
        self.assertEqual(status, 503)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertFalse(self.database.exists())
        self.assertNotIn(str(self.database), body.decode())

    def test_docs_discovery_schema_and_public_files(self):
        self.assertEqual(self.request("/docs")[1]["Location"], "/api/docs/")
        status, headers, markup = self.request("/api/docs/")
        self.assertEqual(status, 200)
        self.assertIn('id="swagger-ui"', markup.decode())
        self.assertIn("script-src 'self'", headers["Content-Security-Policy"])
        self.assertIn("openapi", json.loads(self.request("/api/openapi.json")[2]))
        self.assertEqual(self.request("/api/docs/LICENSE")[0], 200)
        self.assertEqual(self.request("/api/docs/internal.py")[0], 404)


if __name__ == "__main__":
    unittest.main()
