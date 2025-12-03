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
    
    const BACKUP_PLAYER_TYPES = ['embed', 'frontpage', 'site', 'mini', 'embed-legacy'];
    const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
    
    let accessTokenCache = new Map();
    let usedPlayerTypes = new Set();
    
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
        if (typeof url === 'string' && url.includes('.m3u8')) {
            const response = await originalFetch.apply(this, arguments);
            
            if (url.includes('/channel/hls/') || url.includes('usher.ttvnw.net')) {
                const channelMatch = url.match(/\/([^\/]+)\.m3u8/) || url.match(/channel=([^&]+)/);
                if (channelMatch) {
                    const channelName = channelMatch[1];
                    const text = await response.clone().text();
                    
                    if (text.includes('stitched-ad') || text.includes('SCTE35') || text.includes('twitch-stitched-ad')) {
                        console.log('[StreamFetcher] Ads detected, searching clean stream...');
                        
                        const urlParams = new URL(url);
                        let originalPlayerType = null;
                        try {
                            const tokenParam = urlParams.searchParams.get('token');
                            if (tokenParam) {
                                const decodedToken = JSON.parse(atob(tokenParam.split('.')[1]));
                                originalPlayerType = decodedToken.channel_id ? 'site' : null;
                            }
                        } catch (e) {}
                        
                        const typesToTry = BACKUP_PLAYER_TYPES.filter(type => type !== originalPlayerType);
                        
                        for (const playerType of typesToTry) {
                            try {
                                const tokenData = await getAccessToken(channelName, playerType);
                                if (!tokenData?.data?.streamPlaybackAccessToken) continue;
                                
                                const token = tokenData.data.streamPlaybackAccessToken;
                                const backupUrl = new URL(url);
                                backupUrl.searchParams.set('sig', token.signature);
                                backupUrl.searchParams.set('token', token.value);
                                backupUrl.searchParams.set('player_type', playerType);
                                
                                const backupResponse = await originalFetch(backupUrl.toString());
                                if (!backupResponse.ok) continue;
                                
                                const backupText = await backupResponse.text();
                                
                                if (!backupText.includes('stitched-ad') && 
                                    !backupText.includes('SCTE35') && 
                                    !backupText.includes('twitch-stitched-ad') &&
                                    backupText.includes('#EXTINF')) {
                                    console.log(`[StreamFetcher] Found clean stream (${playerType})`);
                                    usedPlayerTypes.add(playerType);
                                    return new Response(backupText, {
                                        status: 200,
                                        headers: backupResponse.headers
                                    });
                                }
                            } catch (err) {
                                console.log(`[StreamFetcher] Failed ${playerType}:`, err.message);
                            }
                        }
                        
                        console.log('[StreamFetcher] No clean stream found, filtering manually...');
                        const filteredText = text.split('\n')
                            .filter(line => !line.includes('stitched-ad') && 
                                           !line.includes('SCTE35') && 
                                           !line.includes('DATERANGE'))
                            .join('\n');
                        
                        if (filteredText.includes('#EXTINF')) {
                            return new Response(filteredText, {
                                status: 200,
                                headers: response.headers
                            });
                        }
                    }
                }
            }
            
            return response;
        }
        
        return originalFetch.apply(this, arguments);
    };
    
    console.log('[StreamFetcher] Initialized');
})();
