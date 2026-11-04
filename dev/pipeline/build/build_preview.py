"""운영 소스를 바꾸지 않고 관리자 검증용 정적 지면을 별도 출력한다.

사용: python3 dev/pipeline/build/build_preview.py
접근 인증은 Vercel 프로젝트의 All Deployments 보호가 담당한다. noindex는 인증이 아니다.
"""
from __future__ import annotations

import html
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import urlsplit

import build_feed
import build_pages
import build_security

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "dev/web"
OUTPUT = ROOT / "dist-preview"
ORIGIN = "https://dev.korea-jogan.com"
PRODUCTION = "https://korea-jogan.com"
KIND = "korea-jogan-preview"
MARKER = "preview-build.json"
NOINDEX = "noindex, nofollow, noarchive, nosnippet"
META = re.compile(r'<meta\b[^>]*>', re.I)
LDJSON = re.compile(r'(<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>)(.*?)(</script>)', re.I | re.S)
IDENTITY = re.compile(r"[0-9a-f]{40}\Z", re.I)
BANNER_CSS = """.kj-preview{padding:12px max(20px,calc((100% - 1540px)/2));border-bottom:2px solid var(--brand,#0047a0);background:var(--brand-soft,#e7eef8);color:var(--ink,#141414);font:500 13px/1.7 var(--font-sans,sans-serif);overflow-wrap:anywhere}.kj-preview strong{margin-right:12px}.kj-preview code{font:inherit;font-variant-numeric:tabular-nums}.kj-preview span{margin-right:12px}@media print{.kj-preview{border:2px solid currentColor}}
"""


def preview_origin(value: str) -> str:
    parsed = urlsplit(value)
    host = parsed.hostname or ""
    allowed = host == "dev.korea-jogan.com" or bool(re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app", host, re.I))
    if parsed.scheme != "https" or not allowed or parsed.username or parsed.password or parsed.port or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("개발 주소는 HTTPS 개발 도메인 또는 Vercel 별칭의 원점이어야 합니다")
    return parsed.scheme + "://" + host


def attributes(tag: str) -> dict[str, str]:
    return {name.lower(): html.unescape(value) for name, _quote, value in re.findall(r'([\w:-]+)\s*=\s*(["\'])(.*?)\2', tag, re.S)}


def disable_measurement(page: str) -> str:
    def replace(match):
        attrs = attributes(match[0])
        name = attrs.get("name", "").lower()
        if name in ("jg-ga4", "jg-goatcounter"):
            return f'<meta name="{name}" content="">'
        if name in ("google-site-verification", "naver-site-verification"):
            return ""
        return match[0]
    return META.sub(replace, page)


def own_url(value: str, origin: str) -> str:
    if value == PRODUCTION or value.startswith(PRODUCTION + "/") or value.startswith(PRODUCTION + "#") or value.startswith(PRODUCTION + "?"):
        return origin + value[len(PRODUCTION):]
    return value


def rewrite_graph(value, origin: str):
    if isinstance(value, dict):
        return {key: rewrite_graph(item, origin) for key, item in value.items()}
    if isinstance(value, list):
        return [rewrite_graph(item, origin) for item in value]
    return own_url(value, origin) if isinstance(value, str) else value


def secure_preview(page: str) -> str:
    secured = build_security.secure_page(page)
    policy = build_security.policy(page)
    policy = re.sub(r"script-src [^;]+", lambda _m: "script-src " + " ".join(["'self'", *inline_hashes(page)]), policy)
    for directive, values in (("connect-src", "'self'"), ("img-src", "'self' data:"), ("frame-src", "'none'")):
        policy = re.sub(r"\b" + directive + r" [^;]+", directive + " " + values, policy)
    return build_security.CSP_META.sub(lambda _m: '\n<meta http-equiv="Content-Security-Policy" content="' + html.escape(policy, quote=True) + '">', secured, count=1)


def inline_hashes(page: str) -> list[str]:
    scripts = build_security.Scripts()
    scripts.feed(page)
    return scripts.hashes


def transform_html(page: str, origin: str, commit: str | None, branch: str) -> str:
    page = disable_measurement(page)
    page = META.sub(lambda match: '<meta name="robots" content="' + NOINDEX + '">' if attributes(match[0]).get("name", "").lower() == "robots" else match[0], page)
    if not re.search(r'<meta\b[^>]*name=["\']robots["\']', page, re.I):
        page = page.replace("</head>", '<meta name="robots" content="' + NOINDEX + '">\n</head>', 1)
    page = re.sub(r'((?:href|src|content)\s*=\s*["\'])https://korea-jogan\.com(?=[/?#"\'])', lambda match: match[1] + origin, page)
    page = LDJSON.sub(lambda match: match[1] + json.dumps(rewrite_graph(json.loads(match[2]), origin), ensure_ascii=False, indent=2).replace("<", "\\u003c") + match[3], page)
    if 'href="/preview.css"' not in page:
        page = page.replace("</head>", '<link rel="stylesheet" href="/preview.css">\n</head>', 1)
    if 'id="previewBanner"' not in page:
        identity = html.escape(commit if commit else "로컬 작업본 · 커밋 미지정")
        banner = '<aside id="previewBanner" class="kj-preview" role="note" aria-label="개발 검증 환경"><strong>개발 검증 환경</strong><span>브랜치 ' + html.escape(branch) + '</span><span>커밋 <code>' + identity + '</code></span><span>운영 지면과 구분해 확인해 주세요.</span></aside>'
        page = re.sub(r'(<body\b[^>]*>)', lambda match: match[1] + "\n" + banner, page, count=1)
    return secure_preview(page)


def admin_notice(origin: str) -> str:
    return '''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>개발 환경의 관리자 안내 | 대한민국 조간</title><meta name="robots" content="''' + NOINDEX + '''"><link rel="canonical" href="''' + html.escape(origin) + '''/admin/"><link rel="stylesheet" href="/src/styles/tokens.css"><link rel="stylesheet" href="/src/styles/kj.css"><link rel="stylesheet" href="/src/styles/discovery.css"></head><body class="discovery-page"><main id="main" class="discovery-main"><h1>개발 환경에서는 운영 통계를 연결하지 않습니다</h1><p>이곳은 지면과 기능을 검증하는 환경입니다. 운영 GA4의 인증·조회 스크립트는 포함하지 않습니다.</p><p><a href="/">개발 지면으로 돌아가기</a></p></main></body></html>'''


def owned_output(path: Path) -> bool:
    if not path.exists() or not any(path.iterdir()):
        return True
    try:
        return json.loads((path / MARKER).read_text(encoding="utf-8")).get("kind") == KIND
    except (OSError, ValueError, AttributeError):
        return False


def build(source: Path = PUBLIC, output: Path = OUTPUT, origin: str = ORIGIN, commit: str | None = None, branch: str = "local") -> dict:
    source, output = Path(source).resolve(), Path(output).resolve()
    origin = preview_origin(origin)
    if commit is not None and not IDENTITY.fullmatch(commit):
        raise ValueError("개발 배포 커밋은 40자리 Git SHA여야 합니다")
    if not branch or len(branch) > 120 or any(ord(char) < 32 for char in branch):
        raise ValueError("개발 브랜치 이름이 올바르지 않습니다")
    if not source.is_dir() or source == output or source in output.parents or output in source.parents:
        raise ValueError("운영 원본과 개발 출력은 서로 포함하지 않는 별도 디렉터리여야 합니다")
    if output.exists() and (not output.is_dir() or not owned_output(output)):
        raise ValueError("다른 파일이 있는 디렉터리를 개발 출력으로 덮어쓰지 않습니다")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".jogan-preview-", dir=output.parent))
    saved = (build_pages.PUBLIC, build_pages.ISSUES, build_pages.SITE, build_feed.PUBLIC, build_feed.ISSUES, build_feed.SITE)
    try:
        shutil.copytree(source, temporary, dirs_exist_ok=True)
        admin = temporary / "admin"
        if admin.exists():
            shutil.rmtree(admin)
        for file in temporary.glob("*.txt"):
            if file.stem == file.read_text(encoding="utf-8").strip():
                file.unlink()
        (temporary / "CNAME").unlink(missing_ok=True)
        home = temporary / "index.html"
        home.write_text(disable_measurement(home.read_text(encoding="utf-8")), encoding="utf-8")
        issues = temporary / "data/issues"
        build_pages.PUBLIC, build_pages.ISSUES, build_pages.SITE = temporary, issues, origin + "/"
        build_feed.PUBLIC, build_feed.ISSUES, build_feed.SITE = temporary, issues, origin + "/"
        published = build_pages.published()
        if not published:
            raise ValueError("개발 지면을 만들 공개 호가 없습니다")
        index = build_pages.published_index(published)
        (issues / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for file in issues.glob("*.json"):
            if file.stem != "index" and file.stem not in index["issues"]:
                file.unlink()
        build_pages.build()
        (temporary / "feed.xml").write_text(build_feed.build(), encoding="utf-8")
        (temporary / "sitemap.xml").write_text(build_feed.build_sitemap(), encoding="utf-8")
        admin.mkdir()
        (admin / "index.html").write_text(admin_notice(origin), encoding="utf-8")
        for page in temporary.rglob("*.html"):
            page.write_text(transform_html(page.read_text(encoding="utf-8"), origin, commit, branch), encoding="utf-8")
        (temporary / "preview.css").write_text(BANNER_CSS, encoding="utf-8")
        (temporary / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
        manifest = temporary / "manifest.webmanifest"
        if manifest.exists():
            data = json.loads(manifest.read_text(encoding="utf-8"))
            data.update(name="대한민국 조간 개발 검증", short_name="조간 dev")
            manifest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        metadata = {"kind": KIND, "origin": origin, "commit": commit, "branch": branch, "latest": index["latest"], "issues": len(published)}
        (temporary / MARKER).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        temporary.rename(output)
        return metadata
    finally:
        build_pages.PUBLIC, build_pages.ISSUES, build_pages.SITE, build_feed.PUBLIC, build_feed.ISSUES, build_feed.SITE = saved
        if temporary.exists():
            shutil.rmtree(temporary)


def main() -> int:
    try:
        commit = os.environ.get("VERCEL_GIT_COMMIT_SHA") or None
        branch = os.environ.get("VERCEL_GIT_COMMIT_REF") or "local"
        if os.environ.get("VERCEL") == "1" and (not commit or branch != "dev"):
            raise ValueError("Vercel 개발 배포에는 dev 브랜치와 정확한 커밋 SHA가 필요합니다")
        result = build(origin=os.environ.get("KJ_PREVIEW_ORIGIN", ORIGIN), commit=commit, branch=branch)
    except (OSError, ValueError) as exc:
        print(f"개발 빌드 실패: {exc}")
        return 1
    print(f"개발 빌드 완료: {result['origin']} · {result['branch']} · {result['commit'] or '로컬 작업본'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
