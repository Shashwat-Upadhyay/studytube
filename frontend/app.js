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

// Startup
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initDirectExtensionBridge();
  loadSettings();
  checkBackendHealth();
  setInterval(checkBackendHealth, 5000);
});
