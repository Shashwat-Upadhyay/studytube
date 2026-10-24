/**
 * StudyTube — Content Script (Manifest V3)
 * Handles DOM metadata extraction, classification requests, category-based card blackout,
 * continuous Shorts scroll blocking, live chat shield, and grayscale video enforcement.
 */

(() => {
  'use strict';

  console.log('[StudyTube] Content script initializing...');

  const COLOR_OVERRIDE_KEY = 'studytubeColorOverrideVideoId';
  const COVER_CLASS = 'studytube-cover';
  const CARD_CLASS = 'studytube-blacked-out';
  const HIDDEN_CLASS = 'studytube-hide-target';
  const CHAT_SHIELD_CLASS = 'studytube-hide-chat';
  const GRAYSCALE_CLASS = 'studytube-video-grayscale';

  // Category display names mapping
  const CATEGORY_NAMES = {
    education_academics: 'Education & Academics',
    programming_technology: 'Programming & Tech',
    career_business: 'Career & Business',
    productivity_self_improvement: 'Productivity & Focus',
    health_fitness: 'Health & Fitness',
    documentaries_explainers: 'Documentaries & Deep Dives',
    news_current_affairs: 'News & Current Affairs',
    hobbies_creative_arts: 'Hobbies & Creative Arts',
    gaming: 'Gaming',
    entertainment_comedy: 'Entertainment & Comedy',
    music: 'Music',
    lifestyle_vlogs: 'Lifestyle & Vlogs',
    unknown: 'Unclassified / Unknown',
  };

  // State
  let settings = {
    studytubeEnabled: true,
    whitelistedCategories: [
      'education_academics',
      'programming_technology',
      'career_business',
      'productivity_self_improvement',
      'health_fitness',
      'documentaries_explainers',
      'unknown',
    ],
    hideLiveChat: true,
    blockShortsScroll: true,
    blockShortsPlayback: true,
    hideComments: true,
    strictFallback: true,
    allowUnknown: true,
  };

  let lastUrl = location.href;
  let currentVideoId = getVideoId(location.href);
  let colorOverrideActive = false;
  let colorOverrideVideoId = null;
  let commentsTemporarilyRevealed = false;

  // Frontend classification cache: video_id -> result
  const clientClassificationCache = new Map();
  // Set of video_ids currently being requested
  const pendingRequests = new Set();

  /**
   * Extract video ID from URL
   */
  function getVideoId(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v');
      }
      const match = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/?]+)/);
      if (match) return match[1];
    } catch (_) {}
    return null;
  }

  function isWatchPage() {
    return location.pathname === '/watch' || location.pathname.startsWith('/live/');
  }

  function isShortsPage() {
    return location.pathname.startsWith('/shorts');
  }

  function isVideoPlaybackPage() {
    return isWatchPage() || isShortsPage();
  }

  function isColorOverrideActive() {
    return colorOverrideActive;
  }

  /**
   * Apply / Remove grayscale filter on video playback (Watch and Shorts)
   */
  function applyVideoGrayscale(enable) {
    const shouldGrayscale = enable && settings.studytubeEnabled && !isColorOverrideActive();

    if (shouldGrayscale) {
      document.documentElement.classList.add(GRAYSCALE_CLASS);
      if (document.body) document.body.classList.add(GRAYSCALE_CLASS);
      document.querySelectorAll('video').forEach((v) => {
        v.style.setProperty('filter', 'grayscale(1)', 'important');
      });
    } else {
      document.documentElement.classList.remove(GRAYSCALE_CLASS);
      if (document.body) document.body.classList.remove(GRAYSCALE_CLASS);
      document.querySelectorAll('video').forEach((v) => {
        v.style.setProperty('filter', 'none', 'important');
      });
    }
  }

  /**
   * Live Chat Hiding Shield
   */
  function syncLiveChatShield() {
    const shouldHide = settings.studytubeEnabled && settings.hideLiveChat;
    if (shouldHide) {
      document.documentElement.classList.add(CHAT_SHIELD_CLASS);
      if (document.body) document.body.classList.add(CHAT_SHIELD_CLASS);
    } else {
      document.documentElement.classList.remove(CHAT_SHIELD_CLASS);
      if (document.body) document.body.classList.remove(CHAT_SHIELD_CLASS);
    }
  }

  /**
   * Comments Section Shield: Hides YouTube comments by default on Watch and Shorts
   */
  function syncCommentsShield() {
    if (!isVideoPlaybackPage()) {
      document.documentElement.classList.remove('studytube-hide-comments');
      if (document.body) document.body.classList.remove('studytube-hide-comments');
      const existing = document.getElementById('studytube-comments-placeholder');
      if (existing) existing.remove();
      return;
    }

    const shouldShield = settings.studytubeEnabled && settings.hideComments;

    if (!shouldShield) {
      document.documentElement.classList.remove('studytube-hide-comments');
      if (document.body) document.body.classList.remove('studytube-hide-comments');
      if (isWatchPage()) {
        const commentsContainer =
          document.querySelector('ytd-comments#comments') ||
          document.querySelector('#comments') ||
          document.querySelector('ytd-comments');
        if (commentsContainer) commentsContainer.classList.remove('studytube-comments-collapsed');
      }
      const placeholder = document.getElementById('studytube-comments-placeholder');
      if (placeholder) placeholder.remove();
      return;
    }

    // On Shorts, hide comments button and close open comments drawer
    if (isShortsPage()) {
      document.documentElement.classList.add('studytube-hide-comments');
      if (document.body) document.body.classList.add('studytube-hide-comments');
      syncShortsUI();
      const closeBtn = document.querySelector(
        'ytd-shorts #shorts-panel-container [aria-label*="Close" i], ytd-shorts ytd-engagement-panel-section-list-renderer [aria-label*="Close" i], #shorts-panel-container #visibility-button'
      );
      if (closeBtn) {
        try { closeBtn.click(); } catch (_) {}
      }
      return;
    }

    const commentsContainer =
      document.querySelector('ytd-comments#comments') ||
      document.querySelector('#comments') ||
      document.querySelector('ytd-comments');

    if (!commentsContainer) return;

    const isRevealed = commentsTemporarilyRevealed;

    if (isRevealed) {
      document.documentElement.classList.remove('studytube-hide-comments');
      if (document.body) document.body.classList.remove('studytube-hide-comments');
      commentsContainer.classList.remove('studytube-comments-collapsed');
    } else {
      document.documentElement.classList.add('studytube-hide-comments');
      if (document.body) document.body.classList.add('studytube-hide-comments');
      commentsContainer.classList.add('studytube-comments-collapsed');
    }

    let placeholder = document.getElementById('studytube-comments-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'studytube-comments-placeholder';
      if (commentsContainer.firstChild) {
        commentsContainer.insertBefore(placeholder, commentsContainer.firstChild);
      } else {
        commentsContainer.appendChild(placeholder);
      }
    } else {
      if (placeholder.parentElement !== commentsContainer) {
        if (commentsContainer.firstChild) {
          commentsContainer.insertBefore(placeholder, commentsContainer.firstChild);
        } else {
          commentsContainer.appendChild(placeholder);
        }
      }
    }

    const stateKey = isRevealed ? 'revealed' : 'hidden';

    // Only update innerHTML when the visual state actually changes to avoid dropping click events
    if (placeholder.dataset.state !== stateKey) {
      placeholder.dataset.state = stateKey;
      placeholder.className = isRevealed
        ? 'studytube-comments-placeholder is-revealed'
        : 'studytube-comments-placeholder';

      placeholder.innerHTML = isRevealed
        ? `
          <div class="studytube-comments-info">
            <div class="studytube-comments-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
            <div class="studytube-comments-texts">
              <div class="studytube-comments-title">Comments temporarily shown</div>
              <div class="studytube-comments-subtitle">Click to re-hide comments and restore focus shield.</div>
            </div>
          </div>
          <button type="button" class="studytube-comments-toggle-btn" id="studytube-comments-toggle-action">
            Hide comments
          </button>
        `
        : `
          <div class="studytube-comments-info">
            <div class="studytube-comments-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                <path d="M7 9h10v2H7zm0-3h10v2H7z"/>
              </svg>
            </div>
            <div class="studytube-comments-texts">
              <div class="studytube-comments-title">Comments hidden by StudyTube</div>
              <div class="studytube-comments-subtitle">Comments are disabled in focus mode to protect your attention.</div>
            </div>
          </div>
          <button type="button" class="studytube-comments-toggle-btn" id="studytube-comments-toggle-action">
            Show anyway
          </button>
        `;

      const actionBtn = placeholder.querySelector('#studytube-comments-toggle-action');
      if (actionBtn) {
        actionBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          commentsTemporarilyRevealed = !commentsTemporarilyRevealed;
          syncCommentsShield();
        };
      }
    }
  }

  let shortsListenersAttached = false;

  function attachShortsScrollListeners() {
    if (shortsListenersAttached) return;
    window.addEventListener('wheel', handleShortsScrollAttempt, { passive: false, capture: true });
    window.addEventListener('touchmove', handleShortsScrollAttempt, { passive: false, capture: true });
    window.addEventListener('keydown', handleShortsScrollAttempt, { capture: true });
    shortsListenersAttached = true;
  }

  function detachShortsScrollListeners() {
    if (!shortsListenersAttached) return;
    window.removeEventListener('wheel', handleShortsScrollAttempt, { capture: true });
    window.removeEventListener('touchmove', handleShortsScrollAttempt, { capture: true });
    window.removeEventListener('keydown', handleShortsScrollAttempt, { capture: true });
    shortsListenersAttached = false;
  }

  /**
   * Remove Shorts navigation scroll arrows (down arrow / up arrow)
   */
  function removeShortsNavigationArrows() {
    if (!isShortsPage()) return;
    const arrows = document.querySelectorAll(
      '#navigation-button-down, #navigation-button-up, ytd-shorts #navigation-button-down, ytd-shorts #navigation-button-up, ytd-shorts [id*="navigation-button"], body [id*="navigation-button"], ytd-shorts [aria-label*="Next video" i], ytd-shorts [aria-label*="Previous video" i], ytd-shorts [aria-label*="Next" i], ytd-shorts [aria-label*="Previous" i]'
    );
    arrows.forEach((el) => {
      try {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.remove();
      } catch (_) {}
    });
  }

  /**
   * Complete Shorts Blocker: Blocks scrolling and disables video playback completely
   */
  function syncShortsBlocker() {
    const shouldBlock =
      settings.studytubeEnabled && (settings.blockShortsScroll || settings.blockShortsPlayback);

    if (shouldBlock && isShortsPage()) {
      document.documentElement.classList.add('studytube-block-shorts');
      if (document.body) document.body.classList.add('studytube-block-shorts');
      if (settings.blockShortsScroll) {
        attachShortsScrollListeners();
        removeShortsNavigationArrows();
      } else {
        detachShortsScrollListeners();
      }
    } else {
      document.documentElement.classList.remove('studytube-block-shorts');
      if (document.body) document.body.classList.remove('studytube-block-shorts');
      detachShortsScrollListeners();
    }

    if (!shouldBlock || !isShortsPage()) {
      const existing = document.getElementById('studytube-shorts-blocker');
      if (existing) existing.remove();
      return;
    }

    if (settings.blockShortsPlayback) {
      // Freeze video playback immediately
      document.querySelectorAll('video').forEach((v) => {
        try {
          v.pause();
          v.currentTime = 0;
          v.muted = true;
        } catch (_) {}
      });

      let blocker = document.getElementById('studytube-shorts-blocker');
      if (!blocker) {
        blocker = document.createElement('div');
        blocker.id = 'studytube-shorts-blocker';
        blocker.className = 'studytube-shorts-full-blocker';
        blocker.innerHTML = `
          <div class="studytube-shorts-blocker-content">
            <div class="studytube-shorts-blocker-icon">🚫</div>
            <h2>Shorts Completely Blocked</h2>
            <p>StudyTube has blocked Shorts playback and scrolling completely to protect your focus.</p>
            <button type="button" id="studytube-leave-shorts-btn" class="studytube-leave-shorts-btn">
              ← Return to YouTube Home
            </button>
          </div>
        `;
        document.body.appendChild(blocker);

        document.getElementById('studytube-leave-shorts-btn')?.addEventListener('click', () => {
          location.href = 'https://www.youtube.com/';
        });
      }
    }
  }

  function handleShortsScrollAttempt(event) {
    if (!settings.studytubeEnabled || !settings.blockShortsScroll || !isShortsPage()) {
      return;
    }

    // Completely block all wheel and touch scrolling on Shorts
    if (event.type === 'wheel' || event.type === 'touchmove') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Completely block scroll/navigation keys on Shorts
    if (event.type === 'keydown') {
      const blockedKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Spacebar', 'Home', 'End', 'j', 'k'];
      if (blockedKeys.includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  // Intercept click on any navigation arrows
  window.addEventListener('click', (e) => {
    if (settings.studytubeEnabled && settings.blockShortsScroll && isShortsPage()) {
      if (e.target && e.target.closest && e.target.closest('#navigation-button-down, #navigation-button-up, [id*="navigation-button"], [aria-label*="Next video" i], [aria-label*="Previous video" i]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  window.addEventListener('play', (e) => {
    if (settings.studytubeEnabled && settings.blockShortsPlayback && isShortsPage()) {
      if (e.target && e.target.tagName === 'VIDEO') {
        e.target.pause();
        e.target.currentTime = 0;
        e.target.muted = true;
      }
      return;
    }
    if (settings.studytubeEnabled && !isColorOverrideActive()) {
      if (e.target && e.target.tagName === 'VIDEO') {
        e.target.style.setProperty('filter', 'grayscale(1)', 'important');
      }
    }
  }, true);

  /**
   * Extract video card elements from YouTube Home, Watch Sidebar, and Shorts Shelves
   */
  function getRecommendationCards() {
    const selectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-compact-radio-renderer',
      'ytd-compact-playlist-renderer',
      'ytd-reel-item-renderer',
      'yt-reel-item-view-model',
      'yt-lockup-view-model',
    ];

    const isWatch = isWatchPage();
    const searchRoot = isWatch
      ? (document.querySelector('#secondary, ytd-watch-next-secondary-results-renderer, #related') || document)
      : document;

    const found = new Set();
    selectors.forEach((sel) => {
      searchRoot.querySelectorAll(sel).forEach((el) => {
        // Guarantee we never touch sticky navigation, filter chips, guide or headers
        if (el.closest('#masthead-container, ytd-masthead, #chips-wrapper, ytd-feed-filter-chip-bar-renderer, #header, #guide, ytd-mini-guide-renderer, yt-page-header-renderer')) {
          return;
        }
        // Do not black out the primary playing video area on watch page
        if (isWatch && el.closest('#primary, ytd-player, #movie_player, #player')) return;
        // Avoid nested selection
        if (el.parentElement && el.parentElement.closest(selectors.join(','))) return;
        // Must contain a video or shorts link
        if (!el.querySelector('a[href*="/watch"], a[href*="/shorts/"]')) return;
        found.add(el);
      });
    });

    return [...found].filter((el) => {
      if (!isWatch) return true;
      return !!el.closest('#secondary, ytd-watch-next-secondary-results-renderer, #related');
    });
  }

  /**
   * Extract video ID, Title, and Channel Name from a card
   */
  function parseViewsCount(str) {
    if (!str) return 0;
    const match = str.match(/([\d,.]+)\s*([KMBkmb]?)\s*(?:views|visualizaciones|vues|Aufrufe)?/i);
    if (!match) return 0;
    const rawNum = parseFloat(match[1].replace(/,/g, ''));
    if (isNaN(rawNum)) return 0;
    const multiplier = (match[2] || '').toUpperCase();
    if (multiplier === 'K') return Math.round(rawNum * 1000);
    if (multiplier === 'M') return Math.round(rawNum * 1000000);
    if (multiplier === 'B') return Math.round(rawNum * 1000000000);
    return Math.round(rawNum);
  }

  function extractCardMetadata(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return null;

    const videoId = getVideoId(link.href);
    if (!videoId) return null;

    // Title extraction
    let title = '';
    const titleEl = card.querySelector('#video-title, .yt-lockup-metadata-view-model h3, h3 a, yt-formatted-string[title]');
    if (titleEl) {
      title = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
    }
    if (!title && link.getAttribute('title')) {
      title = link.getAttribute('title').trim();
    }
    if (!title && link.getAttribute('aria-label')) {
      title = link.getAttribute('aria-label').trim();
    }

    // Channel name extraction
    let channelName = '';
    const channelEl = card.querySelector(
      'ytd-channel-name yt-formatted-string, #channel-name, .yt-lockup-metadata-view-model span.yt-core-attributed-string, a[href^="/@"]'
    );
    if (channelEl) {
      channelName = (channelEl.textContent || '').trim();
    }

    // View count extraction for SQLite LFU cache prioritization
    let views = 0;
    const metaSpans = card.querySelectorAll('#metadata-line span, span.inline-metadata-item');
    for (const span of metaSpans) {
      const text = (span.textContent || '').trim();
      if (text.toLowerCase().includes('view') || text.match(/[\d,.]+\s*(?:K|M|B)?\s*views?/i)) {
        views = parseViewsCount(text);
        if (views > 0) break;
      }
    }
    if (views === 0) {
      const aria = card.getAttribute('aria-label') || link.getAttribute('aria-label') || '';
      views = parseViewsCount(aria);
    }

    return {
      video_id: videoId,
      title: title || `YouTube Video ${videoId}`,
      channel_name: channelName || null,
      url: link.href,
      views: views || 0,
    };
  }

  /**
   * Hide thumbnail & preview contents behind the blackout cover
   */
  function hideCardContents(card) {
    const candidates = card.querySelectorAll(
      '#content, #dismissible, .yt-lockup-view-model, a#thumbnail, ytd-thumbnail, .yt-lockup-metadata-view-model, h3'
    );
    let target = [...candidates].find((el) => el !== card && !el.classList.contains(COVER_CLASS));
    if (!target) target = card.firstElementChild;
    if (target && target !== card && !target.classList.contains(COVER_CLASS)) {
      if (!target.classList.contains(HIDDEN_CLASS)) {
        target.classList.add(HIDDEN_CLASS);
      }
    }
  }

  /**
   * Remove blackout cover and restore card visibility
   */
  function removeBlackout(card) {
    card.classList.remove(CARD_CLASS);
    const hidden = card.querySelectorAll('.' + HIDDEN_CLASS);
    hidden.forEach((el) => el.classList.remove(HIDDEN_CLASS));
    const cover = card.querySelector('.' + COVER_CLASS);
    if (cover) cover.remove();
  }

  /**
   * Apply pending blackout cover while video is in the classification queue
   */
  function applyPendingCover(card) {
    if (!card.classList.contains(CARD_CLASS)) {
      card.classList.add(CARD_CLASS);
    }
    hideCardContents(card);

    let cover = card.querySelector('.' + COVER_CLASS);
    if (!cover) {
      cover = document.createElement('div');
      cover.className = COVER_CLASS + ' is-pending';
      cover.dataset.pending = 'true';
      cover.innerHTML = `
        <div class="studytube-pending-spinner"></div>
        <div class="studytube-cover-badge is-pending-badge">⏳ Classification Pending</div>
        <div class="studytube-cover-title">StudyTube Focus Mode</div>
        <div class="studytube-cover-subtext">Queued for AI classification...</div>
      `;
      card.appendChild(cover);
    } else if (cover.dataset.pending !== 'true' && !cover.dataset.category) {
      cover.classList.add('is-pending');
      cover.dataset.pending = 'true';
      cover.innerHTML = `
        <div class="studytube-pending-spinner"></div>
        <div class="studytube-cover-badge is-pending-badge">⏳ Classification Pending</div>
        <div class="studytube-cover-title">StudyTube Focus Mode</div>
        <div class="studytube-cover-subtext">Queued for AI classification...</div>
      `;
    }
  }

  /**
   * Apply blackout cover with category indicator and reveal action
   */
  function applyBlackout(card, category) {
    if (!card.classList.contains(CARD_CLASS)) {
      card.classList.add(CARD_CLASS);
    }
    hideCardContents(card);

    let cover = card.querySelector('.' + COVER_CLASS);
    const catDisplayName = CATEGORY_NAMES[category] || category;

    const setupOpenHandler = (coverEl) => {
      if (coverEl.dataset.hasClickListener) return;
      coverEl.dataset.hasClickListener = 'true';
      const openVideo = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const link = card.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
        if (!link) return;
        const targetUrl = new URL(link.href, location.origin);
        colorOverrideVideoId = null;
        chrome.storage.local.remove([COLOR_OVERRIDE_KEY], () => {
          location.href = targetUrl.href;
        });
      };
      coverEl.addEventListener('click', openVideo);
      coverEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') openVideo(event);
      });
    };

    if (!cover) {
      cover = document.createElement('div');
      cover.className = COVER_CLASS;
      cover.setAttribute('role', 'button');
      cover.setAttribute('tabindex', '0');
      cover.setAttribute('aria-label', `StudyTube: Blocked ${catDisplayName}. Click to reveal and watch in grayscale`);
      setupOpenHandler(cover);
      card.appendChild(cover);
    } else {
      cover.classList.remove('is-pending');
      cover.removeAttribute('data-pending');
      cover.setAttribute('role', 'button');
      cover.setAttribute('tabindex', '0');
      setupOpenHandler(cover);
    }

    if (cover.dataset.category !== category) {
      cover.dataset.category = category;
      cover.setAttribute('aria-label', `StudyTube: Blocked ${catDisplayName}. Click to reveal and watch in grayscale`);
      cover.innerHTML = `
        <div class="studytube-cover-badge">🛡️ Blocked: ${catDisplayName}</div>
        <div class="studytube-cover-title">StudyTube Focus Mode</div>
        <div class="studytube-cover-action">Click to reveal &amp; watch in grayscale</div>
      `;
    }
  }

  /**
   * Show category tag in top right corner of thumbnail for whitelisted videos
   */
  function applyThumbnailTag(card, category) {
    const thumbContainer =
      card.querySelector('ytd-thumbnail') ||
      card.querySelector('a#thumbnail') ||
      card.querySelector('.yt-lockup-view-model__thumbnail') ||
      card.querySelector('#thumbnail') ||
      card.querySelector('.thumbnail-container');

    if (!thumbContainer) return;

    const currentPos = window.getComputedStyle(thumbContainer).position;
    if (!currentPos || currentPos === 'static') {
      thumbContainer.style.position = 'relative';
    }

    const catName = CATEGORY_NAMES[category] || category;
    let tag = thumbContainer.querySelector('.studytube-thumbnail-tag');
    if (!tag) {
      tag = document.createElement('div');
      tag.className = 'studytube-thumbnail-tag';
      thumbContainer.appendChild(tag);
    }

    if (tag.dataset.category !== category) {
      tag.dataset.category = category;
      tag.textContent = catName;
      tag.title = `StudyTube Category: ${catName}`;
    }
  }

  function removeThumbnailTag(card) {
    const tag = card.querySelector('.studytube-thumbnail-tag');
    if (tag) tag.remove();
  }

  /**
   * Determine if category is allowed by user's whitelist policy
   */
  function isCategoryWhitelisted(category, isFallback) {
    if (isFallback) {
      return false;
    }
    if (!category || category === 'unknown') {
      return false;
    }
    const whitelist = settings.whitelistedCategories || [];
    return whitelist.includes(category);
  }

  // Sequential Classification Queue: only 1 video request in flight at a time
  const enqueuedVideoIds = new Set();
  const classificationQueue = [];
  let isQueueProcessing = false;

  function sendClassifyMessage(task) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'CLASSIFY_VIDEO',
          payload: {
            video_id: task.videoId,
            title: task.title,
            channel_name: task.channelName,
            url: task.url,
            views: task.views || 0,
          },
        },
        (response) => {
          if (chrome.runtime.lastError || !response || response.success === false) {
            resolve({
              category: response?.category || 'gaming',
              is_fallback: true,
              confidence: 0.1,
            });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async function processClassificationQueue() {
    if (isQueueProcessing) return;
    isQueueProcessing = true;

    while (classificationQueue.length > 0) {
      const task = classificationQueue.shift();

      let cached = clientClassificationCache.get(task.videoId);
      if (!cached) {
        // Await single request completion before starting next item
        const response = await sendClassifyMessage(task);
        const category = response.category || 'gaming';
        const isFallback = !!response.is_fallback;

        cached = {
          category: category,
          confidence: response.confidence,
          is_fallback: isFallback,
        };
        clientClassificationCache.set(task.videoId, cached);
      }

      enqueuedVideoIds.delete(task.videoId);
      updateCardsForVideoId(task.videoId, cached);
    }

    isQueueProcessing = false;
  }

  function updateCardsForVideoId(videoId, cached) {
    const isAllowed = isCategoryWhitelisted(cached.category, cached.is_fallback);
    const cards = getRecommendationCards();

    cards.forEach((card) => {
      const meta = extractCardMetadata(card);
      if (meta && meta.video_id === videoId) {
        if (isAllowed) {
          removeBlackout(card);
          applyThumbnailTag(card, cached.category);
        } else {
          removeThumbnailTag(card);
          applyBlackout(card, cached.category);
        }
      }
    });
  }

  /**
   * Evaluate a card and apply filtering policy
   */
  function evaluateCard(card) {
    if (!settings.studytubeEnabled) {
      removeBlackout(card);
      removeThumbnailTag(card);
      return;
    }

    const meta = extractCardMetadata(card);
    if (!meta || !meta.video_id) return;

    // 1. If already classified in cache, apply decision immediately
    if (clientClassificationCache.has(meta.video_id)) {
      const cached = clientClassificationCache.get(meta.video_id);
      const isAllowed = isCategoryWhitelisted(cached.category, cached.is_fallback);

      if (isAllowed) {
        removeBlackout(card);
        applyThumbnailTag(card, cached.category);
      } else {
        removeThumbnailTag(card);
        applyBlackout(card, cached.category);
      }
      return;
    }

    // 2. Video is pending classification: immediately black out with pending badge
    applyPendingCover(card);

    // 3. Deduplicate in queue
    if (enqueuedVideoIds.has(meta.video_id)) {
      return;
    }

    enqueuedVideoIds.add(meta.video_id);
    classificationQueue.push({
      videoId: meta.video_id,
      title: meta.title,
      channelName: meta.channel_name,
      url: meta.url,
      views: meta.views || 0,
    });

    processClassificationQueue();
  }

  /**
   * Process all recommendation cards on the page
   */
  function processRecommendationCards() {
    const cards = getRecommendationCards();
    cards.forEach(evaluateCard);
  }

  /**
   * Manual Color Toggle Button on Watch & Shorts
   */
  function toggleColorMode() {
    const videoId = getVideoId(location.href) || currentVideoId || 'current';
    if (isColorOverrideActive()) {
      colorOverrideActive = false;
      colorOverrideVideoId = null;
      applyVideoGrayscale(true);
      try { chrome.storage.local.remove(COLOR_OVERRIDE_KEY); } catch (_) {}
    } else {
      colorOverrideActive = true;
      colorOverrideVideoId = videoId;
      applyVideoGrayscale(false);
      try { chrome.storage.local.set({ [COLOR_OVERRIDE_KEY]: videoId }); } catch (_) {}
    }
    syncColorToggleButton();
    syncShortsUI();
  }

  /**
   * Manual Color Toggle Button on Watch Page (Native YouTube Action Bar UI)
   */
  function syncColorToggleButton() {
    if (!isWatchPage() || !settings.studytubeEnabled) {
      const existing = document.querySelector('.studytube-color-toggle');
      if (existing) existing.remove();
      return;
    }

    const actionsBar =
      document.querySelector('#top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #top-level-buttons-computed') ||
      document.querySelector('#actions-inner #top-level-buttons-computed') ||
      document.querySelector('#actions-inner') ||
      document.querySelector('ytd-watch-metadata #actions');

    if (!actionsBar) return;

    // Locate YouTube Share button to place our button directly beside it
    let shareContainer = null;
    const candidates = actionsBar.querySelectorAll(
      'button-view-model, yt-button-view-model, ytd-button-renderer, button'
    );
    for (const el of candidates) {
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const text = (el.textContent || '').trim().toLowerCase();
      if (ariaLabel.includes('share') || title.includes('share') || text === 'share') {
        let parent = el;
        while (parent && parent.parentElement !== actionsBar) {
          parent = parent.parentElement;
        }
        shareContainer = parent || el;
        break;
      }
    }

    let button = document.getElementById('studytube-view-in-color-btn') || document.querySelector('.studytube-color-toggle');
    if (!button) {
      button = document.createElement('button');
      button.className = 'studytube-color-toggle';
      button.type = 'button';
      button.id = 'studytube-view-in-color-btn';
    }

    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleColorMode();
    };

    const isColor = isColorOverrideActive();
    const stateStr = isColor ? 'color' : 'grayscale';

    // Only update innerHTML when the visual state actually changes to avoid dropping click events
    if (button.dataset.state !== stateStr) {
      button.dataset.state = stateStr;

      if (isColor) {
        button.classList.add('is-colored');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('title', 'Return to StudyTube Grayscale');
        button.innerHTML = `
          <svg class="studytube-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V4c4.41 0 8 3.59 8 8s-3.59 8-8 8z"/>
          </svg>
          <span class="studytube-btn-label">Grayscale</span>
        `;
      } else {
        button.classList.remove('is-colored');
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('title', 'Watch this video in color');
        button.innerHTML = `
          <svg class="studytube-btn-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.59 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
            <circle cx="12" cy="12" r="3.2"/>
          </svg>
          <span class="studytube-btn-label">View in color</span>
        `;
      }
    }

    // Insert directly beside the Share button if present, or append
    if (shareContainer && shareContainer.parentNode === actionsBar) {
      if (button.previousElementSibling !== shareContainer) {
        shareContainer.insertAdjacentElement('afterend', button);
      }
    } else if (!actionsBar.contains(button)) {
      actionsBar.appendChild(button);
    }
  }

  // --- Notes Taking In-Page UI ---
  let activeNotesVideoId = null;
  let cachedVideoNotes = [];
  let notesPanelCollapsed = false;
  let lockedTimestampSeconds = null;

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function getActivePlayerVideo() {
    return document.querySelector('#movie_player video') || document.querySelector('video');
  }

  function escapeHTML(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fetchAndRenderNotesForCurrentVideo(force = false) {
    const vid = currentVideoId || getVideoId(location.href);
    if (!vid) return;

    if (!force && activeNotesVideoId === vid && cachedVideoNotes.length > 0) {
      renderNotesList(cachedVideoNotes);
      return;
    }

    activeNotesVideoId = vid;
    try {
      chrome.runtime.sendMessage(
        { type: 'GET_VIDEO_NOTES', videoId: vid },
        (res) => {
          if (chrome.runtime.lastError) {
            console.debug('[StudyTube Notes] Background connection:', chrome.runtime.lastError.message);
            return;
          }
          if (res && res.success && Array.isArray(res.notes)) {
            cachedVideoNotes = res.notes;
            renderNotesList(cachedVideoNotes);
          }
        }
      );
    } catch (_) {}
  }

  function renderNotesList(notes) {
    const listEl = document.getElementById('studytubeNotesList');
    const badgeEl = document.getElementById('studytubeNotesCountBadge');
    if (!listEl) return;

    if (badgeEl) {
      const count = (notes || []).length;
      badgeEl.textContent = count === 1 ? '1 note' : `${count} notes`;
    }

    if (!notes || notes.length === 0) {
      listEl.innerHTML = `
        <div class="studytube-notes-empty">
          <div class="studytube-empty-icon">📝</div>
          <div class="studytube-empty-text">No notes yet for this video</div>
          <div class="studytube-empty-sub">Type above to save your first timestamped note!</div>
        </div>
      `;
      return;
    }

    // Sort by timestamp_seconds ascending
    const sorted = [...notes].sort((a, b) => (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0));

    listEl.innerHTML = sorted.map((n) => `
      <div class="studytube-note-item" data-id="${n.id}">
        <div class="studytube-note-item-header">
          <button type="button" class="studytube-seek-btn" data-seconds="${n.timestamp_seconds}" title="Jump video to ${escapeHTML(n.timestamp_formatted)}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>${escapeHTML(n.timestamp_formatted)}</span>
          </button>
          <div class="studytube-note-item-meta">
            <button type="button" class="studytube-delete-note-btn" data-id="${n.id}" title="Delete note">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="studytube-note-content">${escapeHTML(n.content)}</div>
      </div>
    `).join('');

    // Attach click listeners for seeking video
    listEl.querySelectorAll('.studytube-seek-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sec = parseFloat(btn.dataset.seconds || '0');
        const v = getActivePlayerVideo();
        if (v) {
          v.currentTime = sec;
          try { v.play(); } catch (_) {}
          const player = document.querySelector('#movie_player') || v;
          if (player && typeof player.scrollIntoView === 'function') {
            player.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      };
    });

    // Attach delete listeners
    listEl.querySelectorAll('.studytube-delete-note-btn').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const noteId = parseInt(btn.dataset.id, 10);
        if (!noteId) return;

        const itemEl = btn.closest('.studytube-note-item');
        if (itemEl) {
          itemEl.style.opacity = '0.4';
          itemEl.style.pointerEvents = 'none';
        }

        chrome.runtime.sendMessage({ type: 'DELETE_NOTE', id: noteId }, (res) => {
          if (chrome.runtime.lastError) {
            console.warn('[StudyTube Notes] Delete error:', chrome.runtime.lastError.message);
            if (itemEl) {
              itemEl.style.opacity = '1';
              itemEl.style.pointerEvents = 'auto';
            }
            return;
          }
          if (res && res.success) {
            cachedVideoNotes = cachedVideoNotes.filter((x) => x.id !== noteId);
            renderNotesList(cachedVideoNotes);
          } else {
            if (itemEl) {
              itemEl.style.opacity = '1';
              itemEl.style.pointerEvents = 'auto';
            }
          }
        });
      };
    });
  }

  function syncNotesPanel() {
    if (!isWatchPage()) {
      const existing = document.getElementById('studytube-notes-panel');
      if (existing) existing.remove();
      return;
    }

    // Secondary column beside video during non-maximise standard playback
    const secondaryInner =
      document.querySelector('#secondary #secondary-inner') ||
      document.querySelector('#secondary') ||
      document.querySelector('ytd-watch-flexy #columns #secondary');

    if (!secondaryInner) return;

    let panel = document.getElementById('studytube-notes-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'studytube-notes-panel';
      panel.className = 'studytube-notes-panel';

      panel.innerHTML = `
        <div class="studytube-notes-header">
          <div class="studytube-notes-title-group">
            <div class="studytube-notes-logo">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </div>
            <span class="studytube-notes-title">Study Notes</span>
            <span class="studytube-notes-count-badge" id="studytubeNotesCountBadge">0 notes</span>
          </div>
          <div class="studytube-notes-header-actions">
            <a href="http://127.0.0.1:8000/dashboard#notes" target="_blank" class="studytube-notes-tool-btn" title="Open StudyTube Notebook in Web Dashboard">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
            <button type="button" class="studytube-notes-tool-btn" id="studytubeNotesCollapseBtn" title="Toggle Notes Panel">
              <svg class="studytube-collapse-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <div class="studytube-notes-body" id="studytubeNotesBody">
          <div class="studytube-composer-card">
            <div class="studytube-composer-row">
              <button type="button" class="studytube-timestamp-chip" id="studytubeTimestampChip" title="Click to lock/unlock current timestamp">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span id="studytubeTsDisplay">00:00</span>
              </button>
              <span class="studytube-ts-hint" id="studytubeTsHint">Live video time</span>
            </div>

            <textarea id="studytubeNoteInput" class="studytube-note-input" rows="2" placeholder="Take a note at this timestamp... (Enter to save, Shift+Enter for newline)"></textarea>

            <div class="studytube-composer-actions">
              <span class="studytube-note-status" id="studytubeNoteStatus"></span>
              <button type="button" class="studytube-save-note-btn" id="studytubeSaveNoteBtn">
                Save Note
              </button>
            </div>
          </div>

          <div class="studytube-notes-list" id="studytubeNotesList">
            <!-- Notes list rendered here -->
          </div>
        </div>
      `;

      // Setup collapse toggle
      const collapseBtn = panel.querySelector('#studytubeNotesCollapseBtn');
      if (collapseBtn) {
        collapseBtn.onclick = (e) => {
          e.preventDefault();
          notesPanelCollapsed = !notesPanelCollapsed;
          panel.classList.toggle('is-collapsed', notesPanelCollapsed);
        };
      }

      // Timestamp chip click to toggle lock
      const tsChip = panel.querySelector('#studytubeTimestampChip');
      const tsHint = panel.querySelector('#studytubeTsHint');
      if (tsChip) {
        tsChip.onclick = (e) => {
          e.preventDefault();
          const v = getActivePlayerVideo();
          if (lockedTimestampSeconds !== null) {
            lockedTimestampSeconds = null;
            tsChip.classList.remove('is-locked');
            if (tsHint) tsHint.textContent = 'Live video time';
          } else {
            lockedTimestampSeconds = v ? Math.floor(v.currentTime) : 0;
            tsChip.classList.add('is-locked');
            if (tsHint) tsHint.textContent = 'Timestamp locked';
          }
        };
      }

      // Save Note logic
      const saveBtn = panel.querySelector('#studytubeSaveNoteBtn');
      const noteInput = panel.querySelector('#studytubeNoteInput');
      const statusEl = panel.querySelector('#studytubeNoteStatus');

      const handleSave = async () => {
        const text = (noteInput ? noteInput.value : '').trim();
        if (!text) {
          if (noteInput) noteInput.focus();
          return;
        }

        const v = getActivePlayerVideo();
        const currentSec = lockedTimestampSeconds !== null
          ? lockedTimestampSeconds
          : (v ? Math.floor(v.currentTime) : 0);

        const currentUrl = location.href;
        let videoTitle = document.title ? document.title.replace(/ - YouTube$/, '').trim() : '';
        const titleEl = document.querySelector('h1.ytd-watch-metadata') || document.querySelector('#title h1');
        if (titleEl && titleEl.textContent) {
          videoTitle = titleEl.textContent.trim();
        }

        if (statusEl) {
          statusEl.textContent = 'Saving...';
          statusEl.className = 'studytube-note-status saving';
        }
        if (saveBtn) saveBtn.disabled = true;

        chrome.runtime.sendMessage(
          {
            type: 'SAVE_NOTE',
            payload: {
              url: currentUrl,
              timestamp: currentSec,
              content: text,
              title: videoTitle || null,
            },
          },
          (res) => {
            if (saveBtn) saveBtn.disabled = false;

            if (chrome.runtime.lastError) {
              const errStr = chrome.runtime.lastError.message || '';
              console.warn('[StudyTube Notes] Save communication error:', errStr);
              if (statusEl) {
                const isOrphaned =
                  errStr.includes('context invalidated') ||
                  errStr.includes('Receiving end does not exist') ||
                  errStr.includes('Could not establish connection') ||
                  errStr.includes('message port closed');

                if (isOrphaned) {
                  statusEl.textContent = 'Extension reloaded. Please refresh this tab (F5)!';
                } else {
                  statusEl.textContent = `Extension error: ${errStr}`;
                }
                statusEl.className = 'studytube-note-status error';
              }
              return;
            }

            if (res && res.success && res.note) {
              if (noteInput) noteInput.value = '';
              lockedTimestampSeconds = null;
              if (tsChip) tsChip.classList.remove('is-locked');
              if (tsHint) tsHint.textContent = 'Live video time';

              if (statusEl) {
                statusEl.textContent = 'Saved!';
                statusEl.className = 'studytube-note-status saved';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
              }

              // Update cached notes
              cachedVideoNotes.push(res.note);
              renderNotesList(cachedVideoNotes);
            } else {
              if (statusEl) {
                statusEl.textContent = (res && res.error) || 'Failed to save';
                statusEl.className = 'studytube-note-status error';
              }
            }
          }
        );
      };

      if (saveBtn) {
        saveBtn.onclick = (e) => {
          e.preventDefault();
          handleSave();
        };
      }

      if (noteInput) {
        noteInput.onkeydown = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        };
      }
    }

    // Insert at top of secondary column
    if (secondaryInner.firstChild) {
      if (panel.parentElement !== secondaryInner || panel !== secondaryInner.firstChild) {
        secondaryInner.insertBefore(panel, secondaryInner.firstChild);
      }
    } else {
      if (panel.parentElement !== secondaryInner) {
        secondaryInner.appendChild(panel);
      }
    }

    // Refresh notes if video changed
    const vid = currentVideoId || getVideoId(location.href);
    if (vid && vid !== activeNotesVideoId) {
      fetchAndRenderNotesForCurrentVideo(true);
    }
  }

  // Periodic ticker for live timestamp display
  setInterval(() => {
    if (!isWatchPage()) return;
    const tsDisplay = document.getElementById('studytubeTsDisplay');
    if (!tsDisplay) return;

    if (lockedTimestampSeconds !== null) {
      tsDisplay.textContent = formatTime(lockedTimestampSeconds);
    } else {
      const v = getActivePlayerVideo();
      if (v && !isNaN(v.currentTime)) {
        tsDisplay.textContent = formatTime(v.currentTime);
      }
    }
  }, 400);

  /**
   * Check if an element is a genuine Shorts action bar (Wiz or Polymer)
   */
  function isShortsActionBar(el) {
    if (!el || !el.children || el.children.length < 2) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'reel-action-bar-view-model') return true;
    if (el.id === 'actions' && (el.closest('ytd-shorts') || el.closest('ytd-reel-video-renderer') || el.closest('ytd-reel-player-overlay-renderer'))) return true;
    return false;
  }

  /**
   * Find all Shorts action bars on the page (both active and preloaded reels, Wiz and Polymer)
   */
  function getAllShortsActionBars() {
    const bars = new Set();

    // 1. Wiz / Modern YouTube Shorts action bar view-models (the true container element)
    document.querySelectorAll('reel-action-bar-view-model').forEach((el) => {
      bars.add(el);
    });

    // 2. Polymer / Legacy Shorts action bar containers (strictly inside Shorts!)
    document.querySelectorAll(
      'ytd-shorts #actions, ytd-reel-player-overlay-renderer #actions, ytd-reel-video-renderer #actions'
    ).forEach((el) => {
      if (el.tagName.toLowerCase() !== 'reel-action-bar-view-model') {
        const innerWiz = el.querySelector('reel-action-bar-view-model');
        if (innerWiz) {
          bars.add(innerWiz);
        } else if (el.children && el.children.length > 0) {
          bars.add(el);
        }
      }
    });

    // 3. Fallback: find any Like or Share button on Shorts and get its closest action bar
    if (bars.size === 0) {
      document.querySelectorAll(
        'ytd-shorts [aria-label*="share" i], ytd-shorts [aria-label*="like" i], [aria-label*="share" i]'
      ).forEach((btn) => {
        const bar = btn.closest('reel-action-bar-view-model, ytd-reel-player-overlay-renderer #actions, ytd-shorts #actions');
        if (bar) bars.add(bar);
      });
    }

    return Array.from(bars);
  }

  /**
   * Cleanly hide or restore comments action item in a specific Shorts action bar
   */
  function hideCommentsInShortsBar(actionsBar, shouldHide) {
    if (!actionsBar || !actionsBar.children) return;

    Array.from(actionsBar.children).forEach((child) => {
      if (child.classList.contains('studytube-shorts-color-toggle-container')) return;

      const aria = (child.getAttribute('aria-label') || '').toLowerCase();
      const hasCommentDescendant =
        aria.includes('comment') ||
        child.id.toLowerCase().includes('comment') ||
        child.querySelector('#comments-button, [aria-label*="comment" i], [id*="comment"]');

      if (hasCommentDescendant) {
        if (shouldHide) {
          child.style.setProperty('display', 'none', 'important');
          child.style.setProperty('visibility', 'hidden', 'important');
        } else {
          child.style.removeProperty('display');
          child.style.removeProperty('visibility');
        }
        return;
      }

      // Detect orphan comment text node / count (like '79' between Like and Share in user screenshot)
      const text = child.textContent.trim();
      const hasLike =
        child.id === 'like-button' ||
        aria.includes('like') ||
        child.querySelector('#like-button, [aria-label*="like" i]');

      if (!hasLike && /^\d+[\d,.]*[kKmMbB]?$/.test(text)) {
        if (shouldHide) {
          child.style.setProperty('display', 'none', 'important');
          child.style.setProperty('visibility', 'hidden', 'important');
        } else {
          child.style.removeProperty('display');
          child.style.removeProperty('visibility');
        }
      }
    });
  }

  /**
   * Sync Color Button inside a specific Shorts action bar (Placed directly above Like button)
   */
  function syncColorButtonInShortsBar(actionsBar) {
    if (!actionsBar) return;

    actionsBar.style.setProperty('overflow', 'visible', 'important');
    let parentNode = actionsBar.parentElement;
    for (let i = 0; parentNode && i < 4; i++) {
      parentNode.style.setProperty('overflow', 'visible', 'important');
      parentNode = parentNode.parentElement;
    }

    // Clean up any extra duplicate containers that may have been inserted in this bar
    const containers = Array.from(actionsBar.children).filter((c) =>
      c.classList.contains('studytube-shorts-color-toggle-container')
    );
    if (containers.length > 1) {
      for (let i = 1; i < containers.length; i++) {
        containers[i].remove();
      }
    }

    // Find the Like button or first action item in this bar
    let likeItem = null;

    for (const child of actionsBar.children) {
      if (child.classList.contains('studytube-shorts-color-toggle-container')) continue;
      const aria = (child.getAttribute('aria-label') || '').toLowerCase();
      const text = (child.textContent || '').toLowerCase();
      if (
        child.id === 'like-button' ||
        aria.includes('like') ||
        text.includes('like') ||
        child.querySelector('#like-button, [aria-label*="like" i], [title*="Like" i]')
      ) {
        likeItem = child;
        break;
      }
    }

    // Fallback: the first non-studytube child
    if (!likeItem) {
      for (const child of actionsBar.children) {
        if (!child.classList.contains('studytube-shorts-color-toggle-container')) {
          likeItem = child;
          break;
        }
      }
    }

    if (!likeItem) return;

    let container = containers[0];
    if (!container) {
      container = document.createElement('div');
      container.className = 'studytube-shorts-color-toggle-container';
      actionsBar.insertBefore(container, likeItem);
    } else if (container.nextElementSibling !== likeItem) {
      actionsBar.insertBefore(container, likeItem);
    }

    let button = container.querySelector('.studytube-shorts-color-btn');
    if (!button) {
      button = document.createElement('button');
      button.className = 'studytube-shorts-color-btn';
      button.type = 'button';
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleColorMode();
      };
      container.appendChild(button);
    }

    const isColor = isColorOverrideActive();
    const stateStr = isColor ? 'color' : 'grayscale';

    if (button.dataset.state !== stateStr) {
      button.dataset.state = stateStr;

      if (isColor) {
        button.classList.add('is-colored');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('title', 'Return to StudyTube Grayscale');
        button.innerHTML = `
          <div class="studytube-shorts-btn-circle">
            <svg class="studytube-btn-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V4c4.41 0 8 3.59 8 8s-3.59 8-8 8z"/>
            </svg>
          </div>
          <span class="studytube-shorts-btn-text">Grayscale</span>
        `;
      } else {
        button.classList.remove('is-colored');
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('title', 'Watch this short in color');
        button.innerHTML = `
          <div class="studytube-shorts-btn-circle">
            <svg class="studytube-btn-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.4c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 19.59 10.57 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
              <circle cx="12" cy="12" r="3.2"/>
            </svg>
          </div>
          <span class="studytube-shorts-btn-text">Color</span>
        `;
      }
    }
  }

  /**
   * Sync all Shorts action bars on the page (comments shield & color toggle button)
   */
  function syncShortsUI() {
    if (!isShortsPage()) {
      document.querySelectorAll('.studytube-shorts-color-toggle-container').forEach((el) => el.remove());
      return;
    }

    const shouldHideComments = settings.studytubeEnabled && settings.hideComments;
    const actionBars = getAllShortsActionBars();

    actionBars.forEach((actionsBar) => {
      hideCommentsInShortsBar(actionsBar, shouldHideComments);
      if (settings.studytubeEnabled) {
        syncColorButtonInShortsBar(actionsBar);
      } else {
        const btn = actionsBar.querySelector('.studytube-shorts-color-toggle-container');
        if (btn) btn.remove();
      }
    });

    // Global cleanup: ensure no duplicate or orphaned containers exist outside detected action bars
    document.querySelectorAll('.studytube-shorts-color-toggle-container').forEach((el) => {
      if (!el.parentElement || !actionBars.includes(el.parentElement)) {
        el.remove();
      }
    });

    if (shouldHideComments) {
      const closeBtn = document.querySelector(
        'ytd-shorts #shorts-panel-container [aria-label*="Close" i], ytd-shorts ytd-engagement-panel-section-list-renderer [aria-label*="Close" i], #shorts-panel-container #visibility-button'
      );
      if (closeBtn) {
        try { closeBtn.click(); } catch (_) {}
      }
    }
  }

  let shortsRetryTimer = null;
  /**
   * Schedule rapid checks when navigating to Shorts to account for dynamic hydration
   */
  function scheduleShortsSync() {
    if (!isShortsPage()) return;
    syncShortsUI();
    removeShortsNavigationArrows();
    if (shortsRetryTimer) clearInterval(shortsRetryTimer);
    let attempts = 0;
    shortsRetryTimer = setInterval(() => {
      attempts++;
      syncShortsUI();
      removeShortsNavigationArrows();
      const hasBtn = !!document.querySelector('reel-action-bar-view-model .studytube-shorts-color-toggle-container, ytd-shorts #actions .studytube-shorts-color-toggle-container');
      if (hasBtn || attempts >= 8 || !isShortsPage()) {
        clearInterval(shortsRetryTimer);
        shortsRetryTimer = null;
      }
    }, 200);
  }

  /**
   * Sync watch & shorts page state on navigation
   */
  function syncWatchPageState() {
    syncLiveChatShield();
    syncShortsBlocker();
    syncCommentsShield();

    if (!isVideoPlaybackPage()) {
      applyVideoGrayscale(false);
      syncColorToggleButton();
      syncShortsUI();
      return;
    }

    const activeId = getVideoId(location.href);
    if (activeId && activeId !== currentVideoId) {
      currentVideoId = activeId;
      colorOverrideActive = false;
      colorOverrideVideoId = null;
      commentsTemporarilyRevealed = false;
    }

    const shouldBeGrayscale = !isColorOverrideActive();
    applyVideoGrayscale(shouldBeGrayscale);

    if (isWatchPage()) {
      syncColorToggleButton();
      syncNotesPanel();
    } else {
      const existing = document.querySelector('.studytube-color-toggle');
      if (existing) existing.remove();
      const existingNotes = document.getElementById('studytube-notes-panel');
      if (existingNotes) existingNotes.remove();
    }

    if (isShortsPage()) {
      scheduleShortsSync();
    } else {
      document.querySelectorAll('.studytube-shorts-color-toggle-container').forEach((el) => el.remove());
    }
  }

  /**
   * SPA Navigation Handler
   */
  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    const newVideoId = getVideoId(location.href);
    if (newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      colorOverrideActive = false;
      colorOverrideVideoId = null;
      commentsTemporarilyRevealed = false;
      try { chrome.storage.local.remove(COLOR_OVERRIDE_KEY); } catch (_) {}
      fetchAndRenderNotesForCurrentVideo(true);
    }

    syncWatchPageState();
    syncShortsBlocker();
    scheduleShortsSync();
    processRecommendationCards();
  }

  function run() {
    syncShortsBlocker();
    if (location.href !== lastUrl) {
      onUrlChange();
    } else if (isVideoPlaybackPage()) {
      syncWatchPageState();
    }
    if (isShortsPage()) {
      syncShortsUI();
      removeShortsNavigationArrows();
    }
    processRecommendationCards();
  }

  // Debounced MutationObserver for dynamic YouTube SPA content
  const observer = new MutationObserver(() => {
    if (observer._scheduled) return;
    observer._scheduled = true;
    requestAnimationFrame(() => {
      observer._scheduled = false;
      run();
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen for storage changes from popup/dashboard toggles in real-time
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    let settingsChanged = false;
    if (changes.studytubeEnabled !== undefined) {
      settings.studytubeEnabled = changes.studytubeEnabled.newValue;
      settingsChanged = true;
    }
    if (changes.whitelistedCategories !== undefined) {
      settings.whitelistedCategories = changes.whitelistedCategories.newValue;
      settingsChanged = true;
    }
    if (changes.hideLiveChat !== undefined) {
      settings.hideLiveChat = changes.hideLiveChat.newValue;
      syncLiveChatShield();
    }
    if (changes.blockShortsScroll !== undefined) {
      settings.blockShortsScroll = changes.blockShortsScroll.newValue;
    }
    if (changes.blockShortsPlayback !== undefined) {
      settings.blockShortsPlayback = changes.blockShortsPlayback.newValue;
      syncShortsBlocker();
    }
    if (changes.hideComments !== undefined) {
      settings.hideComments = changes.hideComments.newValue;
      syncCommentsShield();
      syncShortsUI();
    }
    if (changes.allowUnknown !== undefined) {
      settings.allowUnknown = changes.allowUnknown.newValue;
      settingsChanged = true;
    }
    if (changes[COLOR_OVERRIDE_KEY] !== undefined) {
      const newOverride = changes[COLOR_OVERRIDE_KEY].newValue || null;
      if (newOverride && newOverride === currentVideoId) {
        colorOverrideActive = true;
        colorOverrideVideoId = newOverride;
      } else if (!newOverride) {
        colorOverrideActive = false;
        colorOverrideVideoId = null;
      }
      syncWatchPageState();
    }

    if (settingsChanged) {
      run();
    }
  });

  // YouTube SPA event hooks
  window.addEventListener('yt-navigate-start', onUrlChange, true);
  document.addEventListener('yt-navigate-start', onUrlChange, true);
  window.addEventListener('yt-navigate-finish', () => { run(); scheduleShortsSync(); }, true);
  document.addEventListener('yt-navigate-finish', () => { run(); scheduleShortsSync(); }, true);
  window.addEventListener('yt-page-data-updated', () => { run(); scheduleShortsSync(); }, true);
  document.addEventListener('yt-page-data-updated', () => { run(); scheduleShortsSync(); }, true);
  window.addEventListener('popstate', onUrlChange, true);

  // Initialize from storage
  chrome.storage.local.get(
    [
      'studytubeEnabled',
      'whitelistedCategories',
      'hideLiveChat',
      'blockShortsScroll',
      'blockShortsPlayback',
      'hideComments',
      'allowUnknown',
      COLOR_OVERRIDE_KEY,
    ],
    (data) => {
      if (data.studytubeEnabled !== undefined) settings.studytubeEnabled = !!data.studytubeEnabled;
      if (data.whitelistedCategories !== undefined) settings.whitelistedCategories = data.whitelistedCategories;
      if (data.hideLiveChat !== undefined) settings.hideLiveChat = !!data.hideLiveChat;
      if (data.blockShortsScroll !== undefined) settings.blockShortsScroll = !!data.blockShortsScroll;
      if (data.blockShortsPlayback !== undefined) settings.blockShortsPlayback = !!data.blockShortsPlayback;
      if (data.hideComments !== undefined) settings.hideComments = !!data.hideComments;
      if (data.allowUnknown !== undefined) settings.allowUnknown = !!data.allowUnknown;
      if (data[COLOR_OVERRIDE_KEY] && data[COLOR_OVERRIDE_KEY] === currentVideoId) {
        colorOverrideActive = true;
        colorOverrideVideoId = data[COLOR_OVERRIDE_KEY];
      }

      run();
      console.log('[StudyTube] Content script running with active configuration.');
    }
  );
})();
