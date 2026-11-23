"""운영·미리보기의 완성된 조간 지면에서만 같은 순서로 읽는 CSS와 JS 요청을 묶는다."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import re
import shutil
from urllib.parse import urljoin

STYLE = re.compile(r'<link rel="stylesheet" href="(?P<path>src/[\w./-]+\.css)"(?: media="(?P<media>[^"]+)")?>')
SCRIPT = re.compile(r'<script src="(?P<path>src/[\w./-]+\.js)" defer></script>')
CSS_URL = re.compile(r"""url\(\s*(['"]?)([^)'"]+)\1\s*\)""")
BETWEEN = re.compile(r'(?:\s|<!--(?:(?!-->)[\s\S])*-->)*')


def adjacent_groups(template: str, pattern: re.Pattern):
    group = []
    for match in pattern.finditer(template):
        if group and not BETWEEN.fullmatch(template[group[-1].end():match.start()]):
            if len(group) > 1:
                yield group
            group = []
        group.append(match)
    if len(group) > 1:
        yield group


def bundle_groups(public: Path, template: str, pattern: re.Pattern, extension: str) -> list[tuple[str, str]]:
    changes = []
    for number, group in enumerate(adjacent_groups(template, pattern), start=1):
        fragments = []
        for match in group:
            relative = match['path']
            code = (public / relative).read_text(encoding='utf-8')
            if extension == 'css':
                def resolve_url(ref):
                    value = ref[2].strip()
                    if value.startswith(('/', '#', 'data:')):
                        return ref[0]
                    return f'url("{urljoin("/" + relative, value)}")'
                code = CSS_URL.sub(resolve_url, code)
                if match['media']:
                    code = '@media ' + match['media'] + ' {\n' + code + '\n}'
            fragments.append(code)
        separator = '\n;\n' if extension == 'js' else '\n'
        body = separator.join(fragments).encode('utf-8')
        filename = f'edition-{number}.{extension}'
        dest = public / 'assets' / filename
        dest.write_bytes(body)
        url = '/assets/' + filename + '?v=' + hashlib.sha256(body).hexdigest()[:16]
        link = f'<script defer src="{url}"></script>' if extension == 'js' else f'<link rel="stylesheet" href="{url}">'
        changes.append((template[group[0].start():group[-1].end()], link))
    return changes


def package_editions(public: Path) -> None:
    home = public / 'index.html'
    template = home.read_text(encoding='utf-8')
    changes = bundle_groups(public, template, STYLE, 'css') + bundle_groups(public, template, SCRIPT, 'js')
    for path in [home, *public.glob('20??-??-??.html')]:
        page = path.read_text(encoding='utf-8')
        for original, bundled in changes:
            if page.count(original) != 1:
                raise ValueError(f'{path.name}: 조간의 리소스 순서가 홈과 다릅니다')
            page = page.replace(original, bundled, 1)
        path.write_text(page, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    shutil.copytree(args.source, args.output)
    package_editions(args.output)
