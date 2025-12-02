# Twitch Stream Cleaner

<p align="center">
  <img src="logo.png" width="150" height="150" alt="StreamCleaner Logo">
</p>

<p align="center">
  <strong>"Watch streams, not ads."</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/firefox-v120%2B-orange" alt="Firefox">
  <img src="https://img.shields.io/badge/manifest-v2-green" alt="Manifest V2">
  <img src="https://img.shields.io/badge/size-%3C100kb-brightgreen" alt="Lightweight">
</p>

---

**Twitch Stream Cleaner** is a specialized, lightweight Firefox extension engineered to block Twitch ads without compromising stream latency or privacy. It features a hybrid blocking engine and a real-time engineering dashboard to monitor performance.

## Key Features

* **Hybrid Blocking Engine:** Combines **SSAI Segment Stripping** (removing ads from the HLS playlist) with **Request Blocking** (preventing client-side ad modules from loading).
* **Engineering Dashboard:** A built-in dark-mode UI monitoring real-time metrics:
    * **Segments Stripped:** Exact count of ad segments removed.
    * **Avg. Latency:** Processing overhead (typically < 0.1ms).
    * **Last Intervention:** Time since the last ad block.
* **Privacy & Telemetry Protection:** Automatically blocks trackers from ScorecardResearch, Amazon AdSystem, and Comscore.
* **Zero Latency:** Optimized parsing logic ensures no delay is added to the stream buffering.
* **UI Cleanup:** Automatically hides "Ad in progress" overlays, purple screens, and banner containers.

## How It Works

Twitch uses complex ad injection methods. This extension employs a multi-layered approach:

1.  **Network Layer (Background):** Intercepts `.m3u8` playlists via the `webRequest.filterResponseData` API. It parses the stream, identifies ad markers (`stitched-ad`, `DATERANGE`), and removes them while preserving the stream integrity (headers, discontinuities).
2.  **Script Blocking:** Prevents the loading of external scripts (like `client-side-video-ads.js`), forcing the player to fallback to the main stream, which we have already cleaned.
3.  **Content Injection:** A lightweight agent injects a script into the page context to patch `JSON.parse`, disabling player flags like `adsEnabled` and `stitched`.

## Installation

### Official Firefox Add-on (Recommended)

**[Install from Firefox Add-ons](https://addons.mozilla.org/ru/firefox/addon/twitch-stream-cleaner/)** ← **Official Mozilla Store**

1. Click the link above to open the Firefox Add-ons page
2. Click **"Add to Firefox"**
3. Confirm the installation
4. Done! Extension is now active

*Official Mozilla distribution - automatically updated*

---

### Alternative: Build From Source

#### For Firefox Developer Edition

```powershell
# Clone repository
git clone https://github.com/unluckxd/Twitch_Stream_Cleaner.git
cd Twitch_Stream_Cleaner

# Build unsigned XPI file
.\build.ps1

# For permanent installation, submit to Mozilla for signing
```

## Troubleshooting / FAQ

**Q: I see a black screen or buffering for a split second.**
A: This is normal. When an ad segment is removed, the player skips the "hole" in the timeline to jump to the live segment. A brief quality drop or pause is expected during this transition.

**Q: "Error #2000" or Network Error.**
A: Twitch updates their playlist structure frequently.
1.  Refresh the page (F5).
2.  If it persists, click the extension icon and check the "Avg. Latency". If it's high, reload the extension in `about:debugging`.

**Q: Does this work on Chrome?**
A: **No.** Chrome's Manifest V3 specification removed the blocking capabilities of the `webRequest` API required for this method to work effectively. This tool leverages Firefox's superior API capabilities.

## Project Structure

* `manifest.json` - Extension configuration and permissions (Manifest V2).
* `background.js` - The core engine. Handles network interception, HLS parsing, and statistics calculation.
* `content.js` - UI cleaner. Handles DOM manipulation, CSS injection, and page-context script patching.
* `popup.html` / `popup.css` / `popup.js` - The Engineering Dashboard interface.

## Disclaimer

This project is for **educational and research purposes only**. It demonstrates browser extension capabilities for HLS stream manipulation and network traffic analysis. I am not affiliated with Twitch, Amazon, or any associated companies.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Copyright (c) 2025 Illia Naumenko