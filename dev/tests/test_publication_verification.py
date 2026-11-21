"""같은 SHA의 이전 시간대 배포나 서로 다른 공개 자료를 성공으로 보지 않는다."""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock

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


class ExpectTodayTest(unittest.TestCase):
    def refs(self, output=f"{SHA}\trefs/heads/main\n"):
        return mock.patch.object(verify_publication.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, output, ""))

    def test_before_six_kst_skips_without_network(self):
        early = dt.datetime(2026, 11, 5, 5, 59, tzinfo=verify_publication.KST)
        with mock.patch.object(verify_publication, "release_sha") as release:
            self.assertEqual(verify_publication.expect_today(60, early), 0)
        release.assert_not_called()

    def test_today_follows_kst_not_utc(self):
        utc = dt.datetime(2026, 11, 4, 21, 0, tzinfo=dt.timezone.utc)
        self.assertEqual(verify_publication.today_kst(utc), (DATE, True))

    def test_release_sha_is_remote_main(self):
        with self.refs():
            self.assertEqual(verify_publication.release_sha(), SHA)
        for output in ("", "main\trefs/heads/main\n", f"{SHA}\trefs/heads/dev\n"):
            with self.refs(output), self.assertRaises(ValueError):
                verify_publication.release_sha()

    def test_public_today_issue_and_deploy_sha_decide_the_result(self):
        now = dt.datetime(2026, 11, 5, 6, 30, tzinfo=verify_publication.KST)
        with self.refs(), mock.patch.object(verify_publication, "wait_until", return_value=True) as wait:
            self.assertEqual(verify_publication.expect_today(60, now), 0)
        wait.assert_called_once_with(SHA, DATE, None, 60)
        with self.refs(), mock.patch.object(verify_publication, "wait_until", return_value=False), \
                mock.patch.object(verify_publication, "public_build_info", return_value="2026-11-04호"):
            self.assertEqual(verify_publication.expect_today(60, now), 1)

    def test_unreadable_main_fails_the_run(self):
        now = dt.datetime(2026, 11, 5, 6, 30, tzinfo=verify_publication.KST)
        with self.refs(""), mock.patch.object(verify_publication, "wait_until") as wait:
            self.assertEqual(verify_publication.expect_today(60, now), 1)
        wait.assert_not_called()

    def test_wait_retries_until_public_copy_matches(self):
        clock = iter(range(0, 1000, 5))
        with mock.patch.object(verify_publication.time, "monotonic", side_effect=lambda: next(clock)), \
                mock.patch.object(verify_publication.time, "sleep"), \
                mock.patch.object(verify_publication, "check_once", side_effect=[OSError(), False, True]) as check:
            self.assertTrue(verify_publication.wait_until(SHA, DATE, None, 60))
        self.assertEqual(check.call_count, 3)


if __name__ == "__main__":
    unittest.main()
