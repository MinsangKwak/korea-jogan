"""조간의 발행일을 기준으로 신문·판례 편집면을 정적으로 채운다."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree

from build_discovery import safe_url

START = "<!-- kj:case-edition -->"
END = "<!-- /kj:case-edition -->"
CARD = re.compile(re.escape(START) + "(.*?)" + re.escape(END), re.S)
DATA = re.compile(r'(<script type="application/json" id="news-case-data">).*?(</script>)', re.S)
MAX_PAIRS = 3


def published_pairs(public: Path, dates: set[str]) -> list[dict]:
    source = json.loads((public / "data/news-case-pairs.json").read_text(encoding="utf-8"))
    records = sorted((pair for pair in source["pairs"] if pair["issueDate"] in dates),
                     key=lambda pair: pair["issueDate"], reverse=True)
    for pair in records:
        if not safe_url(pair["articleUrl"]) or type(pair["caseId"]) is not int or pair["caseId"] < 1:
            raise ValueError(f'기사 또는 판례 원문 주소를 확인하세요: {pair["id"]}')
    return records


def card_markup(fragment: str, pair: dict | None) -> str:
    root = ElementTree.fromstring("<root>" + fragment + "</root>")
    fields = {item.get("id"): item for item in root.iter() if item.get("id")}
    article, empty = fields["casePair"], fields["casePairEmpty"]
    news, ruling, more = fields["casePairArticle"], fields["casePairRuling"], fields["casePairSearch"]
    if pair:
        article.attrib.pop("hidden", None)
        article.set("data-issue-date", pair["issueDate"])
        empty.set("hidden", "hidden")
        fields["casePairDate"].text = pair["issueDate"].replace("-", ".") + " 기사와 함께 읽는 판례"
        fields["casePairQuestion"].text = pair["question"]
        fields["casePairContext"].text = pair["context"]
        news.set("href", pair["articleUrl"])
        news.find("strong").text = pair["articleTitle"]
        ruling.set("href", f'https://www.law.go.kr/LSW/precInfoP.do?precSeq={pair["caseId"]}')
        ruling.find("span").text = "대법원 · " + pair["caseDate"].replace("-", ".") + "."
        ruling.find("strong").text = pair["caseNumber"] + " · " + pair["caseTitle"]
        more.set("href", "/law/?" + urlencode({"theme": pair["theme"], "q": pair["keyword"]}))
        more.text = f'‘{pair["keyword"]}’ 관련 판례 더 찾기 →'
    else:
        article.set("hidden", "hidden")
        article.attrib.pop("data-issue-date", None)
        empty.attrib.pop("hidden", None)
        for link in (news, ruling, more):
            link.attrib.pop("href", None)
        for item in (fields["casePairDate"], fields["casePairQuestion"], fields["casePairContext"],
                     news.find("strong"), ruling.find("span"), ruling.find("strong"), more):
            item.text = ""
    return START + (root.text or "") + "".join(
        ElementTree.tostring(item, encoding="unicode", method="html") for item in root
    ) + END


def with_edition(template: str, date: str, records: list[dict]) -> str:
    pairs = [pair for pair in records if pair["issueDate"] <= date][:MAX_PAIRS]
    page, count = CARD.subn(lambda m: card_markup(m[1], pairs[0] if pairs else None), template, count=1)
    if not count or not DATA.search(page):
        raise ValueError("신문·판례 지면의 템플릿과 데이터 위치를 확인하세요")
    body = json.dumps({"pairs": pairs}, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return DATA.sub(lambda m: m[1] + body + m[2], page, count=1)
