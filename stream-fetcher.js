/**
 * Twitch Stream Cleaner
 * Copyright (c) 2025 Illia Naumenko
 * Licensed under the MIT License.
 */
(function() {
    'use strict';
    
    if (window.twitchAdSolutionsActive) {
        console.log('[StreamFetcher] Already active');
        return;
    }
    window.twitchAdSolutionsActive = true;
    
    const CLEAN_PLAYER_TYPES = [
        'picture-by-picture',
        'thunderdome',
        'popout',
        'mobile',
        'ios',
        'android_native',
        'tva',
        'chromecast',
        'xbox',
        'ps4',
        'frontpage',
        'embed',
        'mini',
        'embed-legacy',
        'site'
    ];
    const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    const CONCURRENT_TRIES = 3;
    
    let accessTokenCache = new Map();
    let usedPlayerTypes = new Set();

    function playlistHasAds(text) {
        if (!text) return false;
        return text.includes('stitched-ad') || text.includes('SCTE35') || text.includes('twitch-stitched-ad');
    }

    function buildPlayerTypePriority(excludedType = null) {
        const preferred = Array.from(usedPlayerTypes).filter((type) => type !== excludedType);
        const remaining = CLEAN_PLAYER_TYPES.filter((type) => type !== excludedType && !usedPlayerTypes.has(type));
        return [...preferred, ...remaining];
    }

    async function attemptCleanRequest(channelName, url, playerType) {
        try {
            const tokenData = await getAccessToken(channelName, playerType);
            if (!tokenData?.data?.streamPlaybackAccessToken) return null;

            const token = tokenData.data.streamPlaybackAccessToken;
            const craftedUrl = new URL(url);
            craftedUrl.searchParams.set('sig', token.signature);
            craftedUrl.searchParams.set('token', token.value);
            craftedUrl.searchParams.set('player_type', playerType);

            const response = await originalFetch(craftedUrl.toString());
            if (!response.ok) return null;

            const text = await response.text();
            if (playlistHasAds(text) || !text.includes('#EXTINF')) return null;

            return {
                playerType,
                text,
                headers: response.headers
            };
        } catch (err) {
            console.log(`[StreamFetcher] ${playerType} failed: ${err.message}`);
            return null;
        }
    }

    async function findCleanStream(channelName, url, playerTypes) {
        for (let i = 0; i < playerTypes.length; i += CONCURRENT_TRIES) {
            const batch = playerTypes.slice(i, i + CONCURRENT_TRIES);
            const attempts = await Promise.all(batch.map((type) => attemptCleanRequest(channelName, url, type)));
            const winner = attempts.find(Boolean);
            if (winner) {
                usedPlayerTypes.add(winner.playerType);
                return winner;
            }
        }
        return null;
    }

    function extractChannelNameFromUrl(url) {
        try {
            const m3u8Match = url.match(/\/([^\/]+)\.m3u8/);
            if (m3u8Match) return decodeURIComponent(m3u8Match[1]);
            const channelParamMatch = url.match(/[?&]channel=([^&]+)/);
            if (channelParamMatch) return decodeURIComponent(channelParamMatch[1]);
        } catch (err) {
            console.debug('[StreamFetcher] Failed to parse channel name:', err.message);
        }
        return null;
    }

    function isLivePlaylistRequest(url) {
        return typeof url === 'string' && url.includes('.m3u8') && (url.includes('/channel/hls/') || url.includes('usher.ttvnw.net'));
    }
    
    async function getAccessToken(channelName, playerType) {
        const cacheKey = `${channelName}_${playerType}`;
        if (accessTokenCache.has(cacheKey)) {
            return accessTokenCache.get(cacheKey);
        }
        
        const body = {
            operationName: 'PlaybackAccessToken',
            variables: {
                isLive: true,
                login: channelName,
                isVod: false,
                vodID: '',
                playerType: playerType
            },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: 'ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9'
                }
            }
        };
        
        try {
            const response = await fetch('https://gql.twitch.tv/gql', {
                method: 'POST',
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            if (response.ok) {
                const data = await response.json();
                accessTokenCache.set(cacheKey, data);
                setTimeout(() => accessTokenCache.delete(cacheKey), 60000);
                return data;
            }
        } catch (err) {
            console.error('[StreamFetcher] Failed to get access token:', err);
        }
        return null;
    }
    
    const originalFetch = window.fetch;
    window.fetch = async function(url, options) {
        if (typeof url === 'string' && url.includes('gql.twitch.tv/gql')) {
            if (options && options.body) {
                try {
                    const body = JSON.parse(options.body);
                    let modified = false;
                    
                    const preferredPlayerType = 'picture-by-picture';
                    
                    if (Array.isArray(body)) {
                        body.forEach(item => {
                            if (item?.variables?.playerType && item.variables.playerType !== preferredPlayerType) {
                                console.log(`[StreamFetcher] Replacing playerType '${item.variables.playerType}' with '${preferredPlayerType}'`);
                                item.variables.playerType = preferredPlayerType;
                                modified = true;
                            }
                        });
                    } else if (body?.variables?.playerType && body.variables.playerType !== preferredPlayerType) {
                        console.log(`[StreamFetcher] Replacing playerType '${body.variables.playerType}' with '${preferredPlayerType}'`);
                        body.variables.playerType = preferredPlayerType;
                        modified = true;
                    }
                    
                    if (modified) {
                        options.body = JSON.stringify(body);
                    }
                } catch (e) {
                }
            }
        }
        
        if (isLivePlaylistRequest(url)) {
            const channelName = extractChannelNameFromUrl(url);
            if (channelName) {
                const priority = buildPlayerTypePriority();
                const cleanResult = await findCleanStream(channelName, url, priority);
                if (cleanResult) {
                    console.log(`[StreamFetcher] Preemptively using clean stream (${cleanResult.playerType})`);
                    return new Response(cleanResult.text, {
                        status: 200,
                        headers: cleanResult.headers
                    });
                }
            }

            const response = await originalFetch.apply(this, arguments);

            if (channelName) {
                const playlistText = await response.clone().text();

                if (playlistHasAds(playlistText)) {
                    console.log('[StreamFetcher] Ads detected, searching clean stream...');

                    const urlParams = new URL(url);
                    const originalPlayerType = urlParams.searchParams.get('player_type');
                    const fallbackOrder = buildPlayerTypePriority(originalPlayerType);
                    const fallbackResult = await findCleanStream(channelName, url, fallbackOrder);

                    if (fallbackResult) {
                        console.log(`[StreamFetcher] Found clean stream (${fallbackResult.playerType})`);
                        return new Response(fallbackResult.text, {
                            status: 200,
                            headers: fallbackResult.headers
                        });
                    }

                    console.log('[StreamFetcher] No clean stream found, filtering manually...');
                    const filteredText = playlistText
                        .split('\n')
                        .filter(line => !playlistHasAds(line) && !line.includes('DATERANGE'))
                        .join('\n');

                    if (filteredText.includes('#EXTINF')) {
                        return new Response(filteredText, {
                            status: 200,
                            headers: response.headers
                        });
                    }
                }
            }

            return response;
        }
        
        return originalFetch.apply(this, arguments);
    };
    
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
        if (this._url && typeof this._url === 'string' && this._url.includes('.m3u8')) {
            const originalOnLoad = this.onload;
            const originalOnReadyStateChange = this.onreadystatechange;
            const self = this;
            
            this.onreadystatechange = async function() {
                if (self.readyState === 4 && self.status === 200) {
                    const text = self.responseText;
                    if (text && (text.includes('stitched-ad') || text.includes('SCTE35'))) {
                        console.log('[StreamFetcher] XHR: Ads detected in playlist');
                    }
                }
                if (originalOnReadyStateChange) {
                    return originalOnReadyStateChange.apply(this, arguments);
                }
            };
        }
        return originalXHRSend.apply(this, args);
    };
    
    console.log('[StreamFetcher] Initialized (fetch + XHR interceptors active)');
})();
