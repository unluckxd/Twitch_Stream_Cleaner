/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */
/**
 * TwitchCleaner Relay Service Worker
 * Provides stale-while-revalidate caching for PlaybackAccessToken calls.
 */
const TOKEN_TTL_MS = 45000;
const tokenCache = new Map();
const NEG_KEYS = new Set(['adsEnabled', 'stitched', 'show_ads', 'surestream', 'csai', 'prerollEnabled', 'midrollEnabled']);
const POS_KEYS = new Set(['disable_ads']);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isGqlRequest(request) {
  try {
    const url = new URL(request.url);
    return url.hostname === 'gql.twitch.tv' && url.pathname === '/gql';
  } catch (err) {
    return false;
  }
}

async function cloneBody(request) {
  try {
    const cloned = request.clone();
    return await cloned.text();
  } catch (err) {
    return '';
  }
}

function extractCacheKey(bodyText) {
  try {
    if (!bodyText) return null;
    const payload = JSON.parse(bodyText);
    const target = Array.isArray(payload)
      ? payload.find((item) => item && item.operationName === 'PlaybackAccessToken')
      : payload;
    if (target && target.operationName === 'PlaybackAccessToken' && target.variables && target.variables.login) {
      const playerType = target.variables.playerType || 'site';
      return `${target.variables.login}:${playerType}`;
    }
  } catch (err) {
    // ignore malformed bodies
  }
  return null;
}

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

function clonePayload(payload) {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (err) {
    return payload;
  }
}

function buildCacheEntry(originalPayload) {
  const raw = originalPayload;
  const cleanSource = clonePayload(originalPayload);
  const clean = sanitizePayload(cleanSource);
  return {
    raw,
    clean,
    storedAt: Date.now()
  };
}

function createJsonResponse(payload, sourceResponse) {
  const headers = new Headers(sourceResponse ? sourceResponse.headers : undefined);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  return new Response(JSON.stringify(payload), {
    status: sourceResponse ? sourceResponse.status : 200,
    statusText: sourceResponse ? sourceResponse.statusText : 'OK',
    headers
  });
}

async function fetchAndUpdate(request, cacheKey) {
  const response = await fetch(request);
  if (!cacheKey) {
    return response;
  }
  try {
    const payload = await response.clone().json();
    const entry = buildCacheEntry(payload);
    tokenCache.set(cacheKey, entry);
    return createJsonResponse(entry.clean, response);
  } catch (err) {
    return response;
  }
}

self.addEventListener('fetch', (event) => {
  if (!isGqlRequest(event.request)) return;

  event.respondWith((async () => {
    const bodyText = await cloneBody(event.request);
    const cacheKey = extractCacheKey(bodyText);
    const now = Date.now();
    if (cacheKey && tokenCache.has(cacheKey)) {
      const entry = tokenCache.get(cacheKey);
      if (now - entry.storedAt < TOKEN_TTL_MS) {
        event.waitUntil(fetchAndUpdate(event.request.clone(), cacheKey).catch(() => {}));
        return createJsonResponse(entry.clean, null);
      }
      tokenCache.delete(cacheKey);
    }
    try {
      return await fetchAndUpdate(event.request, cacheKey);
    } catch (err) {
      if (cacheKey && tokenCache.has(cacheKey)) {
        return createJsonResponse(tokenCache.get(cacheKey).clean, null);
      }
      throw err;
    }
  })());
});
