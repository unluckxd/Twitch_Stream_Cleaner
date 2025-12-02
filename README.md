# Twitch Stream Cleaner


> **"Watch streams, not ads."**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Firefox](https://img.shields.io/badge/firefox-v120%2B-orange)
![Manifest](https://img.shields.io/badge/manifest-v2-green)
![Size](https://img.shields.io/badge/size-%3C50kb-brightgreen)

A lightweight, open-source Firefox extension that removes server-side injected ads (SSAI) from Twitch streams by filtering HLS playlists in real-time.

## Features

* **Reliable Filtering:** Uses "Segment Stripping" technique to surgically remove ad segments from the video stream without breaking the player.
* **Privacy First:** Runs 100% locally on your browser. No VPNs, no proxies, no external servers.
* **Zero Config:** Just install and watch. No settings to tweak.
* **Performance:** Optimized regex parsing ensures 0ms latency added to stream loading.
* **UI Cleanup:** Automatically hides "Ad in progress" banners and overlays.

## How It Works

Twitch uses **SSAI (Server-Side Ad Injection)**. This means ads are stitched directly into the video file (`.m3u8` playlist) on the server, making them invisible to traditional ad blockers like uBlock Origin.

This extension uses the powerful **Firefox `webRequest.filterResponseData` API** to:
1.  **Intercept** the `.m3u8` playlist network request before it reaches the video player.
2.  **Scan** the text for ad markers (tags like `stitched-ad`, `SCTE-35`, `DATERANGE`).
3.  **Strip** the ad segments while preserving the stream headers and structure.
4.  **Serve** the clean playlist to the player.

The result? The player never "knows" an ad was supposed to play.

## Installation

### Option 1: Temporary (Developer Mode)
*Best for testing or if you want to modify the code.*

1.  Download or clone this repository.
2.  Open Firefox and type `about:debugging` in the address bar.
3.  Click **"This Firefox"** on the left sidebar.
4.  Click **"Load Temporary Add-on..."**.
5.  Select the `manifest.json` file from the downloaded folder.
6.  *Note: The extension will be removed if you fully close Firefox.*

### Option 2: Permanent (Unsigned)
1.  Zip all files inside the folder (not the folder itself).
2.  Rename the file from `.zip` to `.xpi`.
3.  Drag and drop the `.xpi` file into Firefox Developer Edition (standard Firefox requires signed extensions).

### Official Store
*(Coming soon)*

## Troubleshooting / FAQ

**Q: I see a black screen for a few seconds.**
A: This is normal. When an ad is removed, the player switches to the next live segment. Sometimes this transition causes a brief pause or quality drop (480p). It's better than watching 3 minutes of ads.

**Q: I got "Error #2000" or "Network Error".**
A: Twitch updates their playlist format frequently.
1.  Refresh the page (F5).
2.  If it persists, reload the extension in `about:debugging`.

**Q: Does this work on Chrome?**
A: No. Chrome's Manifest V3 removed the blocking webRequest API required for this method to work effectively. This is a Firefox-exclusive advantage.

## Project Structure

* `manifest.json` - Extension configuration and permissions (Manifest V2).
* `background.js` - The core logic. Intercepts network requests and cleans the HLS playlists.
* `content.js` - Cleans up visual elements (DOM) on the Twitch page.

## Disclaimer

This project is for **educational purposes only**. It demonstrates how HLS stream manipulation works in browser extensions. I am not affiliated with Twitch/Amazon. Blocking ads affects content creators; please consider subscribing to the streamers you watch or using Twitch Turbo.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Copyright (c) 2025 Illia Naumenko