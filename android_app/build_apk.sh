#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$SCRIPT_DIR/app/src/main/assets/webapp"
KEYSTORE="$SCRIPT_DIR/release.keystore"
OUT_APK="$ROOT_DIR/Inventory_Manager.apk"

echo "[1/4] Building Inventory Manager web bundle..."
(
  cd "$ROOT_DIR/app"
  npm ci --silent 2>/dev/null || npm install --silent
  npm run build
)

echo "[2/4] Syncing built web bundle into Android assets..."
rm -rf "$ASSETS_DIR"
mkdir -p "$ASSETS_DIR"
cp -R "$ROOT_DIR/app/dist/." "$ASSETS_DIR/"

if [ ! -f "$KEYSTORE" ]; then
  echo "[3/4] Generating release signing keystore..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "${ANDROID_KEY_ALIAS:-inventorymanager}" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "${ANDROID_KEYSTORE_PASSWORD:-inventorymanager}" \
    -keypass "${ANDROID_KEY_PASSWORD:-inventorymanager}" \
    -dname "CN=Inventory Manager, OU=Mobile, O=Inventory Manager, L=Local, ST=US, C=US"
else
  echo "[3/4] Using existing release signing keystore."
fi

echo "[4/4] Building signed Release APK with Gradle..."
(
  cd "$SCRIPT_DIR"
  gradle assembleRelease --no-daemon
)

BUILT_APK="$SCRIPT_DIR/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$BUILT_APK" ]; then
  echo "ERROR: Expected $BUILT_APK not found." >&2
  exit 1
fi

cp "$BUILT_APK" "$OUT_APK"
echo "SUCCESS: Built $OUT_APK ($(wc -c < "$OUT_APK" | tr -d ' ') bytes)"
