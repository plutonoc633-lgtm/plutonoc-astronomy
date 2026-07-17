(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const pad = number => String(number).padStart(2, '0');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const header = $('[data-header]');
  let previousScroll = window.scrollY;
  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    header?.classList.toggle('is-hidden', currentScroll > previousScroll && currentScroll > 140);
    previousScroll = currentScroll;
  }, { passive: true });

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
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    reveals.forEach(element => revealObserver.observe(element));
  }

  const index = $('#site-index');
  const indexPreview = $('.index-preview img', index);
  const indexLinks = $$('[data-index-link]', index);
  let indexReturnFocus = null;
  let indexPreviewTimer = 0;

  function openIndex(event) {
    indexReturnFocus = event?.currentTarget || document.activeElement;
    index.classList.add('is-open');
    index.setAttribute('aria-hidden', 'false');
    document.body.classList.add('index-open');
    $('[data-index-close]', index)?.focus();
  }

  function closeIndex() {
    index.classList.remove('is-open');
    index.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('index-open');
    indexReturnFocus?.focus?.();
  }

  function updateIndexPreview(link) {
    const nextSource = link.dataset.preview;
    if (!nextSource || indexPreview.getAttribute('src') === nextSource) return;
    window.clearTimeout(indexPreviewTimer);
    indexPreview.classList.add('is-changing');
    indexPreviewTimer = window.setTimeout(() => {
      indexPreview.src = nextSource;
      indexPreview.classList.remove('is-changing');
    }, reducedMotion ? 0 : 150);
  }

  $$('[data-index-open]').forEach(button => button.addEventListener('click', openIndex));
  $('[data-index-close]', index)?.addEventListener('click', closeIndex);
  indexLinks.forEach(link => {
    link.addEventListener('click', closeIndex);
    link.addEventListener('pointerenter', () => updateIndexPreview(link));
    link.addEventListener('focus', () => updateIndexPreview(link));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && index.classList.contains('is-open')) closeIndex();
    if (event.key !== 'Tab' || !index.classList.contains('is-open')) return;
    const focusable = $$('a[href],button:not([disabled])', index);
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

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      indexLinks.forEach(link => link.classList.toggle('is-current', link.hash === `#${visible.target.id}`));
    }, { threshold: [0.2, 0.45, 0.7] });
    $$('main section[id]').forEach(section => sectionObserver.observe(section));
  }

  const homeLinks = $$('[data-home-preview]');
  const homePreview = $('.home-preview');
  const homePreviewImage = $('.home-preview-frame img', homePreview);
  const homePreviewTitle = $('figcaption b', homePreview);
  const homePreviewCopy = $('figcaption span', homePreview);
  let homePreviewTimer = 0;

  function activateHomeLink(link) {
    if (!link || link.classList.contains('is-active')) return;
    homeLinks.forEach(item => item.classList.toggle('is-active', item === link));
    window.clearTimeout(homePreviewTimer);
    homePreview.classList.add('is-changing');
    homePreviewTimer = window.setTimeout(() => {
      homePreviewImage.src = link.dataset.preview;
      homePreviewImage.alt = `${link.dataset.title}代表影像`;
      homePreviewTitle.textContent = link.dataset.title;
      homePreviewCopy.textContent = link.dataset.copy;
      homePreview.classList.remove('is-changing');
    }, reducedMotion ? 0 : 180);
  }

  homeLinks.forEach(link => {
    link.addEventListener('pointerenter', () => activateHomeLink(link));
    link.addEventListener('focus', () => activateHomeLink(link));
    link.addEventListener('click', () => {
      if (link.dataset.homeFilter) setGalleryFilter(link.dataset.homeFilter);
    });
  });

  if (supportsHover && !reducedMotion) {
    let previewFrame = 0;
    homePreview?.addEventListener('pointermove', event => {
      window.cancelAnimationFrame(previewFrame);
      previewFrame = window.requestAnimationFrame(() => {
        const bounds = homePreview.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * -10;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -10;
        homePreviewImage.style.setProperty('--preview-x', `${x}px`);
        homePreviewImage.style.setProperty('--preview-y', `${y}px`);
      });
    });
    homePreview?.addEventListener('pointerleave', () => {
      homePreviewImage.style.setProperty('--preview-x', '0px');
      homePreviewImage.style.setProperty('--preview-y', '0px');
    });
  }

  const journeyStops = $$('.journey-stop');
  const journeyViewer = $('.journey-viewer');
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
    window.clearTimeout(journeyTimer);
    journeyTimer = window.setTimeout(() => {
      const image = $('img', journeyViewer);
      image.src = stop.dataset.image;
      image.alt = `${stop.dataset.title}代表影像`;
      $('figcaption span', journeyViewer).textContent = stop.dataset.kicker;
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
    if (Math.abs(distance) < 48) return;
    showJourney(currentJourney + (distance < 0 ? 1 : -1));
  });

  const labels = { nightscape: '星野', deepsky: '深空', planetary: '行星' };
  const track = $('.work-track');
  const filters = $$('.gallery-filters [data-filter]');
  const currentElement = $('.gallery-current');
  const totalElement = $('.gallery-total');
  const photoDialog = $('[data-photo-dialog]');
  const allWorks = [...(window.galleryData || [])];
  let visibleWorks = [...allWorks];
  let currentIndex = 0;
  let dragged = false;

  function renderGallery(filter = 'all') {
    visibleWorks = filter === 'all' ? [...allWorks] : allWorks.filter(work => work.category === filter);
    currentIndex = 0;
    track.innerHTML = visibleWorks.map((work, indexNumber) => `
      <figure class="work-card" data-index="${indexNumber}">
        <img src="${escapeHtml(work.src)}" alt="${escapeHtml(work.title)}" loading="${indexNumber < 2 ? 'eager' : 'lazy'}" decoding="async">
        <figcaption><b>${escapeHtml(work.title)}</b><span>${escapeHtml(labels[work.category])} / ${pad(indexNumber + 1)}</span></figcaption>
      </figure>`).join('');
    totalElement.textContent = pad(visibleWorks.length);
    currentElement.textContent = visibleWorks.length ? '01' : '00';
    track.scrollLeft = 0;
  }

  function setGalleryFilter(filter) {
    const target = filters.find(button => button.dataset.filter === filter);
    if (!target) return;
    filters.forEach(button => button.classList.toggle('active', button === target));
    renderGallery(filter);
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
  track?.addEventListener('scroll', () => {
    window.clearTimeout(track.scrollTimer);
    track.scrollTimer = window.setTimeout(() => {
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
    }, 70);
  }, { passive: true });

  let dragStart = 0;
  let scrollStart = 0;
  track?.addEventListener('pointerdown', event => {
    dragStart = event.clientX;
    scrollStart = track.scrollLeft;
    dragged = false;
    track.classList.add('is-dragging');
    track.setPointerCapture(event.pointerId);
  });
  track?.addEventListener('pointermove', event => {
    if (!track.classList.contains('is-dragging')) return;
    const delta = event.clientX - dragStart;
    if (Math.abs(delta) > 5) dragged = true;
    track.scrollLeft = scrollStart - delta;
  });
  ['pointerup', 'pointercancel'].forEach(type => track?.addEventListener(type, () => track.classList.remove('is-dragging')));
  track?.addEventListener('click', event => {
    const card = event.target.closest('.work-card');
    if (!card || dragged) return;
    const work = visibleWorks[Number(card.dataset.index)];
    if (!work) return;
    $('img', photoDialog).src = work.src;
    $('img', photoDialog).alt = work.title;
    $('p', photoDialog).textContent = `${work.title} / ${labels[work.category]}`;
    photoDialog.showModal();
  });
  $('[data-photo-dialog] > button')?.addEventListener('click', () => photoDialog.close());
  photoDialog?.addEventListener('click', event => { if (event.target === photoDialog) photoDialog.close(); });
  document.addEventListener('keydown', event => {
    const workSection = $('#works')?.getBoundingClientRect();
    if (photoDialog?.open || !workSection || workSection.bottom < 0 || workSection.top > innerHeight) return;
    if (event.key === 'ArrowLeft') goToWork(currentIndex - 1);
    if (event.key === 'ArrowRight') goToWork(currentIndex + 1);
  });
  renderGallery();

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
      <figcaption><h3>${escapeHtml(film.title)}</h3><p>${escapeHtml(film.category || '观测影像')} ${film.date ? `/ ${escapeHtml(film.date)}` : ''}</p></figcaption>
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

  function renderFilms(films, sourceLabel) {
    loadedFilms = films;
    const feature = $('[data-film-feature]');
    const list = $('[data-film-list]');
    const status = $('[data-film-status]');
    if (!films.length) {
      feature.innerHTML = '<div class="film-empty">暂无已发布影像</div>';
      list.innerHTML = '';
      status.textContent = '登录私人管理页后可上传并发布视频';
      return;
    }
    feature.innerHTML = filmCard(films[0], 0, true);
    list.innerHTML = films.slice(1).map((film, offset) => filmCard(film, offset + 1)).join('');
    status.textContent = `${pad(films.length)} 条影像 / ${sourceLabel}`;
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
    $('.video-caption p', videoDialog).textContent = [film.summary, film.location, film.date].filter(Boolean).join(' / ');
    videoDialog.showModal();
  }

  $('#films')?.addEventListener('click', event => {
    const card = event.target.closest('.film-card');
    if (card) openFilm(Number(card.dataset.filmIndex));
  });
  $('[data-video-dialog] > button')?.addEventListener('click', () => videoDialog.close());
  videoDialog?.addEventListener('click', event => { if (event.target === videoDialog) videoDialog.close(); });
  videoDialog?.addEventListener('close', () => {
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.removeAttribute('poster');
    videoPlayer.load();
  });

  (async () => {
    try {
      const cloudFilms = await loadCloudFilms();
      renderFilms(cloudFilms.length ? cloudFilms : (window.localVideoData || []), cloudFilms.length ? 'CLOUDBASE' : 'LOCAL ARCHIVE');
    } catch (error) {
      console.warn('CloudBase videos unavailable; using local archive.', error);
      renderFilms(window.localVideoData || [], 'LOCAL ARCHIVE');
    }
  })();
})();
