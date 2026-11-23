"""초안 편집의 사실 필드와 확인 범위가 보존되는지 검사한다."""
from __future__ import annotations

from contextlib import redirect_stdout
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "dev/pipeline/publish"))
import check_editorial

DATE = "2026-11-04"
SHA = "a" * 40


def draft() -> dict:
    return {
        "date": DATE, "status": "draft", "collectedAt": DATE + "T00:20:00+09:00",
        "headline": "10월 물가가 2.8% 올랐습니다.",
        "lead": {"headline": "10월 물가 2.8% 상승", "standfirst": "물가는 2.8% 올랐습니다. 정부는 효과를 0.8%포인트로 추정했습니다.", "facts": [{"t": "물가", "v": "2.8%"}]},
        "briefs": [{"k": "매출 1조643억원", "m": "매출은 1조643억원입니다.", "href": "#industry"}],
        "themes": [{"id": "prices", "summary": ["상승률은 2.8%입니다.", "정부는 효과를 추정했습니다."], "articles": [{"title": "원문 제목", "url": "https://example.com/2026", "date": DATE, "read": False}]}],
        "national": {"flow": ["경찰은 혐의를 수사할 계획입니다."], "items": [{"title": "원문 기사", "summary": "경찰은 3명을 조사할 예정입니다.", "body_read": False, "url": "https://example.com/news"}]},
        "regions": {"summary": {"서울": "공사를 계획했습니다."}, "items": [{"region": "서울", "summary": "서울시의 계획입니다.", "body_read": True}]},
        "nums": [{"k": "코스피", "v": "5,648.79", "src": {"url": "https://example.com/market", "base": "2026-11-03 종가"}}],
    }


class EditorialTest(unittest.TestCase):
    def setUp(self):
        self.before = draft()
        self.after = copy.deepcopy(self.before)

    def test_clearer_prose_preserves_existing_facts(self):
        self.after["lead"]["standfirst"] = "물가는 2.8% 올랐습니다. 효과는 정부가 0.8%포인트로 추정한 값입니다."
        self.after["national"]["items"][0]["summary"] = "조사 대상은 3명이며, 경찰이 조사할 예정입니다."
        self.after["regions"]["summary"]["서울"] = "계획한 내용은 공사입니다."
        self.assertEqual(check_editorial.check(self.before, self.after), [])

    def test_moving_facts_between_cards_is_rejected(self):
        self.after["briefs"].append({"k": "매출 2조원", "m": "매출은 2조원입니다.", "href": "#industry"})
        self.before = copy.deepcopy(self.after)
        self.after["briefs"][0]["m"], self.after["briefs"][1]["m"] = self.after["briefs"][1]["m"], self.after["briefs"][0]["m"]
        self.assertTrue(any("briefs[0].m" in error and "숫자" in error for error in check_editorial.check(self.before, self.after)))

    def test_numbers_signs_and_units_cannot_change(self):
        for before, after in [("3명입니다.", "3건입니다."), ("0.8%포인트로 추정했습니다.", "0.8%로 추정했습니다."), ("−3.2%입니다.", "+3.2%입니다."), ("1조643억원입니다.", "1조644억원입니다.")]:
            with self.subTest(before=before, after=after):
                self.before["lead"]["standfirst"] = before
                self.after["lead"]["standfirst"] = after
                self.assertTrue(any("숫자" in error for error in check_editorial.check(self.before, self.after)))

    def test_number_punctuation_and_spacing_can_be_normalized(self):
        self.before["lead"]["standfirst"] = "매출은 1,000 원입니다."
        self.after["lead"]["standfirst"] = "매출은 1000원입니다."
        self.assertEqual(check_editorial.check(self.before, self.after), [])

    def test_qualifications_cannot_be_removed_or_added(self):
        for qualifier in check_editorial.QUALIFIERS:
            with self.subTest(qualifier=qualifier):
                self.before["lead"]["standfirst"] = "발표 내용은 " + qualifier + "입니다."
                self.after["lead"]["standfirst"] = "발표 내용입니다."
                self.assertTrue(any("한정어" in error for error in check_editorial.check(self.before, self.after)))
                self.before["lead"]["standfirst"], self.after["lead"]["standfirst"] = self.after["lead"]["standfirst"], self.before["lead"]["standfirst"]
                self.assertTrue(any("한정어" in error for error in check_editorial.check(self.before, self.after)))

    def test_embedded_source_urls_cannot_change(self):
        self.before["lead"]["standfirst"] = "출처는 https://example.com/news 입니다."
        self.after["lead"]["standfirst"] = "근거는 https://other.example/news 입니다."
        self.assertTrue(any("원문 주소" in error for error in check_editorial.check(self.before, self.after)))

    def test_source_numbers_read_flags_and_review_cannot_change(self):
        changes = [
            lambda item: item["nums"][0].update(v="5,700.00"),
            lambda item: item["themes"][0]["articles"][0].update(read=True),
            lambda item: item["national"]["items"][0].update(body_read=True),
            lambda item: item["themes"][0]["articles"][0].update(url="https://other.example/2026"),
            lambda item: item.update(review={"by": "사람", "at": DATE}),
            lambda item: item["lead"]["facts"][0].update(v="2.9%"),
            lambda item: item.update(collectedAt=DATE + "T01:00:00+09:00"),
        ]
        for change in changes:
            with self.subTest(change=change):
                after = copy.deepcopy(self.before)
                change(after)
                self.assertTrue(check_editorial.check(self.before, after))

    def test_arrays_and_object_keys_are_fixed(self):
        self.after["themes"][0]["summary"].append("추가 문단입니다.")
        self.assertTrue(any("배열 길이" in error for error in check_editorial.check(self.before, self.after)))
        self.after = copy.deepcopy(self.before)
        self.after["regions"]["summary"]["경기"] = "새 지역입니다."
        self.assertTrue(any("키" in error for error in check_editorial.check(self.before, self.after)))
        self.after = copy.deepcopy(self.before)
        self.after["themes"][0]["summary"].reverse()
        self.assertTrue(any("배열 순서" in error for error in check_editorial.check(self.before, self.after)))

    def test_empty_text_and_changed_field_types_are_rejected(self):
        self.after["headline"] = "  "
        self.assertTrue(any("비울" in error for error in check_editorial.check(self.before, self.after)))
        self.after["headline"] = None
        self.assertTrue(any("자료 형식" in error for error in check_editorial.check(self.before, self.after)))

    def test_published_or_different_dates_cannot_be_edited(self):
        self.after["status"] = "published"
        self.assertTrue(any("초안" in error for error in check_editorial.check(self.before, self.after)))
        self.before["status"] = self.after["status"] = "published"
        self.assertTrue(any("초안" in error for error in check_editorial.check(self.before, self.after)))
        self.before["status"] = self.after["status"] = "draft"
        self.after["date"] = "2026-11-05"
        self.assertTrue(any("같은 날짜" in error for error in check_editorial.check(self.before, self.after)))
        self.assertTrue(check_editorial.check([], []))


class EditorialCliTest(unittest.TestCase):
    def call(self, argv, root, baseline=None):
        output = io.StringIO()
        with patch.object(check_editorial, "ROOT", root), patch.object(check_editorial, "today_kst", return_value=DATE), patch.object(check_editorial, "read_baseline", return_value=baseline or draft()), redirect_stdout(output):
            code = check_editorial.main(argv)
        return code, output.getvalue()

    def test_bad_date_or_nonfixed_base_ref_fails_before_reading(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for args in [["--base-ref", "HEAD", "--date", DATE], ["--base-ref", SHA, "--date", "2026-11-03"], ["--base-ref", SHA, "--date", "../../bad"], ["--base-ref", SHA, "--date", "2026-02-30"]]:
                with self.subTest(args=args):
                    code, output = self.call(args, root)
                    self.assertEqual(code, 1)
                    self.assertIn("편집 검사 실패", output)

    def test_valid_json_passes_and_corrupt_json_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / "dev/web/data/issues" / (DATE + ".json")
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps(draft(), ensure_ascii=False), encoding="utf-8")
            args = ["--base-ref", SHA, "--date", DATE]
            code, output = self.call(args, root)
            self.assertEqual(code, 0, output)
            path.write_text("{", encoding="utf-8")
            code, output = self.call(args, root)
            self.assertEqual(code, 1)
            self.assertIn("JSONDecodeError", output)
            self.assertNotIn("Traceback", output)

    def test_missing_base_commit_or_file_fails_cleanly(self):
        output = io.StringIO()
        with patch.object(check_editorial, "today_kst", return_value=DATE), patch.object(check_editorial, "read_baseline", side_effect=subprocess.CalledProcessError(128, "git")), redirect_stdout(output):
            code = check_editorial.main(["--base-ref", SHA, "--date", DATE])
        self.assertEqual(code, 1)
        self.assertNotIn("Traceback", output.getvalue())

    def test_git_read_uses_structured_args_and_fixed_repo_path(self):
        relative = "dev/web/data/issues/" + DATE + ".json"
        result = subprocess.CompletedProcess([], 0, json.dumps(draft()), "")
        with patch.object(check_editorial.subprocess, "run", return_value=result) as run:
            self.assertEqual(check_editorial.read_baseline(SHA, relative), draft())
        self.assertEqual(run.call_args.args[0], ["git", "show", SHA + ":" + relative])
        self.assertNotIn("shell", run.call_args.kwargs)

    def test_new_draft_can_use_a_separate_baseline_file_without_git(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            candidate = root / "dev/web/data/issues" / (DATE + ".json")
            candidate.parent.mkdir(parents=True)
            baseline = root / "collected-draft.json"
            baseline.write_text(json.dumps(draft(), ensure_ascii=False), encoding="utf-8")
            original = baseline.read_bytes()
            edited = draft()
            edited["lead"]["standfirst"] = "물가는 2.8% 올랐습니다. 효과는 정부가 0.8%포인트로 추정한 값입니다."
            candidate.write_text(json.dumps(edited, ensure_ascii=False), encoding="utf-8")
            with patch.object(check_editorial, "read_baseline", side_effect=AssertionError("Git에서 읽으면 안 됨")):
                output = io.StringIO()
                with patch.object(check_editorial, "ROOT", root), patch.object(check_editorial, "today_kst", return_value=DATE), redirect_stdout(output):
                    code = check_editorial.main(["--baseline-file", str(baseline), "--date", DATE])
            self.assertEqual(code, 0, output.getvalue())
            self.assertEqual(baseline.read_bytes(), original)

    def test_baseline_file_must_differ_from_candidate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            candidate = root / "dev/web/data/issues" / (DATE + ".json")
            candidate.parent.mkdir(parents=True)
            candidate.write_text(json.dumps(draft()), encoding="utf-8")
            code, output = self.call(["--baseline-file", str(candidate), "--date", DATE], root)
            self.assertEqual(code, 1)
            self.assertIn("서로 달라야", output)

    def test_base_ref_and_baseline_file_are_mutually_exclusive(self):
        with redirect_stdout(io.StringIO()), patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as error:
                check_editorial.main(["--base-ref", SHA, "--baseline-file", "baseline.json", "--date", DATE])
        self.assertEqual(error.exception.code, 2)

    def test_missing_or_invalid_baseline_file_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            baseline = root / "snapshot.json"
            args = ["--baseline-file", str(baseline), "--date", DATE]
            code, output = self.call(args, root)
            self.assertEqual(code, 1)
            self.assertIn("FileNotFoundError", output)
            baseline.write_text("{", encoding="utf-8")
            code, output = self.call(args, root)
            self.assertEqual(code, 1)
            self.assertIn("JSONDecodeError", output)
            self.assertNotIn("Traceback", output)

    def test_baseline_file_still_requires_same_today_draft(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            candidate = root / "dev/web/data/issues" / (DATE + ".json")
            candidate.parent.mkdir(parents=True)
            candidate.write_text(json.dumps(draft()), encoding="utf-8")
            baseline = root / "snapshot.json"
            for change in [{"status": "published"}, {"date": "2026-11-03"}]:
                with self.subTest(change=change):
                    original = draft()
                    original.update(change)
                    baseline.write_text(json.dumps(original), encoding="utf-8")
                    code, output = self.call(["--baseline-file", str(baseline), "--date", DATE], root)
                    self.assertEqual(code, 1)
                    self.assertIn("편집 검사 실패", output)


if __name__ == "__main__":
    unittest.main()
