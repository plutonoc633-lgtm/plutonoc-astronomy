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
  const categoryLabels = {
    nightscape: '星野',
    deepsky: '深空',
    planetary: '行星',
    sunmoon: '日月',
    nature: '自然',
    video: '动态影像'
  };

  const header = $('[data-header]');
  const progress = $('[data-reading-progress]');
  let scrollFrame = 0;

  function updateScrollChrome() {
    scrollFrame = 0;
    const scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
    progress?.style.setProperty('transform', `scaleX(${Math.min(Math.max(scrollY / scrollable, 0), 1)})`);
    header?.classList.toggle('is-scrolled', scrollY > 20);
  }

  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollChrome);
  }, { passive: true });
  updateScrollChrome();

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
    }, { threshold: .08, rootMargin: '0px 0px -7% 0px' });
    revealElements.forEach(element => revealObserver.observe(element));
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
    siteIndex?.classList.add('is-open');
    siteIndex?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('index-open');
    window.setTimeout(() => $('[data-index-close]:not(.index-backdrop)', siteIndex)?.focus(), reducedMotion ? 0 : 130);
  }

  function closeIndex({ restoreFocus = true } = {}) {
    siteIndex?.classList.remove('is-open');
    siteIndex?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('index-open');
    if (restoreFocus) indexReturnFocus?.focus?.();
  }

  function updateIndexPreview(link) {
    if (!link || !indexPreview) return;
    const source = link.dataset.preview;
    indexCount.textContent = $('span', link)?.textContent || '';
    indexName.textContent = $('b', link)?.textContent || '';
    if (!source || indexPreview.getAttribute('src') === source) return;
    clearTimeout(indexPreviewTimer);
    indexPreview.classList.add('is-changing');
    indexPreviewTimer = window.setTimeout(() => {
      indexPreview.src = source;
      indexPreview.classList.remove('is-changing');
    }, reducedMotion ? 0 : 140);
  }

  $$('[data-index-open]').forEach(button => button.addEventListener('click', openIndex));
  $$('[data-index-close]', siteIndex).forEach(button => button.addEventListener('click', () => closeIndex()));
  indexLinks.forEach(link => {
    link.addEventListener('pointerenter', () => updateIndexPreview(link));
    link.addEventListener('focus', () => updateIndexPreview(link));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && siteIndex?.classList.contains('is-open')) {
      event.preventDefault();
      closeIndex();
      return;
    }
    if (event.key !== 'Tab' || !siteIndex?.classList.contains('is-open')) return;
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

  const curtain = $('[data-page-curtain]');
  let transitionActive = false;

  function finishNavigation(hash, pushHistory = true) {
    const target = $(hash);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
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
        }, 430);
      });
    }, 380);
  }

  $$('a[data-transition-link], [data-index-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (!link.hash || !$(link.hash)) return;
      event.preventDefault();
      transitionTo(link.hash);
    });
  });

  window.addEventListener('popstate', () => {
    if (location.hash && $(location.hash)) finishNavigation(location.hash, false);
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
    }, { threshold: [.15, .3, .5, .7], rootMargin: '-12% 0px -38% 0px' });
    sections.forEach(section => sectionObserver.observe(section));
  }

  const contactPanels = $$('.contact-panel');
  const contactSheet = $('.contact-sheet');
  const homePreviewVideos = $$('.contact-panel video');
  const resetContactPanels = () => contactPanels.forEach(item => item.classList.remove('is-active'));
  if (reducedMotion) {
    homePreviewVideos.forEach(video => video.pause());
  } else if ('IntersectionObserver' in window) {
    const homeVideoObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { threshold: .35 });
    homePreviewVideos.forEach(video => homeVideoObserver.observe(video));
  }
  contactPanels.forEach(panel => {
    const activate = () => contactPanels.forEach(item => item.classList.toggle('is-active', item === panel));
    panel.addEventListener('pointerenter', activate);
    panel.addEventListener('focus', activate);
    panel.addEventListener('click', () => {
      if (panel.dataset.homeFilter) setGalleryFilter(panel.dataset.homeFilter, true);
    });
  });
  contactSheet?.addEventListener('pointerleave', resetContactPanels);
  contactSheet?.addEventListener('focusout', event => {
    if (!contactSheet.contains(event.relatedTarget)) resetContactPanels();
  });

  const featuredMotionImage = $('[data-motion-src]');
  if (featuredMotionImage && !reducedMotion && 'IntersectionObserver' in window) {
    const featuredMotionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const image = entry.target;
        const nextSource = image.dataset.motionSrc;
        if (nextSource && image.getAttribute('src') !== nextSource) image.src = nextSource;
        featuredMotionObserver.unobserve(image);
      });
    }, { threshold: .45 });
    featuredMotionObserver.observe(featuredMotionImage);
  }

  function restoreInitialHash() {
    if (!location.hash || !$(location.hash)) return;
    requestAnimationFrame(() => requestAnimationFrame(() => finishNavigation(location.hash, false)));
  }

  if (document.readyState === 'complete') restoreInitialHash();
  else window.addEventListener('load', restoreInitialHash, { once: true });

  const allWorks = [...(window.galleryData || [])];
  const track = $('.work-track');
  const filters = $$('.gallery-filters [data-filter]');
  const currentElement = $('.gallery-current');
  const totalElement = $('.gallery-total');
  const photoDialog = $('[data-photo-dialog]');
  const photoDialogImage = $('img', photoDialog);
  let visibleWorks = [...allWorks];
  let currentIndex = 0;
  let photoIndex = 0;
  let dragged = false;
  let filterTimer = 0;

  function renderGallery(filter = 'all') {
    if (!track) return;
    visibleWorks = filter === 'all' ? [...allWorks] : allWorks.filter(work => work.category === filter);
    currentIndex = 0;
    track.innerHTML = visibleWorks.map((work, index) => `
      <figure class="work-card" data-index="${index}" data-src="${escapeHtml(work.src)}" tabindex="0">
        <img src="${escapeHtml(work.src)}" alt="${escapeHtml(work.title)}" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async">
        <figcaption><b>${escapeHtml(work.title)}</b><span>${escapeHtml(categoryLabels[work.category])} / ${pad(index + 1)}</span></figcaption>
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

  $$('[data-feature-filter]').forEach(card => {
    card.addEventListener('click', () => {
      setGalleryFilter(card.dataset.featureFilter);
      const toolbar = $('.gallery-toolbar');
      toolbar?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  });

  const galleryCards = () => $$('.work-card', track);

  function goToWork(index) {
    const cards = galleryCards();
    if (!cards.length) return;
    currentIndex = (index + cards.length) % cards.length;
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
      galleryCards().forEach((card, index) => {
        const nextDistance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center);
        if (nextDistance < distance) {
          distance = nextDistance;
          nearest = index;
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

  function stopGalleryDrag(event) {
    if (event && track?.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture(event.pointerId);
    track?.classList.remove('is-dragging');
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
    $('p', photoDialog).textContent = `${pad(photoIndex + 1)} / ${pad(visibleWorks.length)}　${work.title}　${categoryLabels[work.category]}`;
  }

  function openPhoto(index) {
    photoIndex = index;
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
    if (card && !dragged) openPhoto(Number(card.dataset.index));
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
    const worksBounds = $('#works')?.getBoundingClientRect();
    if (!worksBounds || worksBounds.bottom < 0 || worksBounds.top > innerHeight) return;
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

  equipmentTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showEquipment(tab.dataset.equipmentTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + equipmentTabs.length) % equipmentTabs.length;
      showEquipment(equipmentTabs[next].dataset.equipmentTab, true);
    });
  });

  const contact = $('#contact');
  if (contact) {
    if (reducedMotion || !('IntersectionObserver' in window)) contact.classList.add('is-in-view');
    else {
      const contactObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => contact.classList.toggle('is-in-view', entry.isIntersecting));
      }, { threshold: .3 });
      contactObserver.observe(contact);
    }
  }

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

  function filmCard(film, index, featured = false) {
    return `<figure class="film-card" data-film-index="${index}">
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
})();
