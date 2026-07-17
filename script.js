(() => {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(element => revealObserver.observe(element));
  }

  const index = $('#site-index');
  const indexPreview = $('.index-preview img', index);
  const indexLinks = $$('[data-index-link]', index);
  let indexReturnFocus = null;

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

  $$('[data-index-open]').forEach(button => button.addEventListener('click', openIndex));
  $('[data-index-close]', index)?.addEventListener('click', closeIndex);
  indexLinks.forEach(link => {
    link.addEventListener('click', closeIndex);
    link.addEventListener('pointerenter', () => {
      const nextSource = link.dataset.preview;
      if (!nextSource || indexPreview.src.endsWith(nextSource)) return;
      indexPreview.classList.add('is-changing');
      window.setTimeout(() => {
        indexPreview.src = nextSource;
        indexPreview.classList.remove('is-changing');
      }, 150);
    });
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
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      indexLinks.forEach(link => link.classList.toggle('is-current', link.hash === `#${visible.target.id}`));
    }, { threshold: [0.25, 0.5, 0.75] });
    $$('main section[id]').forEach(section => sectionObserver.observe(section));
  }

  const journeyStops = $$('.journey-stop');
  const journeyViewer = $('.journey-viewer');
  journeyStops.forEach(stop => stop.addEventListener('click', () => {
    journeyStops.forEach(item => {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
    });
    stop.classList.add('active');
    stop.setAttribute('aria-selected', 'true');
    journeyViewer.classList.add('is-changing');
    window.setTimeout(() => {
      const image = $('img', journeyViewer);
      image.src = stop.dataset.image;
      image.alt = `${stop.dataset.title}代表影像`;
      $('figcaption span', journeyViewer).textContent = stop.dataset.kicker;
      $('figcaption h3', journeyViewer).textContent = stop.dataset.title;
      $('figcaption p', journeyViewer).textContent = stop.dataset.copy;
      journeyViewer.classList.remove('is-changing');
    }, reducedMotion ? 0 : 260);
  }));

  const labels = { nightscape: '星野', deepsky: '深空', planetary: '行星' };
  const track = $('.work-track');
  const filters = $$('.gallery-filters [data-filter]');
  const currentElement = $('.gallery-current');
  const totalElement = $('.gallery-total');
  const photoDialog = $('[data-photo-dialog]');
  let visibleWorks = [...(window.galleryData || [])];
  let currentIndex = 0;
  let dragged = false;

  function renderGallery(filter = 'all') {
    visibleWorks = filter === 'all' ? [...window.galleryData] : window.galleryData.filter(work => work.category === filter);
    currentIndex = 0;
    track.innerHTML = visibleWorks.map((work, indexNumber) => `
      <figure class="work-card" data-index="${indexNumber}">
        <img src="${escapeHtml(work.src)}" alt="${escapeHtml(work.title)}" loading="${indexNumber < 2 ? 'eager' : 'lazy'}">
        <figcaption><b>${escapeHtml(work.title)}</b><span>${escapeHtml(labels[work.category])} / ${pad(indexNumber + 1)}</span></figcaption>
      </figure>`).join('');
    totalElement.textContent = pad(visibleWorks.length);
    currentElement.textContent = '01';
    track.scrollLeft = 0;
  }

  const galleryCards = () => $$('.work-card', track);
  function goToWork(indexNumber) {
    const cards = galleryCards();
    if (!cards.length) return;
    currentIndex = (indexNumber + cards.length) % cards.length;
    cards[currentIndex].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    currentElement.textContent = pad(currentIndex + 1);
  }

  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    renderGallery(button.dataset.filter);
  }));
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
        if (nextDistance < distance) { distance = nextDistance; nearest = indexNumber; }
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
      <button type="button" aria-label="播放${escapeHtml(film.title)}"><span class="play" aria-hidden="true">▶</span></button>
      <figcaption><h3>${escapeHtml(film.title)}</h3><p>${escapeHtml(film.category || '观测影像')} ${film.date ? `/ ${escapeHtml(film.date)}` : ''}</p></figcaption>
    </figure>`;
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
    list.innerHTML = films.map((film, indexNumber) => filmCard(film, indexNumber)).join('');
    status.textContent = `${pad(films.length)} 条影像 / ${sourceLabel}`;
  }

  function openFilm(indexNumber) {
    const film = loadedFilms[indexNumber];
    if (!film) return;
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
