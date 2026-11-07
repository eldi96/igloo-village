#!/usr/bin/env bash
# igloo_room.py가 구운 PNG를 KTX2(Basis)로 압축해 assets/에 둔다.
# 사용: bash blender/encode_textures.sh <구운 PNG 폴더>
# toktx는 KTX-Software(https://github.com/KhronosGroup/KTX-Software)에 들어 있다.
set -euo pipefail
SRC="$1"
OUT="$(cd "$(dirname "$0")/.." && pwd)/assets"
TOKTX="${TOKTX:-$LOCALAPPDATA/Programs/KTX-Software/bin/toktx.exe}"
# 벽(넓고 그림이 큼)은 ETC1S로 작게, 바닥(달빛 경계가 또렷함)은 UASTC로 깨끗하게 압축한다.
uastc() { # 이름 원본 크기
  "$TOKTX" --t2 --encode uastc --uastc_quality 2 --uastc_rdo_l 1.5 --zcmp 19 \
    --genmipmap --assign_oetf srgb --resize "$3x$3" "$OUT/igloo-$1.ktx2" "$SRC/$2"
}
etc1s() {
  "$TOKTX" --t2 --encode etc1s --clevel 4 --qlevel 255 \
    --genmipmap --assign_oetf srgb --resize "$3x$3" "$OUT/igloo-$1.ktx2" "$SRC/$2"
}
etc1s dome-desktop dome.png 4096
etc1s dome-mobile dome.png 2048
uastc floor-desktop floor.png 2048
uastc floor-mobile floor.png 1024
ls -la "$OUT"/igloo-*
