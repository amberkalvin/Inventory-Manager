#!/usr/bin/env bash
set -euo pipefail

# One-command macOS IPA builder for Inventory Manager (for AltStore, SideStore, Sideloadly, TrollStore, or Xcode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/InventoryManager/WebApp"
DERIVED="$SCRIPT_DIR/.derivedData"
IPA_STAGE="$SCRIPT_DIR/.ipa_stage"
OUT_IPA="$ROOT_DIR/Inventory_Manager.ipa"

echo "[1/4] Building Inventory Manager web bundle..."
(
  cd "$ROOT_DIR/app"
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build
)

echo "[2/4] Syncing built web bundle into iOS WebApp resource folder..."
rm -rf "$WEBAPP_DIR"
mkdir -p "$WEBAPP_DIR"
cp -R "$ROOT_DIR/app/dist/." "$WEBAPP_DIR/"

if command -v xcodegen >/dev/null 2>&1; then
  echo "[3/4] Generating Xcode project via XcodeGen & compiling Release ARM64 app..."
  (
    cd "$SCRIPT_DIR"
    xcodegen generate
  )
else
  echo "ERROR: xcodegen is required (install via 'brew install xcodegen')." >&2
  exit 1
fi

rm -rf "$DERIVED" "$IPA_STAGE"
xcodebuild \
  -project "$SCRIPT_DIR/InventoryManager.xcodeproj" \
  -scheme "InventoryManager" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

APP_PATH="$DERIVED/Build/Products/Release-iphoneos/InventoryManager.app"
if [ ! -d "$APP_PATH" ]; then
  echo "ERROR: Expected $APP_PATH not found." >&2
  exit 1
fi

echo "[4/4] Ad-hoc signing Mach-O bundle and packaging Payload/InventoryManager.app into $OUT_IPA..."
mkdir -p "$IPA_STAGE/Payload"
cp -R "$APP_PATH" "$IPA_STAGE/Payload/InventoryManager.app"
codesign --force --deep --sign - "$IPA_STAGE/Payload/InventoryManager.app"
(
  cd "$IPA_STAGE"
  zip -qry "$OUT_IPA" Payload
)
rm -rf "$IPA_STAGE"

echo "SUCCESS: Built $OUT_IPA ($(wc -c < "$OUT_IPA" | tr -d ' ') bytes)"
