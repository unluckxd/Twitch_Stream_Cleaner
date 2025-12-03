/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */
console.log('[TwitchCleaner] Background Service Started.');

const EXTERNAL_TRACKERS = [
  "*://*.scorecardresearch.com/*",
  "*://*.amazon-adsystem.com/*",
  "*://*.imrworldwide.com/*",
  "*://*.google-analytics.com/*",
  "*://*.doubleclick.net/*",
  "*://*.twitch.tv/*ads/v1/ad-request*"
];

const AD_SCRIPTS = [
  "*://static.twitchcdn.net/assets/video-ad*.js*",
  "*://*.twitchcdn.net/*video-ad*.js*",
  "*://*.twitchcdn.net/*commercial*.js*",
  "*://*.twitch.tv/*/commercial*",
  "*://video-edge-*.twitch.tv/*/commercial*",
  "*://supervisor.ext-twitch.tv/*"
];

browser.webRequest.onBeforeRequest.addListener(
  (details) => { return { cancel: true }; },
  { urls: [...EXTERNAL_TRACKERS, ...AD_SCRIPTS] },
  ["blocking"]
);

let IS_ENABLED = true;
let BLOCKED_COUNT = 0;
let LOGS = [];
let BLOCK_TIMES = [];

browser.storage.local.get(['isEnabled', 'blockedCount', 'logs', 'avgBlockTime'], (data) => {
  IS_ENABLED = data.isEnabled !== false;
  BLOCKED_COUNT = data.blockedCount || 0;
  if (data.logs) LOGS = data.logs;
  if (data.avgBlockTime) BLOCK_TIMES = [data.avgBlockTime];
  console.log('[TwitchCleaner] Stats loaded:', { count: BLOCKED_COUNT });
});

function logToUI(text) {
  LOGS.push(text);
  if (LOGS.length > 50) LOGS.shift();
  browser.storage.local.set({ logs: LOGS });
  browser.runtime.sendMessage({ type: 'NEW_LOG', text: text }).catch(() => {});
}

function updateStats(blockTime = 0) {
  BLOCKED_COUNT++;
  if (blockTime > 0) {
    BLOCK_TIMES.push(blockTime);
    if (BLOCK_TIMES.length > 100) BLOCK_TIMES.shift();
  }
  
  const avgTime = BLOCK_TIMES.length > 0 
    ? BLOCK_TIMES.reduce((a, b) => a + b, 0) / BLOCK_TIMES.length 
    : 0;
  
  browser.storage.local.set({ blockedCount: BLOCKED_COUNT, avgBlockTime: parseFloat(avgTime.toFixed(3)) });
  browser.runtime.sendMessage({ 
    type: 'UPDATE_STATS', 
    count: BLOCKED_COUNT, 
    latency: avgTime.toFixed(3) 
  }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_STATE') {
    IS_ENABLED = msg.isEnabled;
    logToUI(IS_ENABLED ? 'Engine Active' : 'Engine Paused');
  }
  if (msg.type === 'CLEAR_LOGS') {
    LOGS = [];
    BLOCKED_COUNT = 0;
    browser.storage.local.set({ logs: [], blockedCount: 0 });
    browser.runtime.sendMessage({ type: 'UPDATE_STATS', count: 0, latency: 0 }).catch(() => {});
  }
  if (msg.type === 'AD_BLOCKED_UI') {
    updateStats(msg.blockTime || 0);
    logToUI('UI Overlay Removed');
  }
});

function processPlaylist(text) {
  if (!IS_ENABLED) return text;
  
  const startTime = performance.now();
  
  if (text.includes('twitch-stitched-ad') && !text.includes('#EXTINF')) {
     console.log('[TwitchCleaner] Dropped ad-only playlist');
     return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-ENDLIST`;
  }

  const lines = text.split('\n');
  const cleanLines = [];
  
  let isAdSegment = false;
  let adBlockedSegments = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXT-X-')) {
      
      if (trimmed.includes('DATERANGE') && (trimmed.includes('stitched-ad') || trimmed.includes('class="twitch-stitched-ad"'))) {
        isAdSegment = true;
        continue;
      }
      
      if (trimmed.includes('PROGRAM-DATE-TIME') && isAdSegment) {
        isAdSegment = false;
      }

      if (isAdSegment && trimmed.includes('DISCONTINUITY')) {
        continue;
      }
      
      if (!isAdSegment) cleanLines.push(line);
      continue;
    }

    if (isAdSegment) {
      if (trimmed.startsWith('#EXTINF') || (!trimmed.startsWith('#') && trimmed.length > 0)) {
         if (trimmed.startsWith('#EXTINF')) adBlockedSegments++;
         continue; 
      }
    }

    if (trimmed.includes('stitched-ad') || 
        trimmed.includes('scte35') || 
        trimmed.includes('/v1/segment/ad/') || 
        trimmed.includes('google_')) {
       continue;
    }

    cleanLines.push(line);
  }

  if (adBlockedSegments > 0) {
    const blockTime = performance.now() - startTime;
    let timeDisplay = blockTime < 0.005 ? "< 0.01" : blockTime.toFixed(3);
    
    updateStats(blockTime);
    logToUI(`Removed ${adBlockedSegments} segments (${timeDisplay}ms)`);
    console.log(`[TwitchCleaner] Cleaned ${adBlockedSegments} segs in ${timeDisplay}ms`);
  }

  return cleanLines.join('\n');
}

browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!details.url.includes('.m3u8')) return {};

    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    let chunks = []; 

    filter.ondata = event => chunks.push(event.data);

    filter.onstop = event => {
      let str = "";
      for (let chunk of chunks) str += decoder.decode(chunk, { stream: true });
      str += decoder.decode();

      try {
        const result = processPlaylist(str);
        if (!result.includes('#EXTM3U')) filter.write(encoder.encode(str));
        else filter.write(encoder.encode(result));
      } catch (e) {
        filter.write(encoder.encode(str));
      }
      filter.close();
    };
    return {};
  },
  { urls: ["*://*.ttvnw.net/*"] },
  ["blocking"]
);