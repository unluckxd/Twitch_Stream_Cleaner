/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */

function filterAdSegments(playlistContent) {
  const lines = playlistContent.split('\n');
  const filteredLines = [];
  
  let inAdBlock = false;
  let skipNextSegment = false;
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    if (trimmedLine.includes('#EXT-X-DATERANGE') && trimmedLine.includes('stitched-ad-')) {
      inAdBlock = true;
      i++;
      continue;
    }
    
    if (trimmedLine.includes('#EXT-X-SCTE35')) {
      skipNextSegment = true;
      i++;
      continue;
    }
    
    if (trimmedLine.includes('#EXT-X-DISCONTINUITY')) {
      let j = i + 1;
      let isAdDiscontinuity = false;
      while (j < Math.min(i + 10, lines.length)) {
        const nextLine = lines[j].trim();
        if (nextLine.includes('stitched-ad-') || 
            nextLine.includes('#EXT-X-SCTE35') ||
            nextLine.includes('TWITCH-AD-')) {
          isAdDiscontinuity = true;
          break;
        }
        if (nextLine.startsWith('#EXTINF')) break;
        j++;
      }
      
      if (isAdDiscontinuity) {
        inAdBlock = true;
      } else {
        filteredLines.push(line);
      }
      i++;
      continue;
    }
    
    if (trimmedLine.startsWith('#EXTINF')) {
      if (inAdBlock || skipNextSegment) {
        i += 2; 
        skipNextSegment = false;
        
        if (i < lines.length && !lines[i].trim().startsWith('#EXTINF')) {
          inAdBlock = false;
        }
        continue;
      } else {
        filteredLines.push(line);
        i++;
        if (i < lines.length) {
          filteredLines.push(lines[i]);
          i++;
        }
        continue;
      }
    }
    
    if (trimmedLine.includes('#EXT-X-PROGRAM-DATE-TIME') && inAdBlock) {
      inAdBlock = false;
    }
    
    if (!inAdBlock) {
      filteredLines.push(line);
    }
    
    i++;
  }
  
  return filteredLines.join('\n');
}

browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!details.url.includes('.m3u8')) {
      return {};
    }
    
    const filter = browser.webRequest.filterResponseData(details.requestId);
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    
    let responseData = [];

    filter.ondata = event => {
      responseData.push(event.data);
    };

    filter.onstop = event => {
      let str = "";
      for (let buffer of responseData) {
        str += decoder.decode(buffer, { stream: true });
      }
      str += decoder.decode();

      const filteredPlaylist = filterAdSegments(str);
      
      filter.write(encoder.encode(filteredPlaylist));
      filter.close();
    };
    
    return {};
  },
  {
    urls: ["*://*.ttvnw.net/*"]
  },
  ["blocking"]
);