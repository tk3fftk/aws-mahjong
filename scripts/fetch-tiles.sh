#!/usr/bin/env bash
set -euo pipefail

BASE="https://mu7889yoon.github.io/aws-mahjong/assets/v2.0.1/output"
DEST="public/assets/tiles"

mkdir -p "$DEST"

for s in m p s; do
  for n in 1 2 3 4 5 6 7 8 9; do
    curl -fsSL "$BASE/${n}${s}.svg" -o "$DEST/${n}${s}.svg"
  done
done

for n in 1 2 3 4 5 6 7; do
  curl -fsSL "$BASE/${n}z.svg" -o "$DEST/${n}z.svg"
done

# 右上の牌表記を大きく・濃く・太字に
for f in "$DEST"/*.svg; do
  sed -i '' \
    -e 's/font-size="8"/font-size="14"/' \
    -e 's/fill="#666666"/fill="#1f2937"/' \
    -e 's|text-anchor="end"|text-anchor="end" font-weight="bold"|' \
    "$f"
done

echo "Downloaded 34 tile SVGs to $DEST"
