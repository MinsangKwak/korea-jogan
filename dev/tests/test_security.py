"""정적 페이지의 인라인 허용 범위와 메타 CSP를 검사한다."""
import base64
import hashlib
import html
import json
import re
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/build"))
import build_pages
import build_security


def csp(page):
    return html.unescape(re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"', page)[1])


class SecurityTest(unittest.TestCase):
    def test_only_executable_inline_source_is_hashed(self):
        source = "\nwindow.ready = true;\n"
        page = '<html><head><meta charset="utf-8"><script>' + source + '</script><script type="application/json">{"value":"safe"}</script></head></html>'
        secured = build_security.secure_page(page)
        expected = base64.b64encode(hashlib.sha256(source.encode()).digest()).decode()
        self.assertIn("'sha256-" + expected + "'", csp(secured))
        self.assertEqual(csp(secured).count("sha256-"), 1)
        self.assertNotIn("'unsafe-inline'", csp(secured).split("script-src ")[1].split(";")[0])
        self.assertNotIn("unsafe-eval", csp(secured))
        changed = build_security.secure_page(page.replace("true", "false"))
        self.assertNotEqual(csp(secured), csp(changed))
        self.assertEqual(build_security.secure_page(secured), secured)

    def test_policy_precedes_scripts_and_separates_admin_endpoints(self):
        page = '<html><head><meta charset="utf-8"><script src="main.js"></script></head></html>'
        public = build_security.secure_page(page)
        admin = build_security.secure_page(page, admin=True)
        self.assertLess(public.index("Content-Security-Policy"), public.index("<script"))
        self.assertIn("script-src-attr 'none'", csp(public))
        self.assertIn("object-src 'none'", csp(public))
        self.assertIn("base-uri 'none'", csp(public))
        self.assertNotIn("accounts.google.com", csp(public))
        self.assertNotIn("analyticsdata.googleapis.com", csp(public))
        self.assertIn("https://accounts.google.com/gsi/client", csp(admin))
        self.assertIn("https://analyticsdata.googleapis.com", csp(admin))
        self.assertIn("https://oauth2.googleapis.com/revoke", csp(admin))
        self.assertNotIn("googletagmanager.com", csp(admin))
        self.assertNotIn("frame-ancestors", csp(admin))
        self.assertIn('name="referrer" content="strict-origin-when-cross-origin"', admin)

    def test_news_content_cannot_add_executable_script_or_csp_hash(self):
        template = (REPO / "dev/web/index.html").read_text()
        issue = json.loads((REPO / "dev/web/data/issues/2026-10-19.json").read_text())
        index = {"latest": issue["date"], "issues": [issue["date"]]}
        ordinary = build_pages.issue_page(template, issue, index)
        attack = '</script><script>window.injected=true</script><img src=x onerror="window.injected=true">'
        issue["lead"]["headline"] = attack
        issue["lead"]["standfirst"] = attack
        secured = build_pages.issue_page(template, issue, index)
        self.assertNotIn('<script>window.injected=true</script>', secured)
        self.assertEqual(csp(secured), csp(ordinary))
        embedded = re.search(r'<script type="application/json" id="issue-data">(.*?)</script>', secured, re.S)[1]
        self.assertEqual(json.loads(embedded)["lead"]["headline"], attack)


if __name__ == "__main__":
    unittest.main()
