import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  parseCases,
  themes,
  searchCases,
  extractSituation,
  createMemo,
} from "../frontend-vanilla-js/law/search-core.js";

const cases = parseCases(
  JSON.parse(
    readFileSync(new URL("../frontend-vanilla-js/law/data/precedents.json", import.meta.url)),
  ),
);
test("catalogue has unique official IDs, complete citations and all four topics", () => {
  assert.ok(cases.length >= 2000);
  assert.equal(searchCases(cases, "  ").length, cases.length);
  for (const name of ["보증금", "임대차", "계약·매매", "중개 분쟁"]) {
    assert.ok(searchCases(cases, "", name).length > 0);
  }
});
test("natural Korean deposit query ranks a deposit case first", () => {
  const results = searchCases(
    cases,
    "전세 계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.",
  );
  assert.ok(results[0].topics.includes("보증금"));
  assert.match(results[0].summary, /보증금/);
});
test("colloquial fee, spacing, keyword combinations and Korean particles", () => {
  for (const query of ["복비", "중개 수수료", "중개보수를"]) {
    assert.ok(searchCases(cases, query)[0].topics.includes("중개 분쟁"));
  }
  const first = searchCases(cases, "상가 권리금")[0];
  assert.match(first.summary + first.title, /상가/);
  assert.match(first.summary + first.title, /권리금/);
});
test("exact docket searches handle spaces, court prefix and joined case numbers", () => {
  for (const query of ["2026다201978", "대법원 2026 다 201978 판결"]) {
    assert.deepEqual(
      searchCases(cases, query).map((record) => record.id),
      [622971],
    );
  }
  assert.ok(
    searchCases(cases, "2024다280904").some((record) => record.id === 609447),
  );
  assert.deepEqual(searchCases(cases, "2026다20197"), []);
});
test("topic filters intersect with the same ranked results", () => {
  const results = searchCases(cases, "보증금");
  for (const topic of ["임대차", "중개 분쟁"]) {
    assert.deepEqual(
      searchCases(cases, "보증금", topic),
      results.filter((item) => item.topics.includes(topic)),
    );
  }
  assert.deepEqual(searchCases(cases, "우주여행"), []);
});
test("extraction selects at most three original sentences in source order", () => {
  const text =
    "계약이 끝났습니다. 보증금이 없습니다. 집주인은 연락이 없습니다. 전세 반환이 필요합니다.";
  const result = extractSituation(text);
  assert.equal(result.summary.split("\n").length, 3);
  for (const sentence of result.summary.split("\n"))
    assert.ok(text.includes(sentence));
  assert.ok(result.keywords.includes("보증금"));
});
test("empty extraction is empty and has no invented output", () =>
  assert.deepEqual(extractSituation(""), { summary: "", keywords: [] }));
test("memo includes the situation and traceable case citations", () => {
  const memo = createMemo(
    "보증금 반환이 필요합니다.",
    searchCases(cases, "2026다201978"),
  );
  for (const text of [
    "보증금 반환이 필요합니다.",
    "2026다201978",
    "대법원",
    "2026-06-24",
    "https://www.law.go.kr/LSW/precInfoP.do?precSeq=622971",
  ]) {
    assert.ok(memo.includes(text));
  }
});
test("malformed datasets and duplicate identities are rejected", () => {
  for (const value of [
    null,
    [],
    [{ id: 1 }],
    [cases[0], cases[0]],
    [{ ...cases[0], keywords: [1] }],
    [{ ...cases[0], number: "" }],
    [{ ...cases[0], date: null }],
    [{ ...cases[0], topics: ["bogus"] }],
  ])
    assert.throws(() => parseCases(value));
});

test("every theme, subtopic, suggested keyword and sample resolves within its catalogue", () => {
  for (const [id, theme] of Object.entries(themes)) {
    const records = parseCases(
      JSON.parse(
        readFileSync(new URL("../frontend-vanilla-js/law/data/" + theme.file, import.meta.url)),
      ),
      id,
    );
    const ids = new Set(records.map((record) => record.id));
    for (const topic of Object.keys(theme.topics)) {
      assert.ok(searchCases(records, "", topic).length > 0, topic);
    }
    for (const query of [...theme.keywords, theme.placeholder]) {
      const matches = searchCases(records, query);
      assert.ok(matches.length > 0, query);
      assert.ok(matches.every((record) => ids.has(record.id)));
    }
  }
});

test("dates and amounts in a situation don't trigger an unrelated exact docket search", () => {
  for (const query of [
    "2024년 3월에 전세보증금을 돌려받지 못했어요",
    "보증금 30만원 20만원 반환",
  ]) {
    assert.ok(searchCases(cases, query)[0].topics.includes("보증금"));
  }
});

test("each curated case is reachable by its keyword and its exact docket", () => {
  const selection = JSON.parse(
    readFileSync(new URL("../backend-python/pipeline/law/curated_cases.json", import.meta.url)),
  );
  for (const [theme, entries] of Object.entries(selection)) {
    const records = parseCases(
      JSON.parse(
        readFileSync(
          new URL("../frontend-vanilla-js/law/data/" + themes[theme].file, import.meta.url),
        ),
      ),
      theme,
    );
    assert.ok(records.length > Object.keys(entries).length);
    for (const [id, tags] of Object.entries(entries)) {
      const record = records.find((item) => item.id === Number(id));
      assert.ok(record, id);
      const keyword = tags[0];
      assert.ok(themes[theme].keywords.includes(keyword), keyword);
      assert.equal(searchCases(records, keyword)[0]?.id, record.id, keyword);
      assert.deepEqual(
        searchCases(records, record.number).map((item) => item.id),
        [record.id],
      );
    }
  }
  assert.ok(extractSituation("cctv를 열람했어요.").keywords.includes("CCTV"));
});

test("neighbor and impact-noise cues together find the noise issue", () => {
  const environment = JSON.parse(
    readFileSync(new URL("../frontend-vanilla-js/law/data/environment.json", import.meta.url)),
  );
  for (const query of [
    "윗집이 밤마다 쿵쿵거려요",
    "아래층에서 발망치 소리가 들려요",
  ]) {
    const results = searchCases(environment, query);
    assert.ok(
      results.some((record) => record.summary.includes("층간소음")),
      query,
    );
  }
  assert.deepEqual(searchCases(environment, "심장이 쿵쿵거려요"), []);
});
