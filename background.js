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
  "*://*.doubleclick.net/*"
];

browser.webRequest.onBeforeRequest.addListener(
  (details) => { return { cancel: true }; },
  { urls: EXTERNAL_TRACKERS },
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
  if (data.avgBlockTime) {
    BLOCK_TIMES = [data.avgBlockTime];
  }
  console.log('[TwitchCleaner] Stats loaded:', { count: BLOCKED_COUNT, enabled: IS_ENABLED });
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
  
  const formattedAvgTime = parseFloat(avgTime.toFixed(3));
  
  browser.storage.local.set({ blockedCount: BLOCKED_COUNT, avgBlockTime: formattedAvgTime });
  browser.runtime.sendMessage({ type: 'UPDATE_STATS', count: BLOCKED_COUNT, avgTime: formattedAvgTime }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_STATE') {
    IS_ENABLED = msg.isEnabled;
    logToUI(IS_ENABLED ? 'System Active' : 'System Paused');
  }

  if (msg.type === 'CLEAR_LOGS') {
    LOGS = [];
    browser.storage.local.set({ logs: [] });
  }
  
  if (msg.type === 'AD_BLOCKED_UI') {
    updateStats(msg.blockTime || 0);
    logToUI('UI ad element removed');
  }
});


function processPlaylist(text) {
  if (!IS_ENABLED) return text;
  
  const startTime = performance.now();
  
  if (text.includes('twitch-stitched-ad') && !text.includes('#EXTINF')) {
    console.log('[TwitchCleaner] 🚫 AD-ONLY playlist detected - returning empty response');
    const blockTime = performance.now() - startTime;
    updateStats(blockTime);
    logToUI('Blocked ad-only playlist');
    
    return `#EXTM3U
    #EXT-X-VERSION:3
    #EXT-X-TARGETDURATION:2
    #EXT-X-MEDIA-SEQUENCE:0
    #EXTINF:2.0,
    #EXT-X-ENDLIST`;
  }
  
  const lines = text.split('\n');
  const cleanLines = [];
  
  let isAdSegment = false;
  let adBlockedSegments = 0;
  let segmentsSkipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTM3U') || 
        trimmed.startsWith('#EXT-X-VERSION') ||
        trimmed.startsWith('#EXT-X-TARGETDURATION') ||
        trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
      cleanLines.push(line);
      continue;
    }

    if (trimmed.includes('#EXT-X-DATERANGE') && trimmed.includes('stitched-ad')) {
      isAdSegment = true;
      adBlockedSegments++;
      continue;
    }

    if (isAdSegment) {
      if (trimmed.includes('#EXT-X-PROGRAM-DATE-TIME') && !trimmed.includes('stitched-ad')) {
        isAdSegment = false;
        cleanLines.push(line);
        continue;
      }
      
      if (trimmed.startsWith('#EXTINF')) {
        segmentsSkipped++;
        i++;
        continue;
      }
      
      continue;
    }

    if (trimmed.includes('SCTE35')) {
       continue;
    }

    cleanLines.push(line);
  }

  if (adBlockedSegments > 0) {
    const blockTime = performance.now() - startTime;
    console.log(`[TwitchCleaner] Blocked ${adBlockedSegments} ad blocks, ${segmentsSkipped} segments in ${blockTime.toFixed(2)}ms`);
    updateStats(blockTime);
    logToUI(`Blocked ${adBlockedSegments} ad blocks (${segmentsSkipped} segments)`);
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
      
      if (str.includes('stitched-ad')) {
        console.log('[TwitchCleaner] FULL AD PLAYLIST:\n' + str);
      }

      try {
        const result = processPlaylist(str);
        filter.write(encoder.encode(result));
      } catch (e) {
        console.error('[TwitchCleaner] Error:', e);
        filter.write(encoder.encode(str));
      }
      filter.close();
    };
    return {};
  },
  { urls: [
      "*://video-weaver.*.hls.ttvnw.net/*",
      "*://*.ttvnw.net/*"
    ] 
  },
  ["blocking"]
);