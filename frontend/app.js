/**
 * StudyTube — Frontend Command Center Logic
 * Controls extension settings, category whitelisting, shorts protection, and live classifier sandbox.
 */

'use strict';

const API_BASE = window.location.origin.includes('http') && !window.location.origin.includes('file://')
  ? window.location.origin
  : 'http://127.0.0.1:8000';

const CATEGORIES = [
  {
    id: 'education_academics',
    name: 'Education & Academics',
    emoji: '📚',
    desc: 'University lectures, academic research, math, history, and educational deep dives.',
  },
  {
    id: 'programming_technology',
    name: 'Programming & Tech',
    emoji: '💻',
    desc: 'Coding tutorials, computer science, software engineering, AI, and developer tools.',
  },
  {
    id: 'career_business',
    name: 'Career & Business',
    emoji: '📈',
    desc: 'Professional skills, finance, economics, entrepreneurship, and workplace productivity.',
  },
  {
    id: 'productivity_self_improvement',
    name: 'Productivity & Focus',
    emoji: '⚡',
    desc: 'Study techniques, habits, time management, psychology, and personal development.',
  },
  {
    id: 'health_fitness',
    name: 'Health & Fitness',
    emoji: '💪',
    desc: 'Workout routines, physical training, nutrition, posture, and wellness guides.',
  },
  {
    id: 'documentaries_explainers',
    name: 'Documentaries & Deep Dives',
    emoji: '🎥',
    desc: 'Documentary films, investigative journalism, case studies, and visual explainers.',
  },
  {
    id: 'news_current_affairs',
    name: 'News & Current Affairs',
    emoji: '📰',
    desc: 'World news, geopolitical analysis, journalism, and daily news briefings.',
  },
  {
    id: 'hobbies_creative_arts',
    name: 'Hobbies & Creative Arts',
    emoji: '🎨',
    desc: 'Music composition, digital drawing, 3D modeling, crafts, photography, and design.',
  },
  {
    id: 'gaming',
    name: 'Gaming & Esports',
    emoji: '🎮',
    desc: 'Video game walkthroughs, gaming livestreams, esports tournaments, and game reviews.',
  },
  {
    id: 'entertainment_comedy',
    name: 'Entertainment & Comedy',
    emoji: '🍿',
    desc: 'Humor, comedy sketches, movie clips, satire, reaction videos, and memes.',
  },
  {
    id: 'music',
    name: 'Music & Tracks',
    emoji: '🎵',
    desc: 'Music videos, songs, official audio, album releases, and live music concerts.',
  },
  {
    id: 'lifestyle_vlogs',
    name: 'Lifestyle & Vlogs',
    emoji: '☕',
    desc: 'Daily vlogs, travel diaries, influencer content, routines, and challenges.',
  },
  {
    id: 'unknown',
    name: 'Unclassified / Unknown',
    emoji: '❓',
    desc: 'Videos not yet analyzed or failing classification confidence thresholds.',
  },
];

// Presets mapping
const PRESETS = {
  study: [
    'education_academics',
    'programming_technology',
    'career_business',
    'productivity_self_improvement',
    'health_fitness',
    'documentaries_explainers',
  ],
  strict: [
    'education_academics',
    'programming_technology',
  ],
  all: CATEGORIES.map((c) => c.id).filter((id) => id !== 'unknown'),
  none: [],
};

const STORAGE_CACHE_KEY = 'studytube_dashboard_settings';

// Application State
let appSettings = {
  studytube_enabled: true,
  whitelisted_categories: [...PRESETS.study],
  block_shorts_scroll: true,
  block_shorts_playback: true,
  hide_comments: true,
  hide_live_chat: true,
  strict_fallback: true,
  backend_url: API_BASE,
};

// Immediately restore cached state on page load before handshake
try {
  const cached = localStorage.getItem(STORAGE_CACHE_KEY);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed && typeof parsed === 'object') {
      Object.assign(appSettings, parsed);
    }
  }
} catch (_) {}

let autoSaveTimer = null;
let toastTimer = null;

// DOM Elements
const connectionStatusPill = document.getElementById('connectionStatusPill');
const connectionStatusLabel = document.getElementById('connectionStatusLabel');
const connectionLatencyLabel = document.getElementById('connectionLatencyLabel');
const syncStatusIndicator = document.getElementById('syncStatusIndicator');
const syncStatusText = document.getElementById('syncStatusText');
const reloadSettingsBtn = document.getElementById('reloadSettingsBtn');
const saveAllBtn = document.getElementById('saveAllBtn');

// Switches
const studytubeEnabledToggle = document.getElementById('studytubeEnabledToggle');
const masterStateText = document.getElementById('masterStateText');
const masterStatusDesc = document.getElementById('masterStatusDesc');
const blockShortsScrollToggle = document.getElementById('blockShortsScrollToggle');
const blockShortsPlaybackToggle = document.getElementById('blockShortsPlaybackToggle');
const hideCommentsToggle = document.getElementById('hideCommentsToggle');
const hideLiveChatToggle = document.getElementById('hideLiveChatToggle');
const strictFallbackToggle = document.getElementById('strictFallbackToggle');

// Tags
const tagShortsScroll = document.getElementById('tagShortsScroll');
const tagShortsPlayback = document.getElementById('tagShortsPlayback');
const tagComments = document.getElementById('tagComments');
const tagLiveChat = document.getElementById('tagLiveChat');
const tagFallback = document.getElementById('tagFallback');

// Categories & Presets
const categoriesGrid = document.getElementById('categoriesGrid');
const whitelistCounterBadge = document.getElementById('whitelistCounterBadge');
const presetStudyBtn = document.getElementById('presetStudyBtn');
const presetStrictBtn = document.getElementById('presetStrictBtn');
const presetAllowAllBtn = document.getElementById('presetAllowAllBtn');
const presetBlockAllBtn = document.getElementById('presetBlockAllBtn');

// Classifier Sandbox
const classifierForm = document.getElementById('classifierForm');
const classifierInputTitle = document.getElementById('classifierInputTitle');
const classifierSubmitBtn = document.getElementById('classifierSubmitBtn');
const classifierSpinner = document.getElementById('classifierSpinner');
const classifierResultBox = document.getElementById('classifierResultBox');
const resultEmoji = document.getElementById('resultEmoji');
const resultCategoryName = document.getElementById('resultCategoryName');
const resultCategoryId = document.getElementById('resultCategoryId');
const resultDecisionTag = document.getElementById('resultDecisionTag');
const resultConfidenceVal = document.getElementById('resultConfidenceVal');
const confidenceBarFill = document.getElementById('confidenceBarFill');
const resultActionVal = document.getElementById('resultActionVal');
const resultLatencyVal = document.getElementById('resultLatencyVal');
const toastNotification = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

/**
 * Show temporary toast message
 */
function showToast(message, isError = false) {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toastNotification.style.background = isError ? '#ef4444' : '#10b981';
  toastNotification.style.color = isError ? '#ffffff' : '#064e3b';
  toastNotification.classList.remove('hidden');

  toastTimer = setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, 3500);
}

/**
 * Ping backend health endpoint to check operational status
 */
async function checkBackendHealth() {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
    const latency = Math.round(performance.now() - start);

    if (res.ok) {
      connectionStatusPill.className = 'connection-status connected';
      connectionStatusLabel.textContent = 'Backend Connected';
      connectionLatencyLabel.textContent = `${latency}ms`;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    connectionStatusPill.className = 'connection-status disconnected';
    connectionStatusLabel.textContent = 'Backend Offline';
    connectionLatencyLabel.textContent = '';
  }
}

/**
 * Render the 12 Category Cards in the grid
 */
function renderCategoriesGrid() {
  categoriesGrid.innerHTML = '';
  const whitelistSet = new Set(appSettings.whitelisted_categories);

  CATEGORIES.forEach((cat) => {
    const isWhitelisted = whitelistSet.has(cat.id);

    const card = document.createElement('div');
    card.className = `category-card ${isWhitelisted ? 'whitelisted' : ''}`;
    card.dataset.categoryId = cat.id;

    card.innerHTML = `
      <div class="category-card-top">
        <div class="category-info-group">
          <span class="category-emoji">${cat.emoji}</span>
          <span class="category-title">${cat.name}</span>
        </div>
        <label class="toggle-switch" onclick="event.stopPropagation()">
          <input type="checkbox" data-cat-switch="${cat.id}" ${isWhitelisted ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="category-desc">${cat.desc}</p>
      <div class="category-status-row">
        <span class="category-badge-status">${isWhitelisted ? 'Allowed (Grayscale)' : 'Blacked Out'}</span>
      </div>
    `;

    // Toggle whitelist on card or switch click
    const checkbox = card.querySelector(`input[data-cat-switch="${cat.id}"]`);
    const toggleHandler = () => {
      const currentlyWhitelisted = whitelistSet.has(cat.id);
      if (currentlyWhitelisted) {
        whitelistSet.delete(cat.id);
      } else {
        whitelistSet.add(cat.id);
      }
      appSettings.whitelisted_categories = Array.from(whitelistSet);
      updateUI();
      scheduleAutoSave();
    };

    checkbox.addEventListener('change', toggleHandler);
    card.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.closest('.toggle-switch')) {
        toggleHandler();
      }
    });

    categoriesGrid.appendChild(card);
  });

  const totalWhitelisted = appSettings.whitelisted_categories.filter((c) => c !== 'unknown').length;
  whitelistCounterBadge.textContent = `${totalWhitelisted} of 12 Allowed`;
}

/**
 * Update UI controls to match current state
 */
function updateUI() {
  // Master Switch
  studytubeEnabledToggle.checked = appSettings.studytube_enabled;
  if (appSettings.studytube_enabled) {
    masterStateText.textContent = 'ENABLED';
    masterStateText.style.color = 'var(--accent-cyan)';
    masterStatusDesc.textContent =
      'Focus mode is active. Distracting video recommendations are blacked out, videos play in grayscale, shorts are blocked, and comments are protected.';
  } else {
    masterStateText.textContent = 'PAUSED';
    masterStateText.style.color = 'var(--text-muted)';
    masterStatusDesc.textContent =
      'StudyTube is currently paused. Normal YouTube recommendations, full color playback, and standard features are restored.';
  }

  // Shield Switches
  blockShortsScrollToggle.checked = appSettings.block_shorts_scroll;
  blockShortsPlaybackToggle.checked = appSettings.block_shorts_playback;
  hideCommentsToggle.checked = appSettings.hide_comments;
  hideLiveChatToggle.checked = appSettings.hide_live_chat;
  strictFallbackToggle.checked = appSettings.strict_fallback;

  // Tag Badges
  tagShortsScroll.textContent = appSettings.block_shorts_scroll ? 'Active Protection' : 'Disabled';
  tagShortsPlayback.textContent = appSettings.block_shorts_playback ? 'Strict Playback Lock' : 'Disabled';
  tagComments.textContent = appSettings.hide_comments ? 'Shield Enabled' : 'Comments Visible';
  tagLiveChat.textContent = appSettings.hide_live_chat ? 'Chat Suppressed' : 'Chat Visible';
  tagFallback.textContent = appSettings.strict_fallback ? 'Blacklist on Failure' : 'Permissive Fallback';

  // Preset Buttons Active State
  const currentSet = new Set(appSettings.whitelisted_categories);
  const isStudy =
    PRESETS.study.every((c) => currentSet.has(c)) &&
    currentSet.size === PRESETS.study.length;
  const isStrict =
    PRESETS.strict.every((c) => currentSet.has(c)) &&
    currentSet.size === PRESETS.strict.length;
  const isAll = PRESETS.all.every((c) => currentSet.has(c));
  const isNone = currentSet.size === 0;

  presetStudyBtn.classList.toggle('active', isStudy);
  presetStrictBtn.classList.toggle('active', isStrict);
  presetAllowAllBtn.classList.toggle('active', isAll);
  presetBlockAllBtn.classList.toggle('active', isNone);

  renderCategoriesGrid();
}

let isExtensionDirectConnected = false;

/**
 * Direct Extension Bridge: Enables deployed frontend to communicate directly with
 * StudyTube extension via window.postMessage without requiring any backend.
 */
function initDirectExtensionBridge() {
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'studytube-extension') return;

    if (event.data.type === 'STUDYTUBE_PONG' || event.data.type === 'STUDYTUBE_BRIDGE_READY') {
      isExtensionDirectConnected = true;
      connectionStatusPill.className = 'connection-status connected';
      connectionStatusLabel.textContent = 'Extension Connected';
      connectionLatencyLabel.textContent = 'Direct Bridge';
      syncStatusIndicator.className = 'sync-status saved';
      syncStatusText.textContent = 'Direct Extension Bridge Active';
      // Query current extension settings
      window.postMessage({ source: 'studytube-frontend', type: 'STUDYTUBE_GET_SETTINGS' }, '*');
      return;
    }

    if (event.data.type === 'STUDYTUBE_SETTINGS_RESPONSE') {
      isExtensionDirectConnected = true;
      const data = event.data.settings || {};
      applyIncomingExtensionSettings(data);
      syncStatusIndicator.className = 'sync-status saved';
      syncStatusText.textContent = 'Synced directly with Extension';
      return;
    }

    if (event.data.type === 'STUDYTUBE_SETTINGS_CHANGED') {
      isExtensionDirectConnected = true;
      const changes = event.data.changes || {};
      applyIncomingExtensionSettings(changes);
      syncStatusIndicator.className = 'sync-status saved';
      syncStatusText.textContent = 'Live update from Extension';
      return;
    }

    if (event.data.type === 'STUDYTUBE_SETTINGS_SAVED') {
      syncStatusIndicator.className = 'sync-status saved';
      syncStatusText.textContent = 'Saved directly to Extension';
      return;
    }
  });

  // Dispatch handshake ping to detect extension content bridge
  window.postMessage({ source: 'studytube-frontend', type: 'STUDYTUBE_PING' }, '*');
  setTimeout(() => {
    window.postMessage({ source: 'studytube-frontend', type: 'STUDYTUBE_PING' }, '*');
  }, 400);
}

function applyIncomingExtensionSettings(data) {
  if (data.studytubeEnabled !== undefined) appSettings.studytube_enabled = !!data.studytubeEnabled;
  if (data.studytube_enabled !== undefined) appSettings.studytube_enabled = !!data.studytube_enabled;

  if (Array.isArray(data.whitelistedCategories)) appSettings.whitelisted_categories = data.whitelistedCategories;
  if (Array.isArray(data.whitelisted_categories)) appSettings.whitelisted_categories = data.whitelisted_categories;

  if (data.hideComments !== undefined) appSettings.hide_comments = !!data.hideComments;
  if (data.hide_comments !== undefined) appSettings.hide_comments = !!data.hide_comments;

  if (data.blockShortsScroll !== undefined) appSettings.block_shorts_scroll = !!data.blockShortsScroll;
  if (data.block_shorts_scroll !== undefined) appSettings.block_shorts_scroll = !!data.block_shorts_scroll;

  if (data.blockShortsPlayback !== undefined) appSettings.block_shorts_playback = !!data.blockShortsPlayback;
  if (data.block_shorts_playback !== undefined) appSettings.block_shorts_playback = !!data.block_shorts_playback;

  if (data.hideLiveChat !== undefined) appSettings.hide_live_chat = !!data.hideLiveChat;
  if (data.hide_live_chat !== undefined) appSettings.hide_live_chat = !!data.hide_live_chat;

  if (data.strictFallback !== undefined) appSettings.strict_fallback = !!data.strictFallback;
  if (data.strict_fallback !== undefined) appSettings.strict_fallback = !!data.strict_fallback;

  if (data.backendUrl) appSettings.backend_url = data.backendUrl;
  if (data.backend_url) appSettings.backend_url = data.backend_url;

  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(appSettings));
  } catch (_) {}

  updateUI();
}

/**
 * Fetch settings: Communicates purely with direct extension bridge (Zero Backend needed)
 */
async function loadSettings() {
  syncStatusIndicator.className = 'sync-status saving';
  syncStatusText.textContent = 'Connecting to Extension...';

  // 1. Direct extension bridge query
  window.postMessage({ source: 'studytube-frontend', type: 'STUDYTUBE_GET_SETTINGS' }, '*');

  // 2. Graceful fallback if extension is not installed on this browser
  setTimeout(() => {
    if (!isExtensionDirectConnected) {
      syncStatusIndicator.className = 'sync-status';
      syncStatusText.textContent = 'Extension not detected (Using local mode)';
      updateUI();
    }
  }, 700);
}

/**
 * Save settings: Dispatches directly to extension storage via direct bridge (Zero Backend needed)
 */
async function saveSettings(showNotification = false) {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(appSettings));
  } catch (_) {}

  syncStatusIndicator.className = 'sync-status saving';
  syncStatusText.textContent = 'Saving changes...';

  // Direct Extension Bridge save (Immediate, zero-backend required!)
  window.postMessage(
    {
      source: 'studytube-frontend',
      type: 'STUDYTUBE_SET_SETTINGS',
      payload: appSettings,
    },
    '*'
  );

  if (isExtensionDirectConnected) {
    syncStatusIndicator.className = 'sync-status saved';
    syncStatusText.textContent = 'Saved directly to Extension';
    if (showNotification) {
      showToast('Settings saved directly to your StudyTube extension!');
    }
  } else {
    syncStatusIndicator.className = 'sync-status';
    syncStatusText.textContent = 'Saved locally (Extension not detected)';
    if (showNotification) {
      showToast('Saved locally. Ensure StudyTube extension is installed & enabled.', true);
    }
  }
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  syncStatusIndicator.className = 'sync-status saving';
  syncStatusText.textContent = 'Auto-saving...';
  autoSaveTimer = setTimeout(() => {
    saveSettings(false);
  }, 80);
}

/**
 * Apply Preset
 */
function applyPreset(presetKey) {
  if (PRESETS[presetKey]) {
    appSettings.whitelisted_categories = [...PRESETS[presetKey]];
    updateUI();
    scheduleAutoSave();
    showToast(`Applied preset: ${presetKey.toUpperCase()}`);
  }
}

/**
 * Run Live Classification Sandbox Test
 */
async function runClassifierTest(inputTitle) {
  if (!inputTitle || !inputTitle.trim()) return;

  classifierSubmitBtn.disabled = true;
  classifierSpinner.classList.remove('hidden');

  const start = performance.now();

  try {
    const res = await fetch(`${API_BASE}/api/v1/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        video_id: 'test_sandbox_video',
        title: inputTitle.trim(),
        channel_name: 'Sandbox Demo Channel',
        url: inputTitle.startsWith('http') ? inputTitle.trim() : null,
        views: 50000,
      }),
    });

    const latency = Math.round(performance.now() - start);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const categoryId = data.category || 'unknown';
    const confidence = typeof data.confidence === 'number' ? Math.round(data.confidence * 100) : 85;

    const catObj = CATEGORIES.find((c) => c.id === categoryId) || {
      name: categoryId,
      emoji: '🎬',
    };

    const isAllowed = appSettings.whitelisted_categories.includes(categoryId);

    // Update Result UI
    resultEmoji.textContent = catObj.emoji;
    resultCategoryName.textContent = catObj.name;
    resultCategoryId.textContent = categoryId;

    if (isAllowed) {
      resultDecisionTag.className = 'result-decision-tag allowed';
      resultDecisionTag.textContent = 'ALLOWED';
      resultActionVal.textContent = 'Grayscale Playback';
      resultActionVal.style.color = '#6ee7b7';
    } else {
      resultDecisionTag.className = 'result-decision-tag blacked-out';
      resultDecisionTag.textContent = 'BLACKED OUT';
      resultActionVal.textContent = 'Cover Overlay (Blocked)';
      resultActionVal.style.color = '#fca5a5';
    }

    resultConfidenceVal.textContent = `${confidence}%`;
    confidenceBarFill.style.width = `${Math.max(confidence, 10)}%`;
    resultLatencyVal.textContent = `${latency}ms`;

    classifierResultBox.classList.remove('hidden');
    classifierResultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error('Classification error:', err);
    showToast('Classification failed. Is the FastAPI backend running?', true);
  } finally {
    classifierSubmitBtn.disabled = false;
    classifierSpinner.classList.add('hidden');
  }
}

/**
 * Event Listeners Initialization
 */
function initEventListeners() {
  // Master Switch
  studytubeEnabledToggle.addEventListener('change', () => {
    appSettings.studytube_enabled = studytubeEnabledToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  // Shield Switches
  blockShortsScrollToggle.addEventListener('change', () => {
    appSettings.block_shorts_scroll = blockShortsScrollToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  blockShortsPlaybackToggle.addEventListener('change', () => {
    appSettings.block_shorts_playback = blockShortsPlaybackToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  hideCommentsToggle.addEventListener('change', () => {
    appSettings.hide_comments = hideCommentsToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  hideLiveChatToggle.addEventListener('change', () => {
    appSettings.hide_live_chat = hideLiveChatToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  strictFallbackToggle.addEventListener('change', () => {
    appSettings.strict_fallback = strictFallbackToggle.checked;
    updateUI();
    scheduleAutoSave();
  });

  // Presets
  presetStudyBtn.addEventListener('click', () => applyPreset('study'));
  presetStrictBtn.addEventListener('click', () => applyPreset('strict'));
  presetAllowAllBtn.addEventListener('click', () => applyPreset('all'));
  presetBlockAllBtn.addEventListener('click', () => applyPreset('none'));

  // Action Buttons
  reloadSettingsBtn.addEventListener('click', () => {
    loadSettings();
    showToast('Reloaded settings from extension.');
  });

  saveAllBtn.addEventListener('click', () => {
    saveSettings(true);
  });

  // Sandbox Form
  classifierForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runClassifierTest(classifierInputTitle.value);
  });

  // Sample Chips
  document.querySelectorAll('.sample-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const title = chip.getAttribute('data-title');
      classifierInputTitle.value = title;
      runClassifierTest(title);
    });
  });
}

// ==========================================================================
// Video Notes Notebook Controller
// ==========================================================================

let videoNotesGroups = [];
let currentSelectedVideo = null;
let notesSearchTerm = '';

function escapeHTML(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function switchViewTab(tabTarget) {
  const tabShieldsBtn = document.getElementById('tabShieldsBtn');
  const tabNotesBtn = document.getElementById('tabNotesBtn');
  const shieldsView = document.getElementById('shieldsView');
  const notesView = document.getElementById('notesView');

  if (tabTarget === 'notesView' || tabTarget === 'notes') {
    if (tabShieldsBtn) tabShieldsBtn.classList.remove('active');
    if (tabNotesBtn) tabNotesBtn.classList.add('active');
    if (shieldsView) shieldsView.classList.add('hidden');
    if (notesView) notesView.classList.remove('hidden');
    window.location.hash = 'notes';
    loadVideoNotes();
  } else {
    if (tabNotesBtn) tabNotesBtn.classList.remove('active');
    if (tabShieldsBtn) tabShieldsBtn.classList.add('active');
    if (notesView) notesView.classList.add('hidden');
    if (shieldsView) shieldsView.classList.remove('hidden');
    if (window.location.hash === '#notes') {
      history.replaceState(null, null, window.location.pathname);
    }
  }
}

async function loadVideoNotes() {
  const gridEl = document.getElementById('videoNotesGrid');
  const emptyEl = document.getElementById('videoNotesEmptyState');
  const statVideosEl = document.getElementById('statTotalVideos');
  const statNotesEl = document.getElementById('statTotalNotes');
  const tabBadgeEl = document.getElementById('globalNotesCountBadge');

  try {
    const res = await fetch(`${API_BASE}/api/v1/notes/videos`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    videoNotesGroups = await res.json();

    // Calculate total notes
    const totalNotes = videoNotesGroups.reduce((acc, g) => acc + (g.notes_count || 0), 0);

    if (statVideosEl) statVideosEl.textContent = videoNotesGroups.length;
    if (statNotesEl) statNotesEl.textContent = totalNotes;
    if (tabBadgeEl) tabBadgeEl.textContent = totalNotes;

    renderVideoNotesGrid();
  } catch (err) {
    console.warn('[StudyTube Dashboard] Failed to load notes:', err);
    if (gridEl) gridEl.innerHTML = `<div class="error-box">Failed to load video notes: ${escapeHTML(err.message)}</div>`;
  }
}

function renderVideoNotesGrid() {
  const gridEl = document.getElementById('videoNotesGrid');
  const emptyEl = document.getElementById('videoNotesEmptyState');
  if (!gridEl) return;

  const filtered = (videoNotesGroups || []).filter((group) => {
    if (!notesSearchTerm) return true;
    const term = notesSearchTerm.toLowerCase();
    const matchTitle = (group.video_title || '').toLowerCase().includes(term);
    const matchId = (group.video_id || '').toLowerCase().includes(term);
    const matchNotes = (group.notes || []).some((n) => (n.content || '').toLowerCase().includes(term));
    return matchTitle || matchId || matchNotes;
  });

  if (filtered.length === 0) {
    gridEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  gridEl.innerHTML = filtered.map((group) => {
    const latestNote = group.notes && group.notes.length > 0
      ? group.notes[group.notes.length - 1]
      : null;
    const snippetText = latestNote
      ? `⏱️ ${latestNote.timestamp_formatted}: ${latestNote.content}`
      : 'Click to open notes notebook for this video...';

    return `
      <div class="video-notes-card" data-video-id="${group.video_id}">
        <div class="video-card-thumb-wrap">
          <img class="video-card-thumb" src="${escapeHTML(group.thumbnail_url)}" alt="${escapeHTML(group.video_title)}" loading="lazy">
          <div class="video-card-notes-tag">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>${group.notes_count} Note${group.notes_count === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div class="video-card-body">
          <h3 class="video-card-title" title="${escapeHTML(group.video_title)}">${escapeHTML(group.video_title)}</h3>
          <div class="video-card-snippet" title="${escapeHTML(snippetText)}">${escapeHTML(snippetText)}</div>
          <div class="video-card-actions">
            <button type="button" class="btn-open-notes">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              View Notes Window
            </button>
            <a href="${escapeHTML(group.video_url)}" target="_blank" class="btn-open-yt" title="Watch on YouTube" onclick="event.stopPropagation()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach card click handlers to open notes window
  gridEl.querySelectorAll('.video-notes-card').forEach((card) => {
    card.addEventListener('click', () => {
      const vid = card.getAttribute('data-video-id');
      const grp = videoNotesGroups.find((g) => g.video_id === vid);
      if (grp) openNotesWindow(grp);
    });
  });
}

function openNotesWindow(group) {
  currentSelectedVideo = group;
  const modal = document.getElementById('notesWindowModal');
  const thumbEl = document.getElementById('windowVideoThumb');
  const titleEl = document.getElementById('notesWindowTitle');
  const badgeEl = document.getElementById('windowNotesCountBadge');
  const ytLink = document.getElementById('windowYtLink');
  const openDirectBtn = document.getElementById('windowOpenYtDirectBtn');

  if (!modal) return;

  if (thumbEl) thumbEl.src = group.thumbnail_url;
  if (titleEl) titleEl.textContent = group.video_title;
  if (badgeEl) badgeEl.textContent = `${group.notes_count} Note${group.notes_count === 1 ? '' : 's'}`;
  if (ytLink) ytLink.href = group.video_url;
  if (openDirectBtn) {
    openDirectBtn.onclick = () => window.open(group.video_url, '_blank');
  }

  renderNotesWindowList();
  modal.classList.remove('hidden');
}

function closeNotesWindow() {
  const modal = document.getElementById('notesWindowModal');
  if (modal) modal.classList.add('hidden');
  currentSelectedVideo = null;
}

function renderNotesWindowList() {
  const listEl = document.getElementById('windowNotesList');
  const badgeEl = document.getElementById('windowNotesCountBadge');
  if (!listEl || !currentSelectedVideo) return;

  const notes = currentSelectedVideo.notes || [];
  if (badgeEl) badgeEl.textContent = `${notes.length} Note${notes.length === 1 ? '' : 's'}`;

  if (notes.length === 0) {
    listEl.innerHTML = `
      <div class="notes-empty-state" style="padding: 30px;">
        <div class="empty-state-art" style="font-size: 32px;">📝</div>
        <div class="empty-state-title" style="font-size: 15px;">No notes yet for this video</div>
        <div class="empty-state-desc" style="font-size: 13px;">Use the form above to add your first timestamped note!</div>
      </div>
    `;
    return;
  }

  // Sort notes by timestamp ascending
  const sorted = [...notes].sort((a, b) => (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0));

  listEl.innerHTML = sorted.map((n) => {
    const timestampSec = Math.floor(n.timestamp_seconds || 0);
    const jumpUrl = `https://www.youtube.com/watch?v=${currentSelectedVideo.video_id}&t=${timestampSec}s`;
    let formattedDate = '';
    try {
      formattedDate = new Date(n.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {}

    return `
      <div class="window-note-item" data-note-id="${n.id}">
        <div class="window-note-item-header">
          <a href="${jumpUrl}" target="_blank" class="window-seek-link" title="Click to jump to ${escapeHTML(n.timestamp_formatted)} on YouTube">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>${escapeHTML(n.timestamp_formatted)}</span>
          </a>
          <div class="window-note-meta-right">
            <span class="window-note-date">${formattedDate}</span>
            <button type="button" class="window-delete-note-btn" data-id="${n.id}" title="Delete this note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="window-note-content-text">${escapeHTML(n.content)}</div>
      </div>
    `;
  }).join('');

  // Attach delete handlers inside window
  listEl.querySelectorAll('.window-delete-note-btn').forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const noteId = parseInt(btn.getAttribute('data-id'), 10);
      if (!noteId) return;

      try {
        const res = await fetch(`${API_BASE}/api/v1/notes/${noteId}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Update local state
        currentSelectedVideo.notes = (currentSelectedVideo.notes || []).filter((x) => x.id !== noteId);
        currentSelectedVideo.notes_count = currentSelectedVideo.notes.length;

        // If no notes left in this video group, refresh all
        if (currentSelectedVideo.notes.length === 0) {
          videoNotesGroups = videoNotesGroups.filter((g) => g.video_id !== currentSelectedVideo.video_id);
        } else {
          const groupIdx = videoNotesGroups.findIndex((g) => g.video_id === currentSelectedVideo.video_id);
          if (groupIdx !== -1) {
            videoNotesGroups[groupIdx] = { ...currentSelectedVideo };
          }
        }

        renderNotesWindowList();
        renderVideoNotesGrid();
        showToast('Note deleted successfully.');
      } catch (err) {
        alert(`Failed to delete note: ${err.message}`);
      }
    };
  });
}

function openCreateNoteModal() {
  const modal = document.getElementById('createNoteModal');
  if (modal) {
    modal.classList.remove('hidden');
    const input = document.getElementById('globalNoteUrl');
    if (input) input.focus();
  }
}

function closeCreateNoteModal() {
  const modal = document.getElementById('createNoteModal');
  if (modal) modal.classList.add('hidden');
}

function initNotesNotebookListeners() {
  // Navigation Tabs
  const tabShieldsBtn = document.getElementById('tabShieldsBtn');
  const tabNotesBtn = document.getElementById('tabNotesBtn');

  if (tabShieldsBtn) {
    tabShieldsBtn.addEventListener('click', () => switchViewTab('shieldsView'));
  }
  if (tabNotesBtn) {
    tabNotesBtn.addEventListener('click', () => switchViewTab('notesView'));
  }

  // Check URL hash for direct notebook opening
  if (window.location.hash === '#notes') {
    switchViewTab('notesView');
  }

  // Refresh Button
  const refreshNotesBtn = document.getElementById('refreshNotesBtn');
  if (refreshNotesBtn) {
    refreshNotesBtn.addEventListener('click', () => {
      loadVideoNotes();
      showToast('Notes refreshed from database.');
    });
  }

  // Search input
  const searchInput = document.getElementById('notesSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      notesSearchTerm = e.target.value.trim();
      renderVideoNotesGrid();
    });
  }

  // Open & Close Window Modal
  const closeWindowBtn = document.getElementById('closeNotesWindowBtn');
  if (closeWindowBtn) {
    closeWindowBtn.addEventListener('click', closeNotesWindow);
  }

  const windowModal = document.getElementById('notesWindowModal');
  if (windowModal) {
    windowModal.addEventListener('click', (e) => {
      if (e.target === windowModal) closeNotesWindow();
    });
  }

  // Form inside Window to add note
  const windowAddNoteForm = document.getElementById('windowAddNoteForm');
  if (windowAddNoteForm) {
    windowAddNoteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSelectedVideo) return;

      const tsInput = document.getElementById('windowNoteTimestamp');
      const contentInput = document.getElementById('windowNoteContent');
      const ts = tsInput ? tsInput.value.trim() : '00:00';
      const content = contentInput ? contentInput.value.trim() : '';

      if (!content) return;

      try {
        const res = await fetch(`${API_BASE}/api/v1/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            url: currentSelectedVideo.video_url,
            timestamp: ts,
            content: content,
            title: currentSelectedVideo.video_title,
          }),
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const newNote = await res.json();

        currentSelectedVideo.notes.push(newNote);
        currentSelectedVideo.notes_count = currentSelectedVideo.notes.length;

        if (contentInput) contentInput.value = '';
        renderNotesWindowList();
        renderVideoNotesGrid();
        showToast('Note added to video.');
      } catch (err) {
        alert(`Failed to add note: ${err.message}`);
      }
    });
  }

  // Delete all notes for video inside window
  const deleteAllBtn = document.getElementById('windowDeleteAllBtn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (!currentSelectedVideo) return;
      if (!confirm(`Are you sure you want to delete all notes for "${currentSelectedVideo.video_title}"?`)) {
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/v1/notes/video/${currentSelectedVideo.video_id}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);

        videoNotesGroups = videoNotesGroups.filter((g) => g.video_id !== currentSelectedVideo.video_id);
        closeNotesWindow();
        renderVideoNotesGrid();
        showToast('All notes for video deleted.');
      } catch (err) {
        alert(`Failed to delete notes: ${err.message}`);
      }
    });
  }

  // Global Create Note Modal handlers
  const openNewNoteModalBtn = document.getElementById('openNewNoteModalBtn');
  const emptyStateAddNoteBtn = document.getElementById('emptyStateAddNoteBtn');
  const closeCreateNoteModalBtn = document.getElementById('closeCreateNoteModalBtn');
  const cancelCreateNoteBtn = document.getElementById('cancelCreateNoteBtn');
  const createNoteModal = document.getElementById('createNoteModal');
  const createNoteGlobalForm = document.getElementById('createNoteGlobalForm');

  if (openNewNoteModalBtn) openNewNoteModalBtn.addEventListener('click', openCreateNoteModal);
  if (emptyStateAddNoteBtn) emptyStateAddNoteBtn.addEventListener('click', openCreateNoteModal);
  if (closeCreateNoteModalBtn) closeCreateNoteModalBtn.addEventListener('click', closeCreateNoteModal);
  if (cancelCreateNoteBtn) cancelCreateNoteBtn.addEventListener('click', closeCreateNoteModal);

  if (createNoteModal) {
    createNoteModal.addEventListener('click', (e) => {
      if (e.target === createNoteModal) closeCreateNoteModal();
    });
  }

  if (createNoteGlobalForm) {
    createNoteGlobalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('globalNoteUrl');
      const tsInput = document.getElementById('globalNoteTimestamp');
      const contentInput = document.getElementById('globalNoteContent');

      const url = urlInput ? urlInput.value.trim() : '';
      const ts = tsInput ? tsInput.value.trim() : '00:00';
      const content = contentInput ? contentInput.value.trim() : '';

      if (!url || !content) return;

      try {
        const submitBtn = document.getElementById('submitCreateNoteBtn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving & Fetching...';
        }

        const res = await fetch(`${API_BASE}/api/v1/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            url: url,
            timestamp: ts,
            content: content,
          }),
        });

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Note';
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        const createdNote = await res.json();
        closeCreateNoteModal();
        createNoteGlobalForm.reset();
        await loadVideoNotes();

        // Automatically open the video's notes window
        const targetGroup = videoNotesGroups.find((g) => g.video_id === createdNote.video_id);
        if (targetGroup) {
          openNotesWindow(targetGroup);
        }
        showToast('Timestamped note saved successfully!');
      } catch (err) {
        alert(`Failed to save note: ${err.message}`);
      }
    });
  }

  // Escape key closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeNotesWindow();
      closeCreateNoteModal();
    }
  });
}

// Startup
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initNotesNotebookListeners();
  initDirectExtensionBridge();
  loadSettings();
  loadVideoNotes();
  checkBackendHealth();
  setInterval(checkBackendHealth, 5000);
});

