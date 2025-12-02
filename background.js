/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */

console.log('[TwitchCleaner] Background script STARTED.');

function processPlaylist(text) {
  const lines = text.split('\n');
  const cleanLines = [];
  
  let isAdSegment = false;

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
      console.log('[TwitchCleaner] Начался блок рекламы (DATERANGE)');
      continue;
    }

    if (isAdSegment && trimmed.includes('#EXT-X-DISCONTINUITY')) {
      continue; 
    }

    if (trimmed.startsWith('#EXTINF') && isAdSegment) {
        i++; 
        continue;
    }

    if (!trimmed.startsWith('#') && isAdSegment) {
        continue;
    }

    if (trimmed.includes('#EXT-X-PROGRAM-DATE-TIME')) {
      if (isAdSegment) {
          console.log('[TwitchCleaner] Конец блока рекламы');
          isAdSegment = false;
      }
    }

    if (trimmed.includes('SCTE35')) {
       continue;
    }

    if (!isAdSegment) {
      cleanLines.push(line);
    }
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

    filter.ondata = event => {
      chunks.push(event.data);
    };

    filter.onstop = event => {
      let str = "";
      for (let chunk of chunks) {
        str += decoder.decode(chunk, { stream: true });
      }
      str += decoder.decode();

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
  { 
    urls: [
      "*://video-weaver.*.hls.ttvnw.net/*",
      "*://*.ttvnw.net/*"
    ] 
  },
  ["blocking"]
);