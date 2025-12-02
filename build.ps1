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
    "popup.html",
    "popup.css",
    "popup.js",
    "LICENSE",
    "README.md"
)

# Create temporary directory for proper structure
$tempDir = "temp_build"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null
New-Item -ItemType Directory -Path "$tempDir\icons" | Out-Null

# Copy files maintaining structure
foreach ($file in $files) {
    Copy-Item $file "$tempDir\$file"
}
Copy-Item "icons\icon-48.png" "$tempDir\icons\icon-48.png"
Copy-Item "icons\icon-96.png" "$tempDir\icons\icon-96.png"

# Create archive from temp directory
Compress-Archive -Path "$tempDir\*" -DestinationPath "$filename.zip" -Force
Rename-Item "$filename.zip" $filename

# Cleanup
Remove-Item $tempDir -Recurse -Force

Write-Host "Created $filename" -ForegroundColor Green
$sizeKB = [math]::Round((Get-Item $filename).Length / 1KB, 2)
Write-Host "File size: $sizeKB KB" -ForegroundColor Cyan
