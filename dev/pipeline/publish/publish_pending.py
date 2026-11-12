"""안정 코드로 최근 누락 호를 선별하고 검사·공개·배포를 끝까지 이어 간다."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

import auto_release
import prepare_daily

ROOT = prepare_daily.ROOT
sys.path.insert(0, str(ROOT / 'dev/pipeline/collect'))
import compose_issue


def run(*args: str, root: Path = ROOT, timeout: int = 180) -> str:
    result = subprocess.run(args, cwd=root, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        print(result.stdout[-10000:]); print(result.stderr[-4000:], file=sys.stderr)
        raise RuntimeError(f'{args[0]} 실패 ({result.returncode})')
    if args[0] not in ('git', 'gh'):
        print(result.stdout[-5000:], flush=True)
    return result.stdout.strip()


def write_api(path: str, payload: dict, method: str = 'POST') -> dict:
    response = subprocess.run(['gh', 'api', '--method', method, f'repos/{auto_release.REPOSITORY}/' + path, '--input', '-'], input=json.dumps(payload), text=True, capture_output=True, check=True, timeout=90)
    return json.loads(response.stdout)


def recent_days(day: str) -> list[str]:
    value = dt.date.fromisoformat(day)
    return [(value - dt.timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]


def remote_day(day: str) -> str | None:
    result = subprocess.run(['git', 'ls-remote', '--exit-code', '--heads', 'origin', 'refs/heads/daily/' + day], cwd=ROOT, text=True, capture_output=True, timeout=45)
    if result.returncode == 2:
        return None
    if result.returncode:
        raise RuntimeError('일일 브랜치 조회 실패')
    sha = result.stdout.split()[0]
    if not prepare_daily.SHA.fullmatch(sha):
        raise ValueError('일일 브랜치 SHA 오류')
    run('git', 'fetch', 'origin', sha)
    return sha


def verify_source(sha: str) -> None:
    deadline = time.monotonic() + 420
    while True:
        checks = auto_release.api(f'commits/{sha}/check-runs?per_page=100&filter=latest')
        try:
            prepare_daily.require_checks(checks, sha)
            return
        except prepare_daily.PreparationError:
            active = any(item.get('name') == 'verify-ci' and item.get('head_sha') == sha and item.get('status') != 'completed' for item in checks.get('check_runs', []))
            if not active:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('진행 중인 같은 SHA의 검사가 아직 완료되지 않았습니다')
            time.sleep(10)
    proof = write_api('check-runs', {'name': 'verify-ci', 'head_sha': sha, 'status': 'in_progress', 'details_url': os.environ.get('GITHUB_SERVER_URL', 'https://github.com') + '/' + auto_release.REPOSITORY + '/actions/runs/' + os.environ['GITHUB_RUN_ID']})
    temporary = Path(tempfile.mkdtemp(prefix='jogan-verify-'))
    outcome = 'failure'
    try:
        run('git', 'worktree', 'add', '--detach', str(temporary), sha)
        commands = [(sys.executable, 'dev/pipeline/publish/validate.py'), (sys.executable, 'dev/pipeline/build/build_tokens.py', '--check'), (sys.executable, '-m', 'unittest', 'discover', '-s', 'dev/tests')]
        for args in commands:
            run(*args, root=temporary)
        tests = temporary / 'dev/tests/browser'
        current = ROOT / 'dev/tests/browser'
        same_lock = hashlib.sha256((tests / 'package-lock.json').read_bytes()).digest() == hashlib.sha256((current / 'package-lock.json').read_bytes()).digest()
        if same_lock and (current / 'node_modules').is_dir():
            (tests / 'node_modules').symlink_to(current / 'node_modules', target_is_directory=True)
        else:
            run('npm', 'ci', '--prefix', 'dev/tests/browser', root=temporary)
        run('npm', 'test', '--prefix', 'dev/tests/browser', root=temporary, timeout=240)
        outcome = 'success'
    finally:
        write_api('check-runs/' + str(proof['id']), {'status': 'completed', 'conclusion': outcome, 'output': {'title': '일일 원본 SHA 전체 검사', 'summary': '고정된 원본 커밋에서 데이터·토큰·Python·전체 브라우저 검사를 수행했습니다. 실패한 검사는 성공으로 대체하지 않습니다.'}}, 'PATCH')
        subprocess.run(['git', 'worktree', 'remove', '--force', str(temporary)], cwd=ROOT, capture_output=True)


def prepare_fallback(day: str, main_sha: str) -> str:
    compose_issue.write_today(ROOT, day)
    run(sys.executable, 'dev/pipeline/publish/validate.py')
    run('git', 'switch', '-c', 'daily/' + day)
    run('git', 'add', '--', f'dev/web/data/issues/{day}.json', prepare_daily.INDEX)
    run('git', 'commit', '-m', f'data(issue): {day}호 RSS 보조 초안')
    sha = run('git', 'rev-parse', 'HEAD')
    if remote_day(day) is not None:
        raise RuntimeError('수집 중 다른 일일 초안이 생성됐습니다. 덮어쓰지 않습니다')
    run('git', 'push', 'origin', 'HEAD:refs/heads/daily/' + day)
    run('git', 'switch', '--detach', main_sha)
    return sha


def main() -> int:
    if os.environ.get('GITHUB_REPOSITORY') != auto_release.REPOSITORY or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('안정 main의 발행 작업에서만 실행합니다')
    now = dt.datetime.now(prepare_daily.KST)
    day = now.date().isoformat()
    if now.hour < 6:
        print('06시 전에는 초안을 공개하지 않습니다')
        return 0
    main_sha = run('git', 'rev-parse', 'HEAD')
    refs = auto_release.fetch_refs()
    if refs['main'] != main_sha or run('git', 'status', '--porcelain', '--untracked-files=no'):
        raise RuntimeError('최신의 변경 없는 main 작업본이 필요합니다')
    run('git', 'config', 'user.name', 'github-actions[bot]')
    run('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    index = json.loads((ROOT / prepare_daily.INDEX).read_text())
    if index['latest'] > day:
        raise ValueError('발행 색인에 미래 날짜가 있습니다')
    sources = {}
    for target in recent_days(day):
        path = ROOT / f'dev/web/data/issues/{target}.json'
        if path.exists() and json.loads(path.read_text()).get('status') == 'published':
            continue
        source = remote_day(target)
        if source:
            sources[target] = source
    if day not in index['issues'] and day not in sources:
        sources[day] = prepare_fallback(day, main_sha)
    for target, source in sorted(sources.items()):
        current = run('git', 'rev-parse', 'HEAD')
        prepare_daily.prepare(ROOT, target, source, current, allow_archive=True)
        run(sys.executable, 'dev/pipeline/publish/validate.py')
        verify_source(source)
        if remote_day(target) != source:
            raise RuntimeError('검사 중 일일 자료가 변경됐습니다')
        issue = json.loads((ROOT / f'dev/web/data/issues/{target}.json').read_text())
        if issue['status'] == 'draft':
            run(sys.executable, 'dev/pipeline/publish/approve.py', target, '--auto')
        if target < day:
            path = ROOT / f'dev/web/data/issues/{target}.json'
            recovered = json.loads(path.read_text())
            recovered['publicationRecovery'] = {'at': now.isoformat(timespec='seconds'), 'sourceSha': source, 'reason': '발행 누락 호 복구'}
            recovered.setdefault('limits', []).append(f'{target}호는 자동 발행 장애로 {day}에 복구 공개했습니다. 원래 수집 시각과 당시 자료 기준일을 유지했습니다.')
            path.write_text(json.dumps(recovered, ensure_ascii=False, indent=2) + '\n')
        run(sys.executable, 'dev/pipeline/publish/validate.py', '--deploy')
        run('git', 'add', '--', f'dev/web/data/issues/{target}.json', prepare_daily.INDEX, prepare_daily.TRACKERS)
        run('git', 'commit', '-m', f'data(issue): {target}호 자동 복구 발행')
    candidate = run('git', 'rev-parse', 'HEAD')
    latest = json.loads((ROOT / prepare_daily.INDEX).read_text())['latest']
    if latest != day:
        raise RuntimeError('오늘 호 준비를 완료하지 못했습니다')
    if auto_release.fetch_refs() != refs:
        raise RuntimeError('작업 중 운영 브랜치가 변경돼 반영하지 않습니다')
    for target, source in sources.items():
        if remote_day(target) != source:
            raise RuntimeError('반영 전 일일 원본이 변경됐습니다')
    if not auto_release.ancestor(refs['deploy'], candidate):
        raise RuntimeError('기존 운영 이력을 포함하지 않습니다')
    if candidate != refs['main'] or candidate != refs['deploy']:
        run('git', 'push', '--atomic', 'origin', candidate + ':refs/heads/main', candidate + ':refs/heads/deploy')
    auto_release.ensure_deployment(candidate)
    print(json.dumps({'action': '검증한 누락 호 반영·배포 요청', 'dates': sorted(sources), 'latest': latest, 'sha': candidate}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print('자동 발행 실패: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
