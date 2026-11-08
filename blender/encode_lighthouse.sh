#!/usr/bin/env bash
# 넓은 벽·천장(shell)과 바닥은 얼룩이 덜한 UASTC, 가구는 작은 ETC1S.
# lighthouse_room.py가 구운 PNG를 KTX2로 압축해 assets/에 둔다. 사용: bash blender/encode_lighthouse.sh <구운 PNG 폴더>
set -euo pipefail
SRC="$1"
OUT="$(cd "$(dirname "$0")/.." && pwd)/assets"
TOKTX="${TOKTX:-$LOCALAPPDATA/Programs/KTX-Software/bin/toktx.exe}"
etc1s() { "$TOKTX" --t2 --encode etc1s --clevel 4 --qlevel 255 --genmipmap --assign_oetf srgb --resize "$3x$3" "$OUT/lighthouse-$1.ktx2" "$SRC/$2"; }
uastc() { "$TOKTX" --t2 --encode uastc --uastc_quality 2 --uastc_rdo_l 1.5 --zcmp 19 --genmipmap --assign_oetf srgb --resize "$3x$3" "$OUT/lighthouse-$1.ktx2" "$SRC/$2"; }
uastc shell-desktop shell.png 4096
uastc shell-mobile shell.png 2048
uastc floor-desktop floor.png 2048
uastc floor-mobile floor.png 1024
etc1s props-desktop props.png 4096
etc1s props-mobile props.png 2048
etc1s book-desktop book.png 512
etc1s book-mobile book.png 256
ls -la "$OUT"/lighthouse-*
