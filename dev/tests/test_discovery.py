"""검색 진입 페이지의 본문, 링크 연결, 초안 제외와 재생성을 확인한다."""
from __future__ import annotations

import copy
import json
import re
import shutil
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/build"))

import build_discovery
import build_feed
import build_pages

DATES = ("2026-11-02", "2026-11-03")
DRAFT = "2026-11-04"
SITE = "https://korea-jogan.com"


class Document(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.links = []
        self.titles = []
        self.h1 = []
        self.canonical = []
        self.scripts = []
        self._hidden = 0
        self._title = False
        self._heading = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self._hidden += 1
        if tag == "script":
            self.scripts.append(attrs)
        if tag == "title":
            self._title = True
        if tag == "h1":
            self._heading = True
            self.h1.append("")
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical.append(attrs.get("href"))

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._hidden = max(0, self._hidden - 1)
        if tag == "title":
            self._title = False
        if tag == "h1":
            self._heading = False

    def handle_data(self, data):
        if self._hidden:
            return
        self.text.append(data)
        if self._title:
            self.titles.append(data)
        if self._heading:
            self.h1[-1] += data

    @property
    def visible(self):
        return " ".join(self.text)


class DiscoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.public = self.tmp / "web"
        shutil.copytree(REPO / "dev/web", self.public)
        for path in self.public.glob("20??-??-??.html"):
            path.unlink()
        for directory in ("archive", "topics", "indicators"):
            shutil.rmtree(self.public / directory, ignore_errors=True)
        self.issues_path = self.public / "data/issues"
        self.issues = [json.loads((self.issues_path / f"{date}.json").read_text()) for date in DATES]
        self.trackers_path = self.public / "data/trackers.json"
        self.trackers = json.loads(self.trackers_path.read_text())
        self.saved = (build_pages.PUBLIC, build_pages.ISSUES, build_feed.PUBLIC, build_feed.ISSUES)
        build_pages.PUBLIC = build_feed.PUBLIC = self.public
        build_pages.ISSUES = build_feed.ISSUES = self.issues_path
        self.write_index(DATES)

    def tearDown(self):
        build_pages.PUBLIC, build_pages.ISSUES, build_feed.PUBLIC, build_feed.ISSUES = self.saved
        shutil.rmtree(self.tmp)

    def write_index(self, dates):
        (self.issues_path / "index.json").write_text(json.dumps({"latest": max(dates), "issues": list(dates)}))

    def page_specs(self):
        return build_discovery.pages(self.issues, self.trackers)

    def canonical_for(self, path):
        return SITE + "/" + str(path).removesuffix("index.html")

    def local_path(self, url):
        path = urlsplit(url).path
        if path.endswith("/"):
            return self.public / path.lstrip("/") / "index.html"
        return self.public / (path.lstrip("/") + ".html")

    def test_generated_pages_have_unique_search_identity(self):
        build_pages.build()
        titles, canonical = [], []
        for spec in self.page_specs():
            with self.subTest(page=spec["path"]):
                source = (self.public / spec["path"]).read_text()
                doc = Document(source)
                self.assertEqual(doc.canonical, [self.canonical_for(spec["path"])])
                self.assertEqual(len(doc.h1), 1)
                self.assertTrue(doc.h1[0].strip())
                self.assertTrue(doc.titles)
                self.assertNotIn('name="robots" content="noindex', source)
                titles.append("".join(doc.titles))
                canonical.extend(doc.canonical)
        self.assertEqual(len(titles), len(set(titles)))
        self.assertEqual(len(canonical), len(set(canonical)))

    def test_sitemap_urls_resolve_to_generated_canonical_pages(self):
        build_pages.build()
        root = ET.fromstring(build_feed.build_sitemap())
        locs = [node.text for node in root.findall("{*}url/{*}loc")]
        expected = [self.canonical_for(spec["path"]) for spec in self.page_specs()]
        for url in expected:
            self.assertIn(url, locs)
        self.assertEqual(len(locs), len(set(locs)))
        for url in locs:
            with self.subTest(url=url):
                path = self.local_path(url)
                self.assertTrue(path.exists(), f"사이트맵 주소에 HTML이 없음: {url}")
                self.assertEqual(Document(path.read_text()).canonical, [url])

    def test_main_links_survive_digest_removal_and_reach_archive_and_topics(self):
        build_pages.build()
        for path in (self.public / "index.html", self.public / f"{DATES[-1]}.html"):
            with self.subTest(page=path.name):
                source = build_pages.DIGEST.sub("", path.read_text())
                paths = {urlsplit(href).path for href in Document(source).links}
                self.assertIn("/archive/", paths)
                self.assertIn("/topics/", paths)
                self.assertIn("/indicators/", paths)
                self.assertIn("/" + DATES[0], paths)

    def test_all_discovery_pages_have_crawlable_routes_from_home(self):
        build_pages.build()
        expected = {self.canonical_for(spec["path"]) for spec in self.page_specs()}
        visited, pending = set(), [SITE + "/"]
        while pending:
            url = pending.pop()
            if url in visited:
                continue
            visited.add(url)
            path = self.local_path(url)
            source = build_pages.DIGEST.sub("", path.read_text())
            for href in Document(source).links:
                parts = urlsplit(href)
                if parts.netloc and parts.netloc != "korea-jogan.com":
                    continue
                if not parts.path.startswith("/"):
                    continue
                candidate = SITE + parts.path
                if candidate in expected and candidate not in visited:
                    pending.append(candidate)
        self.assertTrue(expected <= visited, f"홈에서 링크로 도달하지 못함: {expected - visited}")

    def test_tracker_facts_and_pending_work_are_readable_without_javascript(self):
        pages = {spec["path"]: spec for spec in self.page_specs()}
        for tracker in self.trackers["items"]:
            with self.subTest(topic=tracker["id"]):
                doc = Document(pages[f"topics/{tracker['id']}/index.html"]["body"])
                self.assertIn(tracker["summary"], doc.visible)
                self.assertIn(tracker["next"], doc.visible)
                self.assertIn(tracker["note"], doc.visible)
                self.assertIn(self.trackers["updated"], doc.visible)
                for step in tracker["steps"]:
                    self.assertIn(step["t"], doc.visible)
                for link in tracker["links"]:
                    self.assertIn(link["url"], doc.links)
                    if link.get("verification"):
                        self.assertIn(link["verification"], doc.visible)

    def test_indicator_history_keeps_basis_and_source_distinct_from_edition_date(self):
        pages = {spec["path"]: spec for spec in self.page_specs()}
        doc = Document(pages["indicators/usd-krw/index.html"]["body"])
        for issue in self.issues:
            item = next(item for item in issue["nums"] if item["k"] == "원·달러 환율")
            for text in (issue["date"], item["v"], item["d"], item["ref"], item["src"]["base"], item["src"]["pub"]):
                self.assertIn(str(text), doc.visible)
            self.assertIn(item["src"]["url"], doc.links)

    def test_draft_is_excluded_from_histories_archive_and_sitemap(self):
        draft = copy.deepcopy(self.issues[-1])
        draft.update(date=DRAFT, status="draft")
        draft["lead"]["headline"] = "DRAFT_ONLY_HEADLINE_4D64"
        draft["nums"][0]["v"] = "DRAFT_ONLY_VALUE_4D64"
        (self.issues_path / f"{DRAFT}.json").write_text(json.dumps(draft, ensure_ascii=False))
        self.write_index((*DATES, DRAFT))
        specs = build_discovery.pages([*self.issues, draft], self.trackers)
        for spec in specs:
            self.assertNotIn("DRAFT_ONLY_", spec["body"])
        build_pages.build()
        self.assertFalse((self.public / f"{DRAFT}.html").exists())
        self.assertNotIn(SITE + "/" + DRAFT, build_feed.build_sitemap())
        home = Document(build_pages.DIGEST.sub("", (self.public / "index.html").read_text()))
        self.assertNotIn("/" + DRAFT, home.links)

    def test_data_text_cannot_inject_markup(self):
        attack = '</h1><script>window.bad=true</script><img src=x onerror="window.bad=true">'
        trackers = copy.deepcopy(self.trackers)
        trackers["items"][0]["summary"] = attack
        issues = copy.deepcopy(self.issues)
        issues[0]["nums"][0]["ref"] = attack
        for spec in build_discovery.pages(issues, trackers):
            self.assertNotIn("<script>window.bad", spec["body"])
            self.assertNotIn('<img src=x onerror=', spec["body"])
        topic = next(spec for spec in build_discovery.pages(issues, trackers) if spec["path"] == f"topics/{trackers['items'][0]['id']}/index.html")
        self.assertIn(attack, Document(topic["body"]).visible)

    def test_unsafe_source_urls_are_never_clickable(self):
        unsafe = ("javascript:alert(1)", "data:text/html,bad", "https://example.com/\nbad", "https:///missing-host")
        for url in unsafe:
            with self.subTest(url=url):
                trackers = copy.deepcopy(self.trackers)
                trackers["items"][0]["links"][0]["url"] = url
                issues = copy.deepcopy(self.issues)
                issues[0]["nums"][0]["src"]["url"] = url
                for spec in build_discovery.pages(issues, trackers):
                    self.assertNotIn(url, Document(spec["body"]).links)

    def test_rebuild_removes_obsolete_generated_topics_but_preserves_handwritten_files(self):
        build_pages.build()
        topic = self.trackers["items"][0]
        removed = self.public / f"topics/{topic['id']}/index.html"
        self.assertTrue(removed.exists())
        handwritten = self.public / "topics/editorial-note.html"
        handwritten.write_text("<h1>편집자가 직접 쓴 안내</h1>")
        self.trackers["items"] = self.trackers["items"][1:]
        self.trackers_path.write_text(json.dumps(self.trackers, ensure_ascii=False))
        build_pages.build()
        self.assertFalse(removed.exists())
        self.assertTrue(handwritten.exists())
        self.assertNotIn(self.canonical_for(f"topics/{topic['id']}/index.html"), build_feed.build_sitemap())

    def test_no_published_editions_cannot_leave_old_indexable_content(self):
        build_pages.build()
        generated = [self.public / spec["path"] for spec in self.page_specs()]
        for issue in self.issues:
            issue["status"] = "draft"
            (self.issues_path / f"{issue['date']}.json").write_text(json.dumps(issue, ensure_ascii=False))
        build_pages.build()
        self.assertTrue(all(not path.exists() for path in generated))
        for date in DATES:
            self.assertFalse((self.public / (date + ".html")).exists())
        home_source = (self.public / "index.html").read_text()
        home = Document(home_source)
        self.assertNotIn(self.issues[-1]["lead"]["headline"], home.visible)
        for date in DATES:
            self.assertNotIn("/" + date, home.links)
        embedded = re.search(r'<script type="application/json" id="issue-data">(.*?)</script>', home_source, re.S)
        self.assertIsNotNone(embedded)
        self.assertIsNone(json.loads(embedded.group(1)))

    def test_rebuild_is_idempotent(self):
        build_pages.build()
        paths = [spec["path"] for spec in self.page_specs()] + ["index.html", *(date + ".html" for date in DATES)]
        once = {path: (self.public / path).read_bytes() for path in paths}
        build_pages.build()
        self.assertEqual(once, {path: (self.public / path).read_bytes() for path in paths})


if __name__ == "__main__":
    unittest.main()
