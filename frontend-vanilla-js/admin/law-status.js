const base = '/law/data/';
const find = (id) => document.getElementById(id);
const format = new Intl.NumberFormat('ko-KR');
let manifest;
let statusCells = [];

function node(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

async function loadList() {
  const message = find('lawStatusMessage');
  find('retryLaw').hidden = true;
  message.textContent = '수록 목록을 불러오는 중입니다.';
  try {
    const response = await fetch(base + 'catalogue-status.json', { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!Array.isArray(data.files) || !data.files.length || !data.files.every((entry) =>
      /^[a-z-]+\.json$/.test(entry.file) && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isSafeInteger(entry.rows)
    )) throw new Error();
    const cases = data.files.filter((entry) => entry.kind === 'cases');
    const bills = data.files.find((entry) => entry.kind === 'bills');
    const laws = data.files.find((entry) => entry.kind === 'laws');
    const metrics = [
      ['고유 판례', data.uniqueCases, '같은 사건은 한 번 집계'],
      ['분야별 수록 합계', data.caseRows, cases.length + '개 분야 · 중복 포함'],
      ['국회 법률안', bills.rows, '수록 의안번호 기준'],
      ['법률 판본', laws.rows, '공포·시행 일정의 원자료'],
    ];
    find('lawStats').replaceChildren(...metrics.map(([label, count, help]) => {
      const item = document.createElement('div');
      item.className = 'admin-stat';
      item.append(node('span', label), node('strong', format.format(count)), node('small', help));
      return item;
    }));
    find('lawDates').textContent = '판례 자료 ' + data.caseAsOf + ' · 가장 최근 선고 ' + data.latestDecision + ' / 입법 자료 ' + data.legislationAsOf + ' · 가장 최근 제안 ' + data.latestProposal;
    statusCells = [];
    find('lawFileRows').replaceChildren(...data.files.map((entry) => {
      const row = document.createElement('tr');
      const label = node('th', entry.label);
      label.scope = 'row';
      const state = node('td', '검사 전');
      row.append(label, node('td', format.format(entry.rows)), node('td', entry.asOf), state);
      statusCells.push(state);
      return row;
    }));
    manifest = data;
    find('lawDetails').hidden = false;
    message.textContent = '공개 자료 ' + data.files.length + '개 파일의 수록 목록을 읽었습니다.';
  } catch {
    message.textContent = '판례 수록 목록을 불러오지 못했습니다.';
    find('retryLaw').hidden = false;
  }
}

async function verifyFiles() {
  const button = find('verifyLaw');
  const message = find('lawVerification');
  if (!manifest || button.disabled) return;
  if (!globalThis.crypto?.subtle) {
    message.textContent = '파일 검사는 HTTPS에서 지원되는 브라우저로 이용해 주세요.';
    return;
  }
  button.disabled = true;
  message.textContent = '현재 배포 파일을 내려받아 검사하고 있습니다.';
  let failed = 0;
  for (const [index, entry] of manifest.files.entries()) {
    const cell = statusCells[index];
    delete cell.dataset.failed;
    cell.textContent = '검사 중';
    try {
      const response = await fetch(base + entry.file, { cache: 'no-cache', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const bytes = await response.arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== entry.sha256 || bytes.byteLength !== entry.bytes) throw new Error();
      cell.textContent = '일치';
    } catch {
      cell.textContent = '확인 실패';
      cell.dataset.failed = 'true';
      failed += 1;
    }
  }
  const count = manifest.files.length;
  message.textContent = '검사 완료 · 일치 ' + (count - failed) + '개 / 확인 실패 ' + failed + '개';
  button.disabled = false;
}
find('verifyLaw').addEventListener('click', verifyFiles);
find('retryLaw').addEventListener('click', loadList);
loadList();
