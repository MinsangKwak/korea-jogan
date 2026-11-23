const start = "2025-01-01";
function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseSnapshot(raw, source) {
    if (!raw || typeof raw !== "object")
        throw new Error("자료 형식을 확인해 주세요.");
    const snapshot = raw;
    const { asOf, coverage } = snapshot;
    const rows = snapshot[source];
    if (!isDate(asOf) || typeof coverage !== "string" || !coverage.trim() || !Array.isArray(rows) || !rows.length) {
        throw new Error("수록 범위를 확인할 수 없습니다.");
    }
    const events = new Map();
    const publications = new Map();
    for (const row of rows) {
        if (!row || typeof row !== "object")
            throw new Error("잘못된 입법 기록입니다.");
        const { title, number, url } = row;
        if (typeof title !== "string" || !title.trim() || typeof number !== "string" || !number.trim() || typeof url !== "string") {
            throw new Error("입법 기록의 필수 항목이 비었습니다.");
        }
        const link = new URL(url);
        if (link.protocol !== "https:" || !/(^|\.)(assembly\.go\.kr|law\.go\.kr|lawmaking\.go\.kr)$/.test(link.hostname)) {
            throw new Error("공식 원문 주소를 확인할 수 없습니다.");
        }
        const add = (kind, date) => {
            if (!isDate(date))
                throw new Error("입법 기록의 날짜를 확인해 주세요.");
            if (date < start)
                return;
            const id = kind === "proposed" ? "bill/" + number : [kind, date, number, title].join("/");
            const event = { id, kind, date, title, number, url };
            if (kind === "promulgated") {
                const publicationId = [kind, date, number].join("/");
                let versions = publications.get(publicationId);
                if (!versions) {
                    versions = new Map();
                    publications.set(publicationId, versions);
                }
                const indirect = row.indirect === true;
                if (!versions.has(title) || !indirect)
                    versions.set(title, { event, indirect });
            }
            else if (!events.has(id)) {
                events.set(id, event);
            }
        };
        if (source === "bills") {
            add("proposed", row.proposed);
        }
        else {
            add("promulgated", row.promulgated);
            if (row.effective)
                add("effective", row.effective);
        }
    }
    for (const [id, versions] of publications) {
        const batch = Array.from(versions.values()).sort((a, b) => Number(a.indirect) - Number(b.indirect) || a.event.title.localeCompare(b.event.title, "ko"));
        const [first, ...others] = batch;
        events.set(id, {
            ...first.event,
            id,
            indirectOnly: first.indirect,
            related: others.map(({ event }) => ({ title: event.title, url: event.url })),
        });
    }
    return { events: Array.from(events.values()), asOf, coverage };
}
async function readSource(source, signal) {
    const file = source === "bills" ? "bills.json" : "law-calendar.json";
    const response = await fetch(new URL("../data/" + file, import.meta.url), { signal });
    if (!response.ok)
        throw new Error("자료를 불러올 수 없습니다.");
    return parseSnapshot(await response.json(), source);
}
async function readGazette(signal) {
    const response = await fetch(new URL("../data/gazette-preview.json", import.meta.url), { signal });
    if (!response.ok)
        return;
    const entry = await response.json();
    if (!entry || !isDate(entry.issueDate) || !isDate(entry.checkedOn) ||
        typeof entry.issueNumber !== "string" || !/^\d+$/.test(entry.issueNumber) ||
        !Number.isSafeInteger(entry.lawCount) || entry.lawCount < 0 ||
        entry.url !== "https://gwanbo.go.kr/user/pblicteNoti/tomorrowOfctt.do")
        return;
    return entry;
}
export async function loadLegislation(signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted)
        abort();
    const timeout = window.setTimeout(abort, 45000);
    try {
        const [bills, laws, gazette] = await Promise.allSettled([
            readSource("bills", controller.signal),
            readSource("laws", controller.signal),
            readGazette(controller.signal),
        ]);
        if (signal.aborted || (bills.status === "rejected" && laws.status === "rejected")) {
            throw new Error("입법 자료를 불러오지 못했습니다.");
        }
        const missing = "자료를 불러오지 못했습니다.";
        const billData = bills.status === "fulfilled" ? bills.value : null;
        const lawData = laws.status === "fulfilled" ? laws.value : null;
        const dates = [billData?.asOf, lawData?.asOf].filter((s) => !!s);
        return {
            asOf: dates.sort()[dates.length - 1],
            gazette: gazette.status === "fulfilled" ? gazette.value : undefined,
            coverage: {
                proposed: billData ? billData.asOf + " 기준. " + billData.coverage : missing,
                promulgated: lawData ? lawData.asOf + " 기준. " + lawData.coverage : missing,
                effective: lawData ? lawData.asOf + " 기준. " + lawData.coverage : missing,
            },
            events: [...(billData?.events ?? []), ...(lawData?.events ?? [])],
            warning: !billData ? "법률안 제안 자료를 불러오지 못했습니다." : !lawData ? "법률 공포·시행 자료를 불러오지 못했습니다." : undefined,
        };
    }
    finally {
        signal.removeEventListener("abort", abort);
        window.clearTimeout(timeout);
    }
}
