# MeteoScope for iOS

This directory contains the native iOS companion to the existing MeteoScope web app in `C:\Weather-viewer`.
The web app remains independent and is not replaced by this project.

## Requirements

- macOS with a current Xcode release
- XcodeGen 2.45 or newer
- iOS 17 or newer deployment target

## Generate and run on macOS

```sh
brew install xcodegen
xcodegen generate
open MeteoScope.xcodeproj
```

Choose the `MeteoScope` scheme and an iPhone Simulator. Package resolution downloads MapLibre Native the first time the project is opened.

For Windows-only development, the included GitHub Actions workflow can generate the project and run its tests on a hosted macOS runner. It is manual/PR-triggered and does not deploy or submit the app.

Before committing on Windows, run the source-only checks:

```powershell
powershell -ExecutionPolicy Bypass -File .\Scripts\Validate-IOSSource.ps1
```

## Current implementation

- SwiftUI application shell and navigation
- MapLibre Native map wrapper
- JMA radar time-list client
- Three hours of observation frames and one hour of forecast frames
- Radar timeline selection, loading, error, and retry states
- AMeDAS live observations with temperature, rain, wind, humidity, pressure, and snow rankings
- Current humidity high/low rankings and pressure current/today high/low rankings
- Per-station same-day time-series charts for all AMeDAS metrics
- Nationwide warning/advisory summary decoded from JMA warning JSON
- Early-warning probability summaries decoded from JMA probability JSON
- Active designated-river flood forecasts decoded from JMA XML feeds
- Current typhoon details decoded from JMA forecast/specification JSON
- Warning, early-warning, and designated-river areas rendered on the native map
- Typhoon forecast tracks, probability circles, and available strong-wind/storm areas rendered on the native map
- Recent earthquake summaries, intensity-area polygons, and observed intensity stations rendered from JMA XML
- Local disaster-map PDF/JPEG/PNG import, offline storage, positioned markers, notes, editing, and deletion
- iOS 26 Liquid Glass surfaces with iOS 17/18 Material fallbacks
- Notification permission, APNs device registration, municipality selection, and Cloudflare sender preparation
- Deterministic SwiftUI previews for AMeDAS, each warning section, typhoon, earthquake, and disaster-map marker states
- 1024px AppIcon asset plus a reproducible Windows icon-generation script
- Privacy manifest and unit tests for feature data decoding, ranking, and map-overlay construction

APNs credentials, D1 migration, signed-device end-to-end validation, real SwiftUI Preview/Simulator visual QA, and App Store submission remain Mac/Apple-account work. See `Docs/MAC_HANDOFF.md` and `Docs/APNS_BACKEND_PLAN.md`.
