import { themes } from "./themes.js";

export { themes };
export const themeIds = Object.keys(themes);
export function isThemeId(value) {
  return typeof value === "string" && themeIds.includes(value);
}
export const officialCaseUrl = (item) =>
  `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${item.id}`;
export const citation = (item) =>
  `${item.court} · ${item.date} · ${item.number}`;

const aliases = [
  ["복비", "중개수수료", "중개보수", "중개료"],
  ["전세보증금", "전세금", "임대차보증금", "임차보증금"],
  ["월세", "차임"],
  ["집주인", "임대인"],
  ["세입자", "임차인"],
  ["돌려받", "돌려주", "반환"],
  ["전월세", "임대차"],
  ["산재", "산업재해", "업무상재해"],
  ["월급", "임금", "급여"],
  ["야근수당", "연장근로수당"],
  ["상속포기", "상속의포기"],
  ["뺑소니", "도주차량", "도주치상", "도주치사"],
  ["빌려준돈", "대여금", "소비대차", "차용금"],
];
const vocabulary = [
  ...new Set([
    ...Object.values(themes).flatMap((theme) => [
      ...Object.values(theme.topics).flat(),
      ...theme.keywords.flatMap((term) => term.split(" ")),
    ]),
    ...aliases.flat(),
    "보증금",
    "전세",
    "임대차",
    "매매",
    "분양",
    "계약",
    "상가",
    "재개발",
    "권리금",
    "중개",
    "대항력",
    "조합원",
    "계약금",
    "중도금",
    "잔금",
    "전입신고",
    "확정일자",
    "손해배상",
    "대출",
    "갱신",
    "해지",
    "해제",
    "연체",
    "명도",
    "경매",
    "사기",
    "보호법",
  ]),
].sort((a, b) => b.length - a.length);
const compact = (text) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function parseCases(value, theme = "property") {
  if (!Array.isArray(value) || !value.length)
    throw new Error("Invalid case dataset");
  const ids = new Set();
  for (const item of value) {
    if (
      !item ||
      !Number.isSafeInteger(item.id) ||
      item.id <= 0 ||
      ids.has(item.id) ||
      ![item.title, item.summary, item.court, item.number, item.date].every(
        nonempty,
      ) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Array.isArray(item.topics) ||
      !item.topics.length ||
      !item.topics.every((name) =>
        Object.keys(themes[theme].topics).includes(name),
      ) ||
      !Array.isArray(item.keywords) ||
      !item.keywords.length ||
      !item.keywords.every(nonempty)
    )
      throw new Error("Invalid case record");
    ids.add(item.id);
  }
  return value;
}

function queryGroups(input) {
  const query = compact(input);
  const groups = new Map();
  function add(word) {
    const options = aliases.find((group) => group.includes(word)) ?? [word];
    groups.set(compact(options[0]), options.map(compact));
  }
  if (
    /(윗집|아랫집|위층|아래층)/u.test(query) &&
    /(쿵쿵|발소리|발망치)/u.test(query)
  ) {
    add("층간소음");
  }
  const recognized = vocabulary.filter((term) => query.includes(compact(term)));
  for (const term of recognized) {
    if (!recognized.some((longer) => longer !== term && longer.includes(term)))
      add(term);
  }
  for (const token of input
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 80) ?? []) {
    const word = token.replace(
      /(?:으로부터|에서는|에서|에게|으로|까지|부터|처럼|이나|의|이|가|을|를|은|는|에|와|과|로|도)$/,
      "",
    );
    if (
      word.length >= 2 &&
      !recognized.some((term) => compact(term).includes(word)) &&
      ![
        "판례",
        "판결",
        "관련",
        "검색",
        "여부",
        "경우",
        "문의",
        "알고",
        "싶어요",
        "않아요",
      ].includes(word)
    ) {
      add(word);
    }
  }
  return [...groups.values()];
}

function docketNumbers(number) {
  let prefix = "";
  return compact(number)
    .split(/[,·/()]+/)
    .map((part) => {
      const full = part.match(/(\d{2,4}[가-힣]+)(\d+)/);
      if (full) {
        prefix = full[1];
        return full[0];
      }
      return /^\d+$/.test(part) ? prefix + part : "";
    });
}

export function searchCases(cases, query, topic = "전체") {
  const inTopic = (item) =>
    topic === "전체" || item.topics.includes(topic);
  const phrase = compact(query);
  if (!phrase) return cases.filter(inTopic);
  const numbers = phrase.match(/\d{2,4}[가-힣]{1,5}\d+/g);
  if (numbers) {
    const exact = cases.filter(
      (item) =>
        inTopic(item) &&
        docketNumbers(item.number).some((number) => numbers.includes(number)),
    );
    if (
      exact.length ||
      /^(?:대법원)?\d{2,4}[가-힣]{1,5}\d+(?:판결|결정)?$/u.test(phrase)
    ) {
      return exact;
    }
  }
  const groups = queryGroups(query);
  const scored = cases.map((item) => {
    const title = compact(item.title);
    const issue = compact(item.summary);
    const tags = item.keywords.map(compact);
    let score = 0;
    let matches = 0;
    for (const group of groups) {
      let best = 0;
      for (const term of group) {
        const weight =
          (tags.some((tag) => tag.includes(term)) ? 5 : 0) +
          (title.includes(term) ? 4 : 0) +
          (issue.includes(term) ? 2 : 0) +
          (item.court.includes(term) ? 1 : 0);
        best = Math.max(best, weight);
      }
      if (best) matches++;
      score += best;
    }
    if (title.includes(phrase) || issue.includes(phrase)) score += 12;
    const exactAlias = item.keywords.some(
      (word) => word.includes(" ") && compact(word) === phrase,
    );
    if (item.topics.includes(phrase)) score += 6;
    return { item, matches, score, exactAlias };
  });
  const bestCoverage = scored.reduce(
    (best, row) => Math.max(best, row.matches),
    0,
  );
  const minCoverage = bestCoverage >= 4 ? bestCoverage - 1 : bestCoverage;
  return scored
    .filter(
      ({ item, matches, score, exactAlias }) =>
        (exactAlias || (score > 0 && matches >= minCoverage)) && inTopic(item),
    )
    .sort(
      (a, b) =>
        Number(b.exactAlias) - Number(a.exactAlias) ||
        b.matches - a.matches ||
        b.score - a.score ||
        b.item.date.localeCompare(a.item.date) ||
        b.item.id - a.item.id,
    )
    .map(({ item }) => item);
}
export function extractSituation(text) {
  const clean = text.trim().slice(0, 8000);
  const normalized = compact(clean);
  const keywords = vocabulary
    .filter((term) => normalized.includes(compact(term)))
    .slice(0, 6);
  const selected = clean
    .split(/(?<=[.!?。])\s+|\n+/u)
    .filter(Boolean)
    .map((sentence, index) => ({
      sentence,
      index,
      score: keywords.reduce(
        (score, term) => score + Number(sentence.includes(term)),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .sort((a, b) => a.index - b.index);
  return {
    summary: selected.map((item) => item.sentence).join("\n"),
    keywords,
  };
}
export function createMemo(text, cases) {
  const { summary, keywords } = extractSituation(text);
  return [
    "대한민국 조간 · 판례 검색 노트",
    "",
    summary,
    "",
    `찾은 키워드: ${keywords.join(", ") || "없음"}`,
    "",
    `관련 판례 ${cases.length}건 중 상위 ${Math.min(cases.length, 10)}건`,
    ...cases
      .slice(0, 10)
      .map(
        (item) =>
          `• ${item.title} · ${citation(item)}\n  ${officialCaseUrl(item)}`,
      ),
    "",
    "입력 문장에서 추출한 정리이며 AI 분석이나 법률 자문이 아닙니다.",
    "공식 판례 검색: https://www.law.go.kr/precSc.do",
  ].join("\n");
}
