"""robots.txt가 검색 엔진은 들이고 AI·SEO 수집 봇은 막는지 본다."""
from __future__ import annotations

import unittest
from pathlib import Path
from urllib.robotparser import RobotFileParser

ROBOTS = Path(__file__).resolve().parents[1] / "web" / "robots.txt"
SITE = "https://korea-jogan.com"


class RobotsTest(unittest.TestCase):
    def setUp(self):
        self.rp = RobotFileParser()
        self.rp.parse(ROBOTS.read_text(encoding="utf-8").splitlines())

    def test_search_engines_can_render_pages(self):
        for bot in ("Googlebot", "Yeti", "Bingbot", "Daumoa"):
            for path in ("/", "/2026-10-19", "/data/issues/index.json", "/src/main.js"):
                self.assertTrue(self.rp.can_fetch(bot, SITE + path), f"{bot} {path}")
            self.assertFalse(self.rp.can_fetch(bot, SITE + "/admin/"), bot)

    def test_ai_and_seo_crawlers_are_blocked(self):
        for bot in ("GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot", "Bytespider", "AhrefsBot", "SemrushBot"):
            self.assertFalse(self.rp.can_fetch(bot, SITE + "/"), bot)

    def test_other_bots_skip_admin_and_raw_data(self):
        self.assertTrue(self.rp.can_fetch("SomeBot", SITE + "/"))
        for path in ("/admin/", "/data/issues/index.json", "/src/main.js"):
            self.assertFalse(self.rp.can_fetch("SomeBot", SITE + path), path)
        self.assertIn("Sitemap: https://korea-jogan.com/sitemap.xml", ROBOTS.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
