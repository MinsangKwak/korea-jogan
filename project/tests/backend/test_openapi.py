"""기사 문서가 실제 읽기 경로와 같은 계약과 자산을 가리키는지 확인한다."""
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest


API = Path(__file__).resolve().parents[3] / "backend-python" / "public/api"


class Tags(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.assets = {}
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script" or (tag == "link" and a.get("rel") == "stylesheet"):
            self.assets[a.get("src", a.get("href"))] = a.get("integrity")


class ApiDocumentationTest(unittest.TestCase):
    def test_contract_and_known_request_examples(self):
        spec = json.loads((API / "openapi.json").read_text(encoding="utf-8"))
        self.assertEqual(spec["servers"][0]["url"], "/api/v1")
        self.assertEqual(set(spec["paths"]), {"/index.json", "/editions/{date}.json", "/articles/{id}.json"})
        for path, methods in spec["paths"].items():
            self.assertEqual(set(methods), {"get"})
            success = methods["get"]["responses"]["200"]["content"]["application/json"]["schema"]
            self.assertIn(success["$ref"].split("/")[-1], spec["components"]["schemas"])
            if path != "/index.json":
                parameter = methods["get"]["parameters"][0]
                self.assertIn("{" + parameter["name"] + "}", path)
                self.assertTrue(parameter["required"])
                self.assertIn("404", methods["get"]["responses"])

    def test_vendor_assets_are_local_and_match_integrity_in_the_html(self):
        tags = Tags((API / "docs/index.html").read_text(encoding="utf-8"))
        for path, integrity in tags.assets.items():
            self.assertTrue(path.startswith("/api/docs/"), path)
            file = API / path.removeprefix("/api/")
            self.assertTrue(file.is_file())
            if file.name.startswith("swagger-ui"):
                actual = base64.b64encode(hashlib.sha384(file.read_bytes()).digest()).decode()
                self.assertEqual(integrity, "sha384-" + actual)


if __name__ == "__main__":
    unittest.main()
