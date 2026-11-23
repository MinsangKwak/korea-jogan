"""Build the national acts calendar from a local Legalize KR archive and official corrections."""
import argparse
import json
import re
import subprocess
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile


START = "2025-01-01"
SOURCE = "https://github.com/legalize-kr/legalize-kr"
SOURCE_LIST = "https://open.law.go.kr/LSO/lab/lawListSupport.do"
HERE = Path(__file__).resolve().parent
VERSION_FIELDS = re.compile(r"^(제목|법령MST|법령구분|공포일자|공포번호|시행일자): *([^\n]*)", re.M)


def git(archive, *args):
    return subprocess.check_output(["git", "-C", str(archive), *args], text=True)


def blob_ids(archive, revision):
    changes = git(archive, "log", "--raw", "--root", "--no-renames", "--no-abbrev",
                  "--format=", revision, "--", ":(glob)kr/**/법률.md")
    ids = {line.split()[3] for line in changes.splitlines() if line.startswith(":")}
    return sorted(ids - {"0" * 40})


def amendment_types(archive, revision):
    history = git(archive, "log", "--grep=^법률:", "--format=%B%x00", revision)
    changes = {}
    for message in history.split("\0"):
        title = message.strip().partition("\n")[0]
        seq = re.search(r"^법령MST: (\d+)$", message, re.M)
        change = re.search(r"\(([^()]+)\)$", title)
        if seq and change:
            changes[seq[1]] = change[1]
    return changes


def versions(archive, revision):
    changes = amendment_types(archive, revision)
    ids = blob_ids(archive, revision)
    if not ids or not changes:
        raise ValueError("Expected Legalize KR law history")
    with subprocess.Popen(["git", "-C", str(archive), "cat-file", "--batch"],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE) as proc:
        try:
            for oid in ids:
                proc.stdin.write(oid.encode() + b"\n")
                proc.stdin.flush()
                ident, kind, size = proc.stdout.readline().split()
                if ident.decode() != oid or kind != b"blob":
                    raise ValueError(f"Invalid Git blob {oid}")
                body = proc.stdout.read(int(size))
                if proc.stdout.read(1) != b"\n":
                    raise ValueError(f"Truncated Git blob {oid}")
                front = body.partition(b"\n---")[0].decode("utf-8")
                fields = {key: value.strip().strip("'\"") for key, value in VERSION_FIELDS.findall(front)}
                if fields["법령구분"] != "법률":
                    raise ValueError(f"Unexpected law type in {oid}")
                seq = fields["법령MST"]
                effective = fields["시행일자"]
                yield (seq, fields["제목"], fields["공포번호"], fields["공포일자"],
                       None if effective == "9999-01-01" else effective, changes.get(seq, ""))
        finally:
            proc.stdin.close()


def make_law(seq, title, number, promulgated, effective, change):
    date.fromisoformat(promulgated)
    if effective:
        date.fromisoformat(effective)
    if not (seq.isdigit() and number.isdigit() and title):
        raise ValueError(f"Invalid law metadata {seq}")
    url = f"https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq={seq}"
    if effective:
        url += "&efYd=" + effective.replace("-", "")
    return dict(title=title, number=number, promulgated=promulgated, effective=effective,
                indirect=change.startswith("타법"), url=url)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Local legalize-kr/legalize-kr Git repository")
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--as-of", required=True, type=date.fromisoformat)
    parser.add_argument("--output", type=Path, default=HERE.parents[1] / "web/law/data/law-calendar.json")
    args = parser.parse_args()
    cutoff = args.as_of.isoformat()
    revision = git(args.archive, "rev-parse", "--verify", f"{args.revision}^{{commit}}").strip()
    archive_date = git(args.archive, "show", "-s", "--format=%as", revision).strip()
    if archive_date > cutoff:
        raise ValueError("Use an archive revision available on or before the requested snapshot")
    rows = {}
    def collect(record):
        seq, title, number, promulgated, effective, change = record
        if promulgated <= cutoff and (promulgated >= START or (effective and effective >= START)):
            # One publication can implement several laws on several different dates.
            key = (title, number, promulgated, effective)
            rows[key] = make_law(seq, title, number, promulgated, effective, change)

    for record in versions(args.archive, revision):
        collect(record)
    if not rows:
        raise ValueError("No qualifying archive rows")
    corrections = json.loads((HERE / "law_calendar_supplement.json").read_text())
    if corrections["verified"] <= cutoff:
        for record in corrections["records"]:
            collect(record)
    laws = sorted(rows.values(), key=lambda r: (r["promulgated"], r["number"], r["title"], r["effective"] or ""))
    scope = (f"법제처 국가법령정보센터의 법률 판본을 수록합니다. Legalize KR 공개 이력 {archive_date} 기준이며, "
             "공포일 또는 법령 단위 시행일이 2025년 1월 이후인 자료입니다. "
             "원자료에서 확인한 단계별 시행일도 포함합니다. 개별 조문과 미수록 판본의 일정은 원문에서 확인하세요.")
    output = dict(asOf=cutoff, coverage=scope, source=SOURCE, revision=revision,
                  archiveDate=archive_date, officialSource=SOURCE_LIST, laws=laws)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.output.parent, delete=False) as out:
        json.dump(output, out, ensure_ascii=False, separators=(",", ":"))
        out.write("\n")
        name = out.name
    Path(name).chmod(0o644)
    Path(name).replace(args.output)
    print(f"{len(laws):,} law versions and effective dates written to {args.output}")


if __name__ == "__main__":
    main()
