"""개발 빌드가 운영 파일·측정·색인과 분리되는지 확인한다."""
from __future__ import annotations

import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "dev/pipeline/build"))
import build_pages
import build_preview
import build_security

PUBLISHED = "2026-11-03"
DRAFT = "2026-11-04"
COMMIT = "a" * 40


def hashes(root: Path):
    return {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest() for file in root.rglob("*") if file.is_file()}


class PreviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "source"
        self.output = self.root / "preview"
        shutil.copytree(ROOT / "dev/web", self.source)
        self.issues = self.source / "data/issues"
        (self.issues / "index.json").write_text(json.dumps({"latest": DRAFT, "issues": [DRAFT, PUBLISHED]}))
        draft = json.loads((self.issues / f"{DRAFT}.json").read_text())
        draft["status"] = "draft"
        (self.issues / f"{DRAFT}.json").write_text(json.dumps(draft, ensure_ascii=False))
        self.before = hashes(self.source)

    def tearDown(self):
        self.tmp.cleanup()

    def build(self, **kwargs):
        return build_preview.build(self.source, self.output, commit=COMMIT, branch="dev", **kwargs)

    def test_operating_source_is_untouched_and_output_identifies_exact_commit(self):
        metadata = self.build()
        self.assertEqual(hashes(self.source), self.before)
        self.assertEqual(metadata["commit"], COMMIT)
        self.assertEqual(metadata["branch"], "dev")
        self.assertEqual(json.loads((self.output / "preview-build.json").read_text()), metadata)
        page = (self.output / "index.html").read_text()
        self.assertIn('<aside id="previewBanner"', page)
        self.assertIn(COMMIT, page)
        self.assertNotIn(COMMIT, (self.source / "index.html").read_text())

    def test_all_pages_are_noindex_tracking_disabled_and_csp_blocks_google_collection(self):
        self.build()
        pages = list(self.output.rglob("*.html"))
        self.assertGreater(len(pages), 3)
        for file in pages:
            with self.subTest(page=file.relative_to(self.output)):
                page = file.read_text()
                self.assertIn('name="robots" content="' + build_preview.NOINDEX + '"', page)
                self.assertNotRegex(page, r'<meta name="jg-(?:ga4|goatcounter)" content="[^"]+"')
                self.assertNotIn('site-verification', page)
                policy = html.unescape(re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"', page)[1])
                for blocked in ("googletagmanager.com", "google-analytics.com", "gc.zgo.at", "accounts.google.com", "analyticsdata.googleapis.com"):
                    self.assertNotIn(blocked, policy)
                self.assertIn("connect-src 'self'", policy)
                self.assertNotIn("unsafe-eval", policy)
                for value in build_preview.inline_hashes(page):
                    self.assertIn(value, policy)

    def test_metadata_and_feed_stay_in_preview_origin(self):
        self.build()
        for file in self.output.rglob("*.html"):
            page = file.read_text()
            canonical = re.search(r'<link rel="canonical" href="([^"]+)"', page)[1]
            self.assertTrue(canonical.startswith(build_preview.ORIGIN + "/"), canonical)
            for match in build_preview.LDJSON.finditer(page):
                graph = json.loads(match[2])
                self.assertNotIn('"https://korea-jogan.com', json.dumps(graph))
        for name in ("feed.xml", "sitemap.xml"):
            text = (self.output / name).read_text()
            self.assertIn(build_preview.ORIGIN, text)
            self.assertNotIn("<loc>https://korea-jogan.com", text)
            self.assertNotIn("<link>https://korea-jogan.com", text)
        self.assertEqual((self.output / "robots.txt").read_text(), "User-agent: *\nDisallow: /\n")

    def test_original_external_article_links_and_issue_data_are_preserved(self):
        path = self.issues / f"{PUBLISHED}.json"
        issue = json.loads(path.read_text())
        article = "https://news.example.com/story?next=https://korea-jogan.com/test"
        issue["national"]["items"][0]["url"] = article
        path.write_text(json.dumps(issue, ensure_ascii=False))
        self.build()
        output_issue = json.loads((self.output / "data/issues" / path.name).read_text())
        self.assertEqual(output_issue, issue)
        page = (self.output / "index.html").read_text()
        embedded = json.loads(re.search(r'<script type="application/json" id="issue-data">(.*?)</script>', page, re.S)[1])
        self.assertEqual(embedded, issue)
        self.assertIn(article, page)

    def test_unpublished_json_and_date_pages_are_not_shipped(self):
        self.build()
        index = json.loads((self.output / "data/issues/index.json").read_text())
        self.assertEqual(index, {"latest": PUBLISHED, "issues": [PUBLISHED]})
        self.assertFalse((self.output / "data/issues" / f"{DRAFT}.json").exists())
        self.assertFalse((self.output / f"{DRAFT}.html").exists())
        self.assertTrue((self.output / f"{PUBLISHED}.html").exists())
        self.assertIn(PUBLISHED, (self.output / "index.html").read_text())

    def test_admin_oauth_and_domain_verification_are_not_shipped(self):
        (self.source / "CNAME").write_text("korea-jogan.com\n")
        (self.source / "abc123456.txt").write_text("abc123456\n")
        self.build()
        self.assertTrue((self.source / "admin/config.js").exists())
        self.assertFalse((self.output / "admin/config.js").exists())
        self.assertFalse((self.output / "admin/app.js").exists())
        self.assertFalse((self.output / "CNAME").exists())
        self.assertFalse((self.output / "abc123456.txt").exists())
        notice = (self.output / "admin/index.html").read_text()
        self.assertIn("운영 통계를 연결하지 않습니다", notice)
        self.assertNotIn("accounts.google.com", notice)

    def test_invalid_origin_commit_and_overwrite_targets_fail_without_source_change(self):
        for origin in ("https://dev.korea-jogan.com.evil.example", "http://dev.korea-jogan.com", "https://user@dev.korea-jogan.com", "https://dev.korea-jogan.com/path"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                self.build(origin=origin)
        with self.assertRaises(ValueError):
            build_preview.build(self.source, self.source, commit=COMMIT)
        with self.assertRaises(ValueError):
            build_preview.build(self.source, self.root, commit=COMMIT)
        self.output.mkdir()
        (self.output / "keep.txt").write_text("keep")
        with self.assertRaises(ValueError):
            self.build()
        self.assertEqual((self.output / "keep.txt").read_text(), "keep")
        with self.assertRaises(ValueError):
            build_preview.build(self.source, self.root / "invalid", commit="bad")
        self.assertEqual(hashes(self.source), self.before)

    def test_rebuild_replaces_only_owned_output_and_restores_generator_globals(self):
        saved = (build_pages.PUBLIC, build_pages.ISSUES, build_pages.SITE)
        self.build()
        first = (self.output / "index.html").read_text()
        (self.output / "stale.html").write_text("stale")
        self.build()
        self.assertFalse((self.output / "stale.html").exists())
        self.assertEqual(first, (self.output / "index.html").read_text())
        self.assertEqual(saved, (build_pages.PUBLIC, build_pages.ISSUES, build_pages.SITE))
        self.assertEqual((self.output / "index.html").read_text().count('id="previewBanner"'), 1)

    def test_vercel_configuration_covers_every_path_and_deploys_only_dev(self):
        config = json.loads((ROOT / "vercel.json").read_text())
        self.assertEqual(config["outputDirectory"], "dist-preview")
        self.assertEqual(config["git"]["deploymentEnabled"], {"*": False, "dev": True})
        self.assertEqual(config["headers"][0]["source"], "/(.*)")
        headers = {row["key"]: row["value"] for row in config["headers"][0]["headers"]}
        self.assertIn("noindex", headers["X-Robots-Tag"])
        self.assertIn("no-store", headers["Cache-Control"])
        self.assertIn("no-store", headers["Vercel-CDN-Cache-Control"])

    def test_vercel_cli_requires_dev_and_exact_commit_before_build(self):
        for environment in ({"VERCEL": "1"}, {"VERCEL": "1", "VERCEL_GIT_COMMIT_SHA": COMMIT, "VERCEL_GIT_COMMIT_REF": "main"}):
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True), patch.object(build_preview, "build") as build:
                self.assertEqual(build_preview.main(), 1)
                build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
