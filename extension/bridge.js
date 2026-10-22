/**
 * StudyTube — Web Dashboard Content Bridge
 * Enables any deployed or local StudyTube web frontend (Vercel, Netlify, localhost)
 * to directly read and write extension settings via window.postMessage without requiring a backend.
 */

(() => {
  'use strict';

  // Mark in DOM that StudyTube extension is installed and ready
  try {
    document.documentElement.setAttribute('data-studytube-extension', 'true');
    window.__STUDYTUBE_EXTENSION_INSTALLED__ = true;
  } catch (_) {}

  // Announce bridge ready
  window.postMessage(
    { source: 'studytube-extension', type: 'STUDYTUBE_BRIDGE_READY', version: '0.2.0' },
    '*'
  );

  // Listen for requests from the frontend web app
  window.addEventListener('message', (event) => {
    // Only accept messages from the current window originating from studytube-frontend
    if (event.source !== window || !event.data || event.data.source !== 'studytube-frontend') {
      return;
    }

    const { type, payload, requestId } = event.data;

    // 1. Handshake Ping
    if (type === 'STUDYTUBE_PING') {
      window.postMessage(
        {
          source: 'studytube-extension',
          type: 'STUDYTUBE_PONG',
          requestId,
          version: '0.2.0',
        },
        '*'
      );
      return;
    }

    // 2. Fetch current settings directly from chrome.storage.local
    if (type === 'STUDYTUBE_GET_SETTINGS') {
      chrome.storage.local.get(
        [
          'studytubeEnabled',
          'whitelistedCategories',
          'hideComments',
          'blockShortsScroll',
          'blockShortsPlayback',
          'hideLiveChat',
          'strictFallback',
          'backendUrl',
        ],
        (data) => {
          window.postMessage(
            {
              source: 'studytube-extension',
              type: 'STUDYTUBE_SETTINGS_RESPONSE',
              requestId,
              settings: data,
            },
            '*'
          );
        }
      );
      return;
    }

    // 3. Save updated settings directly to chrome.storage.local
    if (type === 'STUDYTUBE_SET_SETTINGS') {
      const updates = {};
      if (payload && typeof payload === 'object') {
        if (payload.studytubeEnabled !== undefined) updates.studytubeEnabled = !!payload.studytubeEnabled;
        if (payload.studytube_enabled !== undefined) updates.studytubeEnabled = !!payload.studytube_enabled;

        if (Array.isArray(payload.whitelistedCategories)) updates.whitelistedCategories = payload.whitelistedCategories;
        if (Array.isArray(payload.whitelisted_categories)) updates.whitelistedCategories = payload.whitelisted_categories;

        if (payload.hideComments !== undefined) updates.hideComments = !!payload.hideComments;
        if (payload.hide_comments !== undefined) updates.hideComments = !!payload.hide_comments;

        if (payload.blockShortsScroll !== undefined) updates.blockShortsScroll = !!payload.blockShortsScroll;
        if (payload.block_shorts_scroll !== undefined) updates.blockShortsScroll = !!payload.block_shorts_scroll;

        if (payload.blockShortsPlayback !== undefined) updates.blockShortsPlayback = !!payload.blockShortsPlayback;
        if (payload.block_shorts_playback !== undefined) updates.blockShortsPlayback = !!payload.block_shorts_playback;

        if (payload.hideLiveChat !== undefined) updates.hideLiveChat = !!payload.hideLiveChat;
        if (payload.hide_live_chat !== undefined) updates.hideLiveChat = !!payload.hide_live_chat;

        if (payload.strictFallback !== undefined) updates.strictFallback = !!payload.strictFallback;
        if (payload.strict_fallback !== undefined) updates.strictFallback = !!payload.strict_fallback;

        if (payload.backendUrl !== undefined) updates.backendUrl = payload.backendUrl;
        if (payload.backend_url !== undefined) updates.backendUrl = payload.backend_url;
      }

      chrome.storage.local.set(updates, () => {
        window.postMessage(
          {
            source: 'studytube-extension',
            type: 'STUDYTUBE_SETTINGS_SAVED',
            requestId,
            settings: updates,
          },
          '*'
        );
      });
      return;
    }
  });

  // 4. Listen for storage changes from the extension (popup or other tabs) and broadcast to frontend in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const changed = {};
    for (const [key, val] of Object.entries(changes)) {
      changed[key] = val.newValue;
    }
    window.postMessage(
      {
        source: 'studytube-extension',
        type: 'STUDYTUBE_SETTINGS_CHANGED',
        changes: changed,
      },
      '*'
    );
  });
})();
