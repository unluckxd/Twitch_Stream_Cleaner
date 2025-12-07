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
  <img src="https://img.shields.io/badge/version-2.3.3-blue" alt="Version">
</p>

---

Twitch Stream Cleaner is a lightweight Firefox extension that blocks Twitch ads without adding latency or leaking telemetry. It combines playlist sanitizing, proactive stream fetching, and configuration patching so the player never receives ad metadata in the first place.

## Highlights

- **Multi-layer defense**
  - *Layer 1* – intercept every `.m3u8`, remove ad markers based on `#EXT-X-DATERANGE`, `SCTE35`, and Twitch-specific tags.
  - *Layer 2* – `stream-fetcher.js` rewrites `playerType`, fetches alternative manifests in parallel, and feeds the first clean playlist to the player.
  - *Layer 3* – the content script patches GraphQL requests/responses, disables flags like `adsEnabled`, `csai`, `prerollEnabled`, and keeps the DOM ad-free with UI Armor.
- **Relay Service Worker** caches both "dirty" and "clean" PlaybackAccessToken responses. The user receives the sanitized token instantly while Twitch still gets the original payload for accounting.
- **Ad Stall Guardian** detects when the player freezes on "ad starting soon", temporarily speeds up `<video>`, and forces a player-type/token reset.
- **Timeshift buffer** keeps the last 30 clean segments in memory. If Twitch returns an ad-only manifest, the player is reseeded with fresh content immediately.
- **Engineering dashboard** in the popup shows stripped segments, average parsing latency (<0.1 ms), and recent log events.
- **Privacy-first**: ScorecardResearch, Amazon AdSystem, Comscore, and other trackers are blocked outright.

## Real-world effectiveness

Benchmarks show roughly **90–95%** of ad slots (pre + mid roll) never reach the player. The remaining ~5–10% occur when Twitch rapidly rotates SSAI endpoints and only serves ad manifests. Even then the timeshift buffer and stall guardian prevent hard hangs, so at worst you might see a one-second quality dip instead of a full commercial.

## Architecture overview

### Layer 1 — Background + Timeshift
- Uses `webRequest.filterResponseData` to inspect every playlist.
- A tiny state machine removes segments with `stitched-ad`, `SCTE35`, `CUE-OUT`, and coordinates `#EXTINF` pairs.
- Clean segments are cached (30-entry rolling window) so playlists can be rebuilt when Twitch supplies ad-only data.

### Layer 2 — Stream Fetcher + Stall Guard
- The injected script intercepts `fetch`/XHR and, before the original request completes, launches concurrent queries to `usher.ttvnw.net` with multiple `playerType` values.
- Successful player types move to the front of the priority list; failed ones are skipped for a short period to save time.
- A watchdog monitors `<video>` progress. If playback stays frozen, it temporarily bumps playbackRate to 16× and broadcasts a recovery message so caches reset.

### Layer 3 — Config Patcher + Relay SW + UI Armor
- Rewrites GraphQL calls on the fly, stamping stable `Device-ID` / `Client-Session-Id` headers.
- Response bodies go through a sanitizer that forces ad flags to `false`/`true` as needed before the player ever parses them.
- The Relay Service Worker returns cached clean tokens instantly while replaying the dirty tokens to Twitch in the background.
- DOM overlays (purple screen, celebrations, extension slots, disclosure cards) are removed every second.

### Extras
- Side ad/analytics domains are hard-blocked.
- `.ts` requests containing `-ad-` are cancelled at the network level.
- Stats/logs live in `browser.storage.local` and surface in the popup UI.

## What gets blocked

| Component | Status |
| --- | --- |
| Pre-roll | ✅ Alternative player types + relay SW |
| Mid-roll | ✅ Playlist filtering + instant reseed |
| Purple screen / overlays | ✅ UI Armor |
| Client ad scripts | ✅ `BLOCK_PATTERNS` in `background.js` |
| Tracking (ScorecardResearch, Amazon, Comscore) | ✅ |
| Twitch extension overlays | ✅ Removed via CSS + DOM sweep |

> Even if Twitch delivers a playlist full of ads, the timeshift buffer feeds clean segments so the player never renders the commercial.

## Installation

### Firefox Add-ons (recommended)
1. Visit the [official listing](https://addons.mozilla.org/ru/firefox/addon/twitch-stream-cleaner/).
2. Click **Add to Firefox** and confirm.
3. Updates arrive automatically via AMO.

### Build from source

```powershell
git clone https://github.com/unluckxd/Twitch_Stream_Cleaner.git
cd Twitch_Stream_Cleaner
./build.ps1   # produces twitch_stream_cleaner-<version>.xpi
```

Test temporarily: `about:debugging` → *This Firefox* → *Load Temporary Add-on…* → pick `manifest.json`.

## Dashboard & logs

- **Segments** – total ad segments removed this session.
- **Avg latency** – mean playlist processing time (<0.1 ms under load).
- **Logs** – recent operations (UI cleanup, ad removal, toggles).

## FAQ

**I see a black pause / Error #2000.** Refresh (F5) or clear cache (`Ctrl+Shift+Delete`). Twitch frequently tweaks SSAI endpoints; a new token usually fixes it.

**An ad slipped through.** Twitch might be experimenting. Switch stream quality or wait a second—Stall Guardian + Stream Fetcher usually grab a clean feed automatically.

**Does this work in Chrome?** No. Manifest V3 removed blocking `webRequest`, so this approach only works in Firefox/Waterfox/LibreWolf where MV2 remains available.

**How much advertising is blocked?** Roughly 90–95% depending on the channel and how aggressively Twitch enforces SSAI at that moment.

## Project structure

```
manifest.json        # permissions and entry points
background.js        # HLS filtering, stats, timeshift cache
content.js           # UI Armor, config patcher, SW registration
stream-fetcher.js    # alternative tokens + stall recovery
sw-relay.js          # PlaybackAccessToken cache
popup.*              # dashboard UI
build.ps1            # XPI packaging script
```

Console highlights:
- `[TwitchCleaner] Background Service Started`
- `[TwitchCleaner] Removed N ad segments ...`
- `[StreamFetcher] Preemptively using clean stream (...)`
- `[StreamFetcher] Force recovery: caches cleared`

## Development

- Pure JS + Firefox APIs, zero external dependencies.
- `build.ps1` packages every required script into the XPI.
- When `stream-fetcher.js` or `content.js` changes, bump the version in `manifest.json` so Firefox reloads the update.

## Disclaimer

This project is for research/educational purposes. I am not affiliated with Twitch or Amazon. Please support your favorite creators via subs or Twitch Turbo—this extension simply showcases what’s possible with Manifest V2.

## License

MIT License — see [LICENSE](LICENSE).

---
© 2025 Illia Naumenko