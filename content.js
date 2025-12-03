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
  .celebration__overlay,
  
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
  [data-a-target="ax-overlay"],
  
  .video-player__overlay [data-a-target="player-overlay-text-ad"],
  .video-player__overlay div[class*="Layout-sc-"] > div[style*="z-index: 2"],
  
  .InjectLayout-sc-1i43xsx-0.persistent-player[data-a-player-state="ad-playing"],
  .InjectLayout-sc-1i43xsx-0.celebration__overlay,
  
  div[data-a-target="player-overlay-content-gate"],
  
  .extension-view__iframe-wrapper,
  .extensions-video-overlay-size-container,
  .extensions-dock__layout,
  .extensions-notifications,
  .extensions-info-balloon__close-button,
  div[class*="extensions"],
  iframe[src*="supervisor.ext-twitch.tv"],
  iframe[src*="extensions-discovery"] {
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

function injectStreamFetcher() {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('stream-fetcher.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

function injectConfigPatcher() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const originalFetch = window.fetch;
      window.fetch = async function(url, options) {
        if (typeof url === 'string' && url.includes('gql.twitch.tv/gql')) {
          if (options && options.body) {
            try {
              const body = JSON.parse(options.body);
              const preferredPlayerType = 'embed';
              
              if (Array.isArray(body)) {
                body.forEach(item => {
                  if (item?.operationName === 'PlaybackAccessToken' && item?.variables?.playerType) {
                    if (item.variables.playerType !== preferredPlayerType) {
                      console.log(\`[TwitchCleaner] '\${item.variables.playerType}' → '\${preferredPlayerType}'\`);
                      item.variables.playerType = preferredPlayerType;
                    }
                  }
                });
              } else if (body?.operationName === 'PlaybackAccessToken' && body?.variables?.playerType) {
                if (body.variables.playerType !== preferredPlayerType) {
                  console.log(\`[TwitchCleaner] '\${body.variables.playerType}' → '\${preferredPlayerType}'\`);
                  body.variables.playerType = preferredPlayerType;
                }
              }
              
              options = { ...options, body: JSON.stringify(body) };
            } catch (e) {}
          }
        }
        return originalFetch.call(this, url, options);
      };
      
      const origParse = JSON.parse;
      JSON.parse = function(text) {
        const data = origParse.apply(this, arguments);
        if (data && typeof data === 'object') {
          if (data.adsEnabled) data.adsEnabled = false;
          if (data.stitched) data.stitched = false;
          if (data.show_ads) data.show_ads = false;
          if (data.disable_ads) data.disable_ads = true;
          
          if (data.surestream) data.surestream = false;
          if (data.csai) data.csai = false;
          
          if (data.prerollEnabled) data.prerollEnabled = false;
          if (data.midrollEnabled) data.midrollEnabled = false;
        }
        return data;
      };

      Object.defineProperties(window, {
        'AmazonVideoAds': { get: () => undefined, set: () => {} },
        'twitchAds': { get: () => undefined, set: () => {} }
      });
      
      console.log('[TwitchCleaner] Config Patcher Active');
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
    '[data-test-selector="sda-container"]',
    '[data-a-target="ax-overlay"]',
    '.celebration__overlay',
    'iframe[src*="supervisor.ext-twitch.tv"]'
  ];
  
  selectors.forEach(sel => {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      const blockId = `${sel}-${els.length}`;
      currentBlockedElements.add(blockId);
      
      if (!blockedElementsCache.has(blockId)) {
        adsBlocked = true;
      }
      
      els.forEach(el => {
        if (el && el.parentNode) {
          el.remove();
        }
      });
    }
  });

  const now = Date.now();
  if (adsBlocked && (now - lastAdBlockTime) > 2000) {
    lastAdBlockTime = now;
    const blockTime = performance.now() - startTime;
    try {
      browser.runtime.sendMessage({ 
        type: 'AD_BLOCKED_UI',
        blockTime: blockTime
      });
    } catch(e) {}
  }
  
  blockedElementsCache = currentBlockedElements;
}

function init() {
  browser.storage.local.get(['isEnabled'], (data) => {
    if (data.isEnabled !== false) {
      injectStreamFetcher();
      injectStyles();
      injectConfigPatcher();
      setInterval(nukeAds, 1000);
      console.log('[TwitchCleaner] UI Armor Active');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}