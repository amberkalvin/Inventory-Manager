# Inventory Manager

Real-time, mobile-first vehicle inventory tracking for dealership and reconditioning teams on **iPhone, Android, and Desktop**.

Built to replace slow mobile spreadsheets with one-tap status updates, instant search, free NHTSA VIN auto-decoding, automatic per-user change history, offline lot caching, and direct `.APK` / `.IPA` downloads from GitHub Pages.

## Distribution & Access (GitHub Pages Hub)

Once published to GitHub with Pages enabled (`Settings → Pages → Source: GitHub Actions`), your team gets a single launch hub:

- **Launch Web App (PWA — Zero Install):** Open directly on iPhone Safari (**Share → Add to Home Screen**), Android Chrome (**Install App**), or any desktop browser.
- **Direct Android `.APK` Download:** Automatically compiled, signed, and attached to GitHub Releases via `.github/workflows/build-android-apk.yml`.
- **Direct iOS `.IPA` Download:** Automatically compiled as a universal ARM64 `.ipa` on macOS via `.github/workflows/build-ios-ipa.yml` for AltStore, SideStore, Sideloadly, or TrollStore.

## Core Features

- **Tappable Status Summary Bar & Archive:** Live counters for **Active Lot**, **Incoming**, **Minor Repairs**, **Major Repairs**, and **Offsite**, plus a dedicated **Archive** where vehicles automatically move when marked **Frontline Ready**.
- **Instant Search:** Filter immediately by Stock #, last 6 of VIN, Year/Make/Model, Offsite Location, or Repair Notes.
- **One-Tap Status Progression:** Move any unit to the next stage straight from the card or jump to any status via the quick dropdown.
- **NHTSA VIN Auto-Decode:** Enter a 17-character VIN in the Quick-Add modal or Detail Drawer to auto-fill Year, Make, Model, and Trim.
- **Per-User Field-Level Activity History:** Every change made to any vehicle field (status, offsite location, mileage, cost, date sent, notes, VIN/specs, photo, archive/restore) is logged automatically with exact before/after values, user name, and timestamp.
- **Google Sheets Live Sync + Shop PIN:** Protected by a 4-digit shop PIN (remembered per device) and synced across all team phones via Google Apps Script (`GET` on load and every 10 seconds; `POST` on every add, edit, move, or delete).
- **One-Click CSV Backup & Optional Import:** Export your full lot inventory as a `.csv` (with native iOS/Android Share Sheets inside `.APK`/`.IPA`) or import vehicles from a CSV anytime.

## Project Layout

| Directory | Purpose |
| :--- | :--- |
| `landing/` | GitHub Pages Landing Hub (`index.html` + icons) |
| `app/` | React + Vite + TypeScript + Tailwind CSS + `vite-plugin-pwa` web app |
| `android_app/` | Native Android WebView Gradle wrapper (`build_apk.sh`) |
| `ios_app/` | Native Swift 5 `WKWebView` XcodeGen wrapper (`project.yml`, `build_ipa.sh`) |
| `.github/workflows/` | Automated GitHub Pages, Android `.APK`, and iOS `.IPA` release pipelines |

## Local Development

```bash
cd app
npm install
npm run dev
```

## Building Native Packages Locally

- **Android `.APK`:** `./android_app/build_apk.sh`
- **iOS `.IPA` (macOS with Xcode + XcodeGen):** `./ios_app/build_ipa.sh`
