$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
    "project.yml",
    "MeteoScope/App/MeteoScopeApp.swift",
    "MeteoScope/Support/MeteoGlass.swift",
    "MeteoScope/Support/PrivacyInfo.xcprivacy",
    "MeteoScope/Views/FeatureDashboardCards.swift",
    "MeteoScopeTests/FeatureDataTests.swift",
    "MeteoScopeTests/PushNotificationServiceTests.swift",
    "MeteoScopeTests/WeatherFreshnessTests.swift",
    "Docs/APP_STORE_PREPARATION.md",
    "Docs/APNS_BACKEND_PLAN.md"
)

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $relativePath"
    }
}

$privacyManifest = Join-Path $root "MeteoScope/Support/PrivacyInfo.xcprivacy"
$privacyXML = [xml](Get-Content -LiteralPath $privacyManifest -Raw -Encoding UTF8)
$privacyText = $privacyXML.OuterXml
foreach ($requiredPrivacyKey in @(
    "NSPrivacyTracking",
    "NSPrivacyCollectedDataTypeDeviceID",
    "NSPrivacyCollectedDataTypeCoarseLocation",
    "NSPrivacyCollectedDataTypePurposeAppFunctionality"
)) {
    if (-not $privacyText.Contains($requiredPrivacyKey)) {
        throw "Privacy manifest key is missing: $requiredPrivacyKey"
    }
}

$repositoryRoot = Split-Path -Parent $root
if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot "public"))) {
    $repositoryRoot = Join-Path $root "Backend"
}
foreach ($legalPage in @("privacy.html", "terms.html", "support.html", "map-style.json")) {
    $path = Join-Path $repositoryRoot "public/$legalPage"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Public policy asset is missing: public/$legalPage"
    }
}

$endpoints = Get-Content -LiteralPath (Join-Path $root "MeteoScope/Services/MeteoScopeEndpoints.swift") -Raw -Encoding UTF8
foreach ($stablePath in @("privacy.html", "terms.html", "support.html", "map-style.json")) {
    if (-not $endpoints.Contains($stablePath)) {
        throw "Stable public URL is not configured in iOS endpoints: $stablePath"
    }
}

$freshnessSources = @(
    Get-Content -LiteralPath (Join-Path $root "MeteoScope/State/WeatherAppModel.swift") -Raw -Encoding UTF8
    Get-Content -LiteralPath (Join-Path $root "MeteoScope/Views/FeatureDashboardCards.swift") -Raw -Encoding UTF8
) -join "`n"
foreach ($freshnessMarker in @("lastSuccessfulFetchAt", "latestFetchError", "DataFreshnessLabel")) {
    if (-not $freshnessSources.Contains($freshnessMarker)) {
        throw "Freshness distinction is missing: $freshnessMarker"
    }
}

$swiftFiles = Get-ChildItem -LiteralPath (Join-Path $root "MeteoScope") -Filter "*.swift" -Recurse
$swiftFiles += Get-ChildItem -LiteralPath (Join-Path $root "MeteoScopeTests") -Filter "*.swift" -Recurse

$mergeMarkers = $swiftFiles | Select-String -Pattern "^(<<<<<<<|=======|>>>>>>>)"
if ($mergeMarkers) {
    throw "Merge conflict markers remain in Swift sources."
}

foreach ($file in $swiftFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    $ifCount = ([regex]::Matches($content, "(?m)^\s*#if\b")).Count
    $endifCount = ([regex]::Matches($content, "(?m)^\s*#endif\b")).Count
    if ($ifCount -ne $endifCount) {
        throw "Unbalanced compiler conditions: $($file.FullName)"
    }
}

$declarationMatches = $swiftFiles | Select-String -Pattern "^(?:@\w+\s+)*(?:(?:public|internal|private|fileprivate)\s+)?(?:final\s+)?(?:struct|class|enum|actor)\s+([A-Za-z_][A-Za-z0-9_]*)"
$duplicateTypes = $declarationMatches |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Group-Object |
    Where-Object Count -gt 1

if ($duplicateTypes) {
    $names = ($duplicateTypes | ForEach-Object Name) -join ", "
    throw "Duplicate type declarations found: $names"
}

Write-Output "Windows source validation passed ($($swiftFiles.Count) Swift files)."
Write-Output "Xcode build, tests, previews, signing, and Simulator QA still require macOS or GitHub Actions."
