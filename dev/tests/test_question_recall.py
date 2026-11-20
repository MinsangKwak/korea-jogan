"""복습 문제의 공개 범위와 자바스크립트 없이 제공되는 자료를 확인한다."""
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

BUILD = Path(__file__).resolve().parents[1] / "pipeline/build"
sys.path.insert(0, str(BUILD))

from question_recall import render_recall


class RecallTags(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tags = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class QuestionRecallTest(unittest.TestCase):
    def test_other_pages_omit_question(self):
        self.assertEqual(render_recall("lee-jae-myung-trials"), "")
        self.assertEqual(render_recall(""), "")

    def test_standalone_controls_and_primary_source(self):
        tags = RecallTags(render_recall("reversal-and-remand")).tags
        self.assertIn(("fieldset", {}), tags)
        self.assertIn(("legend", {}), tags)
        self.assertIn(("summary", {}), tags)
        self.assertFalse(any(tag == "form" for tag, _ in tags))
        controls = [attrs for tag, attrs in tags if tag == "input"]
        self.assertEqual(len(controls), 2)
        self.assertEqual({attrs["type"] for attrs in controls}, {"radio"})
        self.assertEqual(len({attrs["name"] for attrs in controls}), 1)
        self.assertEqual(sum("data-correct" in attrs for attrs in controls), 1)
        self.assertIn(("a", {"href": "https://www.law.go.kr/LSW/precInfoP.do?precSeq=605971"}), tags)
