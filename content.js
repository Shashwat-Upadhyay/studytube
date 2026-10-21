(() => {
  'use strict';

  console.log('[StudyTube] Focus Mode initializing...');

  const COLOR_OVERRIDE_KEY = 'studytubeColorOverrideVideoId';
  const LEGACY_GRAYSCALE_KEY = 'studytubeGrayscaleVideo';
  const COVER_CLASS = 'studytube-cover';
  const CARD_CLASS = 'studytube-blacked-out';
  const HIDDEN_CLASS = 'studytube-hide-target';

  let lastUrl = location.href;
  let currentVideoId = getVideoId(location.href);
  let colorOverrideVideoId = null;

  function getVideoId(url) {
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v');
      const match = parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/?]+)/);
      if (match) return match[1];
    } catch (_) {}
    return null;
  }

  function isWatchPage() {
    return location.pathname === '/watch' ||
      location.pathname.startsWith('/shorts/') ||
      location.pathname.startsWith('/live/');
  }

  function isColorOverrideActive() {
    const videoId = getVideoId(location.href);
    return !!videoId && colorOverrideVideoId === videoId;
  }

  function applyVideoGrayscale(enable) {
    if (enable) {
      document.documentElement.classList.add('studytube-video-grayscale');
      if (document.body) document.body.classList.add('studytube-video-grayscale');
      document.querySelectorAll('video').forEach((v) => {
        v.style.setProperty('filter', 'grayscale(1)', 'important');
      });
    } else {
      document.documentElement.classList.remove('studytube-video-grayscale');
      if (document.body) document.body.classList.remove('studytube-video-grayscale');
      document.querySelectorAll('video').forEach((v) => {
        v.style.removeProperty('filter');
      });
    }
  }

  function recommendationCards() {
    const selectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-compact-radio-renderer',
      'ytd-compact-playlist-renderer',
      'ytd-compact-movie-renderer',
      'ytd-reel-shelf-renderer',
      'yt-lockup-view-model'
    ];
    const isWatch = isWatchPage();
    const searchRoot = isWatch
      ? (document.querySelector('#secondary, ytd-watch-next-secondary-results-renderer, #related') || document)
      : document;

    const found = new Set();
    for (const selector of selectors) {
      searchRoot.querySelectorAll(selector).forEach((el) => {
        // On a watch page, do not black out the primary player area
        if (isWatch && el.closest('#primary, ytd-player, #movie_player, #player')) return;
        // Avoid nesting overlays inside an element already selected
        if (el.parentElement && el.parentElement.closest(selectors.join(','))) return;
        // Must contain a video link
        if (!el.querySelector('a[href*="/watch"], a[href*="/shorts/"]')) return;
        found.add(el);
      });
    }

    return [...found].filter((el) => {
      if (!isWatch) return true;
      return !!el.closest('#secondary, ytd-watch-next-secondary-results-renderer, #related');
    });
  }

  function hideCardContents(card) {
    const candidates = card.querySelectorAll('#content, #dismissible, .yt-lockup-view-model, a#thumbnail, ytd-thumbnail, .yt-lockup-metadata-view-model, h3');
    let target = [...candidates].find((el) => el !== card && !el.classList.contains(COVER_CLASS));
    if (!target) target = card.firstElementChild;
    if (target && target !== card && !target.classList.contains(COVER_CLASS)) {
      target.classList.add(HIDDEN_CLASS);
    }
  }

  function blackOutCard(card) {
    if (card.dataset.studytubeProcessed === '1' && card.querySelector('.' + COVER_CLASS)) return;
    card.dataset.studytubeProcessed = '1';
    card.classList.add(CARD_CLASS);
    hideCardContents(card);

    if (card.querySelector('.' + COVER_CLASS)) return;

    const cover = document.createElement('div');
    cover.className = COVER_CLASS;
    cover.setAttribute('role', 'button');
    cover.setAttribute('tabindex', '0');
    cover.setAttribute('aria-label', 'Reveal video and open in grayscale');
    cover.innerHTML = '<span>StudyTube<br>Reveal &amp; watch in grayscale</span>';

    const openVideo = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const link = card.querySelector('a[href*="/watch"], a[href*="/shorts/"]');
      if (!link) return;
      const targetUrl = new URL(link.href, location.origin);
      // Clear any prior color override so the newly opened video starts in grayscale
      colorOverrideVideoId = null;
      chrome.storage.local.remove([COLOR_OVERRIDE_KEY, LEGACY_GRAYSCALE_KEY], () => {
        location.href = targetUrl.href;
      });
    };

    cover.addEventListener('click', openVideo);
    cover.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') openVideo(event);
    });
    card.appendChild(cover);
  }

  function applyRecommendationBlackout() {
    for (const card of recommendationCards()) blackOutCard(card);
  }

  function toggleColorMode() {
    const videoId = getVideoId(location.href);
    if (!videoId) return;

    if (isColorOverrideActive()) {
      // Toggle back to default grayscale immediately
      colorOverrideVideoId = null;
      applyVideoGrayscale(true);
      syncColorToggleButton();
      chrome.storage.local.remove(COLOR_OVERRIDE_KEY);
    } else {
      // Explicitly watch this specific video in color immediately
      colorOverrideVideoId = videoId;
      applyVideoGrayscale(false);
      syncColorToggleButton();
      chrome.storage.local.set({ [COLOR_OVERRIDE_KEY]: videoId });
    }
  }

  function syncColorToggleButton() {
    if (!isWatchPage()) {
      const existing = document.querySelector('.studytube-color-toggle');
      if (existing) existing.remove();
      return;
    }

    const actions = document.querySelector('#top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #above-the-fold') ||
      document.querySelector('ytd-watch-flexy #primary-inner, ytd-watch-grid #primary-inner') ||
      document.querySelector('#actions-inner') ||
      document.querySelector('#actions');
    if (!actions) return;

    let button = document.querySelector('.studytube-color-toggle');
    if (!button || !actions.contains(button)) {
      if (button) button.remove();
      button = document.createElement('button');
      button.className = 'studytube-color-toggle';
      button.type = 'button';
      button.addEventListener('click', toggleColorMode);
      actions.appendChild(button);
    }

    const isColor = isColorOverrideActive();
    if (isColor) {
      button.textContent = '✓ Color enabled';
      button.setAttribute('aria-pressed', 'true');
    } else {
      button.textContent = '🌈 Watch in color';
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function syncWatchPageState() {
    if (!isWatchPage()) {
      applyVideoGrayscale(false);
      syncColorToggleButton();
      return;
    }

    const activeId = getVideoId(location.href);
    if (activeId !== currentVideoId) {
      currentVideoId = activeId;
      // Moving to a new video resets color override immediately
      if (colorOverrideVideoId !== activeId) {
        colorOverrideVideoId = null;
      }
    }

    // Fast synchronous path: enforce grayscale immediately unless actively overridden
    const shouldBeGrayscale = !isColorOverrideActive();
    applyVideoGrayscale(shouldBeGrayscale);
    syncColorToggleButton();

    // Check storage for persistence if the user refreshed the same video
    chrome.storage.local.get([COLOR_OVERRIDE_KEY], (data) => {
      const storedOverride = data[COLOR_OVERRIDE_KEY];
      if (storedOverride && storedOverride === currentVideoId) {
        colorOverrideVideoId = currentVideoId;
        applyVideoGrayscale(false);
      } else {
        colorOverrideVideoId = null;
        applyVideoGrayscale(true);
      }
      syncColorToggleButton();
    });
  }

  function onUrlChange() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    const newVideoId = getVideoId(location.href);
    if (newVideoId !== currentVideoId) {
      currentVideoId = newVideoId;
      // Clear color override when transitioning to another video
      if (colorOverrideVideoId && colorOverrideVideoId !== newVideoId) {
        colorOverrideVideoId = null;
        chrome.storage.local.remove(COLOR_OVERRIDE_KEY);
      }
    }

    syncWatchPageState();
    applyRecommendationBlackout();
  }

  function run() {
    if (location.href !== lastUrl) {
      onUrlChange();
    } else if (isWatchPage()) {
      syncWatchPageState();
    }
    applyRecommendationBlackout();
  }

  const observer = new MutationObserver(() => {
    if (observer._scheduled) return;
    observer._scheduled = true;
    requestAnimationFrame(() => {
      observer._scheduled = false;
      run();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[COLOR_OVERRIDE_KEY] || changes[LEGACY_GRAYSCALE_KEY])) {
      syncWatchPageState();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Handle YouTube SPA client-side navigation events
  window.addEventListener('yt-navigate-start', onUrlChange, true);
  document.addEventListener('yt-navigate-start', onUrlChange, true);
  window.addEventListener('yt-navigate-finish', run, true);
  document.addEventListener('yt-navigate-finish', run, true);
  window.addEventListener('yt-page-data-updated', run, true);
  document.addEventListener('yt-page-data-updated', run, true);
  window.addEventListener('popstate', onUrlChange, true);

  // Initial execution
  run();
  console.log('[StudyTube] Focus Mode running.');
})();
