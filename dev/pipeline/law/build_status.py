"""판례·입법 수록본의 검수용 파일 목록, 집계, SHA-256을 생성합니다."""

import argparse
import hashlib
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "web/law/data"
FILENAME = "catalogue-status.json"


def make_status(directory):
    themes = json.loads((HERE / "themes.json").read_text(encoding="utf-8"))
    case_source = json.loads((HERE / "case-source.json").read_text(encoding="utf-8"))
    files = []
    case_ids = set()
    case_rows = 0
    latest_decision = ""

    def read(filename, label, kind, rows_key=None):
        raw = (directory / filename).read_bytes()
        content = json.loads(raw)
        if kind == "gazette":
            rows = [content]
            as_of = content["checkedOn"]
        elif kind == "cases":
            rows = content
            as_of = case_source["asOf"]
        else:
            rows = content[rows_key]
            as_of = content["asOf"]
        if not isinstance(rows, list) or not rows:
            raise ValueError(f"{filename} 자료가 없거나 목록이 아닙니다.")
        files.append({
            "file": filename, "label": label, "kind": kind, "rows": len(rows),
            "asOf": as_of, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)
        })
        return rows, as_of

    for theme in themes.values():
        rows, _ = read(theme["file"], theme["label"], "cases")
        ids = {record["id"] for record in rows}
        if len(ids) != len(rows):
            raise ValueError(f"분야 내 중복 판례: {theme['label']}")
        case_ids.update(ids)
        case_rows += len(rows)
        latest_decision = max(latest_decision, max(record["date"] for record in rows))

    bills, bill_as_of = read("bills.json", "국회 법률안", "bills", "bills")
    _, law_as_of = read("law-calendar.json", "법률 판본", "laws", "laws")
    read("gazette-preview.json", "다음 관보 예고 문서", "gazette")
    return {
        "uniqueCases": len(case_ids),
        "caseRows": case_rows,
        "caseAsOf": case_source["asOf"],
        "legislationAsOf": min(bill_as_of, law_as_of),
        "latestDecision": latest_decision,
        "latestProposal": max(row["proposed"] for row in bills),
        "files": files,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--check", action="store_true", help="배포본과 대조만 하고 파일을 변경하지 않습니다.")
    args = parser.parse_args()
    output = args.data / FILENAME
    status = make_status(args.data)
    if args.check:
        if not output.exists() or json.loads(output.read_bytes()) != status:
            parser.exit(1, "법률 자료와 검수 목록이 다릅니다. build_status.py로 다시 생성하세요.\n")
        return
    with NamedTemporaryFile("w", encoding="utf-8", dir=args.data, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            json.dump(status, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.close()
            temporary.chmod(0o644)
            temporary.replace(output)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
