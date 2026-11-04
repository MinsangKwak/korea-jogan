"""운영 코드 승격이 같은 커밋의 CI와 지정 개발 배포를 요구하는지 확인한다."""
from __future__ import annotations

from contextlib import redirect_stdout
import copy
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/publish"))
import check_release

SHA = "a" * 40
OTHER = "b" * 40
PROOF = "https://vercel.com/minsangkwaks-projects/korea-jogan-dev/DEP123"


def checks() -> dict:
    return {"total_count": 2, "check_runs": [
        {"id": index, "name": name, "head_sha": SHA, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}, "started_at": "2026-11-04T00:00:00Z"}
        for index, name in enumerate(("data", "browser"), 1)
    ]}


def statuses() -> list:
    return [{"id": 3, "url": check_release.STATUS_API + SHA, "context": "Vercel", "state": "success", "target_url": PROOF, "creator": {"login": "vercel[bot]"}, "created_at": "2026-11-04T00:00:00Z"}]


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.checks = checks()
        self.statuses = statuses()

    def errors(self):
        return check_release.check(SHA, SHA, self.checks, self.statuses)

    def test_exact_sha_ci_and_project_deployment_pass(self):
        self.assertEqual(self.errors(), [])

    def test_actual_raw_status_shape_preserves_creator_and_sha(self):
        sha = "f4df437b95e7786b701ae8e107735ecc3e72ced9"
        api_url = "https://api.github.com/repos/MinsangKwak/korea-jogan/statuses/" + sha
        target = "https://vercel.com/minsangkwaks-projects/korea-jogan-dev/EQcoTBWNJtHv8bAjHEn6gwogBsEN"
        raw = [
            {"id": 58004830947, "url": api_url, "context": "Vercel", "state": "success", "creator": {"login": "vercel[bot]"}, "target_url": target},
            {"id": 58004827091, "url": api_url, "context": "Vercel", "state": "pending", "creator": {"login": "vercel[bot]"}, "target_url": target},
        ]
        runs = checks()
        for item in runs["check_runs"]:
            item["head_sha"] = sha
        self.assertEqual(check_release.check(sha, sha, runs, raw), [])

    def test_combined_status_without_creator_cannot_prove_deployment(self):
        raw_without_creator = [{key: value for key, value in self.statuses[0].items() if key != "creator"}]
        combined = {"sha": SHA, "statuses": raw_without_creator, "state": "success"}
        self.assertTrue(check_release.check(SHA, SHA, self.checks, combined))
        self.assertTrue(check_release.check(SHA, SHA, self.checks, raw_without_creator))

    def test_raw_status_api_url_must_bind_repository_and_exact_sha(self):
        for url in (check_release.STATUS_API + OTHER, "https://api.github.com/repos/another/repository/statuses/" + SHA, "https://api.github.com.evil.example/repos/MinsangKwak/korea-jogan/statuses/" + SHA, check_release.STATUS_API + SHA + "?fake=true", None):
            with self.subTest(url=url):
                self.statuses = statuses()
                self.statuses[0]["url"] = url
                self.assertTrue(self.errors())

    def test_stale_or_invalid_candidate_is_rejected(self):
        self.assertTrue(check_release.check(SHA, OTHER, self.checks, self.statuses))
        for sha in ("main", SHA[:7], "../bad", "A" * 40, None):
            self.assertTrue(check_release.check(sha, SHA, self.checks, self.statuses))

    def test_pending_failed_and_wrong_sha_checks_cannot_release(self):
        for value in ({"status": "in_progress", "conclusion": None}, {"conclusion": "failure"}, {"head_sha": OTHER}):
            with self.subTest(value=value):
                self.checks = checks()
                self.checks["check_runs"][1].update(value)
                self.assertTrue(self.errors())

    def test_untrusted_ci_app_cannot_impersonate_success(self):
        self.checks["check_runs"][0]["app"]["slug"] = "untrusted-app"
        self.assertTrue(self.errors())

    def test_latest_ci_failure_cannot_use_old_success(self):
        newer = copy.deepcopy(self.checks["check_runs"][1])
        newer.update(id=10, started_at="2026-11-04T01:00:00Z", conclusion="failure")
        self.checks["check_runs"].append(newer)
        self.checks["total_count"] = 3
        self.assertTrue(self.errors())

    def test_new_queued_ci_without_start_time_cannot_use_old_success(self):
        newer = copy.deepcopy(self.checks["check_runs"][1])
        newer.update(id=10, started_at=None, status="queued", conclusion=None)
        self.checks["check_runs"].append(newer)
        self.checks["total_count"] = 3
        self.assertTrue(self.errors())

    def test_status_name_is_not_deployment_proof(self):
        for change in ({"creator": {"login": "someone"}}, {"target_url": "https://example.com/"}, {"state": "pending"}):
            with self.subTest(change=change):
                self.statuses = statuses()
                self.statuses[0].update(change)
                self.assertTrue(self.errors())

    def test_wrong_sha_or_wrong_project_preview_is_rejected(self):
        self.statuses[0]["url"] = check_release.STATUS_API + OTHER
        self.assertTrue(self.errors())
        for url in ("https://vercel.com/minsangkwaks-projects/another-project/DEP123", "https://vercel.com/another-team/korea-jogan-dev/DEP123", "https://vercel.com/minsangkwaks-projects/korea-jogan-dev-evil/DEP123", "https://vercel.com/minsangkwaks-projects/korea-jogan-dev", "https://vercel.com.evil.example/minsangkwaks-projects/korea-jogan-dev/DEP123", "https://user:pass@vercel.com/minsangkwaks-projects/korea-jogan-dev/DEP123"):
            with self.subTest(url=url):
                self.statuses = statuses()
                self.statuses[0]["target_url"] = url
                self.assertTrue(self.errors())

    def test_dashboard_navigation_or_path_traversal_is_not_deployment_proof(self):
        for path in ("settings", "../another-project/DEP123", "%2e%2e", "DEP123/builds"):
            with self.subTest(path=path):
                self.statuses = statuses()
                self.statuses[0]["target_url"] = "https://vercel.com/minsangkwaks-projects/korea-jogan-dev/" + path
                self.assertTrue(self.errors())

    def test_trusted_vercel_check_can_supply_same_project_proof(self):
        self.statuses = []
        self.checks["check_runs"].append({"id": 3, "name": "Vercel", "head_sha": SHA, "app": {"slug": "vercel"}, "status": "completed", "conclusion": "success", "details_url": PROOF, "started_at": "2026-11-04T00:00:00Z"})
        self.checks["total_count"] = 3
        self.assertEqual(self.errors(), [])
        self.checks["check_runs"][-1]["head_sha"] = OTHER
        self.assertTrue(self.errors())

    def test_new_preview_failure_cannot_fall_back_to_old_success(self):
        later = copy.deepcopy(self.statuses[0])
        later.update(id=4, created_at="2026-11-04T01:00:00Z", state="failure")
        self.statuses.append(later)
        self.assertTrue(self.errors())

    def test_missing_malformed_or_truncated_results_fail_closed(self):
        for result in (None, [], {}, {"check_runs": None}):
            self.assertTrue(check_release.check(SHA, SHA, result, self.statuses))
        self.assertTrue(check_release.check(SHA, SHA, self.checks, []))
        self.checks["total_count"] = 101
        self.assertTrue(self.errors())

    def test_malformed_app_and_creator_cannot_crash_or_prove_success(self):
        self.checks["check_runs"].append({"name": "Vercel", "head_sha": SHA, "app": "vercel", "details_url": PROOF})
        self.checks["total_count"] = 3
        self.statuses[0]["creator"] = "vercel[bot]"
        self.assertTrue(self.errors())

    def test_cli_reports_invalid_json_without_traceback(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / "bad.json"
            file.write_text("{")
            stream = io.StringIO()
            with redirect_stdout(stream):
                result = check_release.main(["--sha", SHA, "--dev-sha", SHA, "--checks", str(file), "--statuses", str(file)])
            self.assertEqual(result, 1)
            self.assertIn("JSON", stream.getvalue())


class DeploymentResultTest(unittest.TestCase):
    def setUp(self):
        self.start = "2026-11-04T01:00:00Z"
        self.run = {"id": 12, "head_sha": SHA, "head_branch": "deploy", "event": "workflow_dispatch", "created_at": "2026-11-04T01:00:01Z", "status": "completed", "conclusion": "success"}
        self.previous = {"workflow_runs": [{**self.run, "id": 11}]}

    def state(self, runs):
        return check_release.deployment_state(SHA, {"workflow_runs": runs}, self.previous, self.start)

    def test_new_same_sha_dispatch_is_the_only_success(self):
        self.assertEqual(self.state([self.run]), ("success", 12))
        for change in ({"id": 11}, {"head_sha": OTHER}, {"head_branch": "main"}, {"event": "schedule"}, {"created_at": "2026-11-04T00:59:59Z"}):
            with self.subTest(change=change):
                self.assertEqual(self.state([{**self.run, **change}]), ("pending", None))

    def test_started_or_waiting_run_is_not_success(self):
        for status in ("queued", "in_progress", "waiting"):
            self.assertEqual(self.state([{**self.run, "status": status, "conclusion": None}]), ("pending", 12))

    def test_completed_failure_is_not_hidden_by_old_success(self):
        self.assertEqual(self.state([{**self.run, "conclusion": "failure"}]), ("failure", 12))
        self.assertEqual(self.state([self.run, {**self.run, "id": 13, "conclusion": "cancelled"}]), ("failure", 13))

    def test_malformed_run_response_and_unzoned_start_are_rejected(self):
        with self.assertRaises(ValueError):
            check_release.deployment_state(SHA, [], self.previous, self.start)
        with self.assertRaises(ValueError):
            check_release.deployment_state(SHA, {"workflow_runs": []}, self.previous, "2026-11-04T01:00:00")
        for stamp in (None, [], 5, "bad-date"):
            self.assertEqual(self.state([{**self.run, "created_at": stamp}]), ("pending", None))

    def test_manifest_must_match_production_source(self):
        self.assertTrue(check_release.manifest_matches(SHA, {"environment": "production", "sourceSha": SHA}))
        for manifest in ({"environment": "preview", "sourceSha": SHA}, {"environment": "production", "sourceSha": OTHER}, {"sourceSha": SHA}, [], None):
            self.assertFalse(check_release.manifest_matches(SHA, manifest))


if __name__ == "__main__":
    unittest.main()
