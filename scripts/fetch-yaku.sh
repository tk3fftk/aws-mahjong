#!/usr/bin/env bash
set -euo pipefail

URL="https://mu7889yoon.github.io/aws-mahjong/assets/v2.0.1/yaku.json"
DEST="src/data/yaku.json"

mkdir -p "$(dirname "$DEST")"
curl -fsSL "$URL" -o "$DEST"

echo "Downloaded yaku.json to $DEST"
