(() => {
  'use strict';

  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionMedia.matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mobileMedia = window.matchMedia('(max-width: 760px), (max-width: 1060px) and (max-height: 560px) and (hover: none) and (pointer: coarse)');
  let isMobile = mobileMedia.matches;
  const reloadToHome = document.documentElement.dataset.reloadHome === 'true';
  delete document.documentElement.dataset.reloadHome;
  const $ = (selector, root = document) => root?.querySelector(selector);
  const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const mod = (value, size) => ((value % size) + size) % size;
  const pad = number => String(number).padStart(2, '0');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const deferredImages = new WeakMap();
  let deferredImageGeneration = 0;
  function recoverySource(value, key) {
    if (!value || !key || /^(data|blob):/.test(value)) return value;
    return value.replace(/(^|,\s*)([^,\s]+)/g, (_, separator, source) => {
      const url = new URL(source, location.href);
      url.searchParams.set('__plutonoc_retry', key);
      return separator + url.href;
    });
  }
  function hydrateDeferredImage(image, retry = false) {
    let state = deferredImages.get(image);
    if (state && !retry && ['loading', 'loaded', 'error'].includes(state.phase)) return;
    if (!state) {
      const picture = image.closest('picture');
      state = {
        src: image.dataset.deferredSrc || image.getAttribute('src'),
        srcset: image.dataset.deferredSrcset || image.getAttribute('srcset'),
        sources: $$('source', picture).map(source => [source, source.dataset.deferredSrcset || source.getAttribute('srcset')])
      };
      deferredImages.set(image, state);
      image.addEventListener('error', () => { if (state.phase === 'loaded') hydrateDeferredImage(image, true); });
    }
    state.controller?.abort();
    const controller = state.controller = new AbortController();
    state.phase = image.dataset.mediaState = 'loading';
    image.dataset.mediaHydrated = 'false';
    state.button?.remove();
    const recoveryKey = `${Date.now()}-${++deferredImageGeneration}`;
    const apply = attempt => {
      const key = retry || attempt > 0 ? `${recoveryKey}-${attempt}` : '';
      state.sources.forEach(([source, value]) => { if (value) source.srcset = recoverySource(value, key); });
      if (state.srcset) image.srcset = recoverySource(state.srcset, key);
      if (state.src) image.src = key ? recoverySource(state.src, key) : state.src;
    };
    const clear = () => {
      image.removeAttribute('src'); image.removeAttribute('srcset');
      state.sources.forEach(([source]) => source.removeAttribute('srcset'));
    };
    window.PlutonoCImages.loadElement(image, { apply, clear, signal: controller.signal }).then(() => {
      if (state.controller !== controller) return;
      state.phase = image.dataset.mediaState = 'loaded';
      image.dataset.mediaHydrated = 'true';
      state.button?.remove();
    }).catch(error => {
      if (state.controller !== controller || error.name === 'AbortError') return;
      state.phase = image.dataset.mediaState = 'error';
      const host = image.closest('.descent-sheet, .film-visual, .equipment-track figure, .arrival-hero, .social-links') || image.parentElement;
      let panel = host.querySelector(':scope > .deferred-media-errors');
      if (!panel) {
        panel = document.createElement('div'); panel.className = 'deferred-media-errors'; host.append(panel);
      }
      const button = state.button = document.createElement('button');
      const label = image.closest('[data-home-filter]')?.querySelector('b')?.textContent;
      button.type = 'button'; button.className = 'image-retry'; button.dataset.mediaRetry = '';
      button.textContent = `${label || '图片'}加载失败 · 重新加载`;
      button.setAttribute('aria-label', `${image.alt || '图片'}加载失败，重新加载`);
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); hydrateDeferredImage(image, true); });
      panel.append(button);
    });
  }
  function hydrateDeferredMedia(element) {
    if (!element) return;
    if (element.tagName === 'IMG') { hydrateDeferredImage(element); return; }
    if (element.dataset.mediaHydrated === 'true') return;
    if (element.dataset.deferredPoster) element.poster = element.dataset.deferredPoster;
    if (element.dataset.deferredSrc) element.src = element.dataset.deferredSrc;
    element.dataset.mediaHydrated = 'true';
  }

  const deferredObserverCallback = (entries, observer) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          hydrateDeferredMedia(entry.target);
          observer.unobserve(entry.target);
        });
      };
  const deferredMediaObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(deferredObserverCallback, { rootMargin: '600px 0px', threshold: 0 })
    : null;
  const deferredNearMediaObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(deferredObserverCallback, { rootMargin: '600px 0px', threshold: 0 })
    : null;

  function registerDeferredMedia(root = document) {
    $$('[data-deferred-src]:not([data-deferred-manual]), [data-deferred-poster]:not([data-deferred-manual])', root).forEach(element => {
      if (element.dataset.mediaHydrated === 'true') return;
      const observer = element.hasAttribute('data-deferred-near') ? deferredNearMediaObserver : deferredMediaObserver;
      if (observer) observer.observe(element);
      else hydrateDeferredMedia(element);
    });
  }

  registerDeferredMedia();

  const allWorks = [...(window.galleryData || [])];
  const categoryConfig = window.categoryConfig || {};
  const categoryOrder = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
  const categoryCounts = Object.fromEntries(categoryOrder.map(category => [category, allWorks.filter(work => work.category === category).length]));
  const categoryLabel = category => categoryConfig[category]?.label || category;
  const categoryEnglish = category => categoryConfig[category]?.english || category.toUpperCase();
  const gallerySeenStorageKey = 'plutonoc.gallery.seen.v1';
  const galleryWorkIds = new Set(allWorks.map(work => String(work.id)));
  const photoParamName = 'photo';

  function photoIdFromUrl() {
    return new URL(location.href).searchParams.get(photoParamName) || '';
  }

  function photoUrl(workId = '', hash = '#works') {
    const url = new URL(location.href);
    if (workId) url.searchParams.set(photoParamName, String(workId));
    else url.searchParams.delete(photoParamName);
    url.hash = hash;
    return `${url.pathname}${url.search}${url.hash}`;
  }

  function loadSeenWorkIds() {
    try {
      const stored = JSON.parse(localStorage.getItem(gallerySeenStorageKey) || '[]');
      if (!Array.isArray(stored)) return new Set();
      return new Set(stored.map(String).filter(id => galleryWorkIds.has(id)));
    } catch {
      return new Set();
    }
  }

  let seenWorkIds = loadSeenWorkIds();

  function persistSeenWorkIds() {
    try {
      localStorage.setItem(gallerySeenStorageKey, JSON.stringify([...seenWorkIds]));
    } catch {
      // Browsing progress remains available for this page when storage is unavailable.
    }
  }

  function syncSeenProgress() {
    $$('[data-gallery-seen-count]').forEach(node => { node.textContent = seenWorkIds.size; });
    $$('[data-gallery-seen-total]').forEach(node => { node.textContent = allWorks.length; });
  }

  function markWorkSeen(work) {
    const id = String(work?.id || '');
    if (!id || seenWorkIds.has(id)) return;
    seenWorkIds.add(id);
    persistSeenWorkIds();
    syncSeenProgress();
  }

  persistSeenWorkIds();
  syncSeenProgress();

  let frameRequested = false;
  let scrollDirty = true;
  let layoutDirty = true;
  let viewportDirty = false;
  let filmSectionVisible = false;
  let archiveCanvas = null;
  let timecodeStart = performance.now();
  let timecodeTimer = 0;

  function requestMainFrame() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(runMainFrame);
  }

  function runMainFrame(time) {
    frameRequested = false;
    let needsNext = false;
    if (viewportDirty) {
      viewportDirty = false;
      isMobile = mobileMedia.matches;
      syncMobileContent();
      archiveCanvas?.resize();
      if (photoDialog?.open && photoMotion.context && archiveCanvas) {
        photoMotion.context.camera = { ...archiveCanvas.camera }; photoMotion.context.focused = archiveCanvas.focusedIndex;
        if (photoMotion.phase === 'opening') settlePhotoOpening();
        else if (photoMotion.phase === 'closing') { photoMotion.phase = 'open'; requestPhotoClose({ immediate: true }); }
      }
      directoryImageConcurrency = isMobile ? 4 : 6;
      syncTimecode();
      updateEquipmentTrack(0, true);
      if (siteIndex.classList.contains('is-open')) updateIndexPreview(indexPreviewLink);
    }
    if (layoutDirty) refreshLayoutMetrics();
    if (scrollDirty || layoutDirty) {
      updateScrollExperience();
      scrollDirty = false;
      layoutDirty = false;
    }
    if (archiveCanvas?.frame(time)) needsNext = true;
    if (needsNext) requestMainFrame();
  }

  function updateTimecode() {
    const elapsed = (performance.now() - timecodeStart) / 1000;
    const totalFrames = Math.floor((elapsed % 3600) * 24);
    const seconds = Math.floor(totalFrames / 24);
    const frame = totalFrames % 24;
    const timecode = $('[data-timecode]');
    if (timecode) timecode.textContent = `00:${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(frame)}`;
  }

  function syncTimecode() {
    const shouldRun = filmSectionVisible && !isMobile && !reducedMotion && !document.hidden;
    if (!shouldRun) {
      clearInterval(timecodeTimer);
      timecodeTimer = 0;
      return;
    }
    if (timecodeTimer) return;
    updateTimecode();
    timecodeTimer = window.setInterval(updateTimecode, 100);
  }

  function updateDynamicCounts() {
    $$('[data-category-count]').forEach(node => { node.textContent = categoryCounts[node.dataset.categoryCount] ?? 0; });
    $$('[data-index-category-count]').forEach(node => { node.textContent = pad(categoryCounts[node.dataset.indexCategoryCount] ?? 0); });
    $$('[data-filter-count]').forEach(node => {
      node.textContent = node.dataset.filterCount === 'all' ? allWorks.length : (categoryCounts[node.dataset.filterCount] ?? 0);
    });
    $$('[data-work-total]').forEach(node => { node.textContent = allWorks.length; });
  }
  updateDynamicCounts();

  /* Reveal and section state */
  const revealElements = $$('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach(element => {
      element.classList.remove('is-reveal-before', 'is-reveal-after');
      element.classList.add('is-visible');
    });
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const element = entry.target;
        element.classList.add('is-reveal-ready');
        if (entry.isIntersecting) {
          element.classList.remove('is-reveal-before', 'is-reveal-after');
          element.classList.add('is-visible');
          return;
        }
        const rootTop = entry.rootBounds?.top || 0;
        const hasPassed = entry.boundingClientRect.bottom <= rootTop;
        element.classList.remove('is-visible');
        element.classList.toggle('is-reveal-before', hasPassed);
        element.classList.toggle('is-reveal-after', !hasPassed);
      });
    }, { threshold: [0, .08, .35], rootMargin: '-8% 0px -12% 0px' });
    revealElements.forEach(element => revealObserver.observe(element));
  }

  const sections = $$('[data-section]');
  const currentNumber = $('[data-current-number]');
  const currentSection = $('[data-current-section]');
  const header = $('[data-header]');
  let activeSection = null;
  const sectionTops = new Map();

  function setActiveSection(section) {
    if (!section || activeSection === section) return;
    activeSection = section;
    currentNumber.textContent = section.dataset.section;
    currentSection.textContent = section.dataset.sectionName;
    $$('[data-index-link]').forEach(link => {
      const category = link.dataset.galleryTarget;
      const current = section.id === 'works' && category
        ? category === (archiveCanvas?.filter === 'all' ? 'deepsky' : archiveCanvas?.filter)
        : !category && link.hash === `#${section.id}`;
      link.classList.toggle('is-current', Boolean(current));
    });
  }

  function updateActiveSectionFromScroll() {
    const detectionLine = scrollY + layoutMetrics.headerHeight + innerHeight * .32;
    let nextSection = sections[0];
    for (const section of sections) {
      if ((sectionTops.get(section) ?? Infinity) <= detectionLine) nextSection = section;
      else break;
    }
    setActiveSection(nextSection);
  }

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-lit', entry.isIntersecting));
    }, { threshold: [0, .08], rootMargin: '-12% 0px -12% 0px' });
    sections.forEach(section => sectionObserver.observe(section));
  }

  /* Index */
  const siteIndex = $('#site-index');
  const indexPanel = $('.index-panel', siteIndex);
  const indexPreview = $('.index-preview img', siteIndex);
  const indexCount = $('[data-index-count]', siteIndex);
  const indexName = $('[data-index-name]', siteIndex);
  let indexReturnFocus = null;
  let indexPreviewRequest = 0;
  let indexFocusTimer = 0;
  let indexPreviewImage = null;
  let indexPreviewLink = $('.index-nav a.is-current', siteIndex) || $('.index-nav a', siteIndex);
  function clearIndexPreview() {
    ++indexPreviewRequest;
    if (indexPreviewImage) {
      indexPreviewImage.onload = indexPreviewImage.onerror = null;
      indexPreviewImage.removeAttribute('src');
      indexPreviewImage = null;
    }
    indexPreview?.classList.remove('is-changing');
  }

  function openIndex(event) {
    indexReturnFocus = event?.currentTarget || document.activeElement;
    siteIndex.classList.add('is-open');
    siteIndex.setAttribute('aria-hidden', 'false');
    document.body.classList.add('index-open');
    updateIndexPreview(indexPreviewLink);
    clearTimeout(indexFocusTimer);
    indexFocusTimer = setTimeout(() => {
      if (siteIndex.classList.contains('is-open')) $('[data-index-close]:not(.index-backdrop)', siteIndex)?.focus();
    }, reducedMotion ? 0 : 140);
  }

  function closeIndex({ restoreFocus = true } = {}) {
    clearTimeout(indexFocusTimer);
    clearIndexPreview();
    siteIndex.classList.remove('is-open');
    siteIndex.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('index-open');
    if (restoreFocus) indexReturnFocus?.focus?.();
  }

  function updateIndexPreview(link) {
    if (!link || !indexPreview) return;
    indexPreviewLink = link;
    if (!siteIndex.classList.contains('is-open') || !indexPreview.closest('.index-preview').getClientRects().length) {
      clearIndexPreview();
      return;
    }
    indexCount.textContent = $('span', link)?.textContent || '';
    indexName.textContent = $('b', link)?.textContent || '';
    const source = link.dataset.preview;
    const position = link.dataset.previewPosition || 'center';
    if (!source) return;
    if (indexPreview.getAttribute('src') === source) {
      clearIndexPreview();
      indexPreview.style.setProperty('--index-preview-position', position);
      return;
    }
    if (indexPreviewImage?.getAttribute('src') === source) return;
    clearIndexPreview();
    const request = indexPreviewRequest;
    indexPreview.classList.add('is-changing');
    const preload = indexPreviewImage = new Image();
    preload.onload = () => {
      if (request !== indexPreviewRequest) return;
      indexPreviewImage = null;
      indexPreview.src = source;
      indexPreview.style.setProperty('--index-preview-position', position);
      requestAnimationFrame(() => indexPreview.classList.remove('is-changing'));
    };
    preload.onerror = () => {
      if (request === indexPreviewRequest) {
        indexPreviewImage = null;
        indexPreview.classList.remove('is-changing');
      }
    };
    preload.src = source;
  }

  $$('[data-index-open]').forEach(button => button.addEventListener('click', openIndex));
  $$('[data-index-close]', siteIndex).forEach(button => button.addEventListener('click', () => closeIndex()));
  $$('[data-index-link]', siteIndex).forEach(link => {
    link.addEventListener('pointerenter', () => updateIndexPreview(link));
    link.addEventListener('focus', () => updateIndexPreview(link));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && siteIndex.classList.contains('is-open')) {
      event.preventDefault();
      closeIndex();
      return;
    }
    if (event.key !== 'Tab' || !siteIndex.classList.contains('is-open')) return;
    const focusable = $$('a[href], button:not([disabled]):not([tabindex="-1"])', indexPanel);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  /* Navigation transition */
  const curtain = $('[data-page-curtain]');
  let pendingNavigation = null;
  let navigationEpoch = 0;
  const navigationTimers = new Set();
  function cancelNavigation() {
    navigationEpoch++;
    navigationTimers.forEach(clearTimeout); navigationTimers.clear();
    pendingNavigation = null;
    document.body.classList.remove('is-transitioning', 'is-transition-exiting');
  }
  function navigationDelay(callback, delay, epoch) {
    const timer = setTimeout(() => {
      navigationTimers.delete(timer);
      if (epoch === navigationEpoch) callback();
    }, delay);
    navigationTimers.add(timer);
  }
  const normalizeHash = hash => hash === '#profile' ? '#home' : (hash || '#home');

  function updateCurtain(category, hash) {
    const config = categoryConfig[category];
    const destinations = {
      '#home': ['PLUTONOC', 'HOME', ''],
      '#films': ['MOTION', 'DYNAMIC IMAGE', ''],
      '#records': ['PUBLIC RECORDS', 'MEDIA & HONORS', ''],
      '#equipment': ['EQUIPMENT', 'SYSTEMS', ''],
      '#contact': ['PLUTONOC', '择日成星', ''],
      '#guestbook': ['GUESTBOOK', '留言', '']
    };
    const copy = category
      ? ['ARCHIVE OPENED', config?.english || 'ARCHIVE', `${categoryCounts[category] || allWorks.length} OBSERVATIONS`]
      : destinations[hash] || ['PLUTONOC', 'ARCHIVE', ''];
    $('[data-curtain-kicker]').textContent = copy[0];
    $('[data-curtain-category]').textContent = copy[1];
    $('[data-curtain-count]').textContent = copy[2];
  }

  function finishNavigation(hash, category, pushHistory = true) {
    const normalizedHash = normalizeHash(hash);
    const target = $(normalizedHash);
    if (!target) return;
    if (normalizedHash === '#works' || category) ensureArchiveCanvas();
    if (category && archiveCanvas) archiveCanvas.setFilter(category, true);
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (pushHistory && (location.hash !== normalizedHash || (history.state?.category || null) !== category)) history.pushState({ category }, '', normalizedHash);
    scrollDirty = true;
    requestMainFrame();
  }

  function transitionTo(hash, category = null) {
    const normalizedHash = normalizeHash(hash);
    if (!$(normalizedHash)) return;
    cancelNavigation();
    const epoch = navigationEpoch;
    updateCurtain(category, normalizedHash);
    if (reducedMotion) {
      closeIndex({ restoreFocus: false });
      finishNavigation(normalizedHash, category);
      return;
    }
    pendingNavigation = { hash: normalizedHash, category, applied: false };
    document.body.classList.add('is-transitioning');
    closeIndex({ restoreFocus: false });
    navigationDelay(() => { finishNavigation(normalizedHash, category); pendingNavigation.applied = true; }, 220, epoch);
    navigationDelay(() => { document.body.classList.add('is-transition-exiting'); document.body.classList.remove('is-transitioning'); }, 320, epoch);
    navigationDelay(() => { document.body.classList.remove('is-transition-exiting'); pendingNavigation = null; }, 540, epoch);
  }

  $$('a[data-transition-link], [data-index-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (!link.hash || !$(link.hash)) return;
      event.preventDefault();
      const category = link.dataset.homeFilter || link.dataset.galleryTarget || null;
      transitionTo(link.hash, category);
    });
  });

  window.addEventListener('pagehide', cancelNavigation);
  window.addEventListener('hashchange', cancelNavigation);
  window.addEventListener('popstate', event => {
    const linkedPhoto = photoIdFromUrl();
    const pendingReturn = photoMotion.pendingReturn;
    if (!linkedPhoto && pendingReturn) {
      photoMotion.pendingReturn = null;
      if (normalizeHash(location.hash) === '#works' && (event.state?.category || null) === (pendingReturn.history.category || null)) return;
    }
    cancelNavigation();
    if (linkedPhoto && openPhotoFromLocation()) return;
    if (!linkedPhoto && photoDialog?.open) {
      const context = photoMotion.context;
      const sameGallery = normalizeHash(location.hash) === '#works' && context
        && (event.state?.category || null) === (context.history.category || null);
      photoHistoryEntryOwned = false;
      resetPhotoAnimation(); cancelPhotoImages(); photoMotion.restore = Boolean(sameGallery);
      photoDialog.close();
      if (sameGallery) return;
    }
    const category = event.state?.category || null;
    finishNavigation(normalizeHash(location.hash), category, false);
  });

  if (location.hash === '#profile') {
    history.replaceState(history.state, '', '#home');
    requestAnimationFrame(() => finishNavigation('#home', null, false));
  }

  /* Hero interaction */
  const descentSheet = $('.descent-sheet');
  const descentPanels = $$('.descent-panel');
  const homeMotion = $('[data-home-motion]');
  let activeVisualStage = '';

  function setVisualStage(category) {
    const stage = categoryOrder.includes(category) ? category : 'deepsky';
    if (stage === activeVisualStage) return;
    activeVisualStage = stage;
    document.body.dataset.visualStage = stage;
    document.documentElement.style.setProperty('--stage-color', categoryConfig[stage]?.color || '#9ec8ff');
  }

  // Desktop panels respond entirely in CSS. Do not switch the full-screen SVG
  // atmosphere on hover/focus: its blur rasterization stalls the opening frame.
  // Atmosphere follows page scroll; mobile keeps its existing centered-card state.

  if (descentSheet) {
    let mobilePanelFrame = 0;
    const updateMobilePanel = () => {
      mobilePanelFrame = 0;
      if (!mobileMedia.matches) {
        descentPanels.forEach(panel => panel.classList.remove('is-mobile-current'));
        return;
      }
      const sheetBounds = descentSheet.getBoundingClientRect();
      const sheetCenter = sheetBounds.left + sheetBounds.width / 2;
      let currentPanel = descentPanels[0] || null;
      let currentDistance = Infinity;
      descentPanels.forEach(panel => {
        const bounds = panel.getBoundingClientRect();
        const distance = Math.abs(bounds.left + bounds.width / 2 - sheetCenter);
        if (distance < currentDistance) {
          currentPanel = panel;
          currentDistance = distance;
        }
      });
      descentPanels.forEach(panel => panel.classList.toggle('is-mobile-current', panel === currentPanel));
      if (currentPanel?.dataset.homeFilter) setVisualStage(currentPanel.dataset.homeFilter);
    };
    const requestMobilePanelUpdate = () => {
      if (!mobilePanelFrame) mobilePanelFrame = requestAnimationFrame(updateMobilePanel);
    };
    descentSheet.addEventListener('scroll', requestMobilePanelUpdate, { passive: true });
    window.addEventListener('resize', requestMobilePanelUpdate, { passive: true });
    requestMobilePanelUpdate();
  }

  if (homeMotion && supportsHover && !reducedMotion) {
    const gateway = homeMotion.closest('.motion-gateway');
    let homePreviewActive = false;
    let homePreviewGeneration = 0;
    const stop = () => {
      homePreviewGeneration += 1;
      homePreviewActive = false;
      homeMotion.pause();
      homeMotion.removeAttribute('src');
      homeMotion.load();
    };
    const start = async () => {
      if (homePreviewActive) return;
      const generation = ++homePreviewGeneration;
      homePreviewActive = true;
      hydrateDeferredMedia(homeMotion);
      homeMotion.src = homeMotion.dataset.previewSrc;
      try {
        await homeMotion.play();
        if (generation === homePreviewGeneration && !homePreviewActive) stop();
      } catch (_) { if (generation === homePreviewGeneration) stop(); }
    };
    gateway?.addEventListener('pointerenter', start);
    gateway?.addEventListener('pointerleave', stop);
    gateway?.addEventListener('focusin', start);
    gateway?.addEventListener('focusout', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  }

  /* Scroll progress calibration and finale */
  const progressBar = $('[data-reading-progress]');
  const scrollCalibration = $('[data-scroll-calibration]');
  const calibrationRoute = $('[data-calibration-route]', scrollCalibration);
  const calibrationProgress = $('[data-calibration-progress]', scrollCalibration);
  const arrival = $('#contact');
  const arrivalHero = $('.arrival-hero', arrival);
  const profileCopy = $('.profile-copy');
  let calibrationInertia = 0;
  let previousScrollY = scrollY;
  let calibrationResetTimer = 0;
  const layoutMetrics = {
    scrollable: 1,
    headerHeight: 0,
    calibrationHeight: isMobile ? 50 : 74,
    calibrationTravel: 0,
    calibrationRouteLength: 0,
    worksTop: Infinity,
    worksBottom: -Infinity,
    arrivalHeroTop: Infinity
  };

  function documentTop(element) {
    return element ? element.getBoundingClientRect().top + scrollY : Infinity;
  }

  function refreshLayoutMetrics() {
    layoutMetrics.scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    layoutMetrics.headerHeight = header?.offsetHeight || 0;
    layoutMetrics.calibrationHeight = scrollCalibration?.getBoundingClientRect().height || (isMobile ? 50 : 74);
    const calibrationTop = layoutMetrics.headerHeight + 18;
    layoutMetrics.calibrationTravel = Math.max(innerHeight - calibrationTop - layoutMetrics.calibrationHeight - 18, 0);
    layoutMetrics.calibrationRouteLength = calibrationRoute?.getTotalLength?.() || 0;
    sectionTops.clear();
    sections.forEach(section => sectionTops.set(section, documentTop(section)));
    const works = $('#works');
    layoutMetrics.worksTop = documentTop(works);
    layoutMetrics.worksBottom = Number.isFinite(layoutMetrics.worksTop) ? layoutMetrics.worksTop + (works?.offsetHeight || 0) : -Infinity;
    layoutMetrics.arrivalHeroTop = documentTop(arrivalHero || arrival);
  }

  if ('IntersectionObserver' in window) {
    const textMotionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-motion-active', entry.isIntersecting));
    }, { threshold: .12 });
    [profileCopy, arrival].filter(Boolean).forEach(element => textMotionObserver.observe(element));
  } else {
    profileCopy?.classList.add('is-motion-active');
    arrival?.classList.add('is-motion-active');
  }

  function updateArrivalProgress() {
    if (!arrival) return;
    if (reducedMotion) {
      arrival.style.setProperty('--arrival-image-opacity', '1');
      arrival.style.setProperty('--arrival-image-scale', '1');
      arrival.style.setProperty('--arrival-title-y', '0px');
      arrival.style.setProperty('--arrival-opacity', '1');
      arrival.style.setProperty('--arrival-blur', '0px');
      arrival.style.setProperty('--arrival-spacing', '.04em');
      arrival.classList.add('is-complete');
      return;
    }
    const arrivalTop = layoutMetrics.arrivalHeroTop - scrollY;
    const imageProgress = clamp((innerHeight * .96 - arrivalTop) / Math.max(innerHeight * .78, 1), 0, 1);
    const titleProgress = clamp((imageProgress - .45) / .55, 0, 1);
    arrival.style.setProperty('--arrival-image-opacity', `${(.08 + imageProgress * .92).toFixed(3)}`);
    arrival.style.setProperty('--arrival-image-scale', `${(1.025 - imageProgress * .025).toFixed(4)}`);
    arrival.style.setProperty('--arrival-title-y', `${(12 * (1 - titleProgress)).toFixed(2)}px`);
    arrival.style.setProperty('--arrival-opacity', `${titleProgress.toFixed(3)}`);
    arrival.style.setProperty('--arrival-blur', `${(8 * (1 - titleProgress)).toFixed(2)}px`);
    arrival.style.setProperty('--arrival-spacing', `${(.08 - titleProgress * .04).toFixed(3)}em`);
    arrival.classList.toggle('is-complete', titleProgress > .985);
  }

  function updateScrollExperience() {
    const ratio = clamp(scrollY / layoutMetrics.scrollable, 0, 1);
    if (progressBar) progressBar.style.transform = `scaleX(${ratio})`;
    header.classList.toggle('is-scrolled', scrollY > 20);
    updateActiveSectionFromScroll();
    if (scrollCalibration) {
      const remaining = 1 - ratio;
      const inertia = reducedMotion ? 0 : calibrationInertia;
      scrollCalibration.style.setProperty('--calibration-y', `${(ratio * layoutMetrics.calibrationTravel).toFixed(2)}px`);
      scrollCalibration.style.setProperty('--calibration-outer', `${(reducedMotion ? 0 : -210 * remaining + inertia).toFixed(2)}deg`);
      scrollCalibration.style.setProperty('--calibration-middle', `${(reducedMotion ? 0 : 150 * remaining - inertia * (2 / 3)).toFixed(2)}deg`);
      scrollCalibration.style.setProperty('--calibration-inner', `${(reducedMotion ? 0 : -100 * remaining + inertia * (4 / 9)).toFixed(2)}deg`);
      scrollCalibration.classList.toggle('is-calibrated', ratio > .995);
      scrollCalibration.classList.toggle('is-near-end', ratio > .94);
      if (calibrationRoute && calibrationProgress && layoutMetrics.calibrationRouteLength) {
        const point = calibrationRoute.getPointAtLength(layoutMetrics.calibrationRouteLength * ratio);
        calibrationProgress.setAttribute('cx', point.x.toFixed(2));
        calibrationProgress.setAttribute('cy', point.y.toFixed(2));
      }
    }
    updateArrivalProgress();

    let fallbackStage = 'deepsky';
    if (ratio >= .2) fallbackStage = 'sunmoon';
    if (ratio >= .4) fallbackStage = 'planet';
    if (ratio >= .6) fallbackStage = 'nightscape';
    if (ratio >= .78) fallbackStage = 'earth';
    const worksVisible = layoutMetrics.worksTop < scrollY + innerHeight * .72
      && layoutMetrics.worksBottom > scrollY + innerHeight * .25;
    setVisualStage(worksVisible && archiveCanvas && archiveCanvas.filter !== 'all' ? archiveCanvas.filter : fallbackStage);
  }

  window.addEventListener('scroll', () => {
    const delta = scrollY - previousScrollY;
    previousScrollY = scrollY;
    calibrationInertia = reducedMotion ? 0 : clamp(delta * .56, -18, 18);
    scrollCalibration?.classList.add('is-scrolling');
    clearTimeout(calibrationResetTimer);
    calibrationResetTimer = window.setTimeout(() => {
      calibrationInertia = 0;
      scrollCalibration?.classList.remove('is-scrolling');
      scrollDirty = true;
      requestMainFrame();
    }, 250);
    scrollDirty = true;
    requestMainFrame();
  }, { passive: true });
  function invalidateViewport() {
    viewportDirty = true;
    layoutDirty = true;
    requestMainFrame();
  }
  window.addEventListener('resize', invalidateViewport, { passive: true });
  mobileMedia.addEventListener('change', invalidateViewport);
  if ('ResizeObserver' in window) {
    const contentObserver = new ResizeObserver(() => {
      layoutDirty = true;
      requestMainFrame();
    });
    contentObserver.observe(document.querySelector('main'));
  }
  window.addEventListener('load', () => {
    const initialHash = photoIdFromUrl() ? '#works' : normalizeHash(location.hash);
    if (location.hash !== initialHash) {
      history.replaceState(history.state, '', `${location.pathname}${location.search}${initialHash}`);
    }
    if (initialHash !== '#home') finishNavigation(initialHash, history.state?.category || null, false);
    if (photoIdFromUrl()) requestAnimationFrame(openPhotoFromLocation);
    layoutDirty = true;
    scrollDirty = true;
    requestMainFrame();
  }, { once: true });
  window.addEventListener('pageshow', () => {
    if (!reloadToHome) return;
    requestAnimationFrame(() => {
      scrollTo(0, 0);
      scrollDirty = true;
      requestMainFrame();
    });
  }, { once: true });

  /* ImageBitmap LRU */
  class BitmapCache {
    constructor(budget, concurrency) {
      this.budget = budget;
      this.concurrency = concurrency;
      this.bytes = 0;
      this.entries = new Map();
      this.protectedSources = new Set();
      this.queue = [];
      this.active = 0;
      this.activeUpgrades = 0;
      this.activeWarmups = 0;
      this.pumpScheduled = false;
    }

    get(source) {
      const entry = this.entries.get(source);
      if (entry) entry.used = performance.now();
      return entry?.bitmap || null;
    }

    failed(source) { return Boolean(this.entries.get(source)?.failed); }

    request(source, priority = 0) {
      if (!source) return;
      const existing = this.entries.get(source);
      if (existing) {
        if (existing.pending) existing.priority = priority;
        return;
      }
      const entry = { bitmap: null, bytes: 0, used: performance.now(), pending: true, queued: true, priority };
      this.entries.set(source, entry);
      this.queue.push(source);
      // Collect the frame first so small visible images precede all upgrades.
      if (!this.pumpScheduled) {
        this.pumpScheduled = true;
        queueMicrotask(() => { this.pumpScheduled = false; this.pump(); });
      }
    }

    pump() {
      this.queue.sort((a, b) => (this.entries.get(a)?.priority || 0) - (this.entries.get(b)?.priority || 0));
      while (this.active < this.concurrency && this.queue.length) {
        const backgroundLimit = Math.max(1, Math.floor(this.concurrency / 3));
        // Neither speculative thumbnails nor large upgrades may fill the pool.
        const index = this.queue.findIndex(source => {
          const entry = this.entries.get(source);
          if (!entry?.pending || !entry.queued) return true;
          if (entry.priority >= 1) return this.activeUpgrades < backgroundLimit;
          if (entry.priority > 0) return this.activeWarmups < backgroundLimit;
          return true;
        });
        if (index < 0) break;
        const [source] = this.queue.splice(index, 1);
        const entry = this.entries.get(source);
        if (!entry?.pending || !entry.queued) continue;
        entry.queued = false;
        entry.controller = new AbortController();
        const upgrade = entry.priority >= 1;
        const warmup = entry.priority > 0 && !upgrade;
        this.active += 1;
        if (upgrade) this.activeUpgrades += 1;
        if (warmup) this.activeWarmups += 1;
        this.load(source, entry).finally(() => {
          this.active -= 1;
          if (upgrade) this.activeUpgrades -= 1;
          if (warmup) this.activeWarmups -= 1;
          this.pump();
        });
      }
    }

    async load(source, entry) {
      try {
        const bitmap = await window.PlutonoCImages.load(source, {
          signal: entry.controller.signal,
          priority: entry.priority ? 'low' : 'high'
        });
        if (entry.controller.signal.aborted || this.entries.get(source) !== entry) return;
        entry.bitmap = bitmap;
        entry.pending = false;
        entry.bytes = (bitmap.naturalWidth || bitmap.width || 1) * (bitmap.naturalHeight || bitmap.height || 1) * 4;
        this.bytes += entry.bytes;
        this.prune();
      } catch (error) {
        if (this.entries.get(source) !== entry) return;
        entry.pending = false;
        if (error.name === 'AbortError') this.entries.delete(source);
        else entry.failed = true;
      } finally {
        archiveCanvas?.requestDraw();
      }
    }

    cancelPending() {
      for (const [source, entry] of this.entries) {
        if (!entry.pending) continue;
        this.entries.delete(source);
        entry.controller?.abort();
      }
      this.queue = [];
    }

    retryFailed() {
      for (const source of this.protectedSources) {
        if (this.entries.get(source)?.failed) this.entries.delete(source);
      }
      archiveCanvas?.requestDraw();
    }

    protect(sources) {
      this.protectedSources = new Set(sources);
      for (const [source, entry] of this.entries) {
        if (this.protectedSources.has(source) || (!entry.pending && !entry.failed)) continue;
        this.entries.delete(source);
        entry.controller?.abort();
      }
      this.queue = this.queue.filter(source => this.entries.get(source)?.queued);
      this.prune();
    }

    prune() {
      if (this.bytes <= this.budget) return;
      const removable = [...this.entries.entries()]
        .filter(([source, entry]) => entry.bitmap && !entry.pending && !this.protectedSources.has(source))
        .sort((a, b) => a[1].used - b[1].used);
      for (const [source, entry] of removable) {
        if (this.bytes <= this.budget) break;
        entry.bitmap.close?.();
        this.bytes -= entry.bytes;
        this.entries.delete(source);
      }
    }
  }

  function hashNumber(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  class InfiniteArchiveCanvas {
    constructor(canvas, works) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: true });
      this.allWorks = works;
      this.visibleWorks = works;
      this.filter = 'all';
      this.nodes = [];
      this.rendered = [];
      this.camera = { x: 0, y: 0 };
      this.velocity = { x: 0, y: 0 };
      this.tile = { width: 2600, height: 1800 };
      this.pointer = null;
      this.hovered = null;
      this.focusedIndex = 0;
      this.dragged = false;
      this.opening = null;
      this.needsDraw = true;
      this.visible = !('IntersectionObserver' in window);
      this.prepared = false;
      this.lastFrame = performance.now();
      this.cache = new BitmapCache((isMobile ? 96 : 240) * 1024 * 1024, isMobile ? 4 : 6);
      this.previewSources = new Set();
      this.allPreviewSources = new Set(works.map(work => work.previewSrc || work.src));
      this.allThumbnailSources = new Set(works.map(work => work.thumbnailSrc || work.previewSrc || work.src));
      this.initialCamera = { x: 0, y: 0 };
      this.live = $('[data-canvas-live]');
      this.status = $('[data-canvas-status]');
      this.currentElement = $('.gallery-current');
      this.totalElement = $('.gallery-total');
      this.perspectiveSupported = Boolean(window.CSS?.supports('perspective', '1px') && window.CSS?.supports('transform-style', 'preserve-3d'));
      this.wallLayer = document.createElement('div'); this.wallLayer.className = 'sphere-wall-layer'; this.wallLayer.setAttribute('aria-hidden', 'true');
      this.wallWorld = document.createElement('div'); this.wallWorld.className = 'sphere-wall-world'; this.wallLayer.append(this.wallWorld);
      this.wallPlanes = new Map(); this.wallPlanePool = []; this.canvas.before(this.wallLayer);
      this.wallLayer.hidden = !this.perspectiveSupported;
      this.bind();
      this.resize();
      this.setFilter('all', true);
      if ('IntersectionObserver' in window) {
        this.visibilityObserver = new IntersectionObserver(entries => {
          const visible = entries.some(entry => entry.isIntersecting);
          if (visible === this.visible) return;
          this.visible = visible;
          if (visible) this.requestDraw();
          else {
            this.suspend();
          }
        });
        this.visibilityObserver.observe(canvas);
      }
    }

    bind() {
      this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
      this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
      this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
      this.canvas.addEventListener('pointercancel', event => this.pointerUp(event));
      this.canvas.addEventListener('pointerleave', () => { if (!this.pointer) { this.pendingPointerMove = null; this.hovered = null; this.hoverPoint = null; this.requestDraw(); } });
      this.canvas.addEventListener('keydown', event => this.keyDown(event));
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    }

    clearWallPlanes() {
      for (const { element, image } of this.wallPlanes.values()) {
        image.removeAttribute('src'); element.remove();
      }
      this.wallPlanes.clear();
      this.wallPlanePool.length = 0;
    }

    retireWallPlane(key, plane) {
      plane.image.removeAttribute('src'); plane.source = ''; plane.element.remove();
      this.wallPlanes.delete(key);
      if (this.wallPlanePool.length < (this.mobile ? 8 : 12)) this.wallPlanePool.push(plane);
    }

    releasePreviews() {
      this.previewSources.clear();
      for (const [source, entry] of this.cache.entries) {
        if (!this.allPreviewSources.has(source) || this.allThumbnailSources.has(source)) continue;
        entry.controller?.abort(); entry.bitmap?.close?.();
        this.cache.bytes -= entry.bytes; this.cache.entries.delete(source);
      }
    }

    suspend() {
      this.finishFilterTransition();
      this.velocity.x = this.velocity.y = 0;
      this.pendingPointerMove = null; this.hovered = null; this.hoverPoint = null;
      if (this.pointer && this.canvas.hasPointerCapture?.(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id);
      this.pointer = null; this.canvas.classList.remove('is-dragging');
      if (this.opening && !this.opening.dialogOpened) { this.opening = null; cancelPhotoImages(); }
      this.cache.cancelPending(); this.clearWallPlanes(); this.releasePreviews();
    }

    updateSceneSize() {
      const left = this.mobile ? 18 : 40;
      const titleWidth = Math.max(80, this.width - left * 2 - 100);
      const lines = Math.max(1, ...this.visibleWorks.map(work => this.wrapTitle(work.title, titleWidth).length));
      this.footerHeight = Math.max(76, 28 + lines * 20);
      this.sceneHeight = Math.max(1, this.height - this.footerHeight);
      this.wallLayer.style.height = `${this.sceneHeight}px`;
      this.wallLayer.style.perspective = `${this.wallDistance()}px`;
    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.2 : 1.75);
      if (this.width === bounds.width && this.height === bounds.height && this.dpr === dpr && this.mobile === isMobile) return;
      // Anchor the nearest repeated tile to its existing relative viewport position.
      const anchor = this.nodes.map(node => ({
        node,
        dx: mod(node.x - this.camera.x + this.tile.width / 2, this.tile.width) - this.tile.width / 2,
        dy: mod(node.y - this.camera.y + this.tile.height / 2, this.tile.height) - this.tile.height / 2
      })).sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];
      const projectedAnchor = anchor && this.project(anchor.dx, anchor.dy);
      const relative = projectedAnchor && { x: projectedAnchor.x / this.width, y: projectedAnchor.y / this.height };
      this.mobile = isMobile;
      this.cache.budget = (isMobile ? 96 : 240) * 1024 * 1024;
      this.cache.concurrency = isMobile ? 4 : 6;
      this.width = bounds.width;
      this.height = bounds.height;
      this.dpr = dpr;
      this.canvas.width = Math.round(bounds.width * dpr);
      this.canvas.height = Math.round(bounds.height * dpr);
      this.footerPaintKey = null;
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.updateSceneSize();
      this.layout();
      if (anchor && relative) {
        const target = this.nodes.find(node => node.slotIndex === anchor.node.slotIndex && node.work.id === anchor.node.work.id)
          || this.nodes.find(node => node.work.id === anchor.node.work.id);
        if (target) {
          const offset = this.unproject(relative.x * this.width, relative.y * this.height);
          this.camera.x = mod(target.x - offset.x, this.tile.width);
          this.camera.y = mod(target.y - offset.y, this.tile.height);
        }
      }
      this.velocity.x = this.velocity.y = 0;
      this.pendingPointerMove = null;
      if (this.pointer && this.canvas.hasPointerCapture?.(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id);
      this.pointer = null;
      this.canvas.classList.remove('is-dragging');
      this.hovered = null;
      if (this.opening) {
        this.opening = null;
        if (!photoDialog?.open) cancelPhotoImages();
      }
      this.cache.prune();
      this.requestDraw();
    }

    finishFilterTransition() {
      const transition = this.filterTransition;
      if (!transition) return;
      clearTimeout(this.filterTimer);
      this.filterTransition = null;
      for (const animation of transition.animations) animation.cancel();
      transition.snapshot.querySelectorAll('img').forEach(image => image.removeAttribute('src'));
      transition.snapshot.remove(); this.wallLayer.style.opacity = '1';
      this.canvas.removeAttribute('aria-busy'); this.releasePreviews(); this.requestDraw();
    }

    beginFilterTransition() {
      const transition = this.filterTransition;
      if (!transition || transition.started) return;
      transition.started = true; clearTimeout(this.filterTimer);
      if (reducedMotion || !this.wallLayer.animate) { this.finishFilterTransition(); return; }
      const options = { duration: 200, easing: 'ease', fill: 'both' };
      transition.animations = [this.wallLayer.animate([{ opacity: 0 }, { opacity: 1 }], options),
        transition.snapshot.animate([{ opacity: 1 }, { opacity: 0 }], options)];
      Promise.all(transition.animations.map(animation => animation.finished.catch(() => {}))).then(() => {
        if (this.filterTransition === transition) this.finishFilterTransition();
      });
    }

    setFilter(filter, immediate = false) {
      const normalized = filter === 'planetary' ? 'planet' : filter;
      if (normalized !== 'all' && !categoryConfig[normalized]) return;
      clearTimeout(this.filterTimer);
      let snapshot = null;
      if (!immediate && !reducedMotion && this.visible && this.perspectiveSupported && this.wallPlanes.size) {
        const current = this.filterTransition;
        snapshot = current && Number(getComputedStyle(this.wallLayer).opacity) < .5
          ? current.snapshot.cloneNode(true) : this.wallLayer.cloneNode(true);
        snapshot.classList.add('sphere-wall-snapshot'); snapshot.style.opacity = '1';
      }
      this.finishFilterTransition();
      this.cache.cancelPending(); this.clearWallPlanes();
      if (snapshot) { this.previewSources.clear(); this.wallLayer.before(snapshot); }
      else this.releasePreviews();
      this.hoverPoint = null; this.hovered = null;
      if (this.opening) abortPhotoPresentation({ restore: false });
      this.pendingPointerMove = null;
      this.filter = normalized;
      this.visibleWorks = normalized === 'all' ? [...this.allWorks] : this.allWorks.filter(work => work.category === normalized);
      this.focusedIndex = 0; this.opening = null; this.velocity.x = this.velocity.y = 0;
      this.updateSceneSize(); this.layout();
      this.camera.x = this.initialCamera.x; this.camera.y = this.initialCamera.y;
      this.totalElement.textContent = pad(this.visibleWorks.length);
      this.currentElement.textContent = this.visibleWorks.length ? '01' : '00';
      this.status.textContent = `${normalized === 'all' ? '全部' : categoryLabel(normalized)} / ${this.visibleWorks.length}`;
      $$('.gallery-filters [data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === normalized));
      $$('[data-index-link][data-gallery-target]').forEach(link => link.classList.toggle('is-current', activeSection?.id === 'works' && link.dataset.galleryTarget === (normalized === 'all' ? 'deepsky' : normalized)));
      if (normalized !== 'all') setVisualStage(normalized);
      $('[data-canvas-stage]').classList.remove('is-changing');
      if (snapshot) {
        this.filterTransition = { snapshot, started: false, animations: [] };
        this.wallLayer.style.opacity = '0'; this.canvas.setAttribute('aria-busy', 'true');
        this.filterTimer = setTimeout(() => this.beginFilterTransition(), 300);
      }
      this.requestDraw();
    }

    orderedWorks() {
      const buckets = { landscape: [], portrait: [], square: [] };
      this.visibleWorks.forEach((work, index) => {
        const aspect = Number(work.width) > 0 && Number(work.height) > 0 ? work.width / work.height : 1;
        const bucket = aspect > 1.28 ? 'landscape' : aspect < .78 ? 'portrait' : 'square';
        buckets[bucket].push({ work, index, aspect });
      });
      Object.values(buckets).forEach(bucket => bucket.sort((a, b) => hashNumber(String(a.work.id)) - hashNumber(String(b.work.id))));
      const pattern = ['landscape', 'portrait', 'square', 'landscape', 'square', 'portrait'];
      const ordered = [];
      while (ordered.length < this.visibleWorks.length) {
        let added = false;
        pattern.forEach(name => {
          const item = buckets[name].shift();
          if (!item) return;
          ordered.push(item);
          added = true;
        });
        if (!added) break;
      }
      return ordered;
    }

    layout() {
      this.prepared = false;
      const realCount = this.visibleWorks.length;
      if (!realCount || !this.width || !this.height) {
        this.nodes = [];
        this.tile = { width: Math.max(this.width, 1), height: Math.max(this.height, 1) };
        this.initialCamera = { x: 0, y: 0 };
        return;
      }

      const gap = isMobile ? 18 : 30;
      const rowGap = isMobile ? 32 : 30;
      const targetRowHeight = clamp(this.height * (isMobile ? .23 : .255), isMobile ? 145 : 190, isMobile ? 205 : 285);
      const minimumTileWidth = Math.max(this.width * 3, isMobile ? 1240 : 3200);
      const minimumTileHeight = Math.max(this.height * 2.15, isMobile ? 1240 : 1840);
      const contentWidth = minimumTileWidth - gap * 2;
      const ordered = this.orderedWorks();
      let slotIndex = 0;
      let previousIndex = -1;
      this.nodes = [];
      this.tile.width = minimumTileWidth;

      const nextSlot = () => {
        const clone = slotIndex >= realCount;
        let orderedIndex = slotIndex;
        if (clone) {
          const clonePosition = slotIndex - realCount;
          const cycle = Math.floor(clonePosition / realCount) + 1;
          const position = clonePosition % realCount;
          const offset = mod(Math.max(1, Math.floor(realCount * .37)) * cycle, realCount);
          orderedIndex = cycle % 2
            ? mod(position + offset, realCount)
            : mod(realCount - 1 - position + offset, realCount);
          if (realCount > 1 && ordered[orderedIndex].index === previousIndex) orderedIndex = mod(orderedIndex + 1, realCount);
        }
        const entry = ordered[orderedIndex];
        previousIndex = entry.index;
        const slot = { ...entry, slotIndex, clone };
        slotIndex += 1;
        return slot;
      };

      let rowTop = gap;
      let safety = 0;
      while ((slotIndex < realCount || rowTop - gap < minimumTileHeight) && safety < 1200) {
        const row = [];
        let aspectTotal = 0;
        let projectedWidth = 0;
        do {
          const slot = nextSlot();
          row.push(slot);
          aspectTotal += Math.max(slot.aspect, .08);
          projectedWidth = aspectTotal * targetRowHeight + gap * (row.length - 1);
          safety += 1;
        } while (projectedWidth < contentWidth && safety < 1200);

        const rowHeight = Math.max((contentWidth - gap * (row.length - 1)) / Math.max(aspectTotal, .08), 72);
        let left = gap;
        row.forEach(slot => {
          const width = rowHeight * slot.aspect;
          this.nodes.push({
            work: slot.work,
            index: slot.index,
            slotIndex: slot.slotIndex,
            clone: slot.clone,
            x: left + width / 2,
            y: rowTop + rowHeight / 2,
            width,
            height: rowHeight,
            featured: false
          });
          left += width + gap;
        });
        // Titles live in the independent footer, not between photo rows.
        rowTop += rowHeight + rowGap;
      }

      this.tile.height = rowTop - gap;
      const originals = this.nodes.filter(node => !node.clone);
      const left = Math.min(...originals.map(node => node.x - node.width / 2));
      const right = Math.max(...originals.map(node => node.x + node.width / 2));
      const top = Math.min(...originals.map(node => node.y - node.height / 2));
      const bottom = Math.max(...originals.map(node => node.y + node.height / 2));
      this.initialCamera.x = mod((left + right) / 2, this.tile.width);
      this.initialCamera.y = mod(top + this.height / 2, this.tile.height);
      const initial = originals.reduce((best, node) => {
        const distance = Math.hypot(node.x - this.initialCamera.x, node.y - this.initialCamera.y);
        return !best || distance < best.distance ? { node, distance } : best;
      }, null).node;
      this.initialCamera = { x: initial.x, y: initial.y };
    }

    wrapTitle(title, width) {
      this.context.save();
      this.context.font = '14px "Source Han Sans CN", sans-serif';
      const lines = [];
      let line = '';
      for (const character of String(title)) {
        if (line && this.context.measureText(line + character).width > width) {
          lines.push(line); line = '';
        }
        line += character;
      }
      if (line) lines.push(line);
      this.context.restore();
      return lines.length ? lines : [''];
    }

    primaryNodeForIndex(index) {
      return this.nodes.find(node => !node.clone && node.index === index)
        || this.nodes.find(node => node.index === index)
        || null;
    }

    setFocusedIndex(index, announce = false) {
      if (!this.visibleWorks.length) return;
      this.focusedIndex = mod(index, this.visibleWorks.length);
      const work = this.visibleWorks[this.focusedIndex];
      this.currentElement.textContent = pad(this.focusedIndex + 1);
      if (announce && work) {
        this.live.textContent = `${work.title}，${categoryLabel(work.category)}，第 ${this.focusedIndex + 1} 张，共 ${this.visibleWorks.length} 张`;
      }
    }

    centerOnIndex(index, announce = true) {
      const node = this.primaryNodeForIndex(mod(index, this.visibleWorks.length));
      if (!node) return -1;
      this.setFocusedIndex(node.index, announce);
      this.camera.x = mod(node.x, this.tile.width);
      this.camera.y = mod(node.y, this.tile.height);
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.requestDraw();
      return node.index;
    }

    focusWorkById(workId, announce = true) {
      const index = this.visibleWorks.findIndex(work => String(work.id) === String(workId));
      if (index < 0) return -1;
      return this.centerOnIndex(index, announce);
    }

    syncFocusedFromCenter() {
      if (this.opening || !this.rendered.length) return;
      let closest = null;
      let closestDistance = Infinity;
      for (const item of this.rendered) {
        const distance = (item.x - this.width / 2) ** 2 + (item.y - this.sceneHeight / 2) ** 2;
        if (distance < closestDistance) {
          closest = item;
          closestDistance = distance;
        }
      }
      if (closest && closest.node.index !== this.focusedIndex) this.setFocusedIndex(closest.node.index);
    }

    requestDraw() {
      this.needsDraw = true;
      requestMainFrame();
    }

    frame(time) {
      if (document.hidden) { this.lastFrame = time; return false; }
      // One preparation frame warms small thumbnails near the viewport. Further
      // painting and preview upgrades wait until the canvas is actually visible.
      if (this.visible === false && this.prepared && !this.opening) {
        this.lastFrame = time;
        return false;
      }
      this.flushPointerMove();
      const delta = Math.min((time - this.lastFrame) / 16.667, 2);
      this.lastFrame = time;
      const moving = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > .04;
      if (!this.opening && !this.pointer?.dragging && moving && !reducedMotion) {
        this.camera.x = mod(this.camera.x + this.velocity.x * delta, this.tile.width);
        this.camera.y = mod(this.camera.y + this.velocity.y * delta, this.tile.height);
        const damping = isMobile ? .875 : .925;
        this.velocity.x *= Math.pow(damping, delta);
        this.velocity.y *= Math.pow(damping, delta);
        this.needsDraw = true;
      } else if (reducedMotion || !moving) {
        this.velocity.x = 0;
        this.velocity.y = 0;
      }
      if (this.needsDraw) this.draw();
      return !this.pointer?.dragging && (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > .04);
    }

    wallRadius() {
      return Math.min(this.width, this.sceneHeight) * 1.18;
    }

    wallDistance() {
      return this.wallRadius() * (this.mobile ? 1.8 : 1.2);
    }

    project(dx, dy) {
      const radius = this.wallRadius(), distance = this.wallDistance();
      const flat = reducedMotion || !this.perspectiveSupported;
      let surface, facing = 1;
      const theta = flat ? 0 : dx / radius;
      const phi = flat ? 0 : dy / radius;
      if (!flat && (Math.abs(theta) > 1.34 || Math.abs(phi) > 1.34)) return null;
      if (flat) surface = { x: dx, y: dy, z: 0 };
      else {
        const cosine = Math.cos(theta) * Math.cos(phi);
        surface = { x: radius * Math.sin(theta) * Math.cos(phi), y: radius * Math.sin(phi), z: radius * (cosine - 1) };
        facing = ((distance + radius) * cosine - radius) / Math.hypot(surface.x, surface.y, distance - surface.z);
        if (facing <= .12) return null;
      }
      const perspective = distance / (distance - surface.z);
      const photoScale = flat ? 1 : this.mobile ? .94 : .88;
      return { x: this.width / 2 + surface.x * perspective, y: this.sceneHeight / 2 + surface.y * perspective,
        surface, theta, phi, perspective, scale: perspective * photoScale, photoScale,
        distance: distance - surface.z, facing, opacity: flat ? 1 : clamp((facing - .12) / .13, 0, 1) };
    }

    unproject(x, y, pointer = false) {
      const distance = this.wallDistance(), radius = this.wallRadius();
      const flat = reducedMotion || !this.perspectiveSupported;
      if (pointer) {
        x -= this.pointer?.grabOffsetX || 0;
        y -= this.pointer?.grabOffsetY || 0;
      }
      let sx = x - this.width / 2, sy = y - this.sceneHeight / 2;
      if (flat || (pointer && !this.pointer?.surfaceGrab)) return { x: sx, y: sy };
      const projectedRadius = distance * radius / Math.sqrt(distance * distance + 2 * distance * radius);
      // A sphere's inverse has unbounded gain at its silhouette. Continue along
      // the inner tangent for captured drags instead of accelerating then snapping
      // to a different gain when the pointer crosses that edge.
      const dragLimit = projectedRadius * .9;
      const dragLength = Math.hypot(sx, sy);
      if (pointer && dragLength > dragLimit) {
        const ux = sx / dragLength, uy = sy / dragLength, step = .01;
        const edge = this.unproject(this.width / 2 + ux * dragLimit, this.sceneHeight / 2 + uy * dragLimit);
        const inner = this.unproject(this.width / 2 + ux * (dragLimit - step), this.sceneHeight / 2 + uy * (dragLimit - step));
        const extra = (dragLength - dragLimit) / step;
        return { x: edge.x + (edge.x - inner.x) * extra, y: edge.y + (edge.y - inner.y) * extra };
      }
      const length = Math.hypot(sx, sy), limit = projectedRadius * .999;
      const extension = length > limit ? 1 - limit / length : 0;
      const extraX = sx * extension, extraY = sy * extension;
      if (extension) { sx *= limit / length; sy *= limit / length; }
      const a = 1 + (sx * sx + sy * sy) / (distance * distance);
      const camera = distance + radius;
      const discriminant = Math.max(0, camera * camera - a * (camera * camera - radius * radius));
      const depth = (camera - Math.sqrt(discriminant)) / a;
      const worldX = sx * depth / distance, worldY = sy * depth / distance, worldZ = camera - depth;
      return { x: radius * Math.atan2(worldX, worldZ) + extraX * 1.7,
        y: radius * Math.asin(clamp(worldY / radius, -1, 1)) + extraY * 1.7 };
    }

    draw() {
      this.needsDraw = false;
      const context = this.context;
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (!this.perspectiveSupported) context.clearRect(0, 0, this.width, this.height);
      this.rendered = [];
      this.frameSources = new Set();
      this.wallUsed = new Set();
      const slow = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) < 2.4;
      const loadingMotion = Boolean(this.pointer?.dragging) || Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > .04;
      const warmRadius = this.wallRadius() * 1.35;
      const warmMargin = this.mobile ? 140 : 240;
      const leadX = clamp(this.velocity.x * 12, -warmMargin, warmMargin);
      const leadY = clamp(this.velocity.y * 12, -warmMargin, warmMargin);
      const nearby = new Map();
      const candidates = [];
      for (const node of this.nodes) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          for (let offsetY = -1; offsetY <= 1; offsetY++) {
            const latticeX = node.x - this.camera.x + offsetX * this.tile.width;
            const latticeY = node.y - this.camera.y + offsetY * this.tile.height;
            if (this.visible !== false) {
              const aheadX = latticeX - leadX, aheadY = latticeY - leadY;
              const flat = reducedMotion || !this.perspectiveSupported;
              const near = flat
                ? Math.abs(aheadX) < this.width / 2 + node.width / 2 + warmMargin && Math.abs(aheadY) < this.sceneHeight / 2 + node.height / 2 + warmMargin
                : Math.hypot(aheadX, aheadY) < warmRadius + Math.max(node.width, node.height) / 2;
              if (near) {
                const source = node.work.thumbnailSrc || node.work.previewSrc || node.work.src;
                const score = aheadX * aheadX + aheadY * aheadY;
                if (!nearby.has(source) || nearby.get(source) > score) nearby.set(source, score);
              }
            }
            const point = this.project(latticeX, latticeY);
            if (!point) continue;
            const width = node.width * point.scale, height = node.height * point.scale;
            if (point.x + width / 2 < -40 || point.x - width / 2 > this.width + 40 || point.y + height / 2 < -40 || point.y - height / 2 > this.sceneHeight + 40) continue;
            if (!reducedMotion && this.perspectiveSupported) point.opacity *= clamp((point.y + 24) / 64, 0, 1) * clamp((this.sceneHeight + 24 - point.y) / 64, 0, 1);
            const key = `${node.slotIndex}:${offsetX}:${offsetY}:${node.work.id}`;
            const focused = node.index === this.focusedIndex && document.activeElement === this.canvas;
            candidates.push({ node, key, ...point, width, height, latticeX, latticeY,
              planeWidth: node.width * point.photoScale, planeHeight: node.height * point.photoScale, hovered: false, focused });
          }
        }
      }
      candidates.sort((a, b) => b.distance - a.distance);
      const hover = !this.opening && !loadingMotion && this.hoverPoint && [...candidates].reverse().find(i => this.containsPoint(i, this.hoverPoint.x, this.hoverPoint.y));
      for (const item of candidates) item.hovered = item.key === hover?.key;
      this.hovered = hover || null;
      const score = item => item.key === this.opening?.key || item.hovered || item.focused ? -Infinity : -item.width * item.height * item.opacity;
      const previewCandidates = this.visible === false || this.filterTransition ? [] : candidates.filter(item => !loadingMotion
        || (this.previewSources.has(item.node.work.previewSrc || item.node.work.src) && this.cache.entries.get(item.node.work.previewSrc || item.node.work.src)?.bitmap));
      this.previewSources = new Set(previewCandidates.sort((a, b) => score(a) - score(b)).slice(0, this.mobile ? 4 : 6).map(i => i.node.work.previewSrc || i.node.work.src));
      for (const [source, entry] of this.cache.entries) {
        if (this.filterTransition || !this.allPreviewSources.has(source) || this.allThumbnailSources.has(source) || this.previewSources.has(source)) continue;
        entry.controller?.abort(); entry.bitmap?.close?.(); this.cache.bytes -= entry.bytes; this.cache.entries.delete(source);
      }
      // Request order is independent of far-to-near paint order. The center gets
      // its thumbnail first; a bounded ring also warms the sphere's hidden edge.
      const thumbnailScore = item => item.hovered || item.focused ? -Infinity : (item.x - this.width / 2) ** 2 + (item.y - this.sceneHeight / 2) ** 2;
      for (const item of [...candidates].filter(item => item.opacity > .015).sort((a, b) => thumbnailScore(a) - thumbnailScore(b))) {
        const source = item.node.work.thumbnailSrc || item.node.work.previewSrc || item.node.work.src;
        this.frameSources.add(source); this.cache.request(source, 0);
      }
      let warmed = 0;
      for (const [source] of [...nearby].sort((a, b) => a[1] - b[1])) {
        if (this.frameSources.has(source)) continue;
        this.frameSources.add(source); this.cache.request(source, .5);
        if (++warmed >= (this.mobile ? 6 : 12)) break;
      }
      candidates.sort((a, b) => b.distance - a.distance);
      for (const original of candidates) {
        const item = original, opacity = item.opacity;
        if (opacity > .015) this.drawNode(context, item, slow, opacity);
      }
      for (const [key, plane] of this.wallPlanes) {
        if (this.wallUsed.has(key)) continue;
        this.retireWallPlane(key, plane);
      }
      const front = this.rendered.slice().reverse();
      const label = front.find(i => i.hovered) || front.find(i => i.focused);
      this.drawFooter(context, label && !this.opening && !loadingMotion && slow ? label : null);
      if (this.filterTransition && this.rendered.some(item => this.cache.get(item.node.work.thumbnailSrc || item.node.work.previewSrc))) this.beginFilterTransition();
      this.cache.protect(this.frameSources);
      const retry = document.querySelector('[data-canvas-retry]');
      if (retry) retry.hidden = !this.rendered.some(({ node }) => this.cache.failed(node.work.thumbnailSrc) || (this.previewSources.has(node.work.previewSrc) && this.cache.failed(node.work.previewSrc)));
      this.syncFocusedFromCenter(); this.prepared = true;
      if (this.visible === false) this.clearWallPlanes();
    }

    roundedRect(context, x, y, width, height, radius) {
      const safeRadius = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      if (context.roundRect) context.roundRect(x, y, width, height, safeRadius);
      else {
        context.moveTo(x + safeRadius, y);
        context.arcTo(x + width, y, x + width, y + height, safeRadius);
        context.arcTo(x + width, y + height, x, y + height, safeRadius);
        context.arcTo(x, y + height, x, y, safeRadius);
        context.arcTo(x, y, x + width, y, safeRadius);
        context.closePath();
      }
    }

    drawNode(context, item, slow, opacity = 1) {
      const { node, key } = item;
      const source = node.work.previewSrc || node.work.src;
      const thumbnail = node.work.thumbnailSrc || source;
      this.frameSources.add(thumbnail);
      if (this.previewSources.has(source)) this.frameSources.add(source);
      const preview = this.previewSources.has(source) ? this.cache.get(source) : null;
      const small = this.cache.get(thumbnail);
      const bitmap = preview || small;
      if (!small) this.cache.request(thumbnail, 0);
      if (!preview && this.previewSources.has(source) && this.visible !== false && !this.pointer?.dragging
        && Math.abs(this.velocity.x) + Math.abs(this.velocity.y) <= .04
        && (small || thumbnail === source || this.cache.failed(thumbnail))) this.cache.request(source, 1);
      if (!this.perspectiveSupported) {
        context.save(); context.beginPath(); context.rect(0, 0, this.width, this.sceneHeight); context.clip(); context.globalAlpha = opacity;
        this.roundedRect(context, item.x - item.width / 2, item.y - item.height / 2, item.width, item.height, 12);
        context.fillStyle = '#0b0d11'; context.fill(); context.clip();
        if (bitmap) context.drawImage(bitmap, item.x - item.width / 2, item.y - item.height / 2, item.width, item.height);
        context.restore(); this.rendered.push(item); return;
      }
      let plane = this.wallPlanes.get(key);
      if (!plane) {
        plane = this.wallPlanePool.pop();
        if (!plane) {
          const element = document.createElement('div'); element.className = 'sphere-wall-photo'; element.setAttribute('aria-hidden', 'true');
          const image = document.createElement('img'); image.alt = ''; image.decoding = 'async'; element.append(image);
          plane = { element, image, source: '' };
        }
        this.wallWorld.append(plane.element); this.wallPlanes.set(key, plane);
      }
      const style = plane.element.style;
      if (plane.width !== item.planeWidth) { style.width = `${item.planeWidth}px`; plane.width = item.planeWidth; }
      if (plane.height !== item.planeHeight) { style.height = `${item.planeHeight}px`; plane.height = item.planeHeight; }
      const transform = `translate3d(${item.surface.x - item.planeWidth / 2}px,${item.surface.y - item.planeHeight / 2}px,${item.surface.z}px)`;
      if (plane.transform !== transform) { style.transform = transform; plane.transform = transform; }
      if (plane.opacity !== opacity) { style.opacity = `${opacity}`; plane.opacity = opacity; }
      if (bitmap && plane.source !== bitmap.src) { plane.source = bitmap.src; plane.image.src = bitmap.src; }
      if (plane.visible !== Boolean(bitmap)) { plane.image.style.visibility = bitmap ? 'visible' : 'hidden'; plane.visible = Boolean(bitmap); }
      this.wallUsed.add(key); this.rendered.push(item);
    }

    drawFooter(context, item) {
      const key = `${this.width}:${this.height}:${this.sceneHeight}:${item?.node.work.id || ''}:${item?.node.index ?? ''}`;
      if (this.perspectiveSupported && this.footerPaintKey === key) return;
      this.footerPaintKey = key;
      context.clearRect(0, this.sceneHeight, this.width, this.height - this.sceneHeight);
      context.fillStyle = '#050609';
      context.fillRect(0, this.sceneHeight, this.width, this.height - this.sceneHeight);
      this.captionWorkId = null; this.captionBounds = null;
      if (item) this.drawSpaceCaption(context, item);
    }

    drawSpaceCaption(context, item) {
      this.captionWorkId = item.node.work.id;
      const left = this.mobile ? 18 : 40;
      const width = Math.max(80, this.width - left * 2 - 100);
      const lines = this.wrapTitle(item.node.work.title, width);
      context.save(); context.fillStyle = 'rgba(238,234,224,.94)'; context.font = '14px "Source Han Sans CN", sans-serif';
      lines.forEach((line, index) => context.fillText(line, left, this.sceneHeight + 25 + index * 20, width));
      context.fillStyle = categoryConfig[item.node.work.category]?.color || '#8d9097'; context.font = '9px "IBM Plex Sans", monospace';
      context.fillText(`${categoryEnglish(item.node.work.category)} / ${pad(item.node.index + 1)}`, left, this.sceneHeight + 25 + lines.length * 20, width);
      context.restore(); this.captionBounds = { left, right: left + width, top: this.sceneHeight, bottom: this.sceneHeight + 28 + lines.length * 20 };
    }

    containsPoint(item, x, y) {
      if ((item.opacity ?? 1) < .1) return false;
      const dx = Math.abs(x - item.x), dy = Math.abs(y - item.y);
      if (dx > item.width / 2 || dy > item.height / 2) return false;
      const radius = Math.min(12 * (item.perspective ?? 1), item.width / 2, item.height / 2);
      const cornerX = Math.max(0, dx - item.width / 2 + radius);
      const cornerY = Math.max(0, dy - item.height / 2 + radius);
      return cornerX * cornerX + cornerY * cornerY <= radius * radius;
    }

    hitTest(x, y) {
      if (y < 0 || y >= this.sceneHeight) return null;
      for (let index = this.rendered.length - 1; index >= 0; index -= 1) {
        const item = this.rendered[index];
        if (this.containsPoint(item, x, y)) return item;
      }
      return null;
    }

    startOpening(item) {
      if (!item || item.node.work !== this.visibleWorks[item.node.index] || this.filterTransition) return;
      this.focusedIndex = item.node.index; this.velocity.x = this.velocity.y = 0; this.hovered = null;
      const bounds = this.canvas.getBoundingClientRect();
      const source = this.wallPlanes.get(item.key)?.image.currentSrc
        || this.cache.get(item.node.work.previewSrc)?.src || this.cache.get(item.node.work.thumbnailSrc)?.src;
      openPhoto(item.node.index, { key: item.key, source,
        origin: { left: bounds.left + item.x - item.width / 2, top: bounds.top + item.y - item.height / 2,
          width: item.width, height: item.height, radius: 12 * (item.perspective || 1) } });
    }

    pointerDown(event) {
      this.pendingPointerMove = null;
      if (event.button !== undefined && event.button !== 0) return;
      this.velocity.x = 0;
      this.velocity.y = 0;
      const bounds = this.canvas.getBoundingClientRect();
      const grabbed = this.hitTest(event.clientX - bounds.left, event.clientY - bounds.top);
      this.pointer = {
        surfaceGrab: Boolean(grabbed),
        grabOffsetX: grabbed ? event.clientX - bounds.left - grabbed.x : 0,
        grabOffsetY: grabbed ? event.clientY - bounds.top - grabbed.y : 0,
        id: event.pointerId,
        type: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: performance.now(),
        dragging: false,
        verticalPageGesture: false
      };
      this.dragged = false;
    }

    pointerMove(event) {
      this.pendingPointerMove = {
        clientX: event.clientX, clientY: event.clientY,
        pointerId: event.pointerId, pointerType: event.pointerType,
        time: performance.now()
      };
      requestMainFrame();
    }

    flushPointerMove() {
      const event = this.pendingPointerMove;
      if (!event) return;
      this.pendingPointerMove = null;
      const bounds = this.canvas.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      this.hoverPoint = { x: localX, y: localY };
      if (!this.pointer || this.pointer.id !== event.pointerId) {
        const hit = this.hitTest(localX, localY);
        const changed = hit?.node !== this.hovered?.node || hit?.x !== this.hovered?.x || hit?.y !== this.hovered?.y;
        if (changed) {
          this.hovered = hit ? { ...hit } : null;
          this.canvas.style.cursor = hit ? 'pointer' : 'grab';
          this.requestDraw();
        }
        return;
      }
      const totalX = event.clientX - this.pointer.startX;
      const totalY = event.clientY - this.pointer.startY;
      if (!this.pointer.dragging && !this.pointer.verticalPageGesture && Math.hypot(totalX, totalY) > 10) {
        if (event.pointerType === 'touch' && Math.abs(totalY) > Math.abs(totalX) * 1.25) {
          this.pointer.verticalPageGesture = true;
          return;
        }
        this.pointer.dragging = true;
        this.dragged = true;
        this.canvas.classList.add('is-dragging');
        this.canvas.setPointerCapture?.(event.pointerId);
      }
      if (!this.pointer.dragging) return;
      const now = event.time;
      const elapsed = Math.max(now - this.pointer.lastTime, 1);
      const previous = this.unproject(this.pointer.lastX - bounds.left, this.pointer.lastY - bounds.top, true);
      const current = this.unproject(localX, localY, true);
      const deltaX = current.x - previous.x;
      const deltaY = current.y - previous.y;
      this.camera.x = mod(this.camera.x - deltaX, this.tile.width);
      this.camera.y = mod(this.camera.y - deltaY, this.tile.height);
      this.velocity.x = clamp(-deltaX / elapsed * 16, isMobile ? -22 : -32, isMobile ? 22 : 32);
      this.velocity.y = clamp(-deltaY / elapsed * 16, isMobile ? -22 : -32, isMobile ? 22 : 32);
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.pointer.lastTime = now;
      this.requestDraw();
    }

    pointerUp(event) {
      if (event.type === 'pointercancel') this.pendingPointerMove = null;
      else this.flushPointerMove();
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const bounds = this.canvas.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      this.hoverPoint = { x: localX, y: localY };
      if (performance.now() - this.pointer.lastTime > 100) this.velocity.x = this.velocity.y = 0;
      const wasDragging = this.pointer.dragging;
      const wasPageGesture = this.pointer.verticalPageGesture;
      this.canvas.classList.remove('is-dragging');
      if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      this.pointer = null;
      if (event.type !== 'pointercancel' && !wasDragging && !wasPageGesture && !this.dragged) {
        const hit = this.hitTest(localX, localY);
        if (hit) this.startOpening(hit);
      }
      if (reducedMotion) { this.velocity.x = 0; this.velocity.y = 0; }
      this.requestDraw();
    }

    keyDown(event) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'].includes(event.key)) return;
      this.hoverPoint = null; this.hovered = null;
      if (event.key === 'Escape') { this.canvas.blur(); return; }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const item = this.rendered.find(rendered => rendered.node.index === this.focusedIndex);
        if (item) this.startOpening(item);
        else openPhoto(this.focusedIndex);
        return;
      }
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      this.centerOnIndex(this.focusedIndex + direction);
    }

    go(offset) {
      if (!this.nodes.length) return;
      this.centerOnIndex(this.focusedIndex + offset);
    }
  }

  const canvasElement = $('[data-archive-canvas]');
  let stopArchiveCanvasWarmup = () => {};
  function ensureArchiveCanvas() {
    if (!canvasElement || archiveCanvas) return archiveCanvas;
    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);
    stopArchiveCanvasWarmup();
    layoutDirty = true;
    requestMainFrame();
    return archiveCanvas;
  }

  if (canvasElement) {
    if ('IntersectionObserver' in window) {
      let archiveCanvasNear = false;
      const warmArchiveCanvas = () => {
        if (!archiveCanvasNear || (scrollY <= 32 && normalizeHash(location.hash) === '#home')) return;
        ensureArchiveCanvas();
      };
      const archiveCanvasObserver = new IntersectionObserver(entries => {
        archiveCanvasNear = entries.some(entry => entry.isIntersecting);
        warmArchiveCanvas();
      }, { rootMargin: '800px 0px', threshold: 0 });
      archiveCanvasObserver.observe(canvasElement);
      window.addEventListener('scroll', warmArchiveCanvas, { passive: true });
      stopArchiveCanvasWarmup = () => {
        archiveCanvasObserver.disconnect();
        window.removeEventListener('scroll', warmArchiveCanvas);
      };
    } else if (location.hash === '#works') ensureArchiveCanvas();
  }
  $$('.gallery-filters [data-filter]').forEach(button => button.addEventListener('click', () => ensureArchiveCanvas()?.setFilter(button.dataset.filter)));
  $('[data-canvas-retry]')?.addEventListener('click', () => archiveCanvas?.cache.retryFailed());
  $('.gallery-prev')?.addEventListener('click', () => ensureArchiveCanvas()?.go(-1));
  $('.gallery-next')?.addEventListener('click', () => ensureArchiveCanvas()?.go(1));

  motionMedia.addEventListener('change', event => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      const destination = pendingNavigation; cancelNavigation();
      if (destination && !destination.applied) finishNavigation(destination.hash, destination.category);
      archiveCanvas?.finishFilterTransition();
    }
    if (photoDialog?.open) {
      if (photoMotion.phase === 'closing') { photoMotion.phase = 'open'; requestPhotoClose({ immediate: true }); }
      else if (photoMotion.phase === 'opening') settlePhotoOpening();
      else if (reducedMotion && photoMotion.phase === 'open' && photoMotion.flight) resetPhotoAnimation();
    }
    if (archiveCanvas) {
      archiveCanvas.velocity.x = archiveCanvas.velocity.y = 0;
      archiveCanvas.hovered = null; archiveCanvas.hoverPoint = null;
      archiveCanvas.requestDraw();
    }
    scrollDirty = true; syncTimecode(); requestMainFrame();
  });
  function syncPageVisibility() {
    document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
    if (document.hidden) archiveCanvas?.suspend();
    else if (archiveCanvas?.visible) archiveCanvas.requestDraw();
  }
  document.addEventListener('visibilitychange', syncPageVisibility);
  window.addEventListener('pagehide', () => { archiveCanvas?.suspend(); if (photoDialog?.open) abortPhotoPresentation({ restore: false }); });
  window.addEventListener('pageshow', syncPageVisibility);
  syncPageVisibility();

  /* Searchable photography directory */
  const galleryDirectory = $('[data-gallery-directory]');
  const galleryDirectoryGrid = $('[data-gallery-directory-grid]', galleryDirectory);
  let galleryDirectoryFocusTimer = 0;
  let directoryInputMode = matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'keyboard';
  document.addEventListener('pointerdown', event => { directoryInputMode = event.pointerType; }, true);
  document.addEventListener('keydown', () => { directoryInputMode = 'keyboard'; }, true);
  const galleryDirectorySearch = $('[data-gallery-directory-search]', galleryDirectory);
  const galleryDirectorySummary = $('[data-gallery-directory-summary]', galleryDirectory);
  const galleryDirectoryResult = $('[data-gallery-directory-result]', galleryDirectory);
  const galleryDirectoryState = { search: '', category: 'all', status: 'all' };
  let galleryDirectoryReturnFocus = null;
  let galleryDirectoryRestoreFocus = true;
  let directoryImageObserver = null;
  let directoryImageQueue = [];
  let directoryImageActive = 0;
  let directoryImageGeneration = 0;
  let directoryImageConcurrency = isMobile ? 4 : 6;

  function directorySearchText(work) {
    const details = work.details || {};
    return [
      work.title,
      categoryLabel(work.category),
      categoryEnglish(work.category),
      details.location,
      details.equipment,
      details.parameters
    ].flat().filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
  }

  function directoryWorks() {
    const term = galleryDirectoryState.search.trim().toLocaleLowerCase('zh-CN');
    return allWorks.filter(work => {
      if (galleryDirectoryState.category !== 'all' && work.category !== galleryDirectoryState.category) return false;
      const seen = seenWorkIds.has(String(work.id));
      if (galleryDirectoryState.status === 'seen' && !seen) return false;
      if (galleryDirectoryState.status === 'unseen' && seen) return false;
      return !term || directorySearchText(work).includes(term);
    });
  }

  function syncDirectoryControls() {
    $$('[data-directory-category]', galleryDirectory).forEach(button => {
      button.classList.toggle('active', button.dataset.directoryCategory === galleryDirectoryState.category);
    });
    $$('[data-directory-status]', galleryDirectory).forEach(button => {
      button.classList.toggle('active', button.dataset.directoryStatus === galleryDirectoryState.status);
    });
    const categorySelect = $('[data-directory-category-select]', galleryDirectory);
    const statusSelect = $('[data-directory-status-select]', galleryDirectory);
    if (categorySelect) categorySelect.value = galleryDirectoryState.category;
    if (statusSelect) statusSelect.value = galleryDirectoryState.status;
    if (galleryDirectorySearch && galleryDirectorySearch.value !== galleryDirectoryState.search) {
      galleryDirectorySearch.value = galleryDirectoryState.search;
    }
  }

  const directoryImageControllers = new Set();
  function resetDirectoryImageLoader() {
    directoryImageGeneration += 1;
    directoryImageControllers.forEach(controller => controller.abort());
    directoryImageControllers.clear();
    const retry = $('[data-directory-retry]');
    if (retry) retry.hidden = true;
    directoryImageObserver?.disconnect();
    directoryImageObserver = null;
    directoryImageQueue = [];
  }

  function pumpDirectoryImages() {
    while (directoryImageActive < directoryImageConcurrency && directoryImageQueue.length) {
      const task = directoryImageQueue.shift();
      if (task.generation !== directoryImageGeneration || !task.image.isConnected) continue;
      const controller = new AbortController();
      directoryImageControllers.add(controller);
      directoryImageActive += 1;
      window.PlutonoCImages.load(task.source, { signal: controller.signal }).then(() => {
        if (task.generation !== directoryImageGeneration || !task.image.isConnected) return;
        task.image.src = task.source;
        task.image.classList.add('is-loaded');
        delete task.image.dataset.directoryFailed;
      }).catch(error => {
        if (error.name === 'AbortError' || task.generation !== directoryImageGeneration || !task.image.isConnected) return;
        task.image.dataset.directoryFailed = task.source;
        $('[data-directory-retry]').hidden = false;
      }).finally(() => {
        directoryImageControllers.delete(controller);
        directoryImageActive = Math.max(0, directoryImageActive - 1);
        pumpDirectoryImages();
      });
    }
  }

  $('[data-directory-retry]')?.addEventListener('click', event => {
    event.currentTarget.hidden = true;
    $$('img[data-directory-failed]', galleryDirectoryGrid).forEach(image => {
      directoryImageQueue.push({ image, source: image.dataset.directoryFailed, generation: directoryImageGeneration });
      delete image.dataset.directoryFailed;
    });
    pumpDirectoryImages();
  });

  function observeDirectoryImages(generation) {
    const images = $$('img[data-directory-src]', galleryDirectoryGrid);
    if (!images.length) return;
    const enqueue = image => {
      const source = image.dataset.directorySrc;
      if (!source) return;
      delete image.dataset.directorySrc;
      directoryImageQueue.push({ image, source, generation });
      pumpDirectoryImages();
    };
    if (!('IntersectionObserver' in window)) {
      images.forEach(enqueue);
      return;
    }
    directoryImageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        directoryImageObserver?.unobserve(entry.target);
        enqueue(entry.target);
      });
    }, { root: galleryDirectory, rootMargin: '320px 0px', threshold: 0 });
    images.forEach(image => directoryImageObserver.observe(image));
  }

  function renderGalleryDirectory() {
    if (!galleryDirectoryGrid) return;
    resetDirectoryImageLoader();
    const generation = directoryImageGeneration;
    const works = directoryWorks();
    const resultText = `${works.length} / ${allWorks.length} 张作品`;
    galleryDirectorySummary.textContent = resultText;
    galleryDirectoryResult.textContent = resultText;
    if (!works.length) {
      galleryDirectoryGrid.innerHTML = '<p class="gallery-directory-empty">没有符合条件的作品</p>';
      return;
    }
    galleryDirectoryGrid.innerHTML = works.map(work => {
      const seen = seenWorkIds.has(String(work.id));
      const source = work.thumbnailSrc || work.previewSrc || work.src;
      return `
        <button class="gallery-directory-card${seen ? ' is-seen' : ''}" type="button" data-directory-card data-work-id="${escapeHtml(work.id)}">
          <span class="gallery-directory-card-visual"><img data-directory-src="${escapeHtml(source)}" alt="" decoding="async"></span>
          <span class="gallery-directory-card-copy">
            <strong>${escapeHtml(work.title)}</strong>
            <small>${escapeHtml(categoryLabel(work.category))} / ${escapeHtml(categoryEnglish(work.category))}</small>
            <em>${seen ? '已看' : '未看'}</em>
          </span>
        </button>
      `;
    }).join('');
    observeDirectoryImages(generation);
  }

  function openGalleryDirectory(options = {}) {
    if (!galleryDirectory) return;
    if (options.status) galleryDirectoryState.status = options.status;
    if (options.category) galleryDirectoryState.category = options.category;
    if (typeof options.search === 'string') galleryDirectoryState.search = options.search;
    galleryDirectoryReturnFocus = document.activeElement;
    galleryDirectoryRestoreFocus = true;
    syncDirectoryControls();
    renderGalleryDirectory();
    const touch = ['touch', 'pen'].includes(directoryInputMode);
    const close = $('[data-gallery-directory-close]', galleryDirectory);
    close.autofocus = touch;
    if (!galleryDirectory.open) galleryDirectory.showModal();
    document.body.classList.add('dialog-open');
    clearTimeout(galleryDirectoryFocusTimer);
    if (touch) close.focus();
    else galleryDirectoryFocusTimer = setTimeout(() => { if (galleryDirectory.open) galleryDirectorySearch?.focus(); }, reducedMotion ? 0 : 100);
  }

  function closeGalleryDirectory({ restoreFocus = true } = {}) {
    if (!galleryDirectory?.open) return;
    clearTimeout(galleryDirectoryFocusTimer);
    galleryDirectoryRestoreFocus = restoreFocus;
    galleryDirectory.close();
  }

  function openDirectoryWork(workId) {
    const work = allWorks.find(item => String(item.id) === String(workId));
    if (!work) return;
    const canvas = ensureArchiveCanvas();
    const targetFilter = galleryDirectoryState.category === 'all' ? 'all' : galleryDirectoryState.category;
    canvas.setFilter(targetFilter, true);
    let index = canvas.focusWorkById(work.id);
    if (index < 0) {
      canvas.setFilter('all', true);
      index = canvas.focusWorkById(work.id);
    }
    if (index < 0) return;
    closeGalleryDirectory({ restoreFocus: false });
    openPhoto(index);
  }

  $('[data-gallery-directory-open]')?.addEventListener('click', event => {
    openGalleryDirectory({ status: 'all', search: '' });
    galleryDirectoryReturnFocus = event.currentTarget;
  });
  $('[data-gallery-unseen]')?.addEventListener('click', event => {
    openGalleryDirectory({ status: 'unseen', search: '' });
    galleryDirectoryReturnFocus = event.currentTarget;
  });
  $('[data-gallery-continue]')?.addEventListener('click', () => {
    const nextWork = allWorks.find(work => !seenWorkIds.has(String(work.id)));
    if (!nextWork) {
      openGalleryDirectory({ status: 'all', search: '' });
      return;
    }
    const fromDirectory = galleryDirectory.open;
    if (fromDirectory) closeGalleryDirectory({ restoreFocus: false });
    const canvas = ensureArchiveCanvas();
    canvas.setFilter('all', true);
    const index = canvas.focusWorkById(nextWork.id);
    if (index >= 0) {
      openPhoto(index);
      if (fromDirectory) photoReturnFocus = $('[data-gallery-directory-open]');
    }
  });
  $('[data-gallery-directory-close]', galleryDirectory)?.addEventListener('click', () => closeGalleryDirectory());
  galleryDirectory?.addEventListener('click', event => {
    if (event.target === galleryDirectory) closeGalleryDirectory();
  });
  galleryDirectory?.addEventListener('close', () => {
    if (galleryDirectory.open) return; // A queued close must not clear a newly reopened directory.
    clearTimeout(galleryDirectoryFocusTimer);
    if (!photoDialog?.open) document.body.classList.remove('dialog-open');
    resetDirectoryImageLoader();
    galleryDirectoryGrid.replaceChildren();
    if (galleryDirectoryRestoreFocus) galleryDirectoryReturnFocus?.focus?.();
  });
  galleryDirectorySearch?.addEventListener('input', () => {
    galleryDirectoryState.search = galleryDirectorySearch.value;
    renderGalleryDirectory();
  });
  $$('[data-directory-category]', galleryDirectory).forEach(button => button.addEventListener('click', () => {
    galleryDirectoryState.category = button.dataset.directoryCategory;
    syncDirectoryControls();
    renderGalleryDirectory();
  }));
  $$('[data-directory-status]', galleryDirectory).forEach(button => button.addEventListener('click', () => {
    galleryDirectoryState.status = button.dataset.directoryStatus;
    syncDirectoryControls();
    renderGalleryDirectory();
  }));
  $('[data-directory-category-select]', galleryDirectory)?.addEventListener('change', event => {
    galleryDirectoryState.category = event.currentTarget.value;
    syncDirectoryControls();
    renderGalleryDirectory();
  });
  $('[data-directory-status-select]', galleryDirectory)?.addEventListener('change', event => {
    galleryDirectoryState.status = event.currentTarget.value;
    syncDirectoryControls();
    renderGalleryDirectory();
  });
  galleryDirectoryGrid?.addEventListener('click', event => {
    const card = event.target.closest('[data-directory-card]');
    if (card) openDirectoryWork(card.dataset.workId);
  });
  $('[data-gallery-clear-seen]', galleryDirectory)?.addEventListener('click', () => {
    if (!seenWorkIds.size) return;
    if (!window.confirm('确定清除当前浏览器中的摄影浏览记录吗？')) return;
    seenWorkIds = new Set();
    persistSeenWorkIds();
    syncSeenProgress();
    renderGalleryDirectory();
  });

  /* Photo dialog */
  const photoDialog = $('[data-photo-dialog]');
  const photoImage = $('.photo-stage img', photoDialog);
  let photoIndex = 0;
  let photoReturnFocus = null;
  let photoSwipeStart = null;
  let returnToGalleryDirectory = false;
  let photoHistoryEntryOwned = false;
  let photoReturnScrollY = 0;
  let photoCopyResetTimer = 0;
  let photoImageTask = null;

  function cancelPhotoImages() {
    photoImageTask?.controller.abort();
    photoImageTask = null;
  }

  function preparePhotoImages(work) {
    if (photoImageTask?.work === work && !photoImageTask.controller.signal.aborted) return photoImageTask;
    cancelPhotoImages();
    const controller = new AbortController();
    const task = { work, controller, source: '', fullReady: false, failed: false, render: null };
    photoImageTask = task;
    const current = () => photoImageTask === task && !controller.signal.aborted;
    const cached = archiveCanvas?.cache.get(work.previewSrc) || archiveCanvas?.cache.get(work.thumbnailSrc);
    const preview = cached?.src || (work.thumbnailSrc || work.previewSrc);
    if (cached) task.source = cached.src;
    if (preview && preview !== work.src) {
      window.PlutonoCImages.load(preview, { signal: controller.signal, priority: 'high' }).then(() => {
        if (!current() || task.fullReady) return;
        task.source = preview;
        task.render?.(); task.onChange?.();
      }).catch(() => { /* Full image loading owns the visible error state. */ });
    }
    window.PlutonoCImages.load(work.src, { signal: controller.signal, priority: 'high' }).then(() => {
      if (!current()) return;
      task.fullReady = true;
      task.source = work.src;
      task.render?.(); task.onChange?.();
    }).catch(error => {
      if (!current() || error.name === 'AbortError') return;
      task.failed = true;
      task.render?.(); task.onChange?.();
    });
    return task;
  }

  function loadPhotoImages(work, keepPreview = false) {
    const task = preparePhotoImages(work);
    const message = $('[data-photo-load-message]');
    const retry = $('[data-photo-retry]');
    if (!keepPreview) photoImage.removeAttribute('src');
    photoImage.alt = work.title;
    photoImage.style.aspectRatio = `${work.width} / ${work.height}`;
    task.render = () => {
      if (photoImageTask !== task || task.controller.signal.aborted) return;
      if (task.source) photoImage.src = task.source;
      message.textContent = task.fullReady ? '' : task.failed ? '图片暂未加载完成' : '正在加载高清图片…';
      retry.hidden = !task.failed;
    };
    task.render();
  }

  $('[data-photo-retry]')?.addEventListener('click', () => {
    const work = archiveCanvas?.visibleWorks[photoIndex];
    if (work) { cancelPhotoImages(); if (photoMotion.displayed !== work) updatePhotoDialog(1); else loadPhotoImages(work, true); }
  });

  function detailValue(work, key) {
    const value = work.details?.[key];
    if (Array.isArray(value)) return value.filter(Boolean).join(' / ');
    return value ? String(value) : '';
  }

  function setDetailRow(selector, value) {
    const row = $(selector, photoDialog);
    row.hidden = !value;
    if (value) $('dd', row).textContent = value;
    return Boolean(value);
  }

  const photoMotion = { epoch: 0, phase: 'closed', animations: new Set(), flight: null, context: null,
    committed: false, displayed: null, displayedIndex: -1, historyMode: 'push' };

  function resetPhotoAnimation() {
    photoMotion.epoch++;
    for (const animation of photoMotion.animations) animation.cancel();
    photoMotion.animations.clear();
    photoMotion.flight?.remove(); photoMotion.flight = null;
    photoDialog.style.opacity = '1';
    photoImage.style.visibility = ''; photoImage.style.opacity = '1';
    $('.photo-information', photoDialog).style.opacity = '';
    return photoMotion.epoch;
  }

  function photoAnimate(element, frames, duration) {
    if (reducedMotion || !element.animate || !duration) return Promise.resolve();
    const animation = element.animate(frames, { duration, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both' });
    photoMotion.animations.add(animation);
    return animation.finished.then(() => Object.assign(element.style, frames[frames.length - 1])).catch(() => {}).finally(() => { animation.cancel(); photoMotion.animations.delete(animation); });
  }

  function photoRect(work) {
    const box = photoImage.getBoundingClientRect();
    const scale = Math.min(box.width / work.width, box.height / work.height);
    return { left: box.left + (box.width - work.width * scale) / 2, top: box.top + (box.height - work.height * scale) / 2,
      width: work.width * scale, height: work.height * scale };
  }

  function photoOrigin(work) {
    if (!archiveCanvas?.visible || !work) return null;
    const bounds = archiveCanvas.canvas.getBoundingClientRect();
    const preferredKey = photoMotion.originWorkId === work.id ? photoMotion.originKey : null;
    const preferred = preferredKey && archiveCanvas.rendered.find(item => item.key === preferredKey);
    const items = archiveCanvas.rendered.filter(item => item.node.work.id === work.id && (!preferred || item.key === preferredKey) && item.opacity >= .1
      && archiveCanvas.hitTest(item.x, item.y)?.key === item.key
      && item.y - item.height / 2 >= 0 && item.y + item.height / 2 <= archiveCanvas.sceneHeight
      && bounds.top + item.y - item.height / 2 >= layoutMetrics.headerHeight
      && bounds.top + item.y + item.height / 2 <= innerHeight);
    const item = items.sort((a, b) => a.distance - b.distance)[0];
    if (!item) return null;
    return { left: bounds.left + item.x - item.width / 2, top: bounds.top + item.y - item.height / 2,
      width: item.width, height: item.height, radius: 12 * item.perspective };
  }

  function photoFlight(source, start, end, duration) {
    if (!source || !start || !end || !start.width || !end.width) return null;
    const image = document.createElement('img'); image.className = 'photo-transition-image';
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.src = source;
    Object.assign(image.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`,
      borderRadius: `${start.radius ?? 0}px` });
    photoDialog.append(image); photoMotion.flight = image;
    return photoAnimate(image, [
      { transform: 'translate3d(0,0,0) scale(1)', borderRadius: `${start.radius ?? 0}px` },
      { transform: `translate3d(${end.left - start.left}px,${end.top - start.top}px,0) scale(${end.width / start.width})`, borderRadius: `${(end.radius ?? 0) * start.width / end.width}px` }
    ], duration);
  }

  function commitPhoto(work, index, historyMode) {
    if (!photoDialog.open || !work) return;
    markWorkSeen(work); recordWorkOpen('photo', work.id, work.title);
    setPhotoHistory(work, historyMode);
    photoMotion.committed = true; photoMotion.displayed = work; photoMotion.displayedIndex = index;
    photoMotion.historyMode = 'replace';
  }

  function paintPhotoDetails(work, index) {
    photoDialog.style.setProperty('--photo-ratio', work.width / work.height);
    $('[data-photo-current]').textContent = pad(index + 1);
    $('[data-photo-total]').textContent = pad(archiveCanvas.visibleWorks.length);
    $('[data-photo-title]').textContent = work.title;
    $('[data-photo-category]').textContent = `${categoryLabel(work.category)} / ${categoryEnglish(work.category)}`;
    $('[data-object-label]').textContent = work.category === 'earth' ? 'FRAME' : 'OBJECT';
    const hasDate = setDetailRow('[data-detail-date]', detailValue(work, 'date'));
    const hasLocation = setDetailRow('[data-detail-location]', detailValue(work, 'location'));
    $('[data-detail-capture]').hidden = !(hasDate || hasLocation);
    const hasEquipment = setDetailRow('[data-detail-equipment]', detailValue(work, 'equipment'));
    const hasParameters = setDetailRow('[data-detail-parameters]', detailValue(work, 'parameters'));
    $('[data-detail-system]').hidden = !(hasEquipment || hasParameters);
    const process = detailValue(work, 'process'); $('[data-detail-process]').hidden = !process;
    if (process) $('p', $('[data-detail-process]')).textContent = process;
    const story = detailValue(work, 'story'), notes = detailValue(work, 'notes');
    $('[data-detail-story]').hidden = !story; $('[data-detail-note]').hidden = !notes;
    if (story) $('[data-detail-story]').textContent = story;
    if (notes) $('[data-detail-note]').textContent = notes;
    $('[data-detail-notes]').hidden = !(story || notes);
  }

  function updatePhotoDialog(direction = 0) {
    const work = archiveCanvas?.visibleWorks[photoIndex];
    if (!work) return;
    const index = photoIndex;
    const task = preparePhotoImages(work);
    if (!direction) { paintPhotoDetails(work, index); loadPhotoImages(work, true); return task; }
    const epoch = resetPhotoAnimation();
    photoMotion.phase = 'switching';
    $('[data-photo-load-message]').textContent = '正在加载高清图片…';
    $('[data-photo-retry]').hidden = true;
    let applied = false;
    task.onChange = () => {
      if (epoch !== photoMotion.epoch || photoImageTask !== task || !photoDialog.open) return;
      if (!task.source) {
        if (task.failed) { $('[data-photo-load-message]').textContent = '图片暂未加载完成'; $('[data-photo-retry]').hidden = false; }
        return;
      }
      if (applied) return;
      applied = true;
      const oldSource = photoImage.getAttribute('src'), oldWork = photoMotion.displayed;
      const oldRect = oldSource && oldWork ? photoRect(oldWork) : null;
      paintPhotoDetails(work, index); loadPhotoImages(work, true);
      photoMotion.phase = 'open';
      commitPhoto(work, index, photoMotion.historyMode);
      if (oldSource && oldRect && !reducedMotion) {
        const old = document.createElement('img'); old.className = 'photo-transition-image'; old.alt = ''; old.src = oldSource;
        Object.assign(old.style, { left: `${oldRect.left}px`, top: `${oldRect.top}px`, width: `${oldRect.width}px`, height: `${oldRect.height}px` });
        photoDialog.append(old); photoMotion.flight = old;
        Promise.all([photoAnimate(old, [{ opacity: 1 }, { opacity: 0 }], 180), photoAnimate(photoImage, [{ opacity: 0 }, { opacity: 1 }], 180)])
          .then(() => { if (epoch === photoMotion.epoch) { old.remove(); photoMotion.flight = null; } });
      }
    };
    task.onChange();
    return task;
  }

  function openPhoto(index, options = {}) {
    if (!archiveCanvas?.visibleWorks.length) return;
    const continuing = photoDialog.open, fromOpacity = continuing ? getComputedStyle(photoDialog).opacity : 0;
    const continuingRect = photoMotion.flight?.getBoundingClientRect();
    const continuingSource = photoMotion.flight?.getAttribute('src');
    const continuingWork = photoMotion.displayed;
    if (!photoDialog.open) {
      photoReturnScrollY = scrollY; photoReturnFocus = document.activeElement;
      photoMotion.context = { filter: archiveCanvas.filter, camera: { ...archiveCanvas.camera }, focused: archiveCanvas.focusedIndex,
        scroll: scrollY, history: { ...(history.state || {}) }, hash: normalizeHash(location.hash) };
      photoMotion.committed = false; photoMotion.displayed = null; photoMotion.displayedIndex = -1;
    }
    const epoch = resetPhotoAnimation();
    photoMotion.restore = true;
    photoMotion.phase = 'opening'; photoMotion.historyMode = options.historyMode || (photoMotion.committed ? 'replace' : 'push');
    photoIndex = mod(index, archiveCanvas.visibleWorks.length);
    const work = archiveCanvas.visibleWorks[photoIndex];
    if (options.key || !continuing) { photoMotion.originKey = options.key || null; photoMotion.originWorkId = work.id; }
    const task = updatePhotoDialog();
    if (options.source && !task.source) { task.source = options.source; task.render?.(); }
    archiveCanvas.velocity.x = archiveCanvas.velocity.y = 0;
    archiveCanvas.opening = { node: archiveCanvas.primaryNodeForIndex(photoIndex), key: options.key, dialogOpened: true };
    if (!photoDialog.open) photoDialog.showModal();
    document.body.classList.add('dialog-open');
    let animationDone = reducedMotion;
    task.onChange = () => {
      if (!animationDone || !task.source || epoch !== photoMotion.epoch || photoImageTask !== task || !photoDialog.open) return;
      if (!photoMotion.committed || photoMotion.displayed !== work) commitPhoto(work, photoIndex, photoMotion.historyMode);
    };
    const target = photoRect(work);
    const sameWork = continuingWork === work;
    const flight = !reducedMotion && photoFlight(sameWork && continuingSource || options.source || task.source, sameWork && continuingRect || options.origin, target, 300);
    if (flight) photoImage.style.visibility = 'hidden';
    const information = $('.photo-information', photoDialog);
    const animations = [photoAnimate(photoDialog, [{ opacity: fromOpacity }, { opacity: 1 }], 300),
      photoAnimate(information, [{ opacity: 0 }, { opacity: 1 }], 300)];
    if (flight) animations.push(flight);
    const complete = () => {
      if (epoch !== photoMotion.epoch || !photoDialog.open) return;
      photoMotion.flight?.remove(); photoMotion.flight = null; photoImage.style.visibility = '';
      photoMotion.phase = 'open'; animationDone = true; task.onChange?.();
    };
    if (reducedMotion) complete(); else Promise.all(animations).then(complete);
  }

  function settlePhotoOpening() {
    const task = photoImageTask, work = archiveCanvas?.visibleWorks[photoIndex], mode = photoMotion.historyMode;
    const epoch = resetPhotoAnimation(); photoMotion.phase = 'open';
    if (!task || !work) return;
    task.onChange = () => {
      if (epoch === photoMotion.epoch && task === photoImageTask && task.source && photoDialog.open
        && (!photoMotion.committed || photoMotion.displayed !== work)) commitPhoto(work, photoIndex, mode);
    };
    task.onChange();
  }

  function movePhoto(offset) {
    if (!archiveCanvas?.visibleWorks.length || photoMotion.phase === 'closing') return;
    photoIndex = mod(photoIndex + offset, archiveCanvas.visibleWorks.length);
    updatePhotoDialog(offset);
  }

  function abortPhotoPresentation({ restore = false } = {}) {
    resetPhotoAnimation(); cancelPhotoImages();
    photoMotion.restore = restore;
    photoMotion.phase = 'closed';
    if (photoDialog.open) photoDialog.close();
    if (archiveCanvas) { archiveCanvas.opening = null; archiveCanvas.requestDraw(); }
  }

  function requestPhotoClose({ returnDirectory = false, immediate = false } = {}) {
    if (!photoDialog?.open || photoMotion.phase === 'closing') return;
    returnToGalleryDirectory = returnDirectory;
    const currentOpacity = getComputedStyle(photoDialog).opacity;
    const crossfade = photoMotion.phase !== 'opening' && photoMotion.flight;
    const fadingOpacity = crossfade && getComputedStyle(crossfade).opacity;
    const imageOpacity = getComputedStyle(photoImage).opacity;
    if (crossfade) photoMotion.flight = null;
    const work = photoMotion.displayed || archiveCanvas?.visibleWorks[photoIndex];
    const source = photoMotion.flight?.getAttribute('src') || photoImage.getAttribute('src');
    const box = photoMotion.flight?.getBoundingClientRect() || (work ? photoRect(work) : null);
    const origin = photoOrigin(work);
    const epoch = resetPhotoAnimation(); cancelPhotoImages();
    if (crossfade) { crossfade.style.opacity = fadingOpacity; photoImage.style.opacity = imageOpacity; photoMotion.flight = crossfade; }
    photoMotion.phase = 'closing'; photoMotion.restore = true;
    const finish = () => {
      if (epoch !== photoMotion.epoch || !photoDialog.open) return;
      if (photoMotion.committed && photoHistoryEntryOwned && history.state?.photoOverlay) {
        photoMotion.pendingReturn = photoMotion.context;
        photoDialog.close(); history.back();
      } else {
        if (photoIdFromUrl()) history.replaceState({ ...(history.state || {}), photoId: null, photoOverlay: false }, '', photoUrl('', '#works'));
        photoDialog.close();
      }
    };
    if (immediate || reducedMotion) { finish(); return; }
    const flight = !crossfade && photoFlight(source, box, origin, 240);
    if (flight) photoImage.style.visibility = 'hidden';
    Promise.all([photoAnimate(photoDialog, [{ opacity: currentOpacity }, { opacity: 0 }], 240), ...(flight ? [flight] : [])]).then(finish);
  }

  function setPhotoHistory(work, mode) {
    if (!work || mode === 'none') return;
    const state = { ...(history.state || {}), photoId: work.id, photoOverlay: true };
    const url = photoUrl(work.id);
    if (mode === 'push') {
      history.replaceState(
        { ...(history.state || {}), photoId: null, photoOverlay: false },
        '',
        photoUrl('', '#works')
      );
      history.pushState(state, '', url);
      photoHistoryEntryOwned = true;
    } else {
      history.replaceState(state, '', url);
    }
  }

  function openPhotoFromLocation() {
    const id = photoIdFromUrl();
    if (!id) return false;
    const work = allWorks.find(item => String(item.id) === id);
    if (!work) {
      history.replaceState({ ...(history.state || {}), photoId: null, photoOverlay: false }, '', photoUrl('', '#works'));
      return false;
    }
    const canvas = ensureArchiveCanvas();
    const returningOverlay = Boolean(history.state?.photoOverlay && canvas.visibleWorks.some(item => item.id === work.id));
    if (!returningOverlay) canvas.setFilter('all', true);
    const index = returningOverlay ? canvas.visibleWorks.findIndex(item => item.id === work.id) : canvas.focusWorkById(work.id);
    if (index < 0) {
      history.replaceState({ ...(history.state || {}), photoId: null, photoOverlay: false }, '', photoUrl('', '#works'));
      return false;
    }
    photoHistoryEntryOwned = Boolean(history.state?.photoOverlay);
    openPhoto(index, { historyMode: 'none' });
    return true;
  }

  async function copyPhotoLink() {
    const work = photoMotion.displayed || archiveCanvas?.visibleWorks[photoIndex];
    if (!work) return;
    const absolute = new URL(photoUrl(work.id), location.origin).href;
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await Promise.race([
            navigator.clipboard.writeText(absolute),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timeout')), 1000)),
          ]);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) {
        const input = document.createElement('textarea');
        input.value = absolute;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        copied = document.execCommand('copy');
        input.remove();
      }
      if (!copied) throw new Error('Clipboard unavailable');
      const button = $('[data-photo-copy-link]', photoDialog);
      button.textContent = '已复制';
      clearTimeout(photoCopyResetTimer);
      photoCopyResetTimer = window.setTimeout(() => { button.textContent = '复制链接'; }, 3000);
    } catch {
      window.prompt('复制这张作品的链接', absolute);
    }
  }

  $('.dialog-prev', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(-1); });
  $('.dialog-next', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(1); });
  const photoCloseButton = $('.dialog-close', photoDialog);
  let photoCloseTouch = null;
  photoCloseButton?.addEventListener('pointerdown', event => {
    photoCloseTouch = event.pointerType === 'touch' && event.isPrimary ? { x: event.clientX, y: event.clientY } : null;
  });
  photoCloseButton?.addEventListener('pointercancel', () => { photoCloseTouch = null; });
  photoCloseButton?.addEventListener('touchcancel', () => { photoCloseTouch = null; });
  // Browsers may suppress the synthetic click immediately after a horizontal swipe.
  // Handle a completed touch tap directly and suppress its delayed duplicate click.
  photoCloseButton?.addEventListener('touchend', event => {
    const start = photoCloseTouch, touch = event.changedTouches[0]; photoCloseTouch = null;
    if (!start || !touch || event.touches.length || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;
    event.preventDefault(); requestPhotoClose();
  }, { passive: false });
  photoCloseButton?.addEventListener('click', () => { photoCloseTouch = null; requestPhotoClose(); });
  $('[data-photo-copy-link]', photoDialog)?.addEventListener('click', copyPhotoLink);
  $('[data-gallery-directory-return]', photoDialog)?.addEventListener('click', () => {
    requestPhotoClose({ returnDirectory: true });
  });
  photoDialog?.addEventListener('click', event => { if (event.target === photoDialog) requestPhotoClose(); });
  photoDialog?.addEventListener('cancel', event => {
    event.preventDefault();
    requestPhotoClose();
  });
  photoDialog?.addEventListener('pointerdown', event => {
    photoSwipeStart = event.pointerType === 'touch' && event.target.closest('.photo-stage') && !event.target.closest('button')
      ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  });
  photoDialog?.addEventListener('pointerup', event => {
    if (photoSwipeStart === null) return;
    if (event.pointerId !== photoSwipeStart.id) return;
    const delta = event.clientX - photoSwipeStart.x;
    const vertical = Math.abs(event.clientY - photoSwipeStart.y);
    photoSwipeStart = null;
    if (Math.abs(delta) > 55 && Math.abs(delta) > vertical * 1.25) movePhoto(delta < 0 ? 1 : -1);
  });
  photoDialog?.addEventListener('pointercancel', () => { photoSwipeStart = null; });
  photoDialog?.addEventListener('close', () => {
    if (photoDialog.open) return;
    const restore = photoMotion.restore !== false, context = photoMotion.context;
    const epoch = resetPhotoAnimation(); cancelPhotoImages(); photoMotion.phase = 'closed';
    photoMotion.restore = true; photoMotion.committed = false; photoMotion.displayed = null;
    const reopenDirectory = returnToGalleryDirectory; returnToGalleryDirectory = false;
    photoHistoryEntryOwned = false;
    if (!galleryDirectory?.open) document.body.classList.remove('dialog-open');
    photoImage.removeAttribute('src');
    if (archiveCanvas) {
      archiveCanvas.opening = null;
      if (restore && context) {
        if (archiveCanvas.filter !== context.filter) archiveCanvas.setFilter(context.filter, true);
        archiveCanvas.camera = { ...context.camera }; archiveCanvas.setFocusedIndex(context.focused);
      }
      archiveCanvas.requestDraw();
    }
    if (!restore) return;
    if (reopenDirectory) setTimeout(() => { if (epoch === photoMotion.epoch && !photoDialog.open) openGalleryDirectory(); }, 0);
    else requestAnimationFrame(() => {
      if (epoch !== photoMotion.epoch || photoDialog.open) return;
      scrollTo(0, context?.scroll ?? photoReturnScrollY);
      photoReturnFocus?.focus?.({ preventScroll: true });
    });
  });

  document.addEventListener('keydown', event => {
    if (!photoDialog?.open) return;
    if (event.key === 'ArrowLeft') movePhoto(-1);
    if (event.key === 'ArrowRight') movePhoto(1);
  });

  /* Equipment tabs and strip */
  const equipmentTabs = $$('[data-equipment-tab]');
  const equipmentPanels = $$('[data-equipment-panel]');
  function showEquipment(name, moveFocus = false) {
    equipmentTabs.forEach(tab => {
      const active = tab.dataset.equipmentTab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus();
    });
    equipmentPanels.forEach(panel => {
      const active = panel.dataset.equipmentPanel === name;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
  }
  equipmentTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showEquipment(tab.dataset.equipmentTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = mod(index + (event.key === 'ArrowRight' ? 1 : -1), equipmentTabs.length);
      showEquipment(equipmentTabs[next].dataset.equipmentTab, true);
    });
  });

  const equipmentTrack = $('[data-equipment-track]');
  const equipmentOriginals = $$('figure', equipmentTrack);
  const equipmentPosition = $('[data-equipment-position]');
  if (equipmentTrack && equipmentOriginals.length > 1) {
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();
    equipmentOriginals.forEach((item, logicalIndex) => {
      item.dataset.equipmentLogical = String(logicalIndex);
      const beforeClone = item.cloneNode(true);
      const afterClone = item.cloneNode(true);
      beforeClone.setAttribute('aria-hidden', 'true');
      afterClone.setAttribute('aria-hidden', 'true');
      beforeClone.dataset.equipmentClone = 'before';
      afterClone.dataset.equipmentClone = 'after';
      before.append(beforeClone);
      after.append(afterClone);
    });
    equipmentTrack.prepend(before);
    equipmentTrack.append(after);
  }
  const equipmentItems = $$('figure', equipmentTrack);
  let equipmentIndex = equipmentOriginals.length > 1 ? equipmentOriginals.length : 0;
  let equipmentPointer = null;
  let equipmentWheelAccumulator = 0;
  let equipmentWheelIdleTimer = 0;
  let equipmentNormalizeTimer = 0;
  let equipmentMediaReady = false;

  function hydrateEquipmentAround() {
    if (!equipmentMediaReady || !equipmentOriginals.length) return;
    const center = equipmentLogicalIndex();
    const wanted = new Set([mod(center - 1, equipmentOriginals.length), center, mod(center + 1, equipmentOriginals.length)]);
    equipmentItems.forEach(item => {
      if (!wanted.has(Number(item.dataset.equipmentLogical))) return;
      hydrateDeferredMedia($('[data-equipment-media]', item));
    });
  }

  function equipmentStep() {
    const mediaWidth = equipmentTrack?.parentElement?.clientWidth || innerWidth;
    return mediaWidth * (isMobile ? .69 : .55);
  }

  function equipmentLogicalIndex() {
    return equipmentOriginals.length ? mod(equipmentIndex, equipmentOriginals.length) : 0;
  }

  function updateEquipmentTrack(extra = 0, instant = false) {
    equipmentTrack?.classList.toggle('is-jumping', instant);
    equipmentTrack?.style.setProperty('--equipment-drag', `${extra}px`);
    const step = equipmentStep();
    equipmentItems.forEach((item, index) => {
      const distance = index - equipmentIndex;
      item.style.setProperty('--equipment-x', `${distance * step}px`);
      item.classList.toggle('is-center', distance === 0);
      item.classList.toggle('is-neighbor', Math.abs(distance) === 1);
      item.classList.toggle('is-hidden', Math.abs(distance) > 1);
    });
    if (equipmentPosition) equipmentPosition.textContent = `${pad(equipmentLogicalIndex() + 1)} / ${pad(equipmentOriginals.length)}`;
    hydrateEquipmentAround();
    if (instant) requestAnimationFrame(() => equipmentTrack?.classList.remove('is-jumping'));
  }

  function normalizeEquipmentIndex(instant = true) {
    const count = equipmentOriginals.length;
    if (!count) return;
    let changed = false;
    while (equipmentIndex < count) { equipmentIndex += count; changed = true; }
    while (equipmentIndex >= count * 2) { equipmentIndex -= count; changed = true; }
    if (changed) updateEquipmentTrack(0, instant);
  }

  function scheduleEquipmentNormalization() {
    clearTimeout(equipmentNormalizeTimer);
    equipmentNormalizeTimer = window.setTimeout(() => normalizeEquipmentIndex(true), reducedMotion ? 20 : 460);
  }

  function moveEquipment(offset) {
    if (!equipmentOriginals.length) return;
    normalizeEquipmentIndex(true);
    const limit = Math.max(equipmentOriginals.length - 1, 1);
    equipmentIndex += clamp(Math.trunc(offset), -limit, limit);
    updateEquipmentTrack();
    scheduleEquipmentNormalization();
  }

  equipmentTrack?.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    clearTimeout(equipmentNormalizeTimer);
    equipmentWheelAccumulator = 0;
    normalizeEquipmentIndex(true);
    equipmentPointer = { id: event.pointerId, x: event.clientX, delta: 0, started: performance.now(), velocity: 0, lastX: event.clientX, lastTime: performance.now() };
    equipmentTrack.classList.add('is-dragging');
    equipmentTrack.setPointerCapture?.(event.pointerId);
  });
  equipmentTrack?.addEventListener('pointermove', event => {
    if (!equipmentPointer || equipmentPointer.id !== event.pointerId) return;
    const now = performance.now();
    const elapsed = Math.max(now - equipmentPointer.lastTime, 1);
    equipmentPointer.velocity = (event.clientX - equipmentPointer.lastX) / elapsed;
    equipmentPointer.lastX = event.clientX;
    equipmentPointer.lastTime = now;
    equipmentPointer.delta = event.clientX - equipmentPointer.x;
    updateEquipmentTrack(equipmentPointer.delta);
  });
  ['pointerup', 'pointercancel'].forEach(type => equipmentTrack?.addEventListener(type, event => {
    if (!equipmentPointer || equipmentPointer.id !== event.pointerId) return;
    const delta = equipmentPointer.delta;
    const velocity = equipmentPointer.velocity;
    if (equipmentTrack.hasPointerCapture?.(event.pointerId)) equipmentTrack.releasePointerCapture(event.pointerId);
    equipmentTrack.classList.remove('is-dragging');
    equipmentPointer = null;
    if (type !== 'pointercancel' && (Math.abs(delta) > equipmentStep() * .16 || Math.abs(velocity) > .38)) moveEquipment((delta || velocity) < 0 ? 1 : -1);
    else updateEquipmentTrack();
  }));
  equipmentTrack?.addEventListener('wheel', event => {
    if (!event.deltaX || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      clearTimeout(equipmentWheelIdleTimer);
      equipmentWheelAccumulator = 0;
      return;
    }
    event.preventDefault();
    const rawDelta = event.deltaX;
    const normalizedDelta = event.deltaMode === 1 ? rawDelta * 24 : event.deltaMode === 2 ? rawDelta * innerWidth : rawDelta;
    equipmentWheelAccumulator += clamp(normalizedDelta, -180, 180);
    const threshold = 90;
    const steps = Math.trunc(equipmentWheelAccumulator / threshold);
    if (steps) {
      equipmentWheelAccumulator -= steps * threshold;
      moveEquipment(steps);
    }
    clearTimeout(equipmentWheelIdleTimer);
    equipmentWheelIdleTimer = window.setTimeout(() => {
      if (Math.abs(equipmentWheelAccumulator) >= threshold * .5) moveEquipment(Math.sign(equipmentWheelAccumulator));
      else updateEquipmentTrack();
      equipmentWheelAccumulator = 0;
    }, 100);
  }, { passive: false });
  $('[data-equipment-prev]')?.addEventListener('click', () => moveEquipment(-1));
  $('[data-equipment-next]')?.addEventListener('click', () => moveEquipment(1));

  updateEquipmentTrack(0, true);
  const equipmentSection = $('#equipment');
  if (equipmentSection && 'IntersectionObserver' in window) {
    const equipmentMediaObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      equipmentMediaReady = true;
      hydrateEquipmentAround();
      equipmentMediaObserver.disconnect();
    }, { rootMargin: '600px 0px', threshold: 0 });
    equipmentMediaObserver.observe(equipmentSection);
  } else {
    equipmentMediaReady = true;
    hydrateEquipmentAround();
  }

  /* Film visibility */
  if ('IntersectionObserver' in window) {
    const atmosphereObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.target.id === 'films') {
          filmSectionVisible = entry.isIntersecting;
          if (filmSectionVisible) timecodeStart = performance.now();
          else stopAllFilmPreviews();
          syncTimecode();
        }
      });
    }, { threshold: .18 });
    atmosphereObserver.observe($('#films'));
  }
  document.addEventListener('visibilitychange', syncTimecode);

  /* Video archive */
  const videoDialog = $('[data-video-dialog]');
  const videoPlayer = $('video', videoDialog);
  const videoFrame = $('.video-frame', videoDialog);
  const videoExternalLink = $('[data-video-external]', videoDialog);
  let loadedFilms = [];
  let activeFilmPreview = null;

  function normalizeDate(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value.$date) return new Date(value.$date).toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  }
  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
  }
  let cloudBaseSdkPromise = null;
  function ensureCloudBaseSdk() {
    if (window.cloudbase) return Promise.resolve(window.cloudbase);
    if (cloudBaseSdkPromise) return cloudBaseSdkPromise;
    cloudBaseSdkPromise = new Promise((resolve, reject) => {
      const sdk = document.createElement('script');
      sdk.src = 'https://static.cloudbase.net/cloudbase-js-sdk/2.24.0/cloudbase.full.js';
      sdk.async = true;
      sdk.onload = () => window.cloudbase ? resolve(window.cloudbase) : reject(new Error('CloudBase SDK 未初始化'));
      sdk.onerror = () => reject(new Error('CloudBase SDK 加载失败'));
      document.head.append(sdk);
    });
    return cloudBaseSdkPromise;
  }
  function extractBvid(value) {
    const match = String(value || '').match(/BV[0-9A-Za-z]{10,20}/i)?.[0] || '';
    return match ? `BV${match.slice(2)}` : '';
  }
  function filmSourceType(film = {}) {
    return film.sourceType === 'bilibili' || film.bvid || extractBvid(film.bilibiliUrl) ? 'bilibili' : 'direct';
  }
  function filmPreviewUrl(film = {}) {
    return film.previewUrl || '';
  }
  function bilibiliPageUrl(film = {}) {
    const bvid = film.bvid || extractBvid(film.bilibiliUrl);
    return bvid ? `https://www.bilibili.com/video/${bvid}/` : '';
  }
  function bilibiliPlayerUrl(film = {}) {
    const bvid = film.bvid || extractBvid(film.bilibiliUrl);
    if (!bvid) return '';
    const parameters = new URLSearchParams({ isOutside: 'true', bvid, p: '1', autoplay: '1', high_quality: '1', danmaku: '0' });
    return `https://player.bilibili.com/player.html?${parameters}`;
  }

  async function loadCloudFilms() {
    const config = window.PLUTONOC_CLOUDBASE || {};
    if (config.staticManifest) return [];
    if (!config.envId) return [];
    const cloudbase = await ensureCloudBaseSdk();
    const options = { env: config.envId, region: config.region || 'ap-shanghai' };
    if (config.clientId) options.clientId = config.clientId;
    if (config.accessKey) options.accessKey = config.accessKey;
    const app = cloudbase.init(options);
    const result = await app.database().collection(config.collection || 'videos').where({ status: 'published' }).orderBy('sortOrder', 'asc').get();
    const records = result.data || [];
    const fileIds = [...new Set(records.flatMap(record => [record.videoFileId, record.posterFileId]).filter(fileId => /^cloud:\/\//.test(fileId)))];
    let links = new Map();
    if (fileIds.length) {
      const urlResult = await app.getTempFileURL({ fileList: fileIds });
      links = new Map((urlResult.fileList || []).map(item => [item.fileID, item.tempFileURL || item.download_url]));
    }
    return records.map(record => ({
      ...record,
      id: record._id || record.id,
      date: normalizeDate(record.date),
      videoUrl: links.get(record.videoFileId) || record.videoUrl,
      posterUrl: links.get(record.posterFileId) || record.posterUrl
    })).filter(record => filmSourceType(record) === 'bilibili' ? Boolean(bilibiliPlayerUrl(record)) : Boolean(record.videoUrl));
  }
  function filmCard(film, index) {
    const previewUrl = filmPreviewUrl(film);
    const ratio = Number(film.aspectRatio) > 0 ? Number(film.aspectRatio) : 16 / 9;
    return `<figure class="film-card" data-film-index="${index}" style="--film-ratio:${ratio}"${previewUrl ? ' data-has-preview' : ''}>
      <div class="film-visual"><picture><source media="(max-width: 760px)" data-deferred-srcset="${escapeHtml(film.posterPreviewUrl || film.posterUrl)}"><img data-deferred-src="${escapeHtml(film.posterUrl)}" alt="${escapeHtml(film.title)}视频封面" decoding="async"></picture>
      <video class="film-preview" muted loop playsinline preload="none" aria-hidden="true"></video>
      <button type="button" aria-label="播放${escapeHtml(film.title)}"><span class="play" aria-hidden="true">▶</span></button></div>
      <figcaption><h3>${escapeHtml(film.title)}</h3><p><span>${escapeHtml(film.date || '')}</span><br><span>${formatDuration(film.duration)}</span></p></figcaption>
    </figure>`;
  }
  function stopFilmPreview(card) {
    if (!card) return;
    const preview = $('.film-preview', card);
    if (preview) {
      preview.pause();
      preview.removeAttribute('src');
      preview.load();
    }
    card.classList.remove('is-previewing');
    if (activeFilmPreview === card) activeFilmPreview = null;
  }
  function stopAllFilmPreviews() { $$('.film-card.is-previewing', $('#films')).forEach(stopFilmPreview); }
  function wireFilmPreviews() {
    if (!supportsHover || reducedMotion) return;
    $$('.film-card', $('#films')).forEach(card => {
      const start = async () => {
        if (activeFilmPreview && activeFilmPreview !== card) stopFilmPreview(activeFilmPreview);
        const film = loadedFilms[Number(card.dataset.filmIndex)];
        const preview = $('.film-preview', card);
        if (!film || !preview || card.classList.contains('is-previewing')) return;
        const previewUrl = filmPreviewUrl(film);
        if (!previewUrl) return;
        preview.src = previewUrl;
        try {
          await preview.play();
          card.classList.add('is-previewing');
          activeFilmPreview = card;
        } catch (_) { stopFilmPreview(card); }
      };
      card.addEventListener('pointerenter', start);
      card.addEventListener('pointerleave', () => stopFilmPreview(card));
      card.addEventListener('focusin', start);
      card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) stopFilmPreview(card); });
    });
  }
  function renderFilms(films) {
    loadedFilms = films;
    const feature = $('[data-film-feature]');
    const list = $('[data-film-list]');
    const status = $('[data-film-status]');
    if (!films.length) {
      feature.innerHTML = '<div class="film-empty">暂无影像</div>';
      list.innerHTML = '';
      status.textContent = '';
      layoutDirty = true;
      requestMainFrame();
      return;
    }
    feature.innerHTML = filmCard(films[0], 0);
    list.innerHTML = films.slice(1).map((film, index) => filmCard(film, index + 1)).join('');
    status.textContent = `${pad(films.length)} / MOTION`;
    registerDeferredMedia(feature);
    registerDeferredMedia(list);
    wireFilmPreviews();
    layoutDirty = true;
    requestMainFrame();
  }
  function recordWorkOpen(kind, id, title) {
    try {
      if (window.PlutonoCAnalytics) window.PlutonoCAnalytics.work(kind, id, title);
      else {
        const early = window.plutonoCEarlyWork ||= [];
        if (early.length < 20) early.push([kind, id, title]);
      }
    } catch { /* optional analytics must not affect artwork dialogs */ }
  }
  const videoShell = $('.video-shell', videoDialog);
  const videoCaption = $('.video-caption', videoDialog);
  let videoRatio = 16 / 9, videoLayoutFrame = 0;
  function fitVideoDialog() {
    if (!videoDialog.open) return;
    const style = getComputedStyle(videoDialog);
    const width = Math.min(1300, videoDialog.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const height = videoDialog.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    let fit = width;
    videoFrame.style.setProperty('--video-ratio', videoRatio);
    // Caption wrapping affects the remaining height; only measure on open or viewport changes.
    for (let i = 0; i < 4; i++) {
      videoShell.style.width = `${fit}px`;
      const available = Math.max(1, height - videoCaption.getBoundingClientRect().height - 18);
      fit = Math.min(fit, available * videoRatio);
    }
    videoShell.style.width = `${fit}px`;
  }
  function scheduleVideoLayout() {
    cancelAnimationFrame(videoLayoutFrame);
    if (videoDialog.open) videoLayoutFrame = requestAnimationFrame(fitVideoDialog);
  }
  window.addEventListener('resize', scheduleVideoLayout);
  window.visualViewport?.addEventListener('resize', scheduleVideoLayout);
  videoPlayer.addEventListener('loadedmetadata', () => {
    if (!videoPlayer.hidden && videoPlayer.videoWidth && videoPlayer.videoHeight) {
      videoRatio = videoPlayer.videoWidth / videoPlayer.videoHeight; scheduleVideoLayout();
    }
  });
  function clearVideoPlayers() {
    videoPlayer.pause(); videoPlayer.removeAttribute('src'); videoPlayer.removeAttribute('poster'); videoPlayer.load();
    $$('.bilibili-player', videoFrame).forEach(iframe => { iframe.src = 'about:blank'; iframe.remove(); });
    videoPlayer.hidden = true; videoExternalLink.hidden = true; videoExternalLink.removeAttribute('href');
  }
  function openFilm(index) {
    const film = loadedFilms[index];
    if (!film) return;
    stopAllFilmPreviews();
    clearVideoPlayers();
    const bilibili = filmSourceType(film) === 'bilibili';
    videoRatio = bilibili ? 16 / 9 : (Number(film.aspectRatio) > 0 ? Number(film.aspectRatio) : 16 / 9);
    videoPlayer.hidden = bilibili;
    videoExternalLink.hidden = !bilibili;
    if (bilibili) {
      const pageUrl = bilibiliPageUrl(film);
      const playerUrl = bilibiliPlayerUrl(film);
      if (!playerUrl) return;
      const iframe = document.createElement('iframe');
      iframe.className = 'bilibili-player';
      iframe.src = playerUrl;
      iframe.title = `${film.title} - 哔哩哔哩播放器`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      videoFrame.append(iframe);
      videoExternalLink.href = pageUrl;
    } else {
      videoPlayer.src = film.videoUrl;
      videoPlayer.poster = film.posterUrl || '';
      videoExternalLink.removeAttribute('href');
    }
    $('.video-caption h3', videoDialog).textContent = film.title;
    $('.video-caption p', videoDialog).textContent = [film.date, formatDuration(film.duration), film.location].filter(Boolean).join(' / ');
    if (!videoDialog.open) videoDialog.showModal();
    fitVideoDialog();
    recordWorkOpen('video', film.id, film.title);
    document.body.classList.add('dialog-open');
  }
  $('#films')?.addEventListener('click', event => {
    const card = event.target.closest('.film-card button')?.closest('.film-card');
    if (card) openFilm(Number(card.dataset.filmIndex));
  });
  function closeVideoDialog() {
    cancelAnimationFrame(videoLayoutFrame);
    clearVideoPlayers();
    videoDialog.close();
    document.body.classList.remove('dialog-open');
  }
  $('.dialog-close', videoDialog)?.addEventListener('click', closeVideoDialog);
  videoDialog?.addEventListener('click', event => { if (event.target === videoDialog) closeVideoDialog(); });
  videoDialog?.addEventListener('cancel', event => { event.preventDefault(); closeVideoDialog(); });
  videoDialog?.addEventListener('close', () => {
    if (videoDialog.open) return;
    cancelAnimationFrame(videoLayoutFrame);
    clearVideoPlayers();
    document.body.classList.remove('dialog-open');
  });
  (async () => {
    try {
      const cloudFilms = await loadCloudFilms();
      renderFilms(cloudFilms.length ? cloudFilms : (window.localVideoData || []));
    } catch (error) {
      console.warn('CloudBase videos unavailable; using local archive.', error);
      renderFilms(window.localVideoData || []);
    }
  })();

  const mobileMoves = [
    ...$$('.gallery-seen-progress, [data-gallery-unseen], [data-gallery-continue]', $('.gallery-discovery')).map(element => ({ element, target: $('[data-directory-progress]') })),
    { element: $('[data-detail-notes]'), target: $('.photo-information'), before: $('[data-detail-capture]') },
    { element: $('.equipment-console > header'), target: $('#equipment'), before: $('.equipment-media') }
  ].map(move => {
    const anchor = document.createComment('responsive position');
    move.element.before(anchor);
    return { ...move, anchor };
  });
  let mobileContentState;
  function syncActiveFilter() {
    if (!isMobile) return;
    const strip = $('.gallery-filters'), selected = $('.active', strip);
    if (!selected) return;
    const bounds = strip.getBoundingClientRect(), item = selected.getBoundingClientRect();
    const inset = 4;
    const delta = item.right > bounds.right - inset ? item.right - bounds.right + inset
      : item.left < bounds.left + inset ? item.left - bounds.left - inset : 0;
    if (delta) strip.scrollTo({ left: strip.scrollLeft + delta, behavior: reducedMotion ? 'instant' : 'smooth' });
  }
  function syncMobileContent() {
    if (mobileContentState !== isMobile) {
      $('[data-gallery-directory-open]').textContent = isMobile ? '作品目录' : '目录';
      for (const { element, target, before, anchor } of mobileMoves) {
        if (isMobile) target.insertBefore(element, before || null);
        else anchor.after(element);
      }
      mobileContentState = isMobile;
    }
    syncActiveFilter();
  }
  const filterObserver = new MutationObserver(() => {
    if (isMobile) requestAnimationFrame(syncActiveFilter);
  });
  filterObserver.observe($('.gallery-filters'), { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncMobileContent();

  setVisualStage('deepsky');
  requestMainFrame();
})();
