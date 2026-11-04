"""일일 데이터가 실험 코드·과거 자료를 운영으로 가져오지 않는지 확인한다."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/publish"))
import prepare_daily

PREVIOUS = "2026-11-04"
DATE = "2026-11-05"
OLDER = "2026-11-03"
ISSUE = f"dev/web/data/issues/{DATE}.json"


class DailyPublicationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.com")
        self.write(prepare_daily.INDEX, {"latest": PREVIOUS, "issues": [PREVIOUS]})
        self.write(f"dev/web/data/issues/{PREVIOUS}.json", {"date": PREVIOUS, "status": "published", "headline": "이전 공개 기록"})
        self.write(prepare_daily.TRACKERS, {"updated": PREVIOUS, "items": [{"id": "case", "summary": "이전 기록"}]})
        self.write("dev/web/index.html", "안정된 화면")
        self.base = self.commit("기준 main")
        self.git("switch", "-c", "daily/" + DATE)
        self.write(ISSUE, {"date": DATE, "status": "draft", "headline": "오늘의 새 기록"})
        self.write(prepare_daily.INDEX, {"latest": DATE, "issues": [DATE, PREVIOUS]})
        self.source = self.commit("오늘 초안")
        self.git("switch", "main")
        self.main_ref = self.base

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.root, capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n" if not isinstance(value, str) else value, encoding="utf-8")

    def read(self, path):
        return json.loads((self.root / path).read_text(encoding="utf-8"))

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "-m", message)
        return self.git("rev-parse", "HEAD")

    def edit_source(self, operation):
        self.git("switch", "daily/" + DATE)
        operation()
        self.source = self.commit("초안 변경")
        self.git("switch", "main")

    def prepare(self):
        return prepare_daily.prepare(self.root, DATE, self.source, self.main_ref)

    def rejected_without_writing(self, pattern):
        with self.assertRaisesRegex(prepare_daily.PreparationError, pattern):
            self.prepare()
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_only_today_data_is_imported_on_stable_code(self):
        result = self.prepare()
        self.assertTrue(result["changed"])
        self.assertEqual(result["paths"], sorted([ISSUE, prepare_daily.INDEX]))
        self.assertEqual(self.read(ISSUE)["status"], "draft")
        self.assertEqual(self.read(prepare_daily.INDEX), {"latest": DATE, "issues": [DATE, PREVIOUS]})
        self.assertEqual((self.root / "dev/web/index.html").read_text(), "안정된 화면")
        self.assertEqual(self.git("show", self.base + f":dev/web/data/issues/{PREVIOUS}.json"), (self.root / f"dev/web/data/issues/{PREVIOUS}.json").read_text().strip())

    def test_experimental_code_in_daily_branch_is_rejected(self):
        self.edit_source(lambda: self.write("dev/web/index.html", "미승인 실험 화면"))
        self.rejected_without_writing("오늘 호·색인·추적")

    def test_previous_editions_cannot_be_rewritten(self):
        self.edit_source(lambda: self.write(f"dev/web/data/issues/{PREVIOUS}.json", {"date": PREVIOUS, "status": "published", "headline": "과거 내용 변경"}))
        self.rejected_without_writing("오늘 호·색인·추적")

    def test_source_index_cannot_reset_or_extend_history(self):
        for values in ([DATE], [DATE, PREVIOUS, "2026-11-06"], [DATE, PREVIOUS, PREVIOUS]):
            with self.subTest(values=values):
                self.edit_source(lambda: self.write(prepare_daily.INDEX, {"latest": DATE, "issues": values}))
                self.rejected_without_writing("발행 목록|기존 날짜")

    def test_approved_main_code_and_history_updates_are_preserved(self):
        self.write("dev/web/index.html", "새로 검증한 안정 화면")
        self.write(f"dev/web/data/issues/{OLDER}.json", {"date": OLDER, "status": "published"})
        self.write(prepare_daily.INDEX, {"latest": PREVIOUS, "issues": [PREVIOUS, OLDER]})
        self.main_ref = self.commit("main의 승인된 변경")
        self.prepare()
        self.assertEqual((self.root / "dev/web/index.html").read_text(), "새로 검증한 안정 화면")
        self.assertEqual(self.read(prepare_daily.INDEX)["issues"], [DATE, PREVIOUS, OLDER])

    def test_concurrently_changed_today_issue_is_not_overwritten(self):
        self.write(ISSUE, {"date": DATE, "status": "draft", "headline": "운영자 수정"})
        self.main_ref = self.commit("main 오늘 자료 수정")
        self.rejected_without_writing("오늘 호가 조사 시작 이후")

    def test_new_tracker_evidence_is_imported(self):
        self.edit_source(lambda: self.write(prepare_daily.TRACKERS, {"updated": DATE, "items": [{"id": "case", "summary": "새 근거와 확인 범위"}]}))
        result = self.prepare()
        self.assertIn(prepare_daily.TRACKERS, result["paths"])
        self.assertEqual(self.read(prepare_daily.TRACKERS)["items"][0]["summary"], "새 근거와 확인 범위")

    def test_concurrent_tracker_change_is_not_overwritten(self):
        self.edit_source(lambda: self.write(prepare_daily.TRACKERS, {"updated": DATE, "items": [{"id": "case", "summary": "초안의 새 근거"}]}))
        self.write(prepare_daily.TRACKERS, {"updated": DATE, "items": [{"id": "case", "summary": "운영자의 별도 근거"}]})
        self.main_ref = self.commit("main 추적 수정")
        self.rejected_without_writing("추적 자료가 조사 시작 이후")

    def test_date_only_tracker_refresh_is_rejected(self):
        self.edit_source(lambda: self.write(prepare_daily.TRACKERS, {"updated": DATE, "items": [{"id": "case", "summary": "이전 기록"}]}))
        self.rejected_without_writing("날짜만 바꿔")

    def test_already_published_today_is_idempotent(self):
        self.write(ISSUE, {"date": DATE, "status": "published", "headline": "공개된 최종 기록"})
        self.write(prepare_daily.INDEX, {"latest": DATE, "issues": [DATE, PREVIOUS]})
        self.main_ref = self.commit("오늘 공개 완료")
        result = self.prepare()
        self.assertFalse(result["changed"])
        self.assertEqual(self.read(ISSUE)["headline"], "공개된 최종 기록")
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_symlink_json_is_not_followed(self):
        def symlink():
            path = self.root / ISSUE
            path.unlink()
            path.symlink_to(PREVIOUS + ".json")
        self.edit_source(symlink)
        self.rejected_without_writing("일반 JSON")

    def test_wrong_date_status_or_malformed_json_fails(self):
        cases = [
            {"date": PREVIOUS, "status": "draft"},
            {"date": DATE, "status": "prototype"},
            "{",
        ]
        for value in cases:
            with self.subTest(value=value):
                self.edit_source(lambda: self.write(ISSUE, value))
                self.rejected_without_writing("오늘 날짜|JSON 자료")

    def test_fixed_refs_and_clean_main_are_required(self):
        with self.assertRaisesRegex(prepare_daily.PreparationError, "40자리"):
            prepare_daily.prepare(self.root, DATE, "daily/" + DATE, self.main_ref)
        self.write("dev/web/index.html", "로컬 변경")
        with self.assertRaisesRegex(prepare_daily.PreparationError, "변경 없는 main"):
            self.prepare()


class DailyCheckTest(unittest.TestCase):
    def setUp(self):
        self.sha = "a" * 40
        self.checks = [{"id": number, "name": name, "head_sha": self.sha, "app": {"slug": "github-actions"}, "status": "completed", "conclusion": "success"} for number, name in enumerate(("data", "browser"), 1)]

    def test_checks_are_bound_to_selected_commit_and_trusted_app(self):
        prepare_daily.require_checks({"total_count": 2, "check_runs": self.checks}, self.sha)
        for field, value in (("head_sha", "b" * 40), ("app", {"slug": "unrelated-app"}), ("status", "in_progress"), ("conclusion", "failure")):
            with self.subTest(field=field):
                checks = copy.deepcopy(self.checks)
                checks[0][field] = value
                with self.assertRaises(prepare_daily.PreparationError):
                    prepare_daily.require_checks({"total_count": 2, "check_runs": checks}, self.sha)

    def test_newer_failed_attempt_cannot_reuse_older_success(self):
        newer = dict(self.checks[1], id=3, conclusion="failure")
        with self.assertRaisesRegex(prepare_daily.PreparationError, "browser CI"):
            prepare_daily.require_checks({"total_count": 3, "check_runs": [*self.checks, newer]}, self.sha)

    def test_truncated_checks_do_not_hide_a_later_failure(self):
        with self.assertRaisesRegex(prepare_daily.PreparationError, "잘려"):
            prepare_daily.require_checks({"total_count": 101, "check_runs": self.checks}, self.sha)

    def test_missing_or_malformed_checks_fail_closed(self):
        for value in ({}, {"check_runs": []}, {"check_runs": self.checks[:1]}, []):
            with self.subTest(value=value):
                with self.assertRaises(prepare_daily.PreparationError):
                    prepare_daily.require_checks(value, self.sha)

    def test_same_date_does_not_prove_the_expected_code_was_deployed(self):
        index = {"latest": DATE}
        info = {"environment": "production", "sourceSha": self.sha, "issueDate": DATE}
        self.assertTrue(prepare_daily.published_build_matches(index, info, DATE, self.sha))
        for key, value in (("sourceSha", "b" * 40), ("environment", "preview"), ("issueDate", PREVIOUS)):
            with self.subTest(key=key):
                self.assertFalse(prepare_daily.published_build_matches(index, dict(info, **{key: value}), DATE, self.sha))
        self.assertFalse(prepare_daily.published_build_matches({"latest": PREVIOUS}, info, DATE, self.sha))
        self.assertFalse(prepare_daily.published_build_matches(index, {}, DATE, self.sha))
        self.assertFalse(prepare_daily.published_build_matches([], info, DATE, self.sha))


if __name__ == "__main__":
    unittest.main()
