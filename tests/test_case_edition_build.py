"""기사·판례 지면의 정적 링크, 발행일 경계와 재빌드를 검증한다."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python/pipeline/build"))

import build_case_edition as edition


def row(date):
    return {
        "id": "case-" + date, "issueDate": date, "section": "national", "theme": "labor",
        "articleUrl": "https://example.org/news?a=1&b=2", "articleTitle": "기사 & 보도",
        "caseId": 123, "caseDate": "2010-01-02", "caseTitle": "판결", "caseNumber": "2010다123",
        "keyword": "업무상 재해", "question": '제목 </script><b> & "인용"', "context": "판단의 범위",
    }


def fields(page):
    fragment = ElementTree.fromstring("<root>" + edition.CARD.search(page)[1] + "</root>")
    return {tag.get("id"): tag for tag in fragment.iter() if tag.get("id")}


class CaseEditionBuildTest(unittest.TestCase):
    def setUp(self):
        self.template = (ROOT / "frontend-vanilla-js/index.html").read_text(encoding="utf-8")
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.public = Path(tmp.name)
        (self.public / "data").mkdir()
        self.records = [row("2026-11-0" + str(day)) for day in range(1, 7)]
        self.dates = {item["issueDate"] for item in self.records[:-1]}

    def write(self):
        file = self.public / "data/news-case-pairs.json"
        file.write_text(json.dumps({"pairs": self.records}, ensure_ascii=False), encoding="utf-8")

    def test_latest_eligible_published_pairs_are_static_and_script_safe(self):
        self.write()
        records = edition.published_pairs(self.public, self.dates)
        page = edition.with_edition(self.template, "2026-11-04", records)
        dom = fields(page)
        self.assertNotIn("hidden", dom["casePair"].attrib)
        self.assertIn("2026.11.04", dom["casePairDate"].text)
        self.assertEqual(dom["casePairArticle"].get("href"), self.records[3]["articleUrl"])
        self.assertEqual(dom["casePairRuling"].get("href"), "https://www.law.go.kr/LSW/precInfoP.do?precSeq=123")
        self.assertIn("2010다123", dom["casePairRuling"].find("strong").text)
        self.assertIn("2010.01.02", dom["casePairRuling"].find("span").text)
        self.assertIn('theme=labor&q=', dom["casePairSearch"].get("href"))
        script = page.split(edition.DATA.search(page)[1], 1)[1].split("</script>", 1)[0]
        self.assertNotIn("<", script)
        self.assertEqual([pair["issueDate"] for pair in json.loads(script)["pairs"]],
                         ["2026-11-04", "2026-11-03", "2026-11-02"])
        self.assertEqual(dom["casePairQuestion"].text, self.records[3]["question"])
        self.assertEqual(page, edition.with_edition(page, "2026-11-04", records))
        self.assertEqual(edition.with_edition(self.template, "2026-11-07", records).count("case-2026-11-06"), 0)

    def test_earliest_issue_removes_stale_links_after_rebuild(self):
        self.write()
        records = edition.published_pairs(self.public, self.dates)
        populated = edition.with_edition(self.template, "2026-11-05", records)
        old = edition.with_edition(populated, "2026-10-20", records)
        dom = fields(old)
        self.assertIn("hidden", dom["casePair"].attrib)
        self.assertNotIn("hidden", dom["casePairEmpty"].attrib)
        self.assertNotIn("example.org", edition.CARD.search(old)[1])
        self.assertNotIn("precSeq", edition.CARD.search(old)[1])
        self.assertTrue(all("href" not in tag.attrib for tag in dom["casePair"].iter("a")))
        self.assertIn('id="news-case-data">{"pairs":[]}</script>', old)
        self.assertEqual(populated, edition.with_edition(old, "2026-11-05", records))

    def test_invalid_origin_and_judgment_identifiers_are_rejected(self):
        for field, value in (("articleUrl", "javascript:alert(0)"), ("caseId", "123&other=4")):
            with self.subTest(field=field):
                self.records = [dict(row("2026-11-01"), **{field: value})]
                self.write()
                with self.assertRaises(ValueError):
                    edition.published_pairs(self.public, self.dates)


if __name__ == "__main__":
    unittest.main()
