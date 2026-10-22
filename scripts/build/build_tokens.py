"""디자인 토큰(design/tokens.json)으로 화면이 읽는 CSS 변수 파일(public/src/styles/tokens.css)을 만든다.

사용: python3 scripts/build/build_tokens.py          # 파일을 새로 쓴다
      python3 scripts/build/build_tokens.py --check  # 지금 파일이 토큰과 같은지만 본다(다르면 종료 코드 1)
다크 테마는 기기 설정(prefers-color-scheme)과 data-theme="dark" 두 경로로 켠다.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "design" / "tokens.json"
OUT = ROOT / "public" / "src" / "styles" / "tokens.css"
# 색·그림자처럼 테마마다 값이 다른 묶음
THEMED = ("color", "shadow")
# 테마와 상관없이 한 값인 묶음
PLAIN = ("spacing", "radius", "border", "size")
ALIAS = re.compile(r"\{([A-Za-z0-9][A-Za-z0-9_.-]*)\}")


def value(token: dict, theme: str, first: str) -> str:
    """테마 값이 없으면 첫 테마 값을 쓰고, {이름} 별칭은 var(--이름)으로 바꾼다."""
    v = token["value"]
    if isinstance(v, dict):
        v = v.get(theme, v[first])
    return ALIAS.sub(r"var(--\1)", str(v))


def block(selector: str, lines: list[str], indent: str = "") -> str:
    body = "".join(f"{indent}  {line}\n" for line in lines)
    return f"{indent}{selector} {{\n{body}{indent}}}\n"


def build(tokens: dict) -> str:
    themes = [t["id"] for t in tokens["color"]["themes"]]
    first = themes[0]
    themed = [t for fam in THEMED for t in tokens.get(fam, {}).get("tokens", [])]

    def theme_lines(theme: str) -> list[str]:
        return [f"--{t['name']}: {value(t, theme, first)};" for t in themed]

    plain = [f"--{t['name']}: {t['value']};" for fam in PLAIN for t in tokens.get(fam, {}).get("tokens", [])]
    plain += [f"--font-{k}: {v};" for k, v in tokens["type"]["families"].items()]

    out = [f"/* {tokens['name']} — generated from design/tokens.json by scripts/build/build_tokens.py. 손으로 고치지 않는다 */\n"]
    out.append(block(":root", theme_lines(first) + plain))
    for theme in themes[1:]:
        lines = theme_lines(theme) + [f"color-scheme: {theme};"]
        out.append(f"@media (prefers-color-scheme: {theme}) {{\n" + block(f':root:not([data-theme="{first}"])', lines, "  ") + "}\n")
        out.append(block(f':root[data-theme="{theme}"]', lines))
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    css = build(json.loads(SRC.read_text(encoding="utf-8")))
    if "--check" in args:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != css:
            print(f"{OUT.relative_to(ROOT)}가 토큰과 다름. python3 scripts/build/build_tokens.py로 다시 만듦")
            return 1
        print("토큰 CSS 최신")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(css, encoding="utf-8")
    print(f"만듦: {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
