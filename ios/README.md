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

## Current implementation

- SwiftUI application shell and navigation
- MapLibre Native map wrapper
- JMA radar time-list client
- Three hours of observation frames and one hour of forecast frames
- Radar timeline selection, loading, error, and retry states
- Unit tests for radar frame generation

The remaining AMeDAS, warnings, typhoon, earthquake, notifications, and disaster-map features are represented in the navigation but still need their native data and presentation layers.
