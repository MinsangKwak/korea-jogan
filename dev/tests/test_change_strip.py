"""사건 자체의 최근 변화만 최신 지면에 싣고 재빌드 때 과거 호에 남기지 않는다."""
from pathlib import Path
import sys
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/build"))

from build_change_strip import STRIP, inject_change_strip, latest_changes


class ChangeStripTest(unittest.TestCase):
    def test_editions_and_context(self):
        template = (REPO / "dev/web/index.html").read_text()
        trackers = {"items": [
            {"id": "issue-one", "title": "기록 하나", "summary": "요약", "steps": [
                {"d": "2026-11-18", "t": "사건", "done": True}]},
            {"id": "issue-two", "title": "기록 둘", "summary": "요약", "steps": [
                {"d": "2026-11-18", "t": "사건", "done": True}]},
            {"id": "court-procedure", "title": "형사 재판", "summary": "요약", "steps": [
                {"d": "2025-07-22", "t": "기일 추후 지정", "done": True},
                {"d": "2026-11-19", "t": "관련 입법", "done": True, "contextOnly": True}]},
        ]}
        home = inject_change_strip(template, trackers, "2026-11-20", current=True)
        strip = STRIP.search(home)[0]
        self.assertEqual(strip.count('class="change-strip__card"'), 3)
        self.assertIn('datetime="2025-07-22"', strip)
        self.assertNotIn('datetime="2026-11-19"', strip)
        self.assertIn('href="/topics/court-procedure/"', strip)
        self.assertIn('href="/topics/"', strip)
        self.assertEqual(home, inject_change_strip(home, trackers, "2026-11-20", current=True))
        for day in ("2026-11-18", ""):
            archive = inject_change_strip(home, trackers, day, current=False)
            self.assertNotIn('class="change-strip__card"', STRIP.search(archive)[0])
            self.assertIn('data-change-archive="" hidden', STRIP.search(archive)[0])
            self.assertEqual(home, inject_change_strip(archive, trackers, "2026-11-20", current=True))

    def test_eligible_events_and_ties(self):
        steps = [
            {"d": "2026-01-01", "done": True, "t": "하나"},
            {"d": "2026-01-10", "done": True, "t": "둘"},
            {"d": "2026-01-10", "done": True, "t": "셋", "brief": "같은 날 마지막 발표"},
            {"d": "2026-01-11", "done": True, "t": "관련 입법", "contextOnly": True},
            {"d": "2026-01-12", "done": False, "t": "예정"},
            {"d": "2026-01-23", "done": True, "t": "미래"},
        ]
        def issue(slug, events):
            return {"id": slug, "title": slug, "summary": "요약", "steps": events}

        items = [issue(name, steps) for name in ["one", "two", "three", "four"]]
        items.insert(0, issue("../bad", steps))
        items.insert(0, issue("no-date", [{"d": "", "t": "없음", "done": True}]))
        changes = latest_changes({"items": items, "updated": "2026-01-20"}, "2026-01-20")
        self.assertEqual([change["id"] for change in changes], ["one", "two", "three"])
        self.assertTrue(all(change["date"] == "2026-01-10" for change in changes))
        self.assertTrue(all(change["text"] == "같은 날 마지막 발표" for change in changes))


if __name__ == "__main__":
    unittest.main()
