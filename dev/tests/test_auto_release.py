"""자동 승격의 이벤트 경계·원자적 반영·안정 이력 통합을 검사한다."""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/publish"))
import auto_release
import check_release
import prepare_daily
from test_release import SHA, OTHER, checks, statuses


class AutoReleaseGateTest(unittest.TestCase):
    def test_combined_proof_preserves_daily_and_release_gates(self):
        combined = {"total_count": 1, "check_runs": [{"id": 10, "name": "verify-ci", "head_sha": SHA, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}}]}
        self.assertEqual(auto_release.readiness(SHA, combined, statuses())[0], "ready")
        prepare_daily.require_checks(combined, SHA)
        with_legacy = checks()
        with_legacy["check_runs"].extend(copy.deepcopy(combined["check_runs"]))
        with_legacy["total_count"] = 3
        for status, conclusion in (("in_progress", None), ("completed", "failure")):
            with_legacy["check_runs"][-1].update(status=status, conclusion=conclusion)
            self.assertNotEqual(auto_release.readiness(SHA, with_legacy, statuses())[0], "ready")
            with self.assertRaises(prepare_daily.PreparationError):
                prepare_daily.require_checks(with_legacy, SHA)

    def test_same_sha_checks_and_trusted_preview_are_required(self):
        self.assertEqual(auto_release.readiness(SHA, checks(), statuses()), ("ready", []))
        pending = checks()
        pending["check_runs"][1].update(status="in_progress", conclusion=None)
        self.assertEqual(auto_release.readiness(SHA, pending, statuses())[0], "pending")
        pending["check_runs"][1].update(status="completed", conclusion="failure")
        self.assertEqual(auto_release.readiness(SHA, pending, statuses())[0], "blocked")
        failed = statuses()
        failed[0]["state"] = "failure"
        self.assertEqual(auto_release.readiness(SHA, checks(), failed)[0], "blocked")
        self.assertEqual(auto_release.readiness(SHA, {}, [])[0], "blocked")

    def test_stale_fork_and_pr_events_cannot_promote(self):
        refs = {"dev": SHA, "main": OTHER}
        run = {"head_branch": "dev", "head_sha": SHA, "conclusion": "success", "event": "push", "head_repository": {"full_name": auto_release.REPOSITORY}}
        self.assertTrue(auto_release.allowed_event("workflow_run", {"workflow_run": run}, refs))
        for update in ({"head_sha": OTHER}, {"event": "pull_request"}, {"conclusion": "failure"}, {"head_repository": {"full_name": "other/repo"}}):
            self.assertFalse(auto_release.allowed_event("workflow_run", {"workflow_run": {**run, **update}}, refs))
        event = {"sha": SHA, "state": "success", "context": "Vercel", "sender": {"login": "vercel[bot]"}}
        self.assertTrue(auto_release.allowed_event("status", event, refs))
        self.assertFalse(auto_release.allowed_event("status", {**event, "sender": {"login": "someone"}}, refs))
        event = {"ref": "refs/heads/dev", "after": SHA, "repository": {"full_name": auto_release.REPOSITORY}}
        self.assertTrue(auto_release.allowed_event("push", event, refs))
        self.assertFalse(auto_release.allowed_event("push", {**event, "after": OTHER}, refs))

    def test_public_or_foreign_preview_is_rejected(self):
        self.assertTrue(auto_release.protected_redirect(302, "https://vercel.com/sso-api?url=preview"))
        for status, url in ((200, "https://vercel.com/login"), (302, "https://vercel.com.evil.example/login"), (302, "https://attacker@vercel.com/login"), (302, "http://vercel.com/login"), (302, "https://vercel.com:4430/login")):
            self.assertFalse(auto_release.protected_redirect(status, url))

    def test_release_tag_uses_kst_and_requires_exact_sha(self):
        stamp = dt.datetime(2026, 11, 5, 16, tzinfo=dt.timezone.utc)
        self.assertEqual(auto_release.tag_name(SHA, stamp), "release-20261106-aaaaaaa")
        for sha in ("main", SHA[:7], None):
            with self.assertRaises(auto_release.ReleaseError):
                auto_release.tag_name(sha)
        with self.assertRaises(auto_release.ReleaseError):
            auto_release.tag_name(SHA, stamp.replace(tzinfo=None))

    def test_running_or_already_public_deployment_is_not_requested_again(self):
        active = {"workflow_runs": [{"head_sha": SHA, "head_branch": "deploy", "event": "workflow_dispatch", "status": "in_progress"}]}
        with patch.object(auto_release, "api", return_value=active), patch.object(auto_release, "command") as command:
            self.assertFalse(auto_release.ensure_deployment(SHA))
            command.assert_not_called()
        with patch.object(auto_release, "api", return_value={"workflow_runs": []}), patch.object(auto_release, "git", return_value=json.dumps({"latest": "2026-11-05"})), patch.object(auto_release.verify_publication, "check_once", return_value=True), patch.object(auto_release, "command") as command:
            self.assertFalse(auto_release.ensure_deployment(SHA))
            command.assert_not_called()

    def test_missing_deployment_is_recovered_after_refs_were_already_updated(self):
        with patch.object(auto_release, "api", return_value={"workflow_runs": []}), patch.object(auto_release, "git", return_value=json.dumps({"latest": "2026-11-05"})), patch.object(auto_release.verify_publication, "check_once", return_value=False), patch.object(auto_release, "command") as command:
            self.assertTrue(auto_release.ensure_deployment(SHA))
            self.assertEqual(command.call_args.args[-1], "source_sha=" + SHA)

    def test_publisher_is_booted_once_per_workflow_version(self):
        with patch.object(auto_release, "git", return_value="blob-a"), patch.object(auto_release, "api", side_effect=[{"workflow_runs": [{"head_sha": SHA}]}, {"sha": "blob-a"}]), patch.object(auto_release, "command") as command:
            self.assertFalse(auto_release.initialize_publisher(SHA))
            command.assert_not_called()
        with patch.object(auto_release, "git", return_value="blob-b"), patch.object(auto_release, "api", side_effect=[{"workflow_runs": [{"head_sha": SHA}]}, {"sha": "blob-a"}]), patch.object(auto_release, "command") as command:
            self.assertTrue(auto_release.initialize_publisher(SHA))
            self.assertEqual(command.call_args.args, ("gh", "workflow", "run", "publish.yml", "--ref", "main"))


class AtomicReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        folder = Path(self.temp.name)
        self.remote, self.root = folder / "remote.git", folder / "work"
        subprocess.run(["git", "init", "--bare", str(self.remote)], check=True, capture_output=True)
        subprocess.run(["git", "clone", str(self.remote), str(self.root)], check=True, capture_output=True)
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        self.git("switch", "-c", "main")
        self.base = self.commit("base.txt", "stable")
        self.git("push", "origin", "HEAD:main", "HEAD:deploy", "HEAD:dev")
        self.git("switch", "-c", "dev")
        self.feature = self.commit("feature.txt", "ready feature")
        self.git("push", "origin", "HEAD:dev")
        self.expected = auto_release.fetch_refs(self.root)
        self.tag = auto_release.tag_name(self.feature)

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return auto_release.git(*args, root=self.root)

    def commit(self, path, value):
        (self.root / path).write_text(value)
        self.git("add", path)
        self.git("commit", "-m", "test change")
        return self.git("rev-parse", "HEAD")

    def test_tag_main_and_deploy_are_updated_together(self):
        auto_release.publish_refs(self.expected, self.tag, self.root)
        refs = auto_release.fetch_refs(self.root)
        self.assertEqual(set(refs.values()), {self.feature})
        self.assertTrue(self.git("ls-remote", "--tags", "origin", "refs/tags/" + self.tag).startswith(self.feature))

    def test_concurrent_dev_change_cannot_release_old_candidate(self):
        updated = self.commit("another.txt", "new candidate")
        self.git("push", "origin", "HEAD:dev")
        with self.assertRaisesRegex(auto_release.ReleaseError, "브랜치가 바뀌어"):
            auto_release.publish_refs(self.expected, self.tag, self.root)
        refs = auto_release.fetch_refs(self.root)
        self.assertEqual(refs, {"dev": updated, "main": self.base, "deploy": self.base})
        self.assertEqual(self.git("ls-remote", "--tags", "origin"), "")

    def test_existing_tag_is_never_moved_to_another_commit(self):
        self.git("tag", self.tag, self.base)
        self.git("push", "origin", "refs/tags/" + self.tag)
        with self.assertRaisesRegex(auto_release.ReleaseError, "다른 커밋"):
            auto_release.publish_refs(self.expected, self.tag, self.root)
        self.assertEqual(auto_release.fetch_refs(self.root)["deploy"], self.base)
        self.assertTrue(self.git("ls-remote", "--tags", "origin").startswith(self.base))

    def test_stable_daily_history_is_merged_and_new_sha_is_rechecked(self):
        self.git("switch", "main")
        stable = self.commit("daily.json", "new published data")
        self.git("push", "origin", "HEAD:main", "HEAD:deploy")
        refs = auto_release.fetch_refs(self.root)
        real_command = auto_release.command
        dispatched = []

        def run(*args, **kwargs):
            if args[0] == "gh":
                dispatched.append(args)
                return ""
            return real_command(*args, **kwargs)

        with patch.object(auto_release, "command", side_effect=run):
            merged = auto_release.synchronize(refs, self.root)
        self.assertTrue(auto_release.ancestor(stable, merged, self.root))
        self.assertTrue(auto_release.ancestor(self.feature, merged, self.root))
        self.assertEqual((self.root / "feature.txt").read_text(), "ready feature")
        self.assertEqual((self.root / "daily.json").read_text(), "new published data")
        self.assertEqual(dispatched[0][-1], "source_sha=" + merged)
        self.assertEqual(auto_release.fetch_refs(self.root)["main"], stable)


if __name__ == "__main__":
    unittest.main()
