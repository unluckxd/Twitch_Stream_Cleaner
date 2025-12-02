/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */

const CSS_HIDE = `
  .ad-slot-overlay, .ad-banner, .ad-overlay, 
  [data-test-selector="ad-banner-default-text"],
  [data-a-target="video-ad-label"],
  [data-a-target="video-ad-countdown"],
  [data-a-target="player-overlay-ad-slate"],
  .commercial-break, .tw-animated-ad,
  
  #player-overlay-0,
  div[class*="PushdownSDA"],
  div[class*="AudioAdOverlay"],
  div[class*="StreamDisplayAd"],
  div[class*="AdSlot"],
  
  [data-test-selector="sda-wrapper"],
  [data-test-selector="sda-container"],
  [data-test-selector="sda-transform"],
  [data-test-selector="sda-frame"],
  .stream-display-ad__wrapper,
  .stream-display-ad__container_squeezeback,
  .stream-display-ad__transform-container_squeezeback,
  .stream-display-ad__frame_squeezeback,
  #stream-lowerthird,
  
  [data-a-target="outstream-ax-overlay"],
  
  .video-player__overlay [data-a-target="player-overlay-text-ad"],
  .video-player__overlay div[class*="Layout-sc-"] > div[style*="z-index: 2"],
  
  div[data-a-target="player-overlay-content-gate"],
  
  .extension-view__iframe-wrapper {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
    z-index: -9999 !important;
  }
`;

function injectStyles() {
  const styleId = 'cleaner-css';
  const old = document.getElementById(styleId);
  if (old) old.remove();

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = CSS_HIDE;
  (document.head || document.documentElement).appendChild(style);
}

function injectConfigPatcher() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const origParse = JSON.parse;
      JSON.parse = function(text) {
        const data = origParse.apply(this, arguments);
        if (data && typeof data === 'object') {
          if (data.adsEnabled) data.adsEnabled = false;
          if (data.stitched) data.stitched = false;
          if (data.show_ads) data.show_ads = false;
          if (data.disable_ads) data.disable_ads = true;
        }
        return data;
      };
      console.log('[TwitchCleaner] JSON.parse patched in page context');
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

let lastAdBlockTime = 0;
let blockedElementsCache = new Set();

function nukeAds() {
  const startTime = performance.now();
  let adsBlocked = false;
  const currentBlockedElements = new Set();
  
  const selectors = [
    '[data-a-target="video-ad-label"]', 
    '.ad-banner',
    '[class*="AdSlot"]',
    '#player-overlay-0',
    '[data-test-selector="sda-wrapper"]',
    '[data-test-selector="sda-container"]',
    '.stream-display-ad__wrapper',
    '#stream-lowerthird',
    '[data-a-target="outstream-ax-overlay"]'
  ];
  
  selectors.forEach(sel => {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      const blockId = `${sel}-${els.length}`;
      currentBlockedElements.add(blockId);
      
      if (!blockedElementsCache.has(blockId)) {
        adsBlocked = true;
        console.log('[TwitchCleaner] Blocking UI ad:', sel, `(${els.length} elements)`);
      }
    }
    els.forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  });

  try {
     if (window.AmazonVideoAds) window.AmazonVideoAds = undefined;
     if (window.twitchAds) window.twitchAds = undefined;
  } catch(e) {}
  
  const iframes = document.querySelectorAll('iframe[src*="ads"]');
  if (iframes.length > 0) {
    const iframeBlockId = `iframe-ads-${iframes.length}`;
    currentBlockedElements.add(iframeBlockId);
    
    if (!blockedElementsCache.has(iframeBlockId)) {
      adsBlocked = true;
      console.log('[TwitchCleaner] Blocking ad iframes:', iframes.length);
    }
  }
  iframes.forEach(iframe => {
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  });
  
  const now = Date.now();
  if (adsBlocked && (now - lastAdBlockTime) > 2000) {
    lastAdBlockTime = now;
    const blockTime = performance.now() - startTime;
    browser.runtime.sendMessage({ 
      type: 'AD_BLOCKED_UI',
      timestamp: now,
      blockTime: blockTime
    }).catch(() => {});
  }
  
  blockedElementsCache = currentBlockedElements;
}

function init() {
  browser.storage.local.get(['isEnabled'], (data) => {
    if (data.isEnabled !== false) {
      
      injectStyles();
      injectConfigPatcher();
      
      setInterval(nukeAds, 1000);
      
      console.log('[TwitchCleaner] UI Blocker Active');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}