$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
    "project.yml",
    "MeteoScope/App/MeteoScopeApp.swift",
    "MeteoScope/Support/MeteoGlass.swift",
    "MeteoScope/Support/PrivacyInfo.xcprivacy",
    "MeteoScope/Views/FeatureDashboardCards.swift",
    "MeteoScopeTests/FeatureDataTests.swift"
)

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $root $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file is missing: $relativePath"
    }
}

$privacyManifest = Join-Path $root "MeteoScope/Support/PrivacyInfo.xcprivacy"
$null = [xml](Get-Content -LiteralPath $privacyManifest -Raw -Encoding UTF8)

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
