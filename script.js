(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (selector, root = document) => root?.querySelector(selector);
  const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
  const pad = number => String(number).padStart(2, '0');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const header = $('[data-header]');
  const progress = $('[data-reading-progress]');
  let scrollFrame = 0;

  function updateScrollChrome() {
    scrollFrame = 0;
    const scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    const ratio = Math.min(Math.max(scrollY / scrollable, 0), 1);
    progress?.style.setProperty('transform', `scaleX(${ratio})`);
    header?.classList.toggle('is-scrolled', scrollY > 20);
  }

  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(updateScrollChrome);
  }, { passive: true });
  updateScrollChrome();

  const reveals = $$('.reveal');
  if (reducedMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(element => element.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(element => revealObserver.observe(element));
  }

  const siteIndex = $('#site-index');
  const indexPanel = $('.index-panel', siteIndex);
  const indexPreview = $('.index-preview img', siteIndex);
  const indexLinks = $$('[data-index-link]', siteIndex);
  const indexCount = $('[data-index-count]', siteIndex);
  const indexName = $('[data-index-name]', siteIndex);
  let indexReturnFocus = null;
  let indexPreviewTimer = 0;

  function openIndex(event) {
    indexReturnFocus = event?.currentTarget || document.activeElement;
    siteIndex.classList.add('is-open');
    siteIndex.setAttribute('aria-hidden', 'false');
    document.body.classList.add('index-open');
    window.setTimeout(() => $('[data-index-close]', siteIndex)?.focus(), reducedMotion ? 0 : 120);
  }

  function closeIndex({ restoreFocus = true } = {}) {
    siteIndex.classList.remove('is-open');
    siteIndex.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('index-open');
    if (restoreFocus) indexReturnFocus?.focus?.();
  }

  function updateIndexPreview(link) {
    if (!link) return;
    const nextSource = link.dataset.preview;
    const number = $('span', link)?.textContent || '';
    const name = $('b', link)?.textContent || '';
    indexCount.textContent = number;
    indexName.textContent = name;
    if (!nextSource || indexPreview.getAttribute('src') === nextSource) return;
    clearTimeout(indexPreviewTimer);
    indexPreview.classList.add('is-changing');
    indexPreviewTimer = window.setTimeout(() => {
      indexPreview.src = nextSource;
      indexPreview.classList.remove('is-changing');
    }, reducedMotion ? 0 : 150);
  }

  $$('[data-index-open]').forEach(button => button.addEventListener('click', openIndex));
  $('[data-index-close]', siteIndex)?.addEventListener('click', () => closeIndex());
  $('.index-backdrop', siteIndex)?.addEventListener('click', () => closeIndex());
  indexLinks.forEach(link => {
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
    const focusable = $$('a[href], button:not([disabled])', indexPanel);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const curtain = $('[data-page-curtain]');
  let transitionActive = false;

  function finishNavigation(hash, pushHistory = true) {
    const target = $(hash);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (pushHistory && location.hash !== hash) history.pushState(null, '', hash);
  }

  function transitionTo(hash) {
    if (transitionActive || !$(hash)) return;
    if (reducedMotion) {
      closeIndex({ restoreFocus: false });
      finishNavigation(hash);
      return;
    }
    transitionActive = true;
    document.body.classList.add('is-transitioning');
    curtain.className = 'page-curtain is-covering';
    window.setTimeout(() => {
      closeIndex({ restoreFocus: false });
      finishNavigation(hash);
      requestAnimationFrame(() => {
        curtain.className = 'page-curtain is-revealing';
        window.setTimeout(() => {
          curtain.className = 'page-curtain';
          curtain.style.transition = 'none';
          curtain.style.transform = 'translateY(100%)';
          requestAnimationFrame(() => {
            curtain.removeAttribute('style');
            document.body.classList.remove('is-transitioning');
            transitionActive = false;
          });
        }, 400);
      });
    }, 390);
  }

  $$('a[data-transition-link], [data-index-link]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.hash;
      if (!hash || !$(hash)) return;
      event.preventDefault();
      transitionTo(hash);
    });
  });

  const sections = $$('main section[id]');
  const currentNumber = $('[data-current-number]');
  const currentSection = $('[data-current-section]');

  function setCurrentSection(section) {
    if (!section) return;
    const hash = `#${section.id}`;
    currentNumber.textContent = section.dataset.section || '';
    currentSection.textContent = section.dataset.sectionName || '';
    indexLinks.forEach(link => link.classList.toggle('is-current', link.hash === hash));
  }

  if ('IntersectionObserver' in window) {
    const visibleSections = new Map();
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleSections.set(entry.target, entry.intersectionRatio);
        else visibleSections.delete(entry.target);
      });
      const active = [...visibleSections.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (active) setCurrentSection(active);
    }, { threshold: [0.15, 0.3, 0.5, 0.7], rootMargin: '-15% 0px -35% 0px' });
    sections.forEach(section => sectionObserver.observe(section));
  }

  const hero = $('.hero');
  const heroMedia = $('.hero-media', hero);
  const heroCurrent = $('.hero-image-current', hero);
  const heroNext = $('.hero-image-next', hero);
  const homeLinks = $$('[data-home-preview]', hero);
  let heroSwapToken = 0;

  function activateHeroLink(link) {
    if (!link || link.classList.contains('is-active')) return;
    homeLinks.forEach(item => item.classList.toggle('is-active', item === link));
    const source = link.dataset.preview;
    if (!source || heroCurrent.src.endsWith(source)) return;
    const token = ++heroSwapToken;
    heroNext.src = source;
    const showNext = () => {
      if (token !== heroSwapToken) return;
      heroNext.classList.add('is-visible');
      window.setTimeout(() => {
        if (token !== heroSwapToken) return;
        heroCurrent.src = source;
        heroNext.classList.remove('is-visible');
      }, reducedMotion ? 0 : 570);
    };
    if (heroNext.complete) showNext();
    else heroNext.addEventListener('load', showNext, { once: true });
  }

  homeLinks.forEach(link => {
    link.addEventListener('pointerenter', () => activateHeroLink(link));
    link.addEventListener('focus', () => activateHeroLink(link));
    link.addEventListener('click', () => {
      if (link.dataset.homeFilter) setGalleryFilter(link.dataset.homeFilter, true);
    });
  });

  if (supportsHover && !reducedMotion) {
    let heroFrame = 0;
    hero?.addEventListener('pointermove', event => {
      cancelAnimationFrame(heroFrame);
      heroFrame = requestAnimationFrame(() => {
        const bounds = hero.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - .5) * -14;
        const y = ((event.clientY - bounds.top) / bounds.height - .5) * -14;
        heroMedia.style.setProperty('--hero-x', `${x}px`);
        heroMedia.style.setProperty('--hero-y', `${y}px`);
      });
    });
    hero?.addEventListener('pointerleave', () => {
      heroMedia.style.setProperty('--hero-x', '0px');
      heroMedia.style.setProperty('--hero-y', '0px');
    });
  }

  const journeyStops = $$('.journey-stop');
  const journeyViewer = $('.journey-viewer');
  const journeyStage = $('.journey-stage', journeyViewer);
  const journeyImage = $('img', journeyStage);
  const journeyCurrent = $('[data-journey-current]');
  let currentJourney = 0;
  let journeyTimer = 0;

  function showJourney(indexNumber, moveFocus = false) {
    if (!journeyStops.length) return;
    currentJourney = (indexNumber + journeyStops.length) % journeyStops.length;
    const stop = journeyStops[currentJourney];
    journeyStops.forEach((item, itemIndex) => {
      const active = itemIndex === currentJourney;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    journeyViewer.setAttribute('aria-labelledby', stop.id);
    journeyCurrent.textContent = pad(currentJourney + 1);
    journeyViewer.classList.add('is-changing');
    clearTimeout(journeyTimer);
    journeyTimer = window.setTimeout(() => {
      journeyStage.style.setProperty('--journey-ratio', stop.dataset.ratio);
      journeyImage.src = stop.dataset.image;
      journeyImage.alt = stop.dataset.alt;
      $('figcaption h3', journeyViewer).textContent = stop.dataset.title;
      $('figcaption p', journeyViewer).textContent = stop.dataset.copy;
      journeyViewer.classList.remove('is-changing');
      if (moveFocus) stop.focus();
    }, reducedMotion ? 0 : 210);
  }

  journeyStops.forEach((stop, indexNumber) => {
    stop.addEventListener('click', () => showJourney(indexNumber));
    stop.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') showJourney(0, true);
      else if (event.key === 'End') showJourney(journeyStops.length - 1, true);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') showJourney(currentJourney - 1, true);
      else showJourney(currentJourney + 1, true);
    });
  });
  $('[data-journey-prev]')?.addEventListener('click', () => showJourney(currentJourney - 1));
  $('[data-journey-next]')?.addEventListener('click', () => showJourney(currentJourney + 1));

  let journeySwipeStart = null;
  journeyViewer?.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    journeySwipeStart = event.clientX;
  });
  journeyViewer?.addEventListener('pointerup', event => {
    if (journeySwipeStart === null) return;
    const distance = event.clientX - journeySwipeStart;
    journeySwipeStart = null;
    if (Math.abs(distance) >= 48) showJourney(currentJourney + (distance < 0 ? 1 : -1));
  });

  const labels = { nightscape: '星野', deepsky: '深空', planetary: '行星' };
  const track = $('.work-track');
  const filters = $$('.gallery-filters [data-filter]');
  const currentElement = $('.gallery-current');
  const totalElement = $('.gallery-total');
  const photoDialog = $('[data-photo-dialog]');
  const photoDialogImage = $('img', photoDialog);
  const allWorks = [...(window.galleryData || [])];
  let visibleWorks = [...allWorks];
  let currentIndex = 0;
  let photoIndex = 0;
  let dragged = false;
  let filterTimer = 0;

  function renderGallery(filter = 'all') {
    visibleWorks = filter === 'all' ? [...allWorks] : allWorks.filter(work => work.category === filter);
    currentIndex = 0;
    track.innerHTML = visibleWorks.map((work, indexNumber) => `
      <figure class="work-card" data-index="${indexNumber}" tabindex="0">
        <img src="${escapeHtml(work.src)}" alt="${escapeHtml(work.title)}" loading="${indexNumber < 2 ? 'eager' : 'lazy'}" decoding="async">
        <figcaption><b>${escapeHtml(work.title)}</b><span>${escapeHtml(labels[work.category])} / ${pad(indexNumber + 1)}</span></figcaption>
      </figure>`).join('');
    totalElement.textContent = pad(visibleWorks.length);
    currentElement.textContent = visibleWorks.length ? '01' : '00';
    track.scrollLeft = 0;
  }

  function setGalleryFilter(filter, immediate = false) {
    const target = filters.find(button => button.dataset.filter === filter);
    if (!target) return;
    filters.forEach(button => button.classList.toggle('active', button === target));
    clearTimeout(filterTimer);
    if (immediate || reducedMotion) {
      renderGallery(filter);
      return;
    }
    track.classList.add('is-filtering');
    filterTimer = window.setTimeout(() => {
      renderGallery(filter);
      requestAnimationFrame(() => track.classList.remove('is-filtering'));
    }, 180);
  }

  const galleryCards = () => $$('.work-card', track);
  function goToWork(indexNumber) {
    const cards = galleryCards();
    if (!cards.length) return;
    currentIndex = (indexNumber + cards.length) % cards.length;
    cards[currentIndex].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    currentElement.textContent = pad(currentIndex + 1);
  }

  filters.forEach(button => button.addEventListener('click', () => setGalleryFilter(button.dataset.filter)));
  $('.gallery-prev')?.addEventListener('click', () => goToWork(currentIndex - 1));
  $('.gallery-next')?.addEventListener('click', () => goToWork(currentIndex + 1));

  let galleryScrollFrame = 0;
  track?.addEventListener('scroll', () => {
    if (galleryScrollFrame) return;
    galleryScrollFrame = requestAnimationFrame(() => {
      galleryScrollFrame = 0;
      const center = track.scrollLeft + track.clientWidth / 2;
      let nearest = 0;
      let distance = Infinity;
      galleryCards().forEach((card, indexNumber) => {
        const nextDistance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = indexNumber;
        }
      });
      currentIndex = nearest;
      currentElement.textContent = pad(currentIndex + 1);
    });
  }, { passive: true });

  let dragStart = 0;
  let scrollStart = 0;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let dragVelocity = 0;
  let inertiaFrame = 0;

  function stopGalleryDrag() {
    track.classList.remove('is-dragging');
    if (reducedMotion || Math.abs(dragVelocity) < .05) return;
    cancelAnimationFrame(inertiaFrame);
    const glide = () => {
      track.scrollLeft -= dragVelocity * 16;
      dragVelocity *= .92;
      if (Math.abs(dragVelocity) > .04) inertiaFrame = requestAnimationFrame(glide);
      else track.classList.remove('is-dragging');
    };
    track.classList.add('is-dragging');
    inertiaFrame = requestAnimationFrame(glide);
  }

  track?.addEventListener('pointerdown', event => {
    cancelAnimationFrame(inertiaFrame);
    dragStart = event.clientX;
    scrollStart = track.scrollLeft;
    lastPointerX = event.clientX;
    lastPointerTime = performance.now();
    dragVelocity = 0;
    dragged = false;
    track.classList.add('is-dragging');
    track.setPointerCapture(event.pointerId);
  });
  track?.addEventListener('pointermove', event => {
    if (!track.classList.contains('is-dragging')) return;
    const delta = event.clientX - dragStart;
    if (Math.abs(delta) > 5) dragged = true;
    track.scrollLeft = scrollStart - delta;
    const now = performance.now();
    const elapsed = Math.max(now - lastPointerTime, 1);
    dragVelocity = (event.clientX - lastPointerX) / elapsed;
    lastPointerX = event.clientX;
    lastPointerTime = now;
  });
  ['pointerup', 'pointercancel'].forEach(type => track?.addEventListener(type, stopGalleryDrag));

  function updatePhotoDialog() {
    const work = visibleWorks[photoIndex];
    if (!work) return;
    photoDialogImage.src = work.src;
    photoDialogImage.alt = work.title;
    $('p', photoDialog).textContent = `${pad(photoIndex + 1)} / ${pad(visibleWorks.length)}　${work.title}　${labels[work.category]}`;
  }

  function openPhoto(indexNumber) {
    photoIndex = indexNumber;
    updatePhotoDialog();
    photoDialog.showModal();
    document.body.classList.add('dialog-open');
  }

  function movePhoto(offset) {
    if (!visibleWorks.length) return;
    photoIndex = (photoIndex + offset + visibleWorks.length) % visibleWorks.length;
    updatePhotoDialog();
  }

  track?.addEventListener('click', event => {
    const card = event.target.closest('.work-card');
    if (!card || dragged) return;
    openPhoto(Number(card.dataset.index));
  });
  track?.addEventListener('keydown', event => {
    const card = event.target.closest('.work-card');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openPhoto(Number(card.dataset.index));
  });
  $('.dialog-prev', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(-1); });
  $('.dialog-next', photoDialog)?.addEventListener('click', event => { event.stopPropagation(); movePhoto(1); });
  $('.dialog-close', photoDialog)?.addEventListener('click', () => photoDialog.close());
  photoDialog?.addEventListener('click', event => { if (event.target === photoDialog) photoDialog.close(); });
  photoDialog?.addEventListener('close', () => document.body.classList.remove('dialog-open'));

  document.addEventListener('keydown', event => {
    if (photoDialog?.open) {
      if (event.key === 'ArrowLeft') movePhoto(-1);
      if (event.key === 'ArrowRight') movePhoto(1);
      return;
    }
    const workSection = $('#works')?.getBoundingClientRect();
    if (!workSection || workSection.bottom < 0 || workSection.top > innerHeight) return;
    if (event.key === 'ArrowLeft') goToWork(currentIndex - 1);
    if (event.key === 'ArrowRight') goToWork(currentIndex + 1);
  });
  renderGallery();

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
  equipmentTabs.forEach((tab, indexNumber) => {
    tab.addEventListener('click', () => showEquipment(tab.dataset.equipmentTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = (indexNumber + (event.key === 'ArrowRight' ? 1 : -1) + equipmentTabs.length) % equipmentTabs.length;
      showEquipment(equipmentTabs[next].dataset.equipmentTab, true);
    });
  });

  const videoDialog = $('[data-video-dialog]');
  const videoPlayer = $('video', videoDialog);
  let loadedFilms = [];

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
    if (!config.envId || !window.cloudbase) return [];
    const options = { env: config.envId, region: config.region || 'ap-shanghai' };
    if (config.clientId) options.clientId = config.clientId;
    if (config.accessKey) options.accessKey = config.accessKey;
    const app = window.cloudbase.init(options);
    const result = await app.database().collection(config.collection || 'videos').where({ status: 'published' }).orderBy('sortOrder', 'asc').get();
    const records = result.data || [];
    const fileIds = [...new Set(records.flatMap(record => [record.videoFileId, record.posterFileId]).filter(Boolean))];
    let links = new Map();
    if (fileIds.length) {
      const urlResult = await app.getTempFileURL({ fileList: fileIds });
      links = new Map((urlResult.fileList || []).map(item => [item.fileID, item.tempFileURL || item.download_url]));
    }
    return records.map(record => ({
      ...record,
      id: record._id || record.id,
      date: normalizeDate(record.date),
      videoUrl: links.get(record.videoFileId),
      posterUrl: links.get(record.posterFileId) || record.posterUrl
    })).filter(record => record.videoUrl);
  }

  function filmCard(film, indexNumber, featured = false) {
    return `<figure class="film-card" data-film-index="${indexNumber}">
      <img src="${escapeHtml(film.posterUrl)}" alt="${escapeHtml(film.title)}视频封面" loading="${featured ? 'eager' : 'lazy'}">
      <video class="film-preview" muted loop playsinline preload="none" aria-hidden="true"></video>
      <button type="button" aria-label="播放${escapeHtml(film.title)}"><span class="play" aria-hidden="true">▶</span></button>
      <figcaption><h3>${escapeHtml(film.title)}</h3><p>${escapeHtml(film.date || '')}<br>${formatDuration(film.duration)}</p></figcaption>
    </figure>`;
  }

  function stopFilmPreview(card) {
    const preview = $('.film-preview', card);
    if (!preview) return;
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    card.classList.remove('is-previewing');
  }

  function wireFilmPreviews() {
    if (!supportsHover || reducedMotion) return;
    $$('.film-card', $('#films')).forEach(card => {
      const start = async () => {
        const film = loadedFilms[Number(card.dataset.filmIndex)];
        const preview = $('.film-preview', card);
        if (!film || !preview || card.classList.contains('is-previewing')) return;
        preview.src = film.videoUrl;
        preview.currentTime = 0;
        try {
          await preview.play();
          card.classList.add('is-previewing');
        } catch (error) {
          stopFilmPreview(card);
        }
      };
      card.addEventListener('pointerenter', start);
      card.addEventListener('pointerleave', () => stopFilmPreview(card));
      card.addEventListener('focusin', start);
      card.addEventListener('focusout', event => {
        if (!card.contains(event.relatedTarget)) stopFilmPreview(card);
      });
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
    feature.innerHTML = filmCard(films[0], 0, true);
    list.innerHTML = films.slice(1).map((film, offset) => filmCard(film, offset + 1)).join('');
    status.textContent = `${pad(films.length)} / FILM`;
    wireFilmPreviews();
  }

  function stopAllFilmPreviews() {
    $$('.film-card.is-previewing', $('#films')).forEach(stopFilmPreview);
  }

  function openFilm(indexNumber) {
    const film = loadedFilms[indexNumber];
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
})();
