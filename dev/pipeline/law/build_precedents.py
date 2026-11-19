"""Build one searchable catalogue per theme from the pinned public snapshot."""

import argparse
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1] / "web/law"
THEMES = json.loads((HERE / "themes.json").read_text(encoding="utf-8"))
CURATED = {
    theme: {int(case_id): tags for case_id, tags in entries.items()}
    for theme, entries in json.loads((HERE / "curated_cases.json").read_text(encoding="utf-8")).items()
}
COLUMNS = ["판례정보일련번호", "법원명", "사건번호", "선고일자", "사건명", "판시사항", "데이터출처명"]
CONTEXT = {
    "insurance": re.compile("보험|공제계약|공제약관"),
    "medicine": re.compile("진료|수술|환자|의료|병원|치과|의사면허"),
    "property": re.compile("부동산|아파트|토지|건물|주택|상가|임대차|전세|공인중개사|택지|주거|대지"),
    "debt": re.compile("대여|차용|소비대차|보증|채권|채무|변제|회생|파산|차주"),
    "traffic": re.compile("운전|운행|교통|도로|자동차|차량|승용차|승합차|이륜차|대인배상"),
}
EXTRA = "보증금 반환 대항력 전입신고 확정일자 동시이행 인도 경매 배당 임차인 임대인 차임 계약갱신 계약해지 계약해제 소유권이전등기 계약금 중도금 잔금 손해배상 설명의무 확인설명의무 조합원 상가 월세".split()
MATCHERS = {
    key: re.compile("|".join(re.escape(term) for terms in theme["topics"].values() for term in terms))
    for key, theme in THEMES.items()
}


def select_issue(key, issues):
    best = None
    for issue, compact_issue, text in issues:
        if not MATCHERS[key].search(text) or (key in CONTEXT and not CONTEXT[key].search(text)):
            continue
        groups = THEMES[key]["topics"]
        terms = {name: [term for term in group if term in text] for name, group in groups.items()}
        matched = sorted((name for name in terms if terms[name]), key=lambda name: -len(terms[name]))
        keywords = [term for name in matched for term in terms[name]]
        score = (sum(term in compact_issue for term in keywords), len(keywords))
        if best is None or score > best[0]:
            tags = list(keywords)
            if key == "property":
                tags.extend(tag for tag in EXTRA if tag in text and not any(tag in k for k in keywords))
            best = (score, issue, matched, tags[:8])
    return best


def collect(row, catalogues):
    if row["데이터출처명"] != "대법원" or row["법원명"] != "대법원" or not all(row[key] for key in COLUMNS):
        return
    date = str(row["선고일자"])
    if not re.fullmatch(r"(19|20)\d{6}", date):
        return
    title = " ".join(row["사건명"].split())
    compact_title = "".join(title.split())
    issues = []
    for raw in re.split(r"\[\s*\d+\s*\]", row["판시사항"]):
        issue = " ".join(raw.split())
        if issue:
            compact_issue = "".join(issue.split())
            issues.append((issue, compact_issue, compact_title + compact_issue))
    case_id = row["판례정보일련번호"]
    for key, records in catalogues.items():
        if key == "crime" and not re.search(r"\d{2,4}(?:도|모|초기|오|감도|전도|형상|초)\d+", row["사건번호"]):
            continue
        selected = select_issue(key, issues)
        if selected:
            _, summary, topics, keywords = selected
            if tags := CURATED.get(key, {}).get(case_id):
                keywords = list(dict.fromkeys(tags + keywords))[:8]
            records.append(dict(
                id=case_id, title=title, court=row["법원명"], number=row["사건번호"],
                date=datetime.strptime(date, "%Y%m%d").date().isoformat(),
                summary=summary, topics=topics, keywords=keywords,
            ))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory containing all five train-*.parquet shards")
    parser.add_argument("--output", type=Path, default=WEB, help="판례 페이지 루트. JSON 색인은 data/에 저장합니다.")
    args = parser.parse_args()
    shards = sorted(args.directory.glob("train-*.parquet"))
    if len(shards) != 5:
        parser.error("Expected all five snapshot shards")
    import pyarrow.parquet as pq

    catalogues = {key: [] for key in THEMES}
    for shard in shards:
        for batch in pq.ParquetFile(shard).iter_batches(batch_size=1000, columns=COLUMNS):
            for row in batch.to_pylist():
                collect(row, catalogues)
    for key, entries in CURATED.items():
        if not entries.keys() <= {record["id"] for record in catalogues[key]}:
            raise ValueError(f"Missing curated precedents: {key}")
    args.output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.output) as temporary:
        staging = Path(temporary)
        write_catalogues(catalogues, staging)
        destination = args.output / "data"
        destination.mkdir(exist_ok=True)
        for theme in THEMES.values():
            (staging / theme["file"]).replace(destination / theme["file"])
        (staging / "themes.js").replace(args.output / "themes.js")


def write_catalogues(catalogues, destination):
    for key, records in catalogues.items():
        records.sort(key=lambda case: (case["date"], case["id"]), reverse=True)
        if not records or len({case["id"] for case in records}) != len(records):
            raise ValueError(f"Empty catalogue or duplicate precedent IDs: {key}")
        data = destination / THEMES[key]["file"]
        lines = [json.dumps(case, ensure_ascii=False, separators=(",", ":")) for case in records]
        data.write_text("[\n" + ",\n".join(lines) + "\n]\n", encoding="utf-8")
        print(key, len(records), Counter(topic for case in records for topic in case["topics"]), data.stat().st_size)

    original = (HERE / "themes.json").read_text(encoding="utf-8").rstrip()
    (destination / "themes.js").write_text(f"export const themes = {original};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
