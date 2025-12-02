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
  .commercial-break, .tw-animated-ad {
    display: none !important;
    height: 0 !important;
    width: 0 !important;
    pointer-events: none !important;
    z-index: -9999 !important;
  }
`;

function init() {
  const style = document.createElement('style');
  style.id = 'cleaner-css';
  style.textContent = CSS_HIDE;
  (document.head || document.documentElement).appendChild(style);

  try {
    const origParse = JSON.parse;
    JSON.parse = function(text) {
      const data = origParse.apply(this, arguments);
      if (data && typeof data === 'object') {
        if (data.adsEnabled) data.adsEnabled = false;
        if (data.stitched) data.stitched = false;
      }
      return data;
    };
  } catch(e) {}

  setInterval(() => {
    const ads = document.querySelectorAll('[data-a-target="video-ad-label"], .ad-banner');
    if (ads.length > 0) {
      ads.forEach(el => el.remove());
    }
  }, 3000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}