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
  <img src="https://img.shields.io/badge/version-2.2.0-blue" alt="Version">
</p>

---

**Twitch Stream Cleaner** is a specialized, lightweight Firefox extension engineered to block Twitch ads without compromising stream latency or privacy. It features a three-layer protection system and a real-time engineering dashboard to monitor performance.

## Key Features

* **Three-Layer Protection System:**
    * **Layer 1 - HLS Playlist Cleaner:** Intercepts and strips ad segments from `.m3u8` playlists before they reach the player
    * **Layer 2 - Alternative Stream Fetcher:** Automatically switches to ad-free streams using alternative player types when ads are detected
    * **Layer 3 - Config Patcher:** Disables ad-related flags in Twitch's player configuration via `JSON.parse` patching
* **Engineering Dashboard:** A built-in dark-mode UI monitoring real-time metrics:
    * **Segments Stripped:** Exact count of ad segments removed
    * **Avg. Latency:** Processing overhead (typically < 0.1ms)
    * **Last Intervention:** Time since the last ad block
* **UI Armor:** Automatically removes ad overlays, banners, purple screens, and extension slots from the DOM
* **Privacy & Telemetry Protection:** Blocks trackers from ScorecardResearch, Amazon AdSystem, and Comscore
* **Zero Latency:** Optimized parsing logic ensures no delay is added to stream buffering

## How It Works

Twitch uses sophisticated Server-Side Ad Insertion (SSAI) to inject ads directly into the stream. This extension employs a comprehensive three-layer defense system:

### Layer 1: Background Network Interception
The background script intercepts all `.m3u8` playlist requests using the `webRequest.filterResponseData` API. It parses the HLS manifest in real-time, identifies ad markers (`#EXT-X-DATERANGE` with `SCTE35-OUT`, `stitched-ad` tags), and surgically removes them while preserving stream integrity (headers, discontinuity sequences, and timing).

### Layer 2: Alternative Stream Fetcher
A page-context injection script (`stream-fetcher.js`) monitors all `.m3u8` requests via `fetch` interception. When ads are detected in the primary stream:
1. Fetches Twitch's GraphQL API to obtain alternative access tokens using different `playerType` values (`embed`, `frontpage`, `site`)
2. Tests each alternative stream URL until finding one without ad markers
3. Returns the clean playlist to the player seamlessly

This leverages Twitch's own API to access ad-free streams that are normally reserved for different contexts.

### Layer 3: Configuration Patching & UI Armor
The content script operates on two fronts:
1. **Config Patcher:** Patches `JSON.parse` globally to neutralize ad-related flags (`adsEnabled`, `stitched`, `csai`, `prerollEnabled`, `midrollEnabled`) before they reach the player
2. **UI Armor:** Continuously scans and removes ad-related DOM elements (overlays, banners, celebration animations, extension slots) every second using optimized CSS selectors

### Request Blocking
The background script also blocks requests to:
- Client-side ad scripts (`client-side-video-ads.js`)
- Analytics trackers (ScorecardResearch, Amazon AdSystem, Comscore)
- Third-party ad networks

This multi-layered approach ensures maximum coverage against Twitch's evolving ad delivery systems.

## What Gets Blocked

✅ **Mid-roll ads** - Advertisements shown during stream playback  
✅ **Pre-roll ads** - Ads shown when opening a stream (via alternative stream fetching)  
✅ **UI overlays** - "Ad in progress" banners, purple screens, and celebration animations  
✅ **Ad scripts** - Client-side video ad modules and trackers  
✅ **Analytics** - ScorecardResearch, Amazon AdSystem, Comscore  
✅ **Extension slots** - Twitch extension panels and overlays

> **Note:** While the extension blocks most pre-roll ads using alternative player types, Twitch may occasionally serve ads that bypass all detection methods. In such cases, the HLS cleaner will still remove them from the playlist, though you may experience a brief quality drop during the transition.

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
```

#### Load Temporary Add-on for Development

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Navigate to the extension folder and select `manifest.json`
5. The extension will be loaded until Firefox restarts

*Note: Temporary add-ons are removed on browser restart. For permanent installation, use the official Firefox Add-ons store.*

## Troubleshooting / FAQ

**Q: I see a black screen or buffering for a split second.**  
A: This is normal behavior. When an ad segment is detected and removed, the player automatically skips to the next live segment. A brief quality drop or pause may occur during this transition, especially when switching between alternative streams.

**Q: "Error #2000" or Network Error.**  
A: Twitch frequently updates their playlist structure and API.
1. Refresh the page (F5)
2. Clear browser cache (`Ctrl+Shift+Delete`)
3. If it persists, check the extension dashboard - if "Avg. Latency" is abnormally high, reload the extension in `about:debugging`

**Q: The extension dashboard shows "0 segments" but I see ads.**  
A: The Alternative Stream Fetcher (`stream-fetcher.js`) may have found a clean stream before the background script could strip segments. Check the browser console (`F12`) for `[StreamFetcher] ✅ Found clean stream` messages - this means Layer 2 is working correctly.

**Q: Does this work on Chrome?**  
A: **No.** Chrome's Manifest V3 removed the blocking capabilities of the `webRequest` API required for real-time HLS manipulation. This extension leverages Firefox's superior Manifest V2 API, which allows synchronous network interception and response modification.

**Q: Will this extension be updated for Manifest V3?**  
A: Firefox continues to support Manifest V2 indefinitely. When/if a full migration is required, core functionality may need to be redesigned using declarativeNetRequest, which has significant limitations for this use case.

## Project Structure

* `manifest.json` - Extension configuration and permissions (Manifest V2)
* `background.js` - Layer 1: Network interception, HLS parsing, segment stripping, and statistics tracking
* `stream-fetcher.js` - Layer 2: Alternative Stream Fetcher using Twitch GraphQL API and `fetch` interception
* `content.js` - Layer 3: Config patcher and UI armor (DOM manipulation, CSS injection)
* `popup.html` / `popup.css` / `popup.js` - Engineering Dashboard interface with real-time metrics

### Console Output
When the extension is active, you'll see these messages in the browser console:
- `[TwitchCleaner] Config Patcher Active` - Configuration patching initialized
- `[TwitchCleaner] UI Armor Active` - DOM cleaner is running
- `[StreamFetcher] Initialized` - Alternative Stream Fetcher is ready
- `[StreamFetcher] 🚨 Ads detected, searching clean stream...` - Found ads, switching to backup
- `[StreamFetcher] ✅ Found clean stream (embed)` - Successfully switched to ad-free stream

## Disclaimer

This project is for **educational and research purposes only**. It demonstrates browser extension capabilities for HLS stream manipulation and network traffic analysis. I am not affiliated with Twitch, Amazon, or any associated companies.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
Copyright (c) 2025 Illia Naumenko