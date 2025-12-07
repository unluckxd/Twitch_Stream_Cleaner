$version = (Get-Content manifest.json | ConvertFrom-Json).version
$filename = "twitch_stream_cleaner-$version.xpi"

Write-Host "Building Twitch Stream Cleaner v$version..." -ForegroundColor Green

if (Test-Path $filename) {
    Remove-Item $filename
    Write-Host "Removed old build" -ForegroundColor Yellow
}

$files = @(
    "manifest.json",
    "background.js",
    "content.js",
    "stream-fetcher.js",
    "sw-relay.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "icon-48.png",
    "icon-96.png",
    "LICENSE",
    "README.md"
)

Compress-Archive -Path $files -DestinationPath "$filename.zip" -Force
Rename-Item "$filename.zip" $filename

Write-Host "Created $filename" -ForegroundColor Green
$sizeKB = [math]::Round((Get-Item $filename).Length / 1KB, 2)
Write-Host "File size: $sizeKB KB" -ForegroundColor Cyan
