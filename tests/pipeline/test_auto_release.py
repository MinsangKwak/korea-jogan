"""main 단일 브랜치의 원격 기준 확인과 Pages 배포 요청 경계를 검사한다."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend-python/pipeline/publish"))
import auto_release
import prepare_daily
from .test_release import SHA, OTHER, checks


class DailyProofTest(unittest.TestCase):
    def test_daily_source_requires_completed_same_sha_verify(self):
        combined = {"total_count": 1, "check_runs": [{"id": 10, "name": "verify-ci", "head_sha": SHA, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}}]}
        prepare_daily.require_checks(combined, SHA)
        with_legacy = checks()
        with_legacy["check_runs"].extend(copy.deepcopy(combined["check_runs"]))
        with_legacy["total_count"] = 3
        for status, conclusion in (("in_progress", None), ("completed", "failure")):
            with_legacy["check_runs"][-1].update(status=status, conclusion=conclusion)
            with self.assertRaises(prepare_daily.PreparationError):
                prepare_daily.require_checks(with_legacy, SHA)


class DeploymentRequestTest(unittest.TestCase):
    def test_running_or_already_public_deployment_is_not_requested_again(self):
        active = {"workflow_runs": [{"head_sha": SHA, "head_branch": "main", "event": "workflow_dispatch", "status": "in_progress"}]}
        with patch.object(auto_release, "api", return_value=active), patch.object(auto_release, "command") as command:
            self.assertFalse(auto_release.ensure_deployment(SHA))
            command.assert_not_called()
        with patch.object(auto_release, "api", return_value={"workflow_runs": []}), patch.object(auto_release, "git", return_value=json.dumps({"latest": "2026-11-05"})), patch.object(auto_release.verify_publication, "check_once", return_value=True), patch.object(auto_release, "command") as command:
            self.assertFalse(auto_release.ensure_deployment(SHA))
            command.assert_not_called()

    def test_run_on_another_branch_or_sha_does_not_block_request(self):
        for run in ({"head_sha": SHA, "head_branch": "deploy"}, {"head_sha": OTHER, "head_branch": "main"}):
            runs = {"workflow_runs": [{**run, "event": "workflow_dispatch", "status": "in_progress"}]}
            with self.subTest(run=run), patch.object(auto_release, "api", return_value=runs), patch.object(auto_release, "git", return_value=json.dumps({"latest": "2026-11-05"})), patch.object(auto_release.verify_publication, "check_once", return_value=False), patch.object(auto_release, "command") as command:
                self.assertTrue(auto_release.ensure_deployment(SHA))
                command.assert_called_once()

    def test_missing_deployment_is_requested_on_main_with_exact_sha(self):
        with patch.object(auto_release, "api", return_value={"workflow_runs": []}), patch.object(auto_release, "git", return_value=json.dumps({"latest": "2026-11-05"})), patch.object(auto_release.verify_publication, "check_once", return_value=False), patch.object(auto_release, "command") as command:
            self.assertTrue(auto_release.ensure_deployment(SHA))
            self.assertEqual(command.call_args.args, ("gh", "workflow", "run", "deploy-pages.yml", "--ref", "main", "-f", "source_sha=" + SHA))

    def test_malformed_sha_is_rejected_before_any_request(self):
        for sha in ("main", SHA[:7], None):
            with self.subTest(sha=sha), patch.object(auto_release, "api") as api, self.assertRaises(auto_release.ReleaseError):
                auto_release.ensure_deployment(sha)
            api.assert_not_called()


class MainOnlyRefsTest(unittest.TestCase):
    def test_only_main_is_required_on_remote(self):
        with tempfile.TemporaryDirectory() as folder:
            remote, root = Path(folder) / "remote.git", Path(folder) / "work"
            subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
            subprocess.run(["git", "clone", str(remote), str(root)], check=True, capture_output=True)
            for args in (("config", "user.name", "Test"), ("config", "user.email", "test@example.com"), ("switch", "-c", "main")):
                auto_release.git(*args, root=root)
            (root / "base.txt").write_text("stable")
            auto_release.git("add", "base.txt", root=root)
            auto_release.git("commit", "-m", "test", root=root)
            base = auto_release.git("rev-parse", "HEAD", root=root)
            auto_release.git("push", "origin", "HEAD:main", root=root)
            self.assertEqual(auto_release.fetch_refs(root), {"main": base})
            self.assertTrue(auto_release.ancestor(base, base, root))


class WorkflowShapeTest(unittest.TestCase):
    def test_no_workflow_or_publisher_depends_on_removed_branches(self):
        workflows = REPO / ".github/workflows"
        self.assertFalse((workflows / "integration.yml").exists())
        self.assertFalse((workflows / "promote.yml").exists())
        for path in workflows.glob("*.yml"):
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotIn("refs/heads/deploy", text)
                self.assertNotIn("refs/heads/dev", text)
                self.assertNotIn("--ref deploy", text)
        pages = (workflows / "deploy-pages.yml").read_text(encoding="utf-8")
        self.assertIn("branches: [main]", pages)
        self.assertIn("uses: ./.github/actions/verify", pages)
        # 예약·수동 실행도 검사 증거 없는 SHA는 verify를 거쳐야 deploy가 열린다
        self.assertIn("needs.plan.outputs.proven != 'true'", pages)
        self.assertIn("needs.verify.result == 'skipped' && needs.plan.outputs.proven == 'true'", pages)
        self.assertIn("ref: ${{ needs.plan.outputs.sha }}", pages)
        # 건너뛴 검사는 증거로 세지 않고, 아티팩트 조회 지연은 같은 실행에서 한 번 더 배포한다
        self.assertIn('not in ("skipped", "neutral", None)', pages)
        self.assertIn("id: deployment_retry", pages)
        self.assertIn("branches: [main]", (workflows / "check.yml").read_text(encoding="utf-8"))
        publisher = (REPO / "backend-python/pipeline/publish/publish_pending.py").read_text(encoding="utf-8")
        self.assertNotIn("refs/heads/deploy", publisher)


if __name__ == "__main__":
    unittest.main()
