"""정적 HTML의 CSP를 실제 인라인 스크립트 해시와 함께 만든다.

GitHub Pages에서는 응답 헤더를 설정할 수 없어 HTML 메타 정책을 쓴다.
frame-ancestors·보고·HSTS처럼 응답 헤더가 필요한 기능을 흉내 내지 않는다.
"""
from __future__ import annotations

import base64
import hashlib
import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

PUBLIC = Path(__file__).resolve().parents[3] / "dev" / "web"
CSP_META = re.compile(r'\s*<meta\b(?=[^>]*http-equiv=["\']Content-Security-Policy["\'])[^>]*>', re.I)
REFERRER_META = re.compile(r'\s*<meta\b(?=[^>]*name=["\']referrer["\'])[^>]*>', re.I)


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.hashes: list[str] = []
        self.script: list[str] | None = None
        self.goatcounter = ""

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script":
            kind = (attributes.get("type") or "").lower()
            if "src" not in attributes and kind in ("", "module", "text/javascript", "application/javascript"):
                self.script = []
        if tag == "meta" and attributes.get("name") == "jg-goatcounter":
            endpoint = urlsplit(attributes.get("content") or "")
            if endpoint.scheme == "https" and endpoint.hostname and re.fullmatch(r"[A-Za-z0-9.-]+", endpoint.hostname) and not endpoint.username and not endpoint.password:
                self.goatcounter = endpoint.scheme + "://" + endpoint.netloc

    def handle_data(self, data):
        if self.script is not None:
            self.script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.script is not None:
            value = base64.b64encode(hashlib.sha256("".join(self.script).encode("utf-8")).digest()).decode("ascii")
            token = f"'sha256-{value}'"
            if token not in self.hashes:
                self.hashes.append(token)
            self.script = None


def policy(page: str, admin: bool = False) -> str:
    scripts = Scripts()
    scripts.feed(page)
    script_sources = ["'self'", *scripts.hashes]
    styles = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]
    images = ["'self'", "data:"]
    connections = ["'self'"]
    frames = ["'none'"]
    forms = ["'self'"]
    if admin:
        script_sources += ["https://accounts.google.com/gsi/client"]
        styles += ["https://accounts.google.com/gsi/style"]
        connections += ["https://accounts.google.com/gsi/", "https://analyticsdata.googleapis.com", "https://oauth2.googleapis.com/revoke"]
        frames = ["https://accounts.google.com/gsi/"]
        forms += ["https://oauth2.googleapis.com/revoke"]
    else:
        script_sources += ["https://www.googletagmanager.com", "https://gc.zgo.at"]
        images += ["https://*.google-analytics.com", "https://*.googletagmanager.com", "https://*.google.com", "https://*.google.co.kr", "https://*.g.doubleclick.net"]
        connections += ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://*.google.com", "https://*.google.co.kr", "https://*.g.doubleclick.net", "https://pagead2.googlesyndication.com"]
        frames = ["https://www.googletagmanager.com"]
        if scripts.goatcounter:
            connections.append(scripts.goatcounter)
            images.append(scripts.goatcounter)
    directives = {
        "default-src": ["'self'"],
        "base-uri": ["'none'"],
        "object-src": ["'none'"],
        "script-src": script_sources,
        "script-src-attr": ["'none'"],
        "style-src": styles,
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": images,
        "connect-src": connections,
        "frame-src": frames,
        "form-action": forms,
        "manifest-src": ["'self'"],
        "worker-src": ["'none'"],
    }
    return "; ".join(name + " " + " ".join(values) for name, values in directives.items())


def secure_page(page: str, admin: bool = False) -> str:
    page = CSP_META.sub("", page)
    page = REFERRER_META.sub("", page)
    tags = ('\n<meta http-equiv="Content-Security-Policy" content="' + html.escape(policy(page, admin), quote=True) + '">'
            '\n<meta name="referrer" content="strict-origin-when-cross-origin">')
    charset = re.search(r'<meta\s+charset=["\']utf-8["\']\s*/?>', page, re.I)
    if not charset:
        raise ValueError("CSP 앞에 UTF-8 선언이 필요합니다")
    return page[:charset.end()] + tags + page[charset.end():]


def build(public: Path = PUBLIC) -> list[Path]:
    written = []
    for path in sorted(public.rglob("*.html")):
        page = path.read_text(encoding="utf-8")
        path.write_text(secure_page(page, "admin" in path.relative_to(public).parts), encoding="utf-8")
        written.append(path)
    return written


if __name__ == "__main__":
    print(f"HTML {len(build())}개의 CSP 해시와 참조 정책을 갱신했습니다.")
    sys.exit(0)
