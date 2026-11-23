"""준비된 Chrome을 사용하고 다운로드가 필요할 때만 제한적으로 재시도한다."""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import time


def choose_browser(which=shutil.which, run=subprocess.run, pause=time.sleep) -> str:
    for name in ('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'):
        path = which(name)
        if path and run([path, '--version'], capture_output=True).returncode == 0:
            return path
    last_error = None
    for attempt in range(3):
        try:
            run(['npx', 'playwright', 'install', '--with-deps', '--only-shell', 'chromium'], check=True, timeout=180)
            return ''
        except (subprocess.SubprocessError, OSError) as error:
            last_error = error
            if attempt < 2:
                pause(10 * (attempt + 1))
    raise RuntimeError('Chromium 설치를 세 번 시도했지만 완료하지 못했습니다') from last_error


def main() -> None:
    path = choose_browser()
    if path:
        print('검사 브라우저: ' + path)
        if output := os.environ.get('GITHUB_ENV'):
            with open(output, 'a', encoding='utf-8') as stream:
                stream.write('CHROMIUM_PATH=' + path + '\n')
    else:
        print('Playwright Chromium Headless Shell 설치 완료')


if __name__ == '__main__':
    main()
