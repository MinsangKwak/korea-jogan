#!/usr/bin/env bash
set -euo pipefail
base="${FIRST_VISIT_BASE:-9bb53e54471b43316bce3364c6f37e1648198bda}"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
export QA_OUTPUT="${RUNNER_TEMP:-/tmp}/edition-first-visit"
mkdir -p "$temp/before" "$temp/after" "$QA_OUTPUT"
git archive "$base" backend-python frontend-vanilla-js | tar -x -C "$temp/before"
cp -R backend-python frontend-vanilla-js "$temp/after"
for phase in before after; do
  python3 "$temp/$phase/backend-python/pipeline/build/build_pages.py"
done
python3 - "$temp/after" <<'PY'
import sys
from pathlib import Path
root=Path(sys.argv[1])
sys.path.insert(0,str(root/'backend-python/pipeline/build'))
from build_edition_assets import package_editions
package_editions(root/'frontend-vanilla-js')
PY
cat > "$temp/no-cjk.conf" <<XML
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts/truetype/dejavu</dir>
  <dir>/usr/share/fonts/truetype/liberation2</dir>
  <dir>/usr/share/fonts/truetype/liberation</dir>
  <cachedir>$temp/latin-font-cache</cachedir>
</fontconfig>
XML
if [ -n "$(FONTCONFIG_FILE="$temp/no-cjk.conf" fc-list :lang=ko family)" ]; then
  echo 'The isolated fontconfig profile still exposes a Korean font.' >&2
  exit 1
fi
FONTCONFIG_FILE="$temp/no-cjk.conf" QA_NO_CJK=1 node project/tests/browser/measure-edition.cjs after "$temp/after/frontend-vanilla-js" desktop 1
sudo apt-get -qq update
sudo apt-get -qq install --no-install-recommends -y fonts-noto-cjk
fc-cache -f >/dev/null
fc-match -f 'Installed Korean family: %{family}\n' 'sans-serif:lang=ko'
if ! fc-match -f '%{family}' 'sans-serif:lang=ko' | grep -q Noto; then
  echo 'The Korean system font was not selected by fontconfig.' >&2
  exit 1
fi
for iteration in 1 2; do
  for device in desktop mobile; do
    for phase in before after; do
      node project/tests/browser/measure-edition.cjs "$phase" "$temp/$phase/frontend-vanilla-js" "$device" "$iteration"
    done
  done
done
