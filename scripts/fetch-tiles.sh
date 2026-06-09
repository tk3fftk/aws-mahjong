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

echo "Downloaded 34 tile SVGs to $DEST"
