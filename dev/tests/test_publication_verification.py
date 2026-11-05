"""같은 SHA의 이전 시간대 배포나 서로 다른 공개 자료를 성공으로 보지 않는다."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "dev/pipeline/publish"))
import verify_publication

SHA = "a" * 40
DATE = "2026-11-05"


class PublicationVerificationTest(unittest.TestCase):
    def setUp(self):
        self.index = {"latest": DATE, "issues": [DATE]}
        self.info = {"environment": "production", "sourceSha": SHA, "issueDate": DATE, "builtAt": "2026-11-05T00:00:00Z"}
        self.issue = {"date": DATE, "status": "published", "review": {"auto": True}}
        self.html = '<script id="issue-index" type="application/json">' + json.dumps(self.index) + '</script><script id="issue-data" type="application/json">' + json.dumps(self.issue) + '</script>'

    def matches(self, **changes):
        values = dict(index=self.index, info=self.info, issue=self.issue, html=self.html, sha=SHA, date=DATE, built_at=self.info["builtAt"])
        values.update(changes)
        return verify_publication.snapshot_matches(**values)

    def test_all_public_surfaces_and_current_build_time_must_match(self):
        self.assertTrue(self.matches())
        self.assertFalse(self.matches(info={**self.info, "builtAt": "2026-11-04T23:00:00Z"}))
        self.assertFalse(self.matches(info={**self.info, "sourceSha": "b" * 40}))
        self.assertFalse(self.matches(info={**self.info, "environment": "preview"}))

    def test_wrong_date_draft_and_changed_home_body_are_rejected(self):
        self.assertFalse(self.matches(index={"latest": "2026-11-04", "issues": ["2026-11-04"]}))
        self.assertFalse(self.matches(issue={**self.issue, "status": "draft"}))
        self.assertFalse(self.matches(html=self.html.replace('"auto": true', '"auto": false')))
        self.assertFalse(self.matches(html="<main>로딩 중</main>"))
        self.assertFalse(self.matches(html=self.html + self.html))

    def test_malformed_public_payloads_fail_closed(self):
        for value in (None, [], {}, "bad"):
            self.assertFalse(self.matches(info=value))
        self.assertFalse(self.matches(index={"latest": DATE, "issues": None}))
        self.assertFalse(self.matches(sha=None))


if __name__ == "__main__":
    unittest.main()
