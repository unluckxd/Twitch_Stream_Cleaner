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

function analyzeSegmentDurations(segments, hasDiscontinuity) {
  if (segments.length < 3) return { suspiciousGroups: [], avgDuration: 0, stdDev: 0 };
  
  const durations = segments.map(s => s.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  
  const suspiciousGroups = [];
  let currentGroup = [segments[0]];
  
  for (let i = 1; i < segments.length; i++) {
    const prevDuration = segments[i - 1].duration;
    const currDuration = segments[i].duration;
    
    const threshold = hasDiscontinuity ? 0.2 : 0.1;
    const minDuration = hasDiscontinuity ? 2 : 5;
    
    if (Math.abs(currDuration - prevDuration) < threshold && currDuration > avgDuration + stdDev * 0.5) {
      currentGroup.push(segments[i]);
    } else {
      if (currentGroup.length >= 2 && currentGroup[0].duration >= minDuration) {
        suspiciousGroups.push([...currentGroup]);
      }
      currentGroup = [segments[i]];
    }
  }
  
  if (currentGroup.length >= 2 && currentGroup[0].duration >= (hasDiscontinuity ? 2 : 5)) {
    suspiciousGroups.push(currentGroup);
  }
  
  return { suspiciousGroups, avgDuration, stdDev };
}

function calculateAdProbability(segment, context) {
  let score = 0;
  
  if (segment.duration >= 29 && segment.duration <= 31) score += 0.45;
  else if (segment.duration >= 14 && segment.duration <= 16) score += 0.35;
  else if (segment.duration >= 5 && segment.duration <= 7) score += 0.25;
  
  if (segment.url.includes('stitched-ad') || segment.url.includes('/ad/')) score += 0.6;
  if (segment.url.includes('scte35') || segment.url.includes('google_')) score += 0.5;
  if (segment.url.includes('/commercial') || segment.url.includes('ad_break')) score += 0.5;
  
  if (context.hasAdMarkers) score += 0.35;
  if (context.hasDiscontinuity) score += 0.2;
  if (context.inSuspiciousGroup) score += 0.3;
  
  if (context.avgDuration > 0 && context.stdDev > 0) {
    const deviation = Math.abs(segment.duration - context.avgDuration) / (context.stdDev + 0.01);
    if (deviation > 2) score += 0.2;
    else if (deviation > 1.5) score += 0.1;
  }
  
  return Math.min(score, 1.0);
}

function processPlaylist(text) {
  if (!IS_ENABLED) return text;
  
  const startTime = performance.now();
  
  if (text.includes('twitch-stitched-ad') && !text.includes('#EXTINF')) {
     console.log('[TwitchCleaner] Dropped ad-only playlist');
     updateStats(0.1);
     logToUI('Blocked Pre-roll Ad');
     return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:1\n#EXT-X-ENDLIST`;
  }

  const lines = text.split('\n');
  const cleanLines = [];
  
  let isAdSegment = false;
  let adBlockedSegments = 0;
  
  const segments = [];
  let tempDuration = 0;
  let hasAdMarkers = text.includes('stitched-ad') || text.includes('SCTE35');
  let hasDiscontinuity = text.includes('#EXT-X-DISCONTINUITY');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:([\d.]+)/);
      if (match) tempDuration = parseFloat(match[1]);
    } else if (line && !line.startsWith('#') && tempDuration > 0) {
      segments.push({ duration: tempDuration, url: line, lineIndex: i });
      tempDuration = 0;
    }
  }
  
  const analysis = analyzeSegmentDurations(segments, hasDiscontinuity);
  const suspiciousSet = new Set();
  
  analysis.suspiciousGroups.forEach(group => {
    group.forEach(seg => suspiciousSet.add(seg.lineIndex));
  });
  
  console.log(`[TwitchCleaner] Analysis: ${segments.length} segments, ${analysis.suspiciousGroups.length} suspicious groups, avg=${analysis.avgDuration?.toFixed(2)}s, σ=${analysis.stdDev?.toFixed(2)}s${hasDiscontinuity ? ' [DISCONTINUITY]' : ''}${hasAdMarkers ? ' [AD_MARKERS]' : ''}`);
  
  isAdSegment = false;
  tempDuration = 0;
  let currentUrl = '';

  isAdSegment = false;
  tempDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('#EXTM3U') || trimmed.startsWith('#EXT-X-')) {
      
      if (trimmed.includes('DATERANGE')) {
         if (trimmed.includes('stitched-ad') || 
             trimmed.includes('class="twitch-stitched-ad"') || 
             trimmed.includes('SCTE35')) {
            isAdSegment = true;
            continue;
         }
      }
      
      if (trimmed.includes('PROGRAM-DATE-TIME') && isAdSegment) {
        isAdSegment = false;
      }
      
      if (trimmed === '#EXT-X-DISCONTINUITY' && hasAdMarkers) {
        console.log('[TwitchCleaner] DISCONTINUITY marker detected - potential ad boundary');
      }

      if (isAdSegment) continue;
      
      if (trimmed.startsWith('#EXTINF:')) {
        const match = trimmed.match(/#EXTINF:([\d.]+)/);
        if (match) tempDuration = parseFloat(match[1]);
      }
      
      if (!isAdSegment) cleanLines.push(line);
      continue;
    }

    if (isAdSegment) {
      if (trimmed.startsWith('#EXTINF')) adBlockedSegments++;
      continue; 
    }

    if (trimmed && !trimmed.startsWith('#')) {
      const segment = { duration: tempDuration, url: trimmed };
      const context = {
        hasAdMarkers: hasAdMarkers,
        hasDiscontinuity: hasDiscontinuity,
        inSuspiciousGroup: suspiciousSet.has(i),
        avgDuration: analysis.avgDuration,
        stdDev: analysis.stdDev
      };
      
      const adProbability = calculateAdProbability(segment, context);
      
      if (adProbability >= 0.5) {
        if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].includes('#EXTINF')) {
          cleanLines.pop();
        }
        adBlockedSegments++;
        console.log(`[TwitchCleaner] BLOCKED: P(ad)=${adProbability.toFixed(2)} dur=${tempDuration}s url=${trimmed.substring(0, 60)}...`);
        tempDuration = 0;
        continue;
      } else if (adProbability > 0.3) {
        console.log(`[TwitchCleaner] Suspicious: P(ad)=${adProbability.toFixed(2)} dur=${tempDuration}s`);
      }
      
      tempDuration = 0;
    }

    if (trimmed.includes('stitched-ad') || 
        trimmed.includes('scte35') || 
        trimmed.includes('/v1/segment/ad/') || 
        trimmed.includes('google_')) {
       if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].startsWith('#EXTINF')) {
          cleanLines.pop(); 
          adBlockedSegments++;
       }
       continue;
    }

    cleanLines.push(line);
  }

  if (adBlockedSegments > 0) {
    const blockTime = performance.now() - startTime;
    let timeDisplay = blockTime < 0.005 ? "< 0.01" : blockTime.toFixed(3);
    
    updateStats(blockTime);
    logToUI(`Removed ${adBlockedSegments} segments (${timeDisplay}ms)`);
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