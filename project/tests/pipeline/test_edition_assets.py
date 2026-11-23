"""발행 지면의 리소스 순서·주소·캐시 버전을 검사한다."""
import re
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend-python/pipeline/build"))
from build_edition_assets import package_editions

MODULE = '<script type="module" src="src/reader.js"></script>'
EDITION = f"""<link rel="stylesheet" href="src/css/base.css">
<link rel="stylesheet" href="src/css/print.css" media="print">
<script src="src/first.js" defer></script>
<script src="src/second.js" defer></script>
{MODULE}
<script src="src/last.js" defer></script>"""


class EditionAssetTest(unittest.TestCase):
    def test_shared_versions_preserve_order_media_and_module_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "assets").mkdir()
            (root / "src/css").mkdir(parents=True)
            css_source = (
                "@font-face { font-family: Hangul; src: url('/assets/fonts/hangul.woff2?v=1') format('woff2'); font-display: swap }\n"
                ".map { background: url('../../assets/map.webp') }"
            )
            (root / "src/css/base.css").write_text(css_source)
            print_css = root / "src/css/print.css"
            print_css.write_text(".map { display: none }")
            (root / "src/first.js").write_text("window.order = [1]")
            (root / "src/second.js").write_text("window.order.push(2)")
            unchanged = root / "admin.html"
            unchanged.write_text(EDITION)

            def pack():
                home = root / "index.html"
                dated = root / "2026-11-23.html"
                home.write_text("<title>홈</title>" + EDITION)
                dated.write_text("<title>지난 호</title>" + EDITION)
                package_editions(root)
                page = home.read_text()
                self.assertEqual(page.removeprefix("<title>홈</title>"), dated.read_text().removeprefix("<title>지난 호</title>"))
                self.assertEqual(unchanged.read_text(), EDITION)
                return page, re.findall(r'(/assets/[^"]+\?v=[a-f0-9]+)', page)

            page, urls = pack()
            self.assertEqual(len(urls), 2)
            css_path, js_path = [root / url.split("?", 1)[0].lstrip("/") for url in urls]
            css = css_path.read_text()
            self.assertIn("url('/assets/fonts/hangul.woff2?v=1') format('woff2')", css)
            self.assertIn('url("/assets/map.webp")', css)
            self.assertRegex(css, r'@media print\s*\{\s*\.map \{ display: none \}\s*\}')
            self.assertLess(css.index("background:"), css.index("@media print"))
            self.assertLess(js_path.read_text().index("window.order = "), js_path.read_text().index("window.order.push"))
            self.assertLess(page.index(urls[1]), page.index(MODULE))
            self.assertLess(page.index(MODULE), page.index('src="src/last.js" defer'))
            self.assertEqual(pack()[1], urls)

            print_css.write_text(".map { display: block }")
            _, updated = pack()
            self.assertNotEqual(updated[0], urls[0])
            self.assertEqual(updated[1], urls[1])
