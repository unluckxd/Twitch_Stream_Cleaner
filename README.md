# Twitch Ad Blocker (Firefox Extension)

A Firefox extension that blocks server-side injected ads on Twitch.tv by intercepting and filtering HLS playlists.

## How It Works

### The Problem
Twitch uses **Server-Side Ad Injection (SSAI)**, which means ads are embedded directly into the video stream at the server level. Traditional domain-based ad blockers cannot block these ads because they come from the same video delivery servers as the actual content.

### The Solution
This extension intercepts HLS playlist files (`.m3u8`) before they reach the Twitch player and removes ad segments from the playlist.

## Ad Detection Logic

The extension identifies ad segments in m3u8 playlists using multiple detection methods:

### 1. **EXT-X-DATERANGE with "stitched-ad-" ID**
```
#EXT-X-DATERANGE:ID="stitched-ad-1234567890"...
```
Twitch marks ad segments with DATERANGE tags containing "stitched-ad-" in the ID.

### 2. **SCTE35 Tags**
```
#EXT-X-SCTE35:CUE="/DA..."
```
SCTE35 tags are industry-standard markers for ad insertion points in video streams.

### 3. **Discontinuity Markers with Ad Indicators**
```
#EXT-X-DISCONTINUITY
#EXT-X-DATERANGE:ID="stitched-ad-..."
#EXTINF:2.0
segment.ts
```
The extension looks ahead after discontinuity markers to detect if they're followed by ad-related tags.

### 4. **Segment Filtering**
When an ad segment is detected, both the `#EXTINF` tag and its corresponding `.ts` URL are removed from the playlist, preventing the player from downloading and playing the ad.

## Installation

### Option 1: Temporary Installation (for testing)
1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on..."
4. Navigate to the extension folder and select `manifest.json`
5. The extension will be loaded (until you restart Firefox)

### Option 2: Permanent Installation (unsigned)
1. Open Firefox and navigate to `about:config`
2. Search for `xpinstall.signatures.required`
3. Set it to `false` (allows unsigned extensions)
4. Create a `.zip` file of all extension files
5. Rename the `.zip` to `.xpi`
6. Drag and drop the `.xpi` file into Firefox

### Option 3: Developer Edition (recommended)
1. Download [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
2. In Developer Edition, unsigned extensions work by default
3. Follow Option 1 or 2 above

## Files Overview

### `manifest.json`
- Defines extension metadata and permissions
- Uses Manifest V2 (required for `webRequestBlocking`)
- Requests permissions for:
  - `webRequest` and `webRequestBlocking`: Intercept network requests
  - Twitch domains: Access to modify Twitch traffic

### `background.js`
- **Core functionality**: Intercepts `.m3u8` playlist requests
- Uses `browser.webRequest.filterResponseData()` to modify responses
- Implements the ad detection and filtering logic
- Runs in the background, independent of any open tabs

### `content.js`
- Runs on Twitch.tv pages
- Hides UI elements like "Ad in progress" overlays
- Removes ad-related DOM elements
- Monitors for dynamically added ad indicators

## Technical Details

### StreamFilter API
The extension uses Firefox's `filterResponseData` API to:
1. Intercept the m3u8 file as it's downloaded
2. Decode the binary stream to text
3. Parse and filter the playlist content
4. Re-encode and send the modified playlist to the player

### Why Manifest V2?
Manifest V3 removes the `webRequestBlocking` permission, making it impossible to modify requests synchronously. This extension requires V2 to intercept and modify playlists in real-time.

## Limitations

- **Firefox only**: Uses Firefox-specific `filterResponseData` API
- **Not foolproof**: Twitch may update ad injection methods
- **May affect stream quality**: In rare cases, filtering might cause brief buffering
- **Ethical considerations**: Consider supporting streamers through other means

## Debugging

To see the extension in action:
1. Open Firefox Developer Tools (F12)
2. Go to the Console tab
3. Filter for messages containing `[Twitch Ad Blocker]`
4. Watch for intercepted playlists and filtered segments

## Troubleshooting

**Ads still showing?**
- Check the browser console for errors
- Verify the extension is enabled in `about:addons`
- Try refreshing the Twitch page
- Twitch may have changed their ad format—check console logs

**Stream not loading?**
- Disable the extension temporarily
- Check if other extensions are conflicting
- Clear browser cache and cookies

## Legal Disclaimer

This extension is for educational purposes. Blocking ads may violate Twitch's Terms of Service. Use at your own risk. Consider supporting content creators through subscriptions or other means.

## License

MIT License - Use and modify freely

## Contributing

Found a bug or improvement? Feel free to submit issues or pull requests.
