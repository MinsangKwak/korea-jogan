"""Regenerate the national bill proposal index. Requires pyarrow."""

import argparse
from datetime import date, datetime
import hashlib
from html import unescape
import json
from pathlib import Path
import re
import tempfile
from time import sleep
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

START = date(2025, 1, 1)
BOUNDARY = date(2026, 9, 23)
REVISION = "0cfe29f73f929713140d6b50eee0ef6f70e175cf"
DIGEST = "623e66042e012592dbfce46a9c2e6e5c1c3524104f4b9224e13833af19220540"
MASTER = f"https://media.githubusercontent.com/media/kyusik-yang/kna/{REVISION}/data/processed/master_bills_22.parquet"
RECENT = "https://narabaro.fingr.io/bills"
DETAIL = "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out"
DESTINATION = Path(__file__).resolve().parents[3] / "frontend-vanilla-js/law/data/bills.json"


def download(url):
    request = Request(url, headers={"User-Agent": "Korea-Jogan/1.0 (+https://korea-jogan.com/law/calendar/)"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=40) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            sleep(2 ** (attempt + 1))


def entry(number, title, proposed):
    if not re.fullmatch(r"22\d{5}", number) or not title.strip():
        raise ValueError(f"Invalid bill {number}")
    date.fromisoformat(proposed)
    return {
        "title": title.strip(), "number": number, "proposed": proposed,
        "url": f"{DETAIL}/{number}/detailRP",
    }


def baseline(data):
    if hashlib.sha256(data).hexdigest() != DIGEST:
        raise ValueError("Pinned 22nd Assembly snapshot checksum mismatch")
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pq.read_table(pa.BufferReader(data), columns=["bill_kind", "bill_no", "bill_nm", "bill_id", "ppsl_dt"])
    records = {}
    for row in table.to_pylist():
        proposed = row["ppsl_dt"].date() if row["ppsl_dt"] else None
        if row["bill_kind"] == "법률안" and proposed and START <= proposed <= BOUNDARY:
            record = entry(row["bill_no"], row["bill_nm"], proposed.isoformat())
            official_id = row["bill_id"]
            if not re.fullmatch(r"(PRC|ARC)_[A-Za-z0-9]+", official_id):
                raise ValueError("Invalid official bill identifier")
            record["url"] = f"https://likms.assembly.go.kr/bill/billDetail.do?billId={official_id}"
            if record["number"] in records:
                raise ValueError(f"Duplicate baseline bill {record['number']}")
            records[record["number"]] = record
    if len(records) != 13994:
        raise ValueError("Unexpected baseline record count")
    return records


def page_rows(html):
    cards = re.findall(r'<a\s+href="/bills/\d+"[^>]*>(.*?)</a>', html, re.S)
    rows = []
    for card in cards:
        fields = [unescape(re.sub(r"<[^>]*>", "", field)).strip()
                  for field in re.findall(r"<p\b[^>]*>(.*?)</p>", card, re.S)]
        if len(fields) < 3:
            raise ValueError("Unrecognized proposal row")
        number = re.match(r"(22\d{5})\b", fields[1])
        if not number:
            raise ValueError("Missing proposal number")
        rows.append(entry(number[1], fields[0], fields[-1]))
    if not rows:
        raise ValueError("Missing paginated proposal list")
    return rows


def supplement(records, retrieved):
    feed = json.loads(download(RECENT + ".json?filter=all"))
    timestamp = datetime.fromisoformat(feed["generated_at"]).astimezone(ZoneInfo("Asia/Seoul")).date()
    if timestamp > retrieved or (retrieved - timestamp).days > 2:
        raise ValueError(f"Recent proposal export date is stale or invalid: {timestamp}")
    export = [entry(row["bill_no"], row["title"], row["proposed_on"]) for row in feed["bills"]]
    if len(export) < 20 or len(export) != feed["total"]:
        raise ValueError("Invalid public export size")

    def include(rows):
        if any(row["proposed"] > retrieved.isoformat() for row in rows):
            raise ValueError("Future proposal date in historical source")
        for row in rows:
            if row["proposed"] > BOUNDARY.isoformat():
                records[row["number"]] = row

    include(export)
    oldest = min(row["proposed"] for row in export)
    if oldest <= BOUNDARY.isoformat():
        return timestamp

    # The export is capped at 1,000. Check the overlap before continuing into older public pages.
    page = len(export) // 20
    seen = {row["number"] for row in export}
    rows = page_rows(download(f"{RECENT}?filter=all&page={page}").decode())
    if not any(row["number"] in seen for row in rows):
        raise ValueError("Recent export and list do not overlap")
    include(rows)
    seen.update(row["number"] for row in rows)
    oldest = min(row["proposed"] for row in rows)
    while oldest > BOUNDARY.isoformat():
        page += 1
        sleep(0.2)
        rows = page_rows(download(f"{RECENT}?filter=all&page={page}").decode())
        dates = [row["proposed"] for row in rows]
        numbers = {row["number"] for row in rows}
        if dates != sorted(dates, reverse=True) or max(dates) > oldest or not numbers - seen:
            raise ValueError("Unstable proposal page order")
        include(rows)
        seen.update(numbers)
        oldest = min(dates)
    return timestamp


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", type=Path, help="Local copy of the pinned master_bills_22.parquet")
    parser.add_argument("--output", type=Path, default=DESTINATION)
    args = parser.parse_args()
    records = baseline(args.parquet.read_bytes() if args.parquet else download(MASTER))
    day = supplement(records, datetime.now(ZoneInfo("Asia/Seoul")).date())
    bills = sorted(records.values(), key=lambda row: (row["proposed"], row["number"]))
    result = {
        "asOf": day.isoformat(),
        "coverage": ("2025-01-01~2026-09-23은 열린국회정보를 정리한 KNA의 제22대 법률안"
                     "(의원·정부·위원장)입니다. 2026-09-24부터는 나라바로가 열린국회정보에서 수집한 "
                     "의원발의 목록을 보완했습니다. 이후의 정부·위원장 제안 및 아직 수집되지 않은 의안은 빠질 수 있습니다."),
        "sources": ["https://open.assembly.go.kr", f"https://github.com/kyusik-yang/kna/tree/{REVISION}", RECENT],
        "bills": bills,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    file = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent, delete=False)
    temp_path = Path(file.name)
    try:
        with file:
            json.dump(result, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
        temp_path.chmod(0o644)
        temp_path.replace(args.output)
    finally:
        temp_path.unlink(missing_ok=True)
    print(f"{len(bills):,} bill proposals, {bills[0]['proposed']} through {bills[-1]['proposed']}")


if __name__ == "__main__":
    main()
