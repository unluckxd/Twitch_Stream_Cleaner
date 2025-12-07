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
  div[data-a-target="content-classification-warning-disclosure-overlay"],
  #channel-player-disclosures,
  .disclosure-card,
  
  .extension-view__iframe-wrapper,
  .extensions-video-overlay-size-container,
  .extensions-dock__layout,
  .extensions-dock__dock,
  .extensions-popover,
  .extensions-dock-card,
  .extensions-info-balloon,
  .extensions-notifications,
  [aria-labelledby="popover-extensions-header"],
  [aria-describedby="popover-extensions-body"],
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

const AD_STALL_SELECTORS = [
  '[data-a-target="video-ad-label"]',
  '[data-a-target="video-ad-countdown"]',
  '[data-a-target="player-overlay-ad-slate"]',
  '.ad-slot-overlay',
  '.video-player__overlay [data-a-target="player-overlay-text-ad"]'
];

const STALL_CHECK_INTERVAL = 1500;
let stallState = {
  tracking: false,
  lastTime: 0,
  stuckSince: 0,
  cooldownUntil: 0
};

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
  const resourceUrl = browser.runtime.getURL('stream-fetcher.js');
  const parent = document.head || document.documentElement;

  function injectInlineFallback() {
    fetch(resourceUrl)
      .then(resp => resp.text())
      .then(code => {
        const inlineScript = document.createElement('script');
        inlineScript.textContent = code;
        parent.appendChild(inlineScript);
        inlineScript.remove();
        console.log('[TwitchCleaner] StreamFetcher inline fallback injected');
      })
      .catch(err => console.error('[TwitchCleaner] Failed to inline StreamFetcher:', err));
  }

  const script = document.createElement('script');
  script.src = resourceUrl;
  script.onload = function() {
    this.remove();
  };
  script.onerror = function() {
    this.remove();
    console.warn('[TwitchCleaner] StreamFetcher load blocked, using inline fallback');
    injectInlineFallback();
  };
  parent.appendChild(script);
}

function injectConfigPatcher() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const DEVICE_KEY = '__twitchCleanerDeviceId';
      const SESSION_ID = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2);
      const preferredPlayerType = 'picture-by-picture';

      function getDeviceId() {
        try {
          const cached = localStorage.getItem(DEVICE_KEY);
          if (cached) return cached;
          const fresh = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
          localStorage.setItem(DEVICE_KEY, fresh);
          return fresh;
        } catch (err) {
          return SESSION_ID;
        }
      }

      const DEVICE_ID = getDeviceId();
      const NEG_KEYS = new Set(['adsEnabled', 'stitched', 'show_ads', 'surestream', 'csai', 'prerollEnabled', 'midrollEnabled']);
      const POS_KEYS = new Set(['disable_ads']);

      function sanitizePayload(payload) {
        const visited = new WeakSet();
        function scrub(node) {
          if (!node || typeof node !== 'object' || visited.has(node)) return;
          visited.add(node);

          if (Array.isArray(node)) {
            node.forEach(scrub);
            return;
          }

          Object.keys(node).forEach((key) => {
            if (NEG_KEYS.has(key)) {
              node[key] = false;
              return;
            }
            if (POS_KEYS.has(key)) {
              node[key] = true;
              return;
            }
            scrub(node[key]);
          });
        }
        scrub(payload);
        return payload;
      }

      function rewritePlayerType(bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          const visited = new WeakSet();
          function apply(node) {
            if (!node || typeof node !== 'object' || visited.has(node)) return;
            visited.add(node);
            if (node.variables && node.variables.playerType && node.variables.playerType !== preferredPlayerType) {
              node.variables.playerType = preferredPlayerType;
            }
            if (Array.isArray(node)) {
              node.forEach(apply);
              return;
            }
            Object.values(node).forEach(apply);
          }
          apply(parsed);
          return JSON.stringify(parsed);
        } catch (err) {
          return null;
        }
      }

      function stampIdentity(headers) {
        if (!headers.has('Device-ID')) headers.set('Device-ID', DEVICE_ID);
        if (!headers.has('Client-Session-Id')) headers.set('Client-Session-Id', SESSION_ID);
        return headers;
      }

      const originalFetch = window.fetch;
      window.fetch = async function(resource, init) {
        const request = new Request(resource, init);
        const url = request.url || '';
        const isGql = url.indexOf('gql.twitch.tv/gql') !== -1;
        let finalRequest = request;

        if (isGql) {
          let patchedBody = null;
          if (request.method && request.method.toUpperCase() === 'POST') {
            try {
              const rawBody = await request.clone().text();
              const rewritten = rewritePlayerType(rawBody);
              if (rewritten) patchedBody = rewritten;
            } catch (err) {
              console.debug('[TwitchCleaner] Failed to parse GQL body:', err.message);
            }
          }

          const headers = stampIdentity(new Headers(request.headers));
          const newInit = { headers: headers };
          if (patchedBody !== null) {
            newInit.body = patchedBody;
          }
          finalRequest = new Request(request, newInit);
        }

        const response = await originalFetch.call(this, finalRequest);

        if (isGql) {
          try {
            const payload = await response.clone().json();
            sanitizePayload(payload);
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            return new Response(JSON.stringify(payload), {
              status: response.status,
              statusText: response.statusText,
              headers: headers
            });
          } catch (err) {
            console.debug('[TwitchCleaner] GQL sanitize skipped:', err.message);
          }
        }

        return response;
      };

      ['AmazonVideoAds', 'twitchAds'].forEach((prop) => {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(window, prop);
          if (!descriptor || descriptor.configurable) {
            Object.defineProperty(window, prop, {
              configurable: true,
              get: () => undefined,
              set: () => {}
            });
          } else if (descriptor.writable) {
            window[prop] = undefined;
          }
        } catch (err) {
          console.debug('[TwitchCleaner] Skipped redefining ' + prop + ': ' + err.message);
        }
      });
      
      console.log('[TwitchCleaner] Config Patcher Active');
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function registerRelayWorker() {
  if (!('serviceWorker' in navigator)) return;

  let ownsRelay = false;
  try {
    ownsRelay = localStorage.getItem('__twitchCleanerRelayOwned') === 'true';
  } catch (err) {}

  navigator.serviceWorker.getRegistration('/')
    .then((registration) => {
      if (registration && !ownsRelay) {
        console.debug('[TwitchCleaner] Existing Service Worker detected, relay skipped.');
        return;
      }

      const swUrl = browser.runtime.getURL('sw-relay.js');
      return fetch(swUrl)
        .then((resp) => resp.text())
        .then((code) => {
          const blob = new Blob([code], { type: 'text/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          return navigator.serviceWorker.register(blobUrl, { scope: '/' })
            .then(() => {
              console.log('[TwitchCleaner] Relay Service Worker registered.');
              try {
                localStorage.setItem('__twitchCleanerRelayOwned', 'true');
              } catch (err) {}
            })
            .catch((err) => console.warn('[TwitchCleaner] Relay SW registration failed:', err.message))
            .finally(() => setTimeout(() => URL.revokeObjectURL(blobUrl), 5000));
        });
    })
    .catch((err) => console.debug('[TwitchCleaner] SW registration query failed:', err.message));
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
    'iframe[src*="supervisor.ext-twitch.tv"]',
    'div[data-a-target="content-classification-warning-disclosure-overlay"]',
    '#channel-player-disclosures',
    '.disclosure-card',
    '.extensions-dock__layout',
    '.extensions-dock__dock',
    '.extensions-popover',
    '.extensions-dock-card',
    '.extensions-info-balloon',
    '[aria-labelledby="popover-extensions-header"]',
    '[aria-describedby="popover-extensions-body"]'
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
      registerRelayWorker();
      setInterval(nukeAds, 1000);
      startAdStallGuard();
      console.log('[TwitchCleaner] UI Armor Active');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function hasAdOverlay() {
  return AD_STALL_SELECTORS.some((sel) => document.querySelector(sel));
}

function forceAdRecovery(video) {
  if (!video) return;
  console.log('[TwitchCleaner] Ad-only stall detected, forcing recovery');
  try {
    video.playbackRate = 16;
    setTimeout(() => {
      video.playbackRate = 1;
      if (video.paused && typeof video.play === 'function') {
        video.play().catch(() => {});
      }
    }, 1200);
  } catch (err) {}

  window.postMessage({ source: 'twitch-cleaner', type: 'TWITCH_CLEANER_FORCE_RECOVERY' }, '*');
  try {
    browser.runtime.sendMessage({ type: 'AD_STALL_RECOVERY' });
  } catch (err) {}
}

function monitorAdStall() {
  const video = document.querySelector('video');
  if (!video || video.readyState < 2 || !hasAdOverlay()) {
    stallState.tracking = false;
    return;
  }

  const now = performance.now();
  if (!stallState.tracking) {
    stallState.tracking = true;
    stallState.lastTime = video.currentTime;
    stallState.stuckSince = now;
    return;
  }

  const delta = Math.abs(video.currentTime - stallState.lastTime);
  if (delta < 0.05) {
    if (now - stallState.stuckSince > 2500 && now > stallState.cooldownUntil) {
      forceAdRecovery(video);
      stallState.cooldownUntil = now + 8000;
      stallState.stuckSince = now;
    }
  } else {
    stallState.lastTime = video.currentTime;
    stallState.stuckSince = now;
  }
}

function startAdStallGuard() {
  setInterval(() => {
    try {
      monitorAdStall();
    } catch (err) {}
  }, STALL_CHECK_INTERVAL);
}