(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = window.matchMedia('(max-width: 760px)').matches;
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

  const allWorks = [...(window.galleryData || [])];
  const categoryConfig = window.categoryConfig || {};
  const categoryOrder = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
  const categoryCounts = Object.fromEntries(categoryOrder.map(category => [category, allWorks.filter(work => work.category === category).length]));
  const categoryLabel = category => categoryConfig[category]?.label || category;
  const categoryEnglish = category => categoryConfig[category]?.english || category.toUpperCase();

  let frameRequested = false;
  let scrollDirty = true;
  let layoutDirty = true;
  let filmSectionVisible = false;
  let archiveCanvas = null;
  let timecodeStart = performance.now();

  function requestMainFrame() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(runMainFrame);
  }

  function runMainFrame(time) {
    frameRequested = false;
    let needsNext = false;
    if (scrollDirty || layoutDirty) {
      updateScrollExperience();
      scrollDirty = false;
      layoutDirty = false;
    }
    if (archiveCanvas?.frame(time)) needsNext = true;
    if (filmSectionVisible && !reducedMotion) {
      const elapsed = (time - timecodeStart) / 1000;
      const totalFrames = Math.floor((elapsed % 3600) * 24);
      const seconds = Math.floor(totalFrames / 24);
      const frame = totalFrames % 24;
      const timecode = $('[data-timecode]');
      if (timecode) timecode.textContent = `00:${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(frame)}`;
      needsNext = true;
    }
    if (needsNext) requestMainFrame();
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
    revealElements.forEach(element => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
    revealElements.forEach(element => revealObserver.observe(element));
  }

  const sections = $$('[data-section]');
  const currentNumber = $('[data-current-number]');
  const currentSection = $('[data-current-section]');
  const header = $('[data-header]');
  let activeSection = null;

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
    const detectionLine = scrollY + (header?.offsetHeight || 0) + innerHeight * .32;
    let nextSection = sections[0];
    for (const section of sections) {
      if (section.offsetTop <= detectionLine) nextSection = section;
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

  function openIndex(event) {
    indexReturnFocus = event?.currentTarget || document.activeElement;
    siteIndex.classList.add('is-open');
    siteIndex.setAttribute('aria-hidden', 'false');
    document.body.classList.add('index-open');
    setTimeout(() => $('[data-index-close]:not(.index-backdrop)', siteIndex)?.focus(), reducedMotion ? 0 : 140);
  }

  function closeIndex({ restoreFocus = true } = {}) {
    siteIndex.classList.remove('is-open');
    siteIndex.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('index-open');
    if (restoreFocus) indexReturnFocus?.focus?.();
  }

  function updateIndexPreview(link) {
    if (!link || !indexPreview) return;
    indexCount.textContent = $('span', link)?.textContent || '';
    indexName.textContent = $('b', link)?.textContent || '';
    const source = link.dataset.preview;
    const position = link.dataset.previewPosition || 'center';
    if (!source) return;
    if (indexPreview.getAttribute('src') === source) {
      indexPreview.style.setProperty('--index-preview-position', position);
      return;
    }
    const request = ++indexPreviewRequest;
    indexPreview.classList.add('is-changing');
    const preload = new Image();
    preload.onload = () => {
      if (request !== indexPreviewRequest) return;
      indexPreview.src = source;
      indexPreview.style.setProperty('--index-preview-position', position);
      requestAnimationFrame(() => indexPreview.classList.remove('is-changing'));
    };
    preload.onerror = () => {
      if (request === indexPreviewRequest) indexPreview.classList.remove('is-changing');
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
  let transitionActive = false;
  let pendingGalleryFilter = null;
  const normalizeHash = hash => hash === '#profile' ? '#home' : (hash || '#home');

  function updateCurtain(category, hash) {
    const config = categoryConfig[category];
    const destinations = {
      '#home': ['PLUTONOC', 'HOME', ''],
      '#films': ['MOTION', 'DYNAMIC IMAGE', '00:06'],
      '#records': ['ARCHIVE OPENED', 'DECLASSIFIED', ''],
      '#equipment': ['EQUIPMENT', 'SYSTEMS', ''],
      '#contact': ['PER ASPERA AD ASTRA', '循此苦旅 以达天际', '']
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
    if (category && archiveCanvas) archiveCanvas.setFilter(category, true);
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (pushHistory && location.hash !== normalizedHash) history.pushState({ category }, '', normalizedHash);
    scrollDirty = true;
    requestMainFrame();
  }

  function transitionTo(hash, category = null) {
    const normalizedHash = normalizeHash(hash);
    if (transitionActive || !$(normalizedHash)) return;
    pendingGalleryFilter = category;
    updateCurtain(category, normalizedHash);
    if (reducedMotion) {
      closeIndex({ restoreFocus: false });
      finishNavigation(normalizedHash, category);
      return;
    }
    transitionActive = true;
    document.body.classList.add('is-transitioning');
    closeIndex({ restoreFocus: false });
    setTimeout(() => finishNavigation(normalizedHash, category), category ? 520 : 320);
    setTimeout(() => document.body.classList.remove('is-transitioning'), category ? 960 : 650);
    setTimeout(() => { transitionActive = false; pendingGalleryFilter = null; }, category ? 1180 : 760);
  }

  $$('a[data-transition-link], [data-index-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (!link.hash || !$(link.hash)) return;
      event.preventDefault();
      const category = link.dataset.homeFilter || link.dataset.galleryTarget || null;
      transitionTo(link.hash, category);
    });
  });

  window.addEventListener('popstate', event => {
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
  let visualStageOverride = null;

  function setVisualStage(category) {
    const stage = categoryOrder.includes(category) ? category : 'deepsky';
    document.body.dataset.visualStage = stage;
    document.documentElement.style.setProperty('--stage-color', categoryConfig[stage]?.color || '#9ec8ff');
  }

  descentPanels.forEach(panel => {
    const category = panel.dataset.homeFilter;
    const activate = () => {
      descentPanels.forEach(item => item.classList.toggle('is-active', item === panel));
      descentSheet?.classList.add('has-active');
      visualStageOverride = category;
      setVisualStage(category);
      requestMainFrame();
    };
    if (supportsHover) panel.addEventListener('pointerenter', activate);
    panel.addEventListener('focus', activate);
    if (supportsHover && !reducedMotion) {
      panel.addEventListener('pointermove', event => {
        activate();
        const bounds = panel.getBoundingClientRect();
        const x = clamp((event.clientX - bounds.left) / bounds.width * 100, 8, 92);
        const y = clamp((event.clientY - bounds.top) / bounds.height * 100, 8, 92);
        panel.style.setProperty('--zoom-x', `${x}%`);
        panel.style.setProperty('--zoom-y', `${y}%`);
      });
    }
  });
  descentSheet?.addEventListener('pointerleave', () => {
    descentPanels.forEach(panel => panel.classList.remove('is-active'));
    descentSheet.classList.remove('has-active');
    visualStageOverride = null;
    scrollDirty = true;
    requestMainFrame();
  });
  descentSheet?.addEventListener('focusout', event => {
    if (descentSheet.contains(event.relatedTarget)) return;
    descentPanels.forEach(panel => panel.classList.remove('is-active'));
    descentSheet.classList.remove('has-active');
    visualStageOverride = null;
    scrollDirty = true;
    requestMainFrame();
  });

  if (isMobile && descentSheet) {
    let mobilePanelFrame = 0;
    const updateMobilePanel = () => {
      mobilePanelFrame = 0;
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

  if (homeMotion && supportsHover && !reducedMotion && 'IntersectionObserver' in window) {
    const homeVideoObserver = new IntersectionObserver(entries => {
      entries.forEach(async entry => {
        if (entry.isIntersecting) {
          try { await homeMotion.play(); } catch (_) { /* Poster remains visible. */ }
        } else homeMotion.pause();
      });
    }, { threshold: .3 });
    homeVideoObserver.observe(homeMotion);
  }

  /* Scroll progress calibration and finale */
  const progressBar = $('[data-reading-progress]');
  const scrollCalibration = $('[data-scroll-calibration]');
  const calibrationRoute = $('[data-calibration-route]', scrollCalibration);
  const calibrationProgress = $('[data-calibration-progress]', scrollCalibration);
  const arrival = $('#contact');
  const profileCopy = $('.profile-copy');
  let calibrationInertia = 0;
  let previousScrollY = scrollY;
  let calibrationResetTimer = 0;

  if ('IntersectionObserver' in window && !reducedMotion) {
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
      arrival.style.setProperty('--arrival-left-x', '12vw');
      arrival.style.setProperty('--arrival-right-x', '-10vw');
      arrival.style.setProperty('--arrival-left-y', '-3vh');
      arrival.style.setProperty('--arrival-right-y', '6vh');
      arrival.style.setProperty('--arrival-left-rotate', '1.2deg');
      arrival.style.setProperty('--arrival-right-rotate', '-1deg');
      arrival.style.setProperty('--arrival-opacity', '1');
      arrival.style.setProperty('--arrival-blur', '0px');
      arrival.style.setProperty('--arrival-spacing', '-.045em');
      arrival.classList.add('is-complete');
      return;
    }
    const bounds = arrival.getBoundingClientRect();
    const progress = clamp((innerHeight * .9 - bounds.top) / Math.max(bounds.height * .84, 1), 0, 1);
    arrival.style.setProperty('--arrival-left-x', `${(-54 + progress * 70).toFixed(2)}vw`);
    arrival.style.setProperty('--arrival-right-x', `${(54 - progress * 66).toFixed(2)}vw`);
    arrival.style.setProperty('--arrival-left-y', `${(-8 + progress * 5).toFixed(2)}vh`);
    arrival.style.setProperty('--arrival-right-y', `${(8 - progress * 2).toFixed(2)}vh`);
    arrival.style.setProperty('--arrival-left-rotate', `${(-4 + progress * 5.2).toFixed(2)}deg`);
    arrival.style.setProperty('--arrival-right-rotate', `${(4 - progress * 5).toFixed(2)}deg`);
    arrival.style.setProperty('--arrival-opacity', `${(.1 + progress * .9).toFixed(3)}`);
    arrival.style.setProperty('--arrival-blur', `${(14 * (1 - progress)).toFixed(2)}px`);
    arrival.style.setProperty('--arrival-spacing', `${(.02 - progress * .065).toFixed(3)}em`);
    arrival.classList.toggle('is-complete', progress > .985);
  }

  function updateScrollExperience() {
    const scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const ratio = clamp(scrollY / scrollable, 0, 1);
    if (progressBar) progressBar.style.transform = `scaleX(${ratio})`;
    header.classList.toggle('is-scrolled', scrollY > 20);
    updateActiveSectionFromScroll();
    if (scrollCalibration) {
      const height = scrollCalibration.getBoundingClientRect().height || (isMobile ? 50 : 74);
      const top = header.offsetHeight + 18;
      const travel = Math.max(innerHeight - top - height - 18, 0);
      const remaining = 1 - ratio;
      const inertia = reducedMotion ? 0 : calibrationInertia;
      scrollCalibration.style.setProperty('--calibration-y', `${(ratio * travel).toFixed(2)}px`);
      scrollCalibration.style.setProperty('--calibration-outer', `${(reducedMotion ? 0 : -210 * remaining + inertia).toFixed(2)}deg`);
      scrollCalibration.style.setProperty('--calibration-middle', `${(reducedMotion ? 0 : 150 * remaining - inertia * (2 / 3)).toFixed(2)}deg`);
      scrollCalibration.style.setProperty('--calibration-inner', `${(reducedMotion ? 0 : -100 * remaining + inertia * (4 / 9)).toFixed(2)}deg`);
      scrollCalibration.classList.toggle('is-calibrated', ratio > .995);
      scrollCalibration.classList.toggle('is-near-end', ratio > .94);
      if (calibrationRoute && calibrationProgress) {
        const length = calibrationRoute.getTotalLength();
        const point = calibrationRoute.getPointAtLength(length * ratio);
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
    const worksBounds = $('#works')?.getBoundingClientRect();
    const worksVisible = worksBounds && worksBounds.top < innerHeight * .72 && worksBounds.bottom > innerHeight * .25;
    setVisualStage(visualStageOverride || (worksVisible && archiveCanvas?.filter !== 'all' ? archiveCanvas.filter : fallbackStage));
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
  window.addEventListener('resize', () => { layoutDirty = true; archiveCanvas?.resize(); requestMainFrame(); }, { passive: true });
  window.addEventListener('load', () => {
    const initialHash = normalizeHash(location.hash);
    if (location.hash !== initialHash) history.replaceState(history.state, '', initialHash);
    if (initialHash !== '#home') finishNavigation(initialHash, history.state?.category || null, false);
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
    constructor(budget) {
      this.budget = budget;
      this.bytes = 0;
      this.entries = new Map();
      this.protectedSources = new Set();
    }

    get(source) {
      const entry = this.entries.get(source);
      if (entry) entry.used = performance.now();
      return entry?.bitmap || null;
    }

    request(source) {
      if (!source || this.entries.has(source)) return;
      const entry = { bitmap: null, bytes: 0, used: performance.now(), pending: true };
      this.entries.set(source, entry);
      const finish = bitmap => {
        entry.bitmap = bitmap;
        entry.pending = false;
        entry.bytes = (bitmap.width || 1) * (bitmap.height || 1) * 4;
        this.bytes += entry.bytes;
        this.prune();
        archiveCanvas?.requestDraw();
      };
      const fallback = () => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => finish(image);
        image.onerror = () => { entry.pending = false; entry.failed = true; };
        image.src = source;
      };
      if (location.protocol !== 'file:' && 'createImageBitmap' in window) {
        fetch(source).then(response => {
          if (!response.ok) throw new Error(`Image ${response.status}`);
          return response.blob();
        }).then(blob => createImageBitmap(blob)).then(finish).catch(fallback);
      } else fallback();
    }

    protect(sources) {
      this.protectedSources = new Set(sources);
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
      this.lastFrame = performance.now();
      this.cache = new BitmapCache((isMobile ? 96 : 240) * 1024 * 1024);
      this.initialCamera = { x: 0, y: 0 };
      this.live = $('[data-canvas-live]');
      this.status = $('[data-canvas-status]');
      this.currentElement = $('.gallery-current');
      this.totalElement = $('.gallery-total');
      this.bind();
      this.resize();
      this.setFilter('all', true);
    }

    bind() {
      this.canvas.addEventListener('pointerdown', event => this.pointerDown(event));
      this.canvas.addEventListener('pointermove', event => this.pointerMove(event));
      this.canvas.addEventListener('pointerup', event => this.pointerUp(event));
      this.canvas.addEventListener('pointercancel', event => this.pointerUp(event));
      this.canvas.addEventListener('pointerleave', () => { if (!this.pointer) { this.hovered = null; this.requestDraw(); } });
      this.canvas.addEventListener('keydown', event => this.keyDown(event));
      this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.2 : 1.75);
      this.width = bounds.width;
      this.height = bounds.height;
      this.dpr = dpr;
      this.canvas.width = Math.round(bounds.width * dpr);
      this.canvas.height = Math.round(bounds.height * dpr);
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
      this.requestDraw();
    }

    setFilter(filter, immediate = false) {
      const normalized = filter === 'planetary' ? 'planet' : filter;
      if (normalized !== 'all' && !categoryConfig[normalized]) return;
      this.filter = normalized;
      this.visibleWorks = normalized === 'all' ? [...this.allWorks] : this.allWorks.filter(work => work.category === normalized);
      this.focusedIndex = 0;
      this.opening = null;
      this.velocity.x = 0;
      this.velocity.y = 0;
      const apply = () => {
        this.layout();
        this.camera.x = this.initialCamera.x;
        this.camera.y = this.initialCamera.y;
        this.totalElement.textContent = pad(this.visibleWorks.length);
        this.currentElement.textContent = this.visibleWorks.length ? '01' : '00';
        this.status.textContent = `${normalized === 'all' ? '全部' : categoryLabel(normalized)} / ${this.visibleWorks.length}`;
        $$('.gallery-filters [data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === normalized));
        $$('[data-index-link][data-gallery-target]').forEach(link => link.classList.toggle('is-current', activeSection?.id === 'works' && link.dataset.galleryTarget === (normalized === 'all' ? 'deepsky' : normalized)));
        if (normalized !== 'all') setVisualStage(normalized);
        this.requestDraw();
      };
      const stage = $('[data-canvas-stage]');
      if (immediate || reducedMotion) apply();
      else {
        stage.classList.add('is-changing');
        setTimeout(() => { apply(); stage.classList.remove('is-changing'); }, 180);
      }
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
      const realCount = this.visibleWorks.length;
      if (!realCount || !this.width || !this.height) {
        this.nodes = [];
        this.tile = { width: Math.max(this.width, 1), height: Math.max(this.height, 1) };
        this.initialCamera = { x: 0, y: 0 };
        return;
      }

      const gap = isMobile ? 18 : 30;
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
      while ((slotIndex < realCount || rowTop < minimumTileHeight) && safety < 1200) {
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
        rowTop += rowHeight + gap;
      }

      this.tile.height = Math.max(rowTop, minimumTileHeight);
      const originals = this.nodes.filter(node => !node.clone);
      const left = Math.min(...originals.map(node => node.x - node.width / 2));
      const right = Math.max(...originals.map(node => node.x + node.width / 2));
      const top = Math.min(...originals.map(node => node.y - node.height / 2));
      const bottom = Math.max(...originals.map(node => node.y + node.height / 2));
      this.initialCamera.x = mod((left + right) / 2, this.tile.width);
      this.initialCamera.y = mod(top + this.height / 2, this.tile.height);
    }

    primaryNodeForIndex(index) {
      return this.nodes.find(node => !node.clone && node.index === index)
        || this.nodes.find(node => node.index === index)
        || null;
    }

    requestDraw() {
      this.needsDraw = true;
      requestMainFrame();
    }

    frame(time) {
      const delta = Math.min((time - this.lastFrame) / 16.667, 2);
      this.lastFrame = time;
      const moving = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > .04;
      let openingActive = false;
      if (this.opening && !this.opening.dialogOpened) {
        const progress = clamp((time - this.opening.started) / this.opening.duration, 0, 1);
        this.opening.progress = progress;
        this.needsDraw = true;
        openingActive = progress < 1;
        if (progress >= 1) {
          this.opening.dialogOpened = true;
          openPhoto(this.opening.node.index);
        }
      }
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
      return openingActive || (!this.pointer?.dragging && (Math.abs(this.velocity.x) + Math.abs(this.velocity.y) > .04));
    }

    draw() {
      this.needsDraw = false;
      const context = this.context;
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, this.width, this.height);
      this.rendered = [];
      this.frameSources = new Set();
      const slow = Math.abs(this.velocity.x) + Math.abs(this.velocity.y) < 2.4;
      const openingProgress = this.opening ? 1 - Math.pow(1 - (this.opening.progress || 0), 3) : 0;

      const repeatX = Math.ceil(this.width / Math.max(this.tile.width, 1)) + 1;
      const repeatY = Math.ceil(this.height / Math.max(this.tile.height, 1)) + 1;
      for (const node of this.nodes) {
        for (let offsetX = -repeatX; offsetX <= repeatX; offsetX += 1) {
          for (let offsetY = -repeatY; offsetY <= repeatY; offsetY += 1) {
            let x = node.x - this.camera.x + this.width / 2 + offsetX * this.tile.width;
            let y = node.y - this.camera.y + this.height / 2 + offsetY * this.tile.height;
            if (x + node.width / 2 < -80 || x - node.width / 2 > this.width + 80 || y + node.height / 2 < -80 || y - node.height / 2 > this.height + 80) continue;
            let opacity = 1;
            let emphasis = 1;
            if (this.opening) {
              const selected = node === this.opening.node
                && Math.abs(x - this.opening.originX) < 2
                && Math.abs(y - this.opening.originY) < 2;
              if (!selected) opacity = 1 - openingProgress;
              else {
                const targetScale = clamp(Math.min(this.width * .68 / node.width, this.height * .68 / node.height), 1.08, 1.7);
                x += (this.width / 2 - x) * openingProgress;
                y += (this.height / 2 - y) * openingProgress;
                emphasis = 1 + (targetScale - 1) * openingProgress;
              }
            }
            if (opacity > .01) this.drawNode(context, node, x, y, slow, opacity, emphasis);
          }
        }
      }
      this.cache.protect(this.frameSources);
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

    drawNode(context, node, x, y, slow, opacity = 1, emphasis = 1) {
      const hovered = this.hovered?.node === node && Math.abs(this.hovered.x - x) < 2 && Math.abs(this.hovered.y - y) < 2;
      const focused = node.index === this.focusedIndex && document.activeElement === this.canvas;
      const scale = (hovered || focused ? 1.035 : 1) * emphasis;
      const width = node.width * scale;
      const height = node.height * scale;
      const source = node.work.previewSrc || node.work.src;
      this.frameSources.add(source);
      const bitmap = this.cache.get(source);
      if (!bitmap) this.cache.request(source);

      context.save();
      context.translate(x, y);
      context.globalAlpha = opacity;
      if (hovered || focused) {
        context.shadowColor = 'rgba(0,0,0,.82)';
        context.shadowBlur = 28;
        context.shadowOffsetY = 12;
      }
      context.fillStyle = '#0a0c10';
      this.roundedRect(context, -width / 2, -height / 2, width, height, 12);
      context.fill();
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
      context.save();
      this.roundedRect(context, -width / 2, -height / 2, width, height, 12);
      context.clip();
      if (bitmap) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, -width / 2, -height / 2, width, height);
      } else {
        const gradient = context.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
        gradient.addColorStop(0, '#0b0d11');
        gradient.addColorStop(1, '#141820');
        context.fillStyle = gradient;
        context.fillRect(-width / 2, -height / 2, width, height);
      }
      context.restore();
      context.restore();

      if (!this.opening && slow && (hovered || focused)) {
        context.save();
        context.globalAlpha = opacity;
        context.fillStyle = 'rgba(238,234,224,.92)';
        context.font = '14px "Source Han Sans CN", sans-serif';
        context.fillText(node.work.title, x - width / 2, y + height / 2 + 24);
        context.fillStyle = categoryConfig[node.work.category]?.color || '#8d9097';
        context.font = '9px "IBM Plex Sans", monospace';
        context.fillText(`${categoryEnglish(node.work.category)} / ${pad(node.index + 1)}`, x - width / 2, y + height / 2 + 41);
        context.restore();
      }
      this.rendered.push({ node, x, y, width, height });
    }

    hitTest(x, y) {
      for (let index = this.rendered.length - 1; index >= 0; index -= 1) {
        const item = this.rendered[index];
        if (x >= item.x - item.width / 2 && x <= item.x + item.width / 2 && y >= item.y - item.height / 2 && y <= item.y + item.height / 2) return item;
      }
      return null;
    }

    startOpening(item) {
      if (!item || this.opening) return;
      this.focusedIndex = item.node.index;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.hovered = null;
      if (reducedMotion) {
        openPhoto(item.node.index);
        return;
      }
      this.opening = {
        node: item.node,
        originX: item.x,
        originY: item.y,
        started: performance.now(),
        duration: 420,
        progress: 0,
        dialogOpened: false
      };
      this.requestDraw();
    }

    pointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.pointer = {
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
      const bounds = this.canvas.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
      if (!this.pointer || this.pointer.id !== event.pointerId) {
        const hit = this.hitTest(localX, localY);
        this.hovered = hit ? { ...hit } : null;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.requestDraw();
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
      if (event.cancelable) event.preventDefault();
      const now = performance.now();
      const elapsed = Math.max(now - this.pointer.lastTime, 1);
      const deltaX = event.clientX - this.pointer.lastX;
      const deltaY = event.clientY - this.pointer.lastY;
      this.camera.x = mod(this.camera.x - deltaX, this.tile.width);
      this.camera.y = mod(this.camera.y - deltaY, this.tile.height);
      this.velocity.x = -deltaX / elapsed * 16;
      this.velocity.y = -deltaY / elapsed * 16;
      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;
      this.pointer.lastTime = now;
      this.requestDraw();
    }

    pointerUp(event) {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const bounds = this.canvas.getBoundingClientRect();
      const localX = event.clientX - bounds.left;
      const localY = event.clientY - bounds.top;
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
      this.focusedIndex = mod(this.focusedIndex + direction, this.visibleWorks.length);
      const node = this.primaryNodeForIndex(this.focusedIndex);
      if (!node) return;
      this.camera.x = mod(node.x, this.tile.width);
      this.camera.y = mod(node.y, this.tile.height);
      this.currentElement.textContent = pad(this.focusedIndex + 1);
      this.live.textContent = `${node.work.title}，${categoryLabel(node.work.category)}，第 ${this.focusedIndex + 1} 张，共 ${this.visibleWorks.length} 张`;
      this.requestDraw();
    }

    go(offset) {
      if (!this.nodes.length) return;
      this.focusedIndex = mod(this.focusedIndex + offset, this.visibleWorks.length);
      const node = this.primaryNodeForIndex(this.focusedIndex);
      if (!node) return;
      this.camera.x = mod(node.x, this.tile.width);
      this.camera.y = mod(node.y, this.tile.height);
      this.currentElement.textContent = pad(this.focusedIndex + 1);
      this.requestDraw();
    }
  }

  const canvasElement = $('[data-archive-canvas]');
  if (canvasElement) archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);
  $$('.gallery-filters [data-filter]').forEach(button => button.addEventListener('click', () => archiveCanvas?.setFilter(button.dataset.filter)));
  $('.gallery-prev')?.addEventListener('click', () => archiveCanvas?.go(-1));
  $('.gallery-next')?.addEventListener('click', () => archiveCanvas?.go(1));

  /* Photo dialog */
  const photoDialog = $('[data-photo-dialog]');
  const photoImage = $('.photo-stage img', photoDialog);
  let photoIndex = 0;
  let photoReturnFocus = null;
  let photoSwipeStart = null;

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

  function updatePhotoDialog(direction = 0) {
    const work = archiveCanvas?.visibleWorks[photoIndex];
    if (!work) return;
    if (direction) {
      photoDialog.style.setProperty('--photo-direction', `${direction * 20}px`);
      photoDialog.classList.add('is-switching');
    }
    const render = () => {
      photoImage.src = work.src;
      photoImage.alt = work.title;
      $('[data-photo-current]').textContent = pad(photoIndex + 1);
      $('[data-photo-total]').textContent = pad(archiveCanvas.visibleWorks.length);
      $('[data-photo-title]').textContent = work.title;
      $('[data-photo-category]').textContent = `${categoryLabel(work.category)} / ${categoryEnglish(work.category)}`;
      $('[data-object-label]').textContent = work.category === 'earth' ? 'FRAME' : 'OBJECT';

      const hasDate = setDetailRow('[data-detail-date]', detailValue(work, 'date'));
      const hasLocation = setDetailRow('[data-detail-location]', detailValue(work, 'location'));
      const hasCapture = hasDate || hasLocation;
      $('[data-detail-capture]').hidden = !hasCapture;
      const hasEquipment = setDetailRow('[data-detail-equipment]', detailValue(work, 'equipment'));
      const hasParameters = setDetailRow('[data-detail-parameters]', detailValue(work, 'parameters'));
      const hasSystem = hasEquipment || hasParameters;
      $('[data-detail-system]').hidden = !hasSystem;
      const process = detailValue(work, 'process');
      $('[data-detail-process]').hidden = !process;
      if (process) $('p', $('[data-detail-process]')).textContent = process;
      const story = detailValue(work, 'story');
      const notes = detailValue(work, 'notes');
      $('[data-detail-story]').hidden = !story;
      $('[data-detail-note]').hidden = !notes;
      if (story) $('[data-detail-story]').textContent = story;
      if (notes) $('[data-detail-note]').textContent = notes;
      $('[data-detail-notes]').hidden = !(story || notes);
      photoDialog.classList.remove('is-switching');
    };
    if (direction && !reducedMotion) setTimeout(render, 150);
    else render();
  }

  function openPhoto(index) {
    if (!archiveCanvas?.visibleWorks.length) return;
    photoIndex = mod(index, archiveCanvas.visibleWorks.length);
    photoReturnFocus = document.activeElement;
    updatePhotoDialog();
    photoDialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function movePhoto(offset) {
    if (!archiveCanvas?.visibleWorks.length) return;
    photoIndex = mod(photoIndex + offset, archiveCanvas.visibleWorks.length);
    updatePhotoDialog(offset);
  }

  $('.dialog-prev', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(-1); });
  $('.dialog-next', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(1); });
  $('.dialog-close', photoDialog)?.addEventListener('click', () => photoDialog.close());
  photoDialog?.addEventListener('click', event => { if (event.target === photoDialog) photoDialog.close(); });
  photoDialog?.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') photoSwipeStart = event.clientX; });
  photoDialog?.addEventListener('pointerup', event => {
    if (photoSwipeStart === null) return;
    const delta = event.clientX - photoSwipeStart;
    photoSwipeStart = null;
    if (Math.abs(delta) > 55) movePhoto(delta < 0 ? 1 : -1);
  });
  photoDialog?.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    photoImage.removeAttribute('src');
    if (archiveCanvas) {
      archiveCanvas.opening = null;
      archiveCanvas.requestDraw();
    }
    photoReturnFocus?.focus?.();
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
    equipmentOriginals.forEach(item => {
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
    event.preventDefault();
    const rawDelta = event.deltaX || event.deltaY;
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
  window.addEventListener('resize', () => updateEquipmentTrack(0, true), { passive: true });
  updateEquipmentTrack(0, true);

  /* Film visibility */
  if ('IntersectionObserver' in window) {
    const atmosphereObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.target.id === 'films') {
          filmSectionVisible = entry.isIntersecting;
          if (filmSectionVisible) { timecodeStart = performance.now(); requestMainFrame(); }
          else stopAllFilmPreviews();
        }
      });
    }, { threshold: .18 });
    atmosphereObserver.observe($('#films'));
  }

  /* Video archive */
  const videoDialog = $('[data-video-dialog]');
  const videoPlayer = $('video', videoDialog);
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
  async function loadCloudFilms() {
    const config = window.PLUTONOC_CLOUDBASE || {};
    if (config.staticManifest) return [];
    if (!config.envId || !window.cloudbase) return [];
    const options = { env: config.envId, region: config.region || 'ap-shanghai' };
    if (config.clientId) options.clientId = config.clientId;
    if (config.accessKey) options.accessKey = config.accessKey;
    const app = window.cloudbase.init(options);
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
    })).filter(record => record.videoUrl);
  }
  function filmCard(film, index) {
    return `<figure class="film-card" data-film-index="${index}">
      <img src="${escapeHtml(film.posterUrl)}" alt="${escapeHtml(film.title)}视频封面" loading="${index === 0 ? 'eager' : 'lazy'}">
      <video class="film-preview" muted loop playsinline preload="none" aria-hidden="true"></video>
      <button type="button" aria-label="播放${escapeHtml(film.title)}"><span class="play" aria-hidden="true">▶</span></button>
      <figcaption><h3>${escapeHtml(film.title)}</h3><p>${escapeHtml(film.date || '')}<br>${formatDuration(film.duration)}</p></figcaption>
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
        preview.src = film.videoUrl;
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
      return;
    }
    feature.innerHTML = filmCard(films[0], 0);
    list.innerHTML = films.slice(1).map((film, index) => filmCard(film, index + 1)).join('');
    status.textContent = `${pad(films.length)} / MOTION`;
    wireFilmPreviews();
  }
  function openFilm(index) {
    const film = loadedFilms[index];
    if (!film) return;
    stopAllFilmPreviews();
    videoPlayer.src = film.videoUrl;
    videoPlayer.poster = film.posterUrl || '';
    $('.video-caption h3', videoDialog).textContent = film.title;
    $('.video-caption p', videoDialog).textContent = [film.date, formatDuration(film.duration), film.location].filter(Boolean).join(' / ');
    videoDialog.showModal();
    document.body.classList.add('dialog-open');
  }
  $('#films')?.addEventListener('click', event => {
    const card = event.target.closest('.film-card');
    if (card) openFilm(Number(card.dataset.filmIndex));
  });
  $('.dialog-close', videoDialog)?.addEventListener('click', () => videoDialog.close());
  videoDialog?.addEventListener('click', event => { if (event.target === videoDialog) videoDialog.close(); });
  videoDialog?.addEventListener('close', () => {
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.removeAttribute('poster');
    videoPlayer.load();
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

  setVisualStage('deepsky');
  requestMainFrame();
})();
