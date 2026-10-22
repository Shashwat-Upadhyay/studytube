/**
 * StudyTube Popup Script
 * Manages category whitelisting, all distraction shields, feature toggles, and backend connection.
 */

'use strict';

const CATEGORIES = [
  { id: 'education_academics', label: 'Education & Academics', icon: '📚' },
  { id: 'programming_technology', label: 'Programming & Tech', icon: '💻' },
  { id: 'career_business', label: 'Career & Business', icon: '📈' },
  { id: 'productivity_self_improvement', label: 'Productivity & Focus', icon: '⚡' },
  { id: 'health_fitness', label: 'Health & Fitness', icon: '💪' },
  { id: 'documentaries_explainers', label: 'Documentaries & Deep Dives', icon: '🎥' },
  { id: 'news_current_affairs', label: 'News & Current Affairs', icon: '📰' },
  { id: 'hobbies_creative_arts', label: 'Hobbies & Creative Arts', icon: '🎨' },
  { id: 'gaming', label: 'Gaming & Esports', icon: '🎮' },
  { id: 'entertainment_comedy', label: 'Entertainment & Comedy', icon: '🍿' },
  { id: 'music', label: 'Music & Tracks', icon: '🎵' },
  { id: 'lifestyle_vlogs', label: 'Lifestyle & Vlogs', icon: '☕' },
];

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
  all: CATEGORIES.map((c) => c.id),
  none: [],
};

// DOM Elements
const masterToggle = document.getElementById('masterToggle');
const masterStatusDot = document.getElementById('masterStatusDot');
const statusText = document.getElementById('statusText');
const retryConnectionBtn = document.getElementById('retryConnectionBtn');

// Distraction Shields
const hideCommentsToggle = document.getElementById('hideCommentsToggle');
const blockShortsScrollToggle = document.getElementById('blockShortsScrollToggle');
const blockShortsPlaybackToggle = document.getElementById('blockShortsPlaybackToggle');
const hideChatToggle = document.getElementById('hideChatToggle');
const strictFallbackToggle = document.getElementById('strictFallbackToggle');

// Presets
const presetStudy = document.getElementById('presetStudy');
const presetStrict = document.getElementById('presetStrict');
const presetAll = document.getElementById('presetAll');
const presetClear = document.getElementById('presetClear');

// Categories
const categoryListContainer = document.getElementById('categoryList');
const whitelistCountBadge = document.getElementById('whitelistCountBadge');

// Backend
const backendUrlInput = document.getElementById('backendUrlInput');
const saveBackendUrlBtn = document.getElementById('saveBackendUrlBtn');
const openDashboardLink = document.getElementById('openDashboardLink');

let activeWhitelist = new Set(PRESETS.study);
let isInitializing = true;

/**
 * Render all 12 category rows with toggle switches
 */
function renderCategories(whitelistedArray) {
  activeWhitelist = new Set(whitelistedArray || PRESETS.study);
  categoryListContainer.innerHTML = '';

  CATEGORIES.forEach((cat) => {
    const isChecked = activeWhitelist.has(cat.id);

    const row = document.createElement('div');
    row.className = 'category-row';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'category-label';
    labelDiv.innerHTML = `<span class="category-badge">${cat.icon}</span><span>${cat.label}</span>`;

    const labelSwitch = document.createElement('label');
    labelSwitch.className = 'switch';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = isChecked;
    input.dataset.categoryId = cat.id;

    input.addEventListener('change', () => {
      if (isInitializing) return;
      if (input.checked) {
        activeWhitelist.add(cat.id);
      } else {
        activeWhitelist.delete(cat.id);
      }
      persistWhitelist();
      updatePresetButtons();
      updateCounterBadge();
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    labelSwitch.appendChild(input);
    labelSwitch.appendChild(slider);

    row.appendChild(labelDiv);
    row.appendChild(labelSwitch);

    // Clicking row toggles switch
    row.addEventListener('click', (e) => {
      if (e.target !== input && !e.target.closest('.switch')) {
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change'));
      }
    });

    categoryListContainer.appendChild(row);
  });

  updateCounterBadge();
}

/**
 * Update the category counter badge
 */
function updateCounterBadge() {
  const count = CATEGORIES.filter((c) => activeWhitelist.has(c.id)).length;
  if (whitelistCountBadge) {
    whitelistCountBadge.textContent = `${count} of ${CATEGORIES.length} Allowed`;
  }
}

/**
 * Persist whitelist to chrome.storage.local
 */
function persistWhitelist() {
  if (isInitializing) return;
  const list = Array.from(activeWhitelist);
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ whitelistedCategories: list });
  }
}

/**
 * Update UI highlight for preset buttons
 */
function updatePresetButtons() {
  const current = activeWhitelist;
  const isStudy =
    current.size === PRESETS.study.length && PRESETS.study.every((c) => current.has(c));
  const isStrict =
    current.size === PRESETS.strict.length && PRESETS.strict.every((c) => current.has(c));
  const isAll = PRESETS.all.every((c) => current.has(c));
  const isNone = current.size === 0;

  presetStudy.classList.toggle('active', isStudy);
  presetStrict.classList.toggle('active', isStrict);
  presetAll.classList.toggle('active', isAll);
  presetClear.classList.toggle('active', isNone);
}

/**
 * Apply preset selection
 */
function applyPreset(ids) {
  activeWhitelist = new Set(ids);
  persistWhitelist();

  // Update checkbox inputs
  const inputs = categoryListContainer.querySelectorAll('input[type="checkbox"]');
  inputs.forEach((input) => {
    const catId = input.dataset.categoryId;
    input.checked = activeWhitelist.has(catId);
  });

  updatePresetButtons();
  updateCounterBadge();
}

/**
 * Update Master Switch UI state and indicator dot
 */
function updateMasterUI(enabled) {
  masterToggle.checked = enabled;
  if (enabled) {
    masterStatusDot.className = 'status-dot online';
    statusText.textContent = 'Focus Mode Active';
  } else {
    masterStatusDot.className = 'status-dot offline';
    statusText.textContent = 'Focus Mode Paused';
  }
}

/**
 * Check backend connection via background service worker or direct fetch
 */
function testBackendConnection() {
  retryConnectionBtn.textContent = 'Testing...';

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.connected) {
        retryConnectionBtn.textContent = 'Offline';
        retryConnectionBtn.style.color = '#f87171';
      } else {
        const ver = response.data?.version ? `v${response.data.version}` : '';
        retryConnectionBtn.textContent = `Online ${ver}`.trim();
        retryConnectionBtn.style.color = '#34d399';
      }
      setTimeout(() => {
        retryConnectionBtn.textContent = 'Test API';
        retryConnectionBtn.style.color = '';
      }, 2500);
    });
  } else {
    const rawUrl = (backendUrlInput.value.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    fetch(`${rawUrl}/health`)
      .then((r) => r.json())
      .then((data) => {
        retryConnectionBtn.textContent = `Online v${data.version || '0.1'}`;
        retryConnectionBtn.style.color = '#34d399';
      })
      .catch(() => {
        retryConnectionBtn.textContent = 'Offline';
        retryConnectionBtn.style.color = '#f87171';
      })
      .finally(() => {
        setTimeout(() => {
          retryConnectionBtn.textContent = 'Test API';
          retryConnectionBtn.style.color = '';
        }, 2500);
      });
  }
}

/**
 * Load initial values from chrome.storage.local
 */
function init() {
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  if (hasStorage) {
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
        const enabled = data.studytubeEnabled !== undefined ? !!data.studytubeEnabled : true;
        updateMasterUI(enabled);

        if (data.hideComments !== undefined) hideCommentsToggle.checked = !!data.hideComments;
        if (data.blockShortsScroll !== undefined) blockShortsScrollToggle.checked = !!data.blockShortsScroll;
        if (data.blockShortsPlayback !== undefined) blockShortsPlaybackToggle.checked = !!data.blockShortsPlayback;
        if (data.hideLiveChat !== undefined) hideChatToggle.checked = !!data.hideLiveChat;
        if (data.strictFallback !== undefined) strictFallbackToggle.checked = !!data.strictFallback;
        if (data.backendUrl) backendUrlInput.value = data.backendUrl;

        renderCategories(data.whitelistedCategories || PRESETS.study);
        updatePresetButtons();
        isInitializing = false;
      }
    );
  } else {
    updateMasterUI(true);
    renderCategories(PRESETS.study);
    updatePresetButtons();
    isInitializing = false;
  }

  // Master Switch
  masterToggle.addEventListener('change', () => {
    if (isInitializing) return;
    const val = masterToggle.checked;
    updateMasterUI(val);
    if (hasStorage) chrome.storage.local.set({ studytubeEnabled: val });
  });

  // Distraction Shield Listeners
  hideCommentsToggle.addEventListener('change', () => {
    if (isInitializing) return;
    if (hasStorage) chrome.storage.local.set({ hideComments: hideCommentsToggle.checked });
  });

  blockShortsScrollToggle.addEventListener('change', () => {
    if (isInitializing) return;
    if (hasStorage) chrome.storage.local.set({ blockShortsScroll: blockShortsScrollToggle.checked });
  });

  blockShortsPlaybackToggle.addEventListener('change', () => {
    if (isInitializing) return;
    if (hasStorage) chrome.storage.local.set({ blockShortsPlayback: blockShortsPlaybackToggle.checked });
  });

  hideChatToggle.addEventListener('change', () => {
    if (isInitializing) return;
    if (hasStorage) chrome.storage.local.set({ hideLiveChat: hideChatToggle.checked });
  });

  strictFallbackToggle.addEventListener('change', () => {
    if (isInitializing) return;
    if (hasStorage) chrome.storage.local.set({ strictFallback: strictFallbackToggle.checked });
  });

  // Presets
  presetStudy.addEventListener('click', () => applyPreset(PRESETS.study));
  presetStrict.addEventListener('click', () => applyPreset(PRESETS.strict));
  presetAll.addEventListener('click', () => applyPreset(PRESETS.all));
  presetClear.addEventListener('click', () => applyPreset(PRESETS.none));

  // Backend URL & Test
  retryConnectionBtn.addEventListener('click', testBackendConnection);

  saveBackendUrlBtn.addEventListener('click', () => {
    const rawUrl = backendUrlInput.value.trim() || 'http://127.0.0.1:8000';
    if (hasStorage) {
      chrome.storage.local.set({ backendUrl: rawUrl }, () => {
        saveBackendUrlBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBackendUrlBtn.textContent = 'Save';
        }, 1200);
        testBackendConnection();
      });
    } else {
      saveBackendUrlBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveBackendUrlBtn.textContent = 'Save';
      }, 1200);
      testBackendConnection();
    }
  });

  // Open Dashboard Link
  if (openDashboardLink) {
    openDashboardLink.addEventListener('click', (e) => {
      e.preventDefault();
      const rawUrl = (backendUrlInput.value.trim() || 'http://127.0.0.1:8000').replace(/\/+$/, '');
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: `${rawUrl}/dashboard` });
      } else {
        window.open(`${rawUrl}/dashboard`, '_blank');
      }
    });
  }

  // Real-time Storage Listener: Sync if settings change in Web Dashboard while popup is open
  if (hasStorage && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      isInitializing = true;
      try {
        if (changes.studytubeEnabled !== undefined) {
          updateMasterUI(changes.studytubeEnabled.newValue);
        }
        if (changes.hideComments !== undefined) {
          hideCommentsToggle.checked = !!changes.hideComments.newValue;
        }
        if (changes.blockShortsScroll !== undefined) {
          blockShortsScrollToggle.checked = !!changes.blockShortsScroll.newValue;
        }
        if (changes.blockShortsPlayback !== undefined) {
          blockShortsPlaybackToggle.checked = !!changes.blockShortsPlayback.newValue;
        }
        if (changes.hideLiveChat !== undefined) {
          hideChatToggle.checked = !!changes.hideLiveChat.newValue;
        }
        if (changes.strictFallback !== undefined) {
          strictFallbackToggle.checked = !!changes.strictFallback.newValue;
        }
        if (changes.whitelistedCategories !== undefined) {
          renderCategories(changes.whitelistedCategories.newValue);
          updatePresetButtons();
        }
        if (changes.backendUrl !== undefined && changes.backendUrl.newValue) {
          backendUrlInput.value = changes.backendUrl.newValue;
        }
      } finally {
        isInitializing = false;
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
