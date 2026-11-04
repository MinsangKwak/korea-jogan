"""운영 배포 정보가 실제 HTML·공개 자료·체크아웃 커밋을 가리키는지 확인한다."""
from __future__ import annotations

from contextlib import redirect_stdout
import datetime as dt
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/build"))
import build_info

DATE = "2026-11-04"
SHA = "a" * 40
NOW = dt.datetime(2026, 11, 4, 10, 30, 45, tzinfo=dt.timezone(dt.timedelta(hours=9)))


class BuildInfoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.public = Path(self.temp.name)
        (self.public / "data/issues").mkdir(parents=True)
        self.index = {"latest": DATE, "issues": [DATE, "2026-11-03"]}
        self.issue = {"date": DATE, "status": "published", "headline": "공개한 호"}
        self.render()

    def tearDown(self):
        self.temp.cleanup()

    def render(self):
        page = '<html><head></head><body><script type="application/json" id="issue-index">' + json.dumps(self.index, ensure_ascii=False) + '</script><script type="application/json" id="issue-data">' + json.dumps(self.issue, ensure_ascii=False) + '</script></body></html>'
        (self.public / "index.html").write_text(page, encoding="utf-8")
        (self.public / "data/issues" / f"{DATE}.json").write_text(json.dumps(self.issue, ensure_ascii=False), encoding="utf-8")

    def test_manifest_has_only_public_identity_and_utc_build_time(self):
        result = build_info.build(self.public, SHA, NOW)
        self.assertEqual(result, {"environment": "production", "sourceSha": SHA, "issueDate": DATE, "builtAt": "2026-11-04T01:30:45Z"})
        self.assertEqual(build_info.build(self.public, SHA.upper(), NOW)["sourceSha"], SHA)

    def test_raw_index_draft_cannot_replace_actual_built_publication(self):
        (self.public / "data/issues/index.json").write_text(json.dumps({"latest": "2026-11-05", "issues": ["2026-11-05", DATE]}))
        (self.public / "data/issues/2026-11-05.json").write_text(json.dumps({"date": "2026-11-05", "status": "draft"}))
        self.assertEqual(build_info.build(self.public, SHA, NOW)["issueDate"], DATE)

    def test_draft_or_mismatched_built_issue_is_rejected(self):
        for change in ({"status": "draft"}, {"status": "prototype"}, {"date": "2026-11-03"}):
            with self.subTest(change=change):
                self.issue = {"date": DATE, "status": "published", "headline": "공개한 호", **change}
                self.render()
                with self.assertRaisesRegex(ValueError, "공개 상태"):
                    build_info.build(self.public, SHA, NOW)

    def test_missing_malformed_or_ambiguous_embedded_data_is_rejected(self):
        cases = [
            '<script type="application/json" id="issue-index">null</script>',
            '<script type="application/json" id="issue-index">{</script><script type="application/json" id="issue-data">null</script>',
            '<script type="application/json" id="issue-index">{}</script><script type="application/json" id="issue-index">{}</script>',
            '<div id="issue-index"></div>',
            '<script type="application/json" id="issue-index" id="other">{}</script>',
        ]
        for page in cases:
            with self.subTest(page=page):
                (self.public / "index.html").write_text(page)
                with self.assertRaises(ValueError):
                    build_info.build(self.public, SHA, NOW)

    def test_invalid_or_inconsistent_publication_dates_are_rejected(self):
        cases = [
            {"latest": "2026-02-30", "issues": ["2026-02-30"]},
            {"latest": DATE, "issues": ["2026-11-05", DATE]},
            {"latest": DATE, "issues": [DATE, DATE]},
            {"latest": DATE, "issues": []},
        ]
        for value in cases:
            with self.subTest(value=value):
                self.index = value
                self.render()
                with self.assertRaises(ValueError):
                    build_info.build(self.public, SHA, NOW)

    def test_stale_html_cannot_claim_new_json_content(self):
        (self.public / "data/issues" / f"{DATE}.json").write_text(json.dumps(dict(self.issue, headline="이후 바뀐 내용")))
        with self.assertRaisesRegex(ValueError, "다시 생성"):
            build_info.build(self.public, SHA, NOW)

    def test_fixed_commit_and_timezone_are_required(self):
        for value in ("main", "a" * 39, "g" * 40, "a" * 40 + "/main"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_info.build(self.public, value, NOW)
        with self.assertRaisesRegex(ValueError, "시간대"):
            build_info.build(self.public, SHA, dt.datetime(2026, 11, 4))

    def call_cli(self, source_sha, actual=SHA):
        output = io.StringIO()
        result = subprocess.CompletedProcess([], 0, stdout=actual + "\n", stderr="")
        with patch.object(build_info, "PUBLIC", self.public), patch.object(build_info.subprocess, "run", return_value=result), redirect_stdout(output):
            code = build_info.main(["--source-sha", source_sha])
        return code, output.getvalue()

    def test_cli_uses_actual_checkout_not_github_trigger_sha(self):
        with patch.dict(os.environ, {"GITHUB_SHA": "b" * 40, "SECRET_TOKEN": "must-not-appear"}):
            code, output = self.call_cli(SHA)
        self.assertEqual(code, 0)
        data = json.loads((self.public / "build-info.json").read_text())
        self.assertEqual(data["sourceSha"], SHA)
        self.assertNotIn("b" * 40, json.dumps(data) + output)
        self.assertNotIn("must-not-appear", json.dumps(data) + output)
        self.assertFalse((self.public / "build-info.json.tmp").exists())

    def test_cli_mismatch_does_not_replace_previous_manifest(self):
        output = self.public / "build-info.json"
        output.write_text("previous")
        code, text = self.call_cli("b" * 40)
        self.assertEqual(code, 1)
        self.assertIn("실제 체크아웃 HEAD", text)
        self.assertEqual(output.read_text(), "previous")


if __name__ == "__main__":
    unittest.main()
