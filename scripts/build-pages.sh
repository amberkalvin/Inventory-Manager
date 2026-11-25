#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[1/2] Building Inventory Manager PWA..."
(
  cd "$ROOT_DIR/app"
  npm run build
)

echo "[2/2] Assembling GitHub Pages bundle in _site/ ..."
rm -rf "$ROOT_DIR/_site"
mkdir -p "$ROOT_DIR/_site/app"
cp -R "$ROOT_DIR/landing/." "$ROOT_DIR/_site/"
cp -R "$ROOT_DIR/app/dist/." "$ROOT_DIR/_site/app/"
touch "$ROOT_DIR/_site/.nojekyll"
echo "Done! Preview locally with: python3 -m http.server 4173 --directory _site"
