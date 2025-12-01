/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */

function hideAdElements() {
  const style = document.createElement('style');
  style.textContent = `
    .ad-banner, .ad-overlay, [class*="AdBanner"], [class*="AdOverlay"],
    [data-test-selector="ad-banner"], [data-a-target="video-ad-label"],
    [data-a-target="video-ad-countdown"], .commercial-break,
    [class*="CommercialBreak"], [data-test-selector="commercial-break-overlay"],
    .tw-animated-ad, [class*="AnimatedAdUnit"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      height: 0 !important;
      width: 0 !important;
      z-index: -1000 !important;
    }
  `;
  document.head.appendChild(style);
}

function removeAdContainers() {
  const selectors = [
    '[class*="ad-banner"]',
    '[class*="video-ad"]',
    '[data-a-target="video-ad-label"]',
    '[data-a-target="video-ad-countdown"]'
  ];
  
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });
}

function observeAdElements() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const adElements = node.querySelectorAll ? 
            node.querySelectorAll('[class*="ad-"], [class*="Ad"], [data-a-target*="ad"]') : [];
          
          adElements.forEach(el => {
            const className = el.className || '';
            const dataTarget = el.getAttribute('data-a-target') || '';
            
            if (className.includes('ad-banner') || className.includes('AdBanner') || dataTarget.includes('video-ad')) {
              el.remove();
            }
          });
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

function patchPlayerConfig() {
  const originalParse = JSON.parse;
  JSON.parse = function(...args) {
    const result = originalParse.apply(this, args);
    if (result && typeof result === 'object') {
      if (result.adsEnabled !== undefined) result.adsEnabled = false;
      if (result.showAds !== undefined) result.showAds = false;
    }
    return result;
  };
}

function init() {
  hideAdElements();
  removeAdContainers();
  observeAdElements();
  patchPlayerConfig();
  setInterval(removeAdContainers, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}