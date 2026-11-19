"""판례 분류·검색·출처 집계가 배포할 자료와 함께 재현되는지 검증한다."""

from contextlib import redirect_stdout
from datetime import date
import io
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

DEV = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEV / "pipeline/law"))
import bills
import build_law_calendar
import build_precedents
import build_status
import refresh_gazette


class LawDataTest(unittest.TestCase):
    def test_manifest_matches_deployed_documents_and_checksums(self):
        status = json.loads((build_status.DATA / build_status.FILENAME).read_bytes())
        self.assertEqual(status, build_status.make_status(build_status.DATA))
        self.assertLessEqual(status["uniqueCases"], status["caseRows"])
        bills_file = next(entry for entry in status["files"] if entry["kind"] == "bills")
        self.assertEqual(len(bills_file["sha256"]), 64)

    def test_domain_registry_and_catalogues_reproduce_without_network(self):
        with TemporaryDirectory() as temporary:
            directory = Path(temporary)
            catalogues = {theme: json.loads((build_status.DATA / config["file"]).read_bytes())
                          for theme, config in build_precedents.THEMES.items()}
            with redirect_stdout(io.StringIO()):
                build_precedents.write_catalogues(catalogues, directory)
            for config in build_precedents.THEMES.values():
                self.assertEqual((directory / config["file"]).read_bytes(),
                                 (build_status.DATA / config["file"]).read_bytes())
            self.assertEqual((directory / "themes.js").read_bytes(), (DEV / "web/law/themes.js").read_bytes())

    def test_classifier_uses_one_issue_and_filters_out_other_courts(self):
        row = dict(판례정보일련번호=123456, 법원명="대법원", 사건번호="2025다12345",
                   선고일자="20251110", 사건명="임대차보증금 반환", 데이터출처명="대법원",
                   판시사항="[1] 대여금 변제. [2] 주택 임대차보증금의 반환 요건.")
        catalogues = {"property": []}
        build_precedents.collect(row, catalogues)
        build_precedents.collect(dict(row, 법원명="지방법원"), catalogues)
        self.assertEqual(len(catalogues["property"]), 1)
        self.assertEqual(catalogues["property"][0]["summary"], "주택 임대차보증금의 반환 요건.")

    def test_bills_and_laws_preserve_official_ids_and_unknown_effective_date(self):
        html = '<a href="/bills/123"><p>예시 법률안</p><p>2221234</p><p>2026-11-18</p></a>'
        record, = bills.page_rows(html)
        self.assertEqual(record["url"], "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out/2221234/detailRP")
        law = build_law_calendar.make_law("1234", "예시", "9876", "2026-06-01", None, "")
        self.assertIsNone(law["effective"])
        self.assertEqual(law["url"], "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=1234")

    def test_gazette_zero_count_and_expired_preview(self):
        html = "<p>다음호(21366호)는 2026.11.20. 발행됩니다. 법률(-건)</p>"
        self.assertEqual(refresh_gazette.parse_preview(html, date(2026, 11, 19))["lawCount"], 0)
        with self.assertRaises(ValueError):
            refresh_gazette.parse_preview(html, date(2026, 11, 20))

    def test_search_across_all_published_catalogues(self):
        result = subprocess.run(["node", "--test", str(DEV / "tests/law-search.mjs")],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
