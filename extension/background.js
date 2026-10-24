/**
 * StudyTube Background Service Worker (Manifest V3)
 * Handles backend API proxying, deduplication, caching, and network failure fallbacks.
 */

'use strict';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';
const DEFAULT_WHITELIST = [
  'education_academics',
  'programming_technology',
  'career_business',
  'productivity_self_improvement',
  'health_fitness',
  'documentaries_explainers',
  'unknown'
];

// In-memory cache for classifications during the browser session
const memoryCache = new Map();
// In-flight request deduplication map: video_id -> Promise
const inFlightRequests = new Map();

/**
 * Initialize default settings on extension installation or startup
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    [
      'studytubeEnabled',
      'whitelistedCategories',
      'hideLiveChat',
      'blockShortsScroll',
      'blockShortsPlayback',
      'hideComments',
      'strictFallback',
      'allowUnknown',
      'backendUrl',
    ],
    (data) => {
      const updates = {};
      if (data.studytubeEnabled === undefined) updates.studytubeEnabled = true;
      if (data.whitelistedCategories === undefined) updates.whitelistedCategories = DEFAULT_WHITELIST;
      if (data.hideLiveChat === undefined) updates.hideLiveChat = true;
      if (data.blockShortsScroll === undefined) updates.blockShortsScroll = true;
      if (data.blockShortsPlayback === undefined) updates.blockShortsPlayback = true;
      if (data.hideComments === undefined) updates.hideComments = true;
      if (data.strictFallback === undefined) updates.strictFallback = true;
      if (data.allowUnknown === undefined) updates.allowUnknown = true;
      if (data.backendUrl === undefined) updates.backendUrl = DEFAULT_BACKEND_URL;

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    }
  );
  console.log('[StudyTube Background] Service Worker initialized with local settings.');
});

/**
 * Fetch classification from FastAPI backend with timeout and deduplication
 */
async function classifyVideo(payload) {
  const { video_id, title, channel_name, url } = payload;
  if (!video_id) {
    return { success: false, error: 'MISSING_VIDEO_ID', is_fallback: true };
  }

  // 1. Check in-memory cache
  if (memoryCache.has(video_id)) {
    return memoryCache.get(video_id);
  }

  // 2. Deduplicate concurrent requests for identical video_id
  if (inFlightRequests.has(video_id)) {
    return inFlightRequests.get(video_id);
  }

  const promise = (async () => {
    try {
      const storage = await chrome.storage.local.get(['backendUrl']);
      const backendUrl = (storage.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${backendUrl}/api/v1/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          video_id: video_id,
          title: (title || '').slice(0, 500) || `YouTube Video ${video_id}`,
          channel_name: channel_name ? channel_name.slice(0, 255) : null,
          url: url ? url.slice(0, 2048) : null,
          views: typeof payload.views === 'number' ? payload.views : (parseInt(payload.views, 10) || 0),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      const result = {
        success: true,
        video_id: data.video_id || video_id,
        category: data.category || 'unknown',
        confidence: data.confidence !== undefined ? data.confidence : 0.0,
        suggested_mode: data.suggested_mode || 'grayscale',
        classifier: data.classifier || 'unknown',
        is_fallback: !!data.is_fallback,
      };

      // Only cache genuine, non-fallback classifications
      if (!result.is_fallback) {
        memoryCache.set(video_id, result);
      }

      return result;
    } catch (err) {
      console.warn(`[StudyTube Background] Classification request failed for ${video_id}:`, err.message);
      // Fallback: report failure with default fallback category 'gaming'
      return {
        success: false,
        video_id: video_id,
        category: 'gaming',
        confidence: 0.1,
        suggested_mode: 'grayscale',
        classifier: 'offline_fallback',
        is_fallback: true,
        error: err.name === 'AbortError' ? 'TIMEOUT' : 'BACKEND_OFFLINE',
      };
    } finally {
      inFlightRequests.delete(video_id);
    }
  })();

  inFlightRequests.set(video_id, promise);
  return promise;
}

/**
 * Check backend health status
 */
async function checkBackendHealth() {
  try {
    const storage = await chrome.storage.local.get(['backendUrl']);
    const backendUrl = (storage.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return { connected: true, data };
    }
    return { connected: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return { connected: false, error: err.name === 'AbortError' ? 'Timeout' : 'Unreachable' };
  }
}

/**
 * Listen for messages from content script or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CLASSIFY_VIDEO') {
    classifyVideo(message.payload).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_HEALTH') {
    checkBackendHealth().then(sendResponse);
    return true;
  }

  if (message.type === 'SYNC_SETTINGS') {
    chrome.storage.local.get(null, (data) => {
      sendResponse({ success: true, settings: data });
    });
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    memoryCache.clear();
    sendResponse({ success: true, message: 'Classification cache cleared.' });
    return true;
  }

  // --- Notes Taking Message Handlers ---
  if (message.type === 'SAVE_NOTE') {
    saveNoteToBackend(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_VIDEO_NOTES') {
    getVideoNotesFromBackend(message.videoId || message.video_id).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_ALL_NOTES_GROUPED') {
    getAllNotesGroupedFromBackend().then(sendResponse);
    return true;
  }

  if (message.type === 'DELETE_NOTE') {
    deleteNoteFromBackend(message.id || message.note_id).then(sendResponse);
    return true;
  }
});

/**
 * Helper to get backend URL candidates (resolves both 127.0.0.1 and localhost)
 */
async function getBackendCandidates() {
  const storage = await chrome.storage.local.get(['backendUrl']);
  const configuredUrl = (storage.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  const candidates = [configuredUrl];

  if (configuredUrl.includes('127.0.0.1')) {
    candidates.push(configuredUrl.replace('127.0.0.1', 'localhost'));
  } else if (configuredUrl.includes('localhost')) {
    candidates.push(configuredUrl.replace('localhost', '127.0.0.1'));
  }
  return candidates;
}

async function saveNoteToBackend(payload) {
  const candidates = await getBackendCandidates();
  let lastErrorMsg = 'Backend offline';

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${baseUrl}/api/v1/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errData = {};
        try { errData = await res.json(); } catch (_) {}
        return { success: false, error: errData.detail || `HTTP error ${res.status}` };
      }

      const note = await res.json();
      return { success: true, note };
    } catch (err) {
      lastErrorMsg = err.name === 'AbortError' ? 'Connection timed out' : `Cannot connect to ${baseUrl}`;
    }
  }

  return {
    success: false,
    error: `${lastErrorMsg}. Please ensure StudyTube backend server is running!`,
  };
}

async function getVideoNotesFromBackend(videoId) {
  if (!videoId) return { success: true, notes: [] };
  const candidates = await getBackendCandidates();
  const vid = encodeURIComponent(videoId);

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${baseUrl}/api/v1/notes?video_id=${vid}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const notes = await res.json();
        return { success: true, notes };
      }
    } catch (_) {}
  }

  return { success: false, notes: [], error: 'Backend offline' };
}

async function getAllNotesGroupedFromBackend() {
  const candidates = await getBackendCandidates();

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${baseUrl}/api/v1/notes/videos`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const videos = await res.json();
        return { success: true, videos };
      }
    } catch (_) {}
  }

  return { success: false, videos: [], error: 'Backend offline' };
}

async function deleteNoteFromBackend(noteId) {
  if (!noteId) return { success: false, error: 'Missing note ID' };
  const candidates = await getBackendCandidates();

  for (const baseUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${baseUrl}/api/v1/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        return { success: true, data };
      }
    } catch (_) {}
  }

  return { success: false, error: 'Failed to delete note. Backend offline.' };
}

/**
 * Listen for external messages directly from web pages (via externally_connectable)
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'GET_SETTINGS') {
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
        sendResponse({ success: true, settings: data });
      }
    );
    return true;
  }

  if (message.type === 'SET_SETTINGS') {
    const p = message.settings || {};
    const updates = {};
    if (p.studytubeEnabled !== undefined) updates.studytubeEnabled = !!p.studytubeEnabled;
    if (p.studytube_enabled !== undefined) updates.studytubeEnabled = !!p.studytube_enabled;
    if (Array.isArray(p.whitelistedCategories)) updates.whitelistedCategories = p.whitelistedCategories;
    if (Array.isArray(p.whitelisted_categories)) updates.whitelistedCategories = p.whitelisted_categories;
    if (p.hideComments !== undefined) updates.hideComments = !!p.hideComments;
    if (p.hide_comments !== undefined) updates.hideComments = !!p.hide_comments;
    if (p.blockShortsScroll !== undefined) updates.blockShortsScroll = !!p.blockShortsScroll;
    if (p.block_shorts_scroll !== undefined) updates.blockShortsScroll = !!p.block_shorts_scroll;
    if (p.blockShortsPlayback !== undefined) updates.blockShortsPlayback = !!p.blockShortsPlayback;
    if (p.block_shorts_playback !== undefined) updates.blockShortsPlayback = !!p.block_shorts_playback;
    if (p.hideLiveChat !== undefined) updates.hideLiveChat = !!p.hideLiveChat;
    if (p.hide_live_chat !== undefined) updates.hideLiveChat = !!p.hide_live_chat;
    if (p.strictFallback !== undefined) updates.strictFallback = !!p.strictFallback;
    if (p.strict_fallback !== undefined) updates.strictFallback = !!p.strict_fallback;
    if (p.backendUrl !== undefined) updates.backendUrl = p.backendUrl;
    if (p.backend_url !== undefined) updates.backendUrl = p.backend_url;

    chrome.storage.local.set(updates, () => {
      sendResponse({ success: true, settings: updates });
    });
    return true;
  }
});
