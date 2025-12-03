/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */
console.log('[TwitchCleaner] Background Service Started.');

const BLOCK_PATTERNS = [
  "*://*.scorecardresearch.com/*",
  "*://*.amazon-adsystem.com/*",
  "*://*.imrworldwide.com/*",
  "*://*.google-analytics.com/*",
  "*://*.doubleclick.net/*",
  
  "*://*.twitch.tv/*ads/v1/ad-request*",
  "*://*.twitch.tv/*/commercial",
  "*://*.twitch.tv/*ad_break*",
  
  "*://static.twitchcdn.net/assets/video-ad*.js*",
  "*://*.twitchcdn.net/*video-ad*.js*",
  "*://supervisor.ext-twitch.tv/*"
];

browser.webRequest.onBeforeRequest.addListener(
  (details) => { 
    if (details.url.includes('.m3u8') || details.url.includes('.ts') || details.url.includes('.mp4')) return {};
    
    return { cancel: true }; 
  },
  { urls: BLOCK_PATTERNS },
  ["blocking"]
);

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.requestBody || !details.requestBody.raw) return {};
    
    try {
      const enc = new TextDecoder("utf-8");
      const body = enc.decode(details.requestBody.raw[0].bytes);
      
      if (body.includes("AdRequest") || 
          body.includes("VideoAd") || 
          body.includes("Commercial") ||
          body.includes("AdBreak")) {
        console.log('[TwitchCleaner] Blocked Ad GQL Request');
        return { cancel: true };
      }
    } catch(e) {}
    
    return {};
  },
  { urls: ["*://gql.twitch.tv/gql"] },
  ["blocking", "requestBody"]
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
     console.log('[TwitchCleaner] Blocked ad-only playlist');
     updateStats(0.1);
     logToUI('Blocked Pre-roll Ad');
     return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-ENDLIST`;
  }

  const lines = text.split('\n');
  const cleanLines = [];
  
  let isAdSegment = false;
  let skipNextSegment = false;
  let adBlockedSegments = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXT-X-')) {
      
      if (trimmed.includes('DATERANGE')) {
         if (trimmed.includes('stitched-ad') || 
             trimmed.includes('class=\"twitch-stitched-ad\"') || 
             trimmed.includes('SCTE35-OUT') ||
             trimmed.includes('SCTE35-IN') ||
             trimmed.includes('SCTE35')) {
            isAdSegment = true;
            adBlockedSegments++;
            continue;
         }
      }
      
      if (trimmed.includes('PROGRAM-DATE-TIME') && isAdSegment) {
        isAdSegment = false;
      }

      if (isAdSegment) continue;
      
      cleanLines.push(line);
      continue;
    }

    if (isAdSegment) {
      if (trimmed.startsWith('#EXTINF')) skipNextSegment = true;
      continue; 
    }

    if (trimmed.includes('stitched-ad') || 
        trimmed.includes('scte35') || 
        trimmed.includes('/v1/segment/ad/') ||
        trimmed.includes('-ad-') ||
        trimmed.includes('google_')) {
       if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim().startsWith('#EXTINF')) {
          cleanLines.pop(); 
          adBlockedSegments++;
       }
       continue;
    }

    if (skipNextSegment && !trimmed.startsWith('#')) {
      skipNextSegment = false;
      continue;
    }

    cleanLines.push(line);
  }

  if (adBlockedSegments > 0) {
    const blockTime = performance.now() - startTime;
    let timeDisplay = blockTime < 0.005 ? "< 0.01" : blockTime.toFixed(3);
    
    console.log(`[TwitchCleaner] Removed ${adBlockedSegments} ad segments in ${timeDisplay}ms`);
    updateStats(blockTime);
    logToUI(`Removed ${adBlockedSegments} segments (${timeDisplay}ms)`);
  }

  let finalClean = cleanLines.join('\n');
  
  finalClean = finalClean.replace(/.*stitched-ad.*/gi, '');
  finalClean = finalClean.replace(/.*SCTE35.*/gi, '');
  finalClean = finalClean.replace(/.*\/v1\/segment\/ad\/.*/gi, '');
  
  finalClean = finalClean.replace(/\n\n+/g, '\n');
  
  return finalClean;
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
      
      const hasAds = str.includes('stitched-ad') || str.includes('SCTE35') || str.includes('twitch-stitched-ad');
      if (hasAds) {
        console.log('[TwitchCleaner] Ads detected in playlist, filtering...');
      }

      try {
        let result = processPlaylist(str);
        
        if (hasAds && result !== str) {
          const segmentCount = (result.match(/#EXTINF/g) || []).length;
          
          if (segmentCount === 0 && hasAds) {
            console.log('[TwitchCleaner] All segments were ads, returning empty playlist');
            result = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n`;
          } else {
            console.log(`[TwitchCleaner] Playlist cleaned: ${segmentCount} segments remaining`);
          }
        }
        
        if (!result.includes('#EXTM3U')) {
          filter.write(encoder.encode(str));
        } else {
          filter.write(encoder.encode(result));
        }
      } catch (e) {
        console.error('[TwitchCleaner] Error processing playlist:', e);
        filter.write(encoder.encode(str));
      }
      filter.close();
    };
    return {};
  },
  { urls: ["*://*.ttvnw.net/*"] },
  ["blocking"]
);