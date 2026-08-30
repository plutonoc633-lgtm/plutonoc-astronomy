(() => {
  'use strict';

  const $ = (selector, root = document) => root?.querySelector(selector);
  const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
  const config = window.PLUTONOC_CLOUDBASE || {};
  const publisherFunction = 'plutonoc-content-publisher';
  const publicSiteUrl = 'https://plutonoc.cn/';
  const githubRepository = 'plutonoc633-lgtm/plutonoc-astronomy';
  const detailKeys = ['date', 'location', 'equipment', 'parameters', 'process', 'story', 'notes'];
  const categoryOrder = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
  const categoryLabels = { deepsky: '深空', sunmoon: '日月', planet: '行星', nightscape: '星野', earth: '大地' };
  const setupPanel = $('[data-setup]');
  const loginPanel = $('[data-login]');
  const dashboard = $('[data-dashboard]');
  const publisher = $('[data-publisher]');
  const signOutButton = $('[data-sign-out]');
  const publishState = $('[data-publish-state]');
  const photoForm = $('[data-photo-form]');
  const videoForm = $('[data-video-form]');
  const confirmDialog = $('[data-confirm-dialog]');
  let app;
  let auth;
  let repoState = null;
  let preparedPhoto = null;
  let preparedPoster = null;
  let photoPreviewUrl = '';
  let posterPreviewUrl = '';
  let publishing = false;
  const draftKeys = {
    photo: 'plutonoc.studio.draft.v1.photo',
    video: 'plutonoc.studio.draft.v1.video',
  };
  const draftFieldNames = {
    photo: ['recordId', 'title', 'category', 'date', 'location', 'sortOrder', 'equipment', 'parameters', 'process', 'story', 'notes', 'featured', 'status'],
    video: ['recordId', 'videoUrl', 'title', 'category', 'summary', 'date', 'location', 'sortOrder', 'duration', 'aspectRatio', 'status'],
  };
  const draftTimers = { photo: 0, video: 0 };
  const draftDirty = { photo: false, video: false };
  let suppressDraftSave = false;

  function setMessage(target, text, isError = false) {
    if (!target) return;
    target.textContent = text;
    target.classList.toggle('is-error', isError);
  }

  function setPublishState(text, state = '', detailsUrl = '') {
    publishState.replaceChildren(document.createTextNode(text));
    if (/^https:\/\/github\.com\/plutonoc633-lgtm\/plutonoc-astronomy\/actions\/runs\/\d+(?:\/job\/\d+)?$/.test(detailsUrl)) {
      const separator = document.createTextNode(' / ');
      const link = document.createElement('a');
      link.href = detailsUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '查看详情';
      publishState.append(separator, link);
    }
    publishState.className = `publish-state${state ? ` is-${state}` : ''}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character]);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function draftForm(kind) {
    return kind === 'photo' ? photoForm : videoForm;
  }

  function draftNotice(kind) {
    return $(`[data-${kind}-draft-notice]`);
  }

  function readDraft(kind) {
    try {
      const value = JSON.parse(localStorage.getItem(draftKeys[kind]) || 'null');
      return value?.version === 1 && value.type === kind && value.fields ? value : null;
    } catch {
      return null;
    }
  }

  function clearDraft(kind, hideNotice = true) {
    clearTimeout(draftTimers[kind]);
    draftDirty[kind] = false;
    try { localStorage.removeItem(draftKeys[kind]); } catch {}
    if (hideNotice) draftNotice(kind).hidden = true;
  }

  function formFields(kind) {
    const form = draftForm(kind);
    return Object.fromEntries(draftFieldNames[kind].map(name => {
      const field = form.elements[name];
      return [name, field?.type === 'checkbox' ? field.checked : String(field?.value || '')];
    }));
  }

  function writeDraft(kind) {
    if (suppressDraftSave || !repoState || !draftDirty[kind]) return;
    const payload = {
      version: 1,
      type: kind,
      recordId: String(draftForm(kind).elements.recordId.value || ''),
      fields: formFields(kind),
      savedAt: new Date().toISOString(),
      baseHeadSha: repoState.headSha,
      hadFile: kind === 'photo' ? Boolean(preparedPhoto) : Boolean(preparedPoster),
    };
    try { localStorage.setItem(draftKeys[kind], JSON.stringify(payload)); } catch {}
  }

  function markDraftDirty(kind) {
    if (suppressDraftSave || !repoState) return;
    draftDirty[kind] = true;
    clearTimeout(draftTimers[kind]);
    draftTimers[kind] = setTimeout(() => writeDraft(kind), 500);
  }

  function showDraftNotice(kind) {
    const draft = readDraft(kind);
    const notice = draftNotice(kind);
    if (!draft) {
      notice.hidden = true;
      return;
    }
    const saved = new Date(draft.savedAt);
    const savedLabel = Number.isNaN(saved.getTime()) ? '此前' : saved.toLocaleString('zh-CN', { hour12: false });
    const remoteChanged = Boolean(draft.baseHeadSha && repoState?.headSha && draft.baseHeadSha !== repoState.headSha);
    $(`[data-${kind}-draft-text]`).textContent = remoteChanged
      ? `${savedLabel} 保存的草稿仍在，但网站内容已更新，恢复后请核对再发布。`
      : `${savedLabel} 保存了一份未发布草稿。`;
    notice.hidden = false;
  }

  function applyDraftFields(kind, fields) {
    const form = draftForm(kind);
    draftFieldNames[kind].forEach(name => {
      const field = form.elements[name];
      if (!field || !(name in fields)) return;
      if (field.type === 'checkbox') field.checked = Boolean(fields[name]);
      else field.value = String(fields[name] ?? '');
    });
  }

  function restoreDraft(kind) {
    const draft = readDraft(kind);
    if (!draft || !repoState) return;
    const source = kind === 'photo' ? repoState.gallery.items : repoState.videos.items;
    const record = draft.recordId ? source.find(item => item.id === draft.recordId) : null;
    const fields = { ...draft.fields };
    if (draft.recordId && !record) fields.recordId = '';
    suppressDraftSave = true;
    try {
      if (kind === 'photo') {
        if (record) editPhoto(record, { clearStoredDraft: false, scroll: false });
        else resetPhotoForm({ clearStoredDraft: false });
      } else if (record) editVideo(record, { clearStoredDraft: false, scroll: false });
      else resetVideoForm({ clearStoredDraft: false });
      applyDraftFields(kind, fields);
      preparedPhoto = kind === 'photo' ? null : preparedPhoto;
      preparedPoster = kind === 'video' ? null : preparedPoster;
      if (draft.hadFile && kind === 'photo') {
        photoForm.elements.image.value = '';
        $('[data-photo-file]').textContent = '草稿中的图片需重新选择';
      }
      if (draft.hadFile && kind === 'video') {
        videoForm.elements.poster.value = '';
        $('[data-poster-file]').textContent = '草稿中的封面需重新选择';
      }
    } finally {
      suppressDraftSave = false;
    }
    draftDirty[kind] = true;
    draftNotice(kind).hidden = true;
    const fileText = draft.hadFile ? `；原${kind === 'photo' ? '图片' : '封面'}文件需重新选择` : '';
    setMessage($(`[data-${kind}-message]`), `草稿已恢复${fileText}`);
  }

  function normalizeDetails(details = {}) {
    return Object.fromEntries(detailKeys.map(key => [key, String(details[key] || '').trim()]));
  }

  function cloudOptions() {
    const options = { env: config.envId, region: config.region || 'ap-shanghai' };
    if (config.clientId) options.clientId = config.clientId;
    if (config.accessKey) options.accessKey = config.accessKey;
    return options;
  }

  async function currentUser() {
    if (typeof auth.getCurrentUser === 'function') return auth.getCurrentUser();
    if (typeof auth.getCurrenUser === 'function') return auth.getCurrenUser();
    return auth.currentUser || null;
  }

  async function signIn(username, password) {
    if (typeof auth.signIn === 'function') return auth.signIn({ username, password });
    if (username.includes('@') && typeof auth.signInWithEmailAndPassword === 'function') {
      return auth.signInWithEmailAndPassword(username, password);
    }
    return auth.signInWithUsernameAndPassword(username, password);
  }

  function formatError(error) {
    const detail = error?.message || error?.error_description || error?.code || String(error);
    if (/GITHUB_AUTH|凭据无效|凭据.*过期/i.test(detail)) return '服务器端发布凭据已过期，请联系维护者更新';
    if (/GITHUB_PERMISSION|权限不足|FORBIDDEN|无权发布/i.test(detail)) return '当前账号无权发布内容';
    if (/CONFIG_REQUIRED|尚未配置/i.test(detail)) return '发布服务尚未完成服务器配置';
    if (/409|422|conflict|reference update failed/i.test(detail)) return '远端内容已变化。你的表单仍保留，请刷新内容后再发布';
    if (/password|credential|login|auth/i.test(detail)) return '登录失败，请检查账号和密码';
    if (/FILE_TOO_LARGE|单文件限制|request.*large/i.test(detail)) return '网页图片仍然过大，请先压缩原图后重试';
    if (/network|fetch/i.test(detail)) return '网络请求失败，请检查连接后重试';
    return detail;
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  async function publisherRequest(action, data = {}) {
    const response = await app.callFunction({
      name: publisherFunction,
      data: { action, ...data },
      parse: true,
    });
    let result = response?.result;
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch {}
    }
    if (!result?.ok) {
      const error = new Error(result?.error?.message || response?.message || '发布服务调用失败');
      error.code = result?.error?.code || response?.code || 'PUBLISHER_ERROR';
      throw error;
    }
    return result.data;
  }

  async function loadRepositoryContent() {
    setPublishState('正在读取网站内容', 'working');
    const state = await publisherRequest('load');
    const { gallery, videos } = state;
    validateGallery(gallery);
    validateVideos(videos);
    repoState = state;
    renderAll();
    setPublishState(`内容已连接 / ${gallery.items.length} 张照片 / ${videos.items.length} 条影像`, 'success');
  }

  function contentVersion() {
    const now = new Date();
    const digits = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
      String(now.getUTCHours()).padStart(2, '0'),
      String(now.getUTCMinutes()).padStart(2, '0'),
      String(now.getUTCSeconds()).padStart(2, '0'),
    ].join('');
    return `${digits}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function validateGallery(data) {
    const ids = new Set();
    const featured = new Map();
    if (data?.version !== 1 || !data.categoryConfig || !Array.isArray(data.items)) throw new Error('摄影数据格式无效');
    data.items.forEach(item => {
      if (!item.id || ids.has(item.id)) throw new Error(`摄影作品 ID 重复：${item.id || '空'}`);
      if (!data.categoryConfig[item.category]) throw new Error(`摄影分类无效：${item.title}`);
      if (!item.title || !item.src || !item.previewSrc || !item.thumbnailSrc) throw new Error(`摄影资料不完整：${item.title || item.id}`);
      if (!['published', 'hidden'].includes(item.status)) throw new Error(`摄影状态无效：${item.title}`);
      ids.add(item.id);
      if (item.featured && item.status === 'published') {
        if (featured.has(item.category)) throw new Error(`${categoryLabels[item.category]}存在多个首页精选`);
        featured.set(item.category, item.id);
      }
    });
    categoryOrder.forEach(category => {
      if (!featured.has(category)) throw new Error(`${categoryLabels[category]}至少需要一张已发布的首页精选`);
    });
  }

  function validateVideos(data) {
    const ids = new Set();
    if (data?.version !== 1 || !Array.isArray(data.items)) throw new Error('视频数据格式无效');
    data.items.forEach(item => {
      if (!item.id || ids.has(item.id)) throw new Error(`视频 ID 重复：${item.id || '空'}`);
      if (!item.title || !item.videoUrl || !item.posterUrl) throw new Error(`视频资料不完整：${item.title || item.id}`);
      if (!['published', 'draft'].includes(item.status)) throw new Error(`视频状态无效：${item.title}`);
      ids.add(item.id);
    });
  }

  async function createBlob(path, content) {
    if (!(content instanceof Blob)) throw new Error('发布服务只接受图片文件');
    const base64 = bytesToBase64(new Uint8Array(await content.arrayBuffer()));
    const result = await publisherRequest('createBlob', { path, content: base64 });
    return { path, sha: result.sha };
  }

  async function publishChanges({ gallery, videos, files = [], deletions = [], message, changed }) {
    if (publishing) throw new Error('已有内容正在发布');
    publishing = true;
    $$('.content-form button').forEach(button => { button.disabled = true; });
    try {
      const version = contentVersion();
      const nextGallery = gallery || deepClone(repoState.gallery);
      const nextVideos = videos || deepClone(repoState.videos);
      if (changed === 'gallery') nextGallery.contentVersion = version;
      if (changed === 'videos') nextVideos.contentVersion = version;
      validateGallery(nextGallery);
      validateVideos(nextVideos);

      setPublishState('正在准备原子提交', 'working');
      const uniqueFiles = new Map(files);
      const fileEntries = [];
      let completed = 0;
      for (const [path, content] of uniqueFiles) {
        fileEntries.push(await createBlob(path, content));
        completed += 1;
        setPublishState(`正在上传内容 ${completed} / ${uniqueFiles.size}`, 'working');
      }
      const result = await publisherRequest('publish', {
        expectedHeadSha: repoState.headSha,
        gallery: nextGallery,
        videos: nextVideos,
        fileEntries,
        deletions: [...new Set(deletions)].filter(path => path && !uniqueFiles.has(path)),
        message,
        changed,
      });
      repoState = {
        ...repoState,
        headSha: result.sha,
        treeSha: result.treeSha,
        gallery: nextGallery,
        videos: nextVideos,
        index: result.index,
      };
      renderAll();
      setPublishState(`已提交 ${result.sha.slice(0, 7)}，等待 Pages 部署`, 'working');
      pollDeployment(version, changed, result.sha);
      return result.sha;
    } finally {
      publishing = false;
      $$('.content-form button').forEach(button => { button.disabled = false; });
    }
  }

  async function fetchDeploymentCheck(commitSha) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${githubRepository}/commits/${encodeURIComponent(commitSha)}/check-runs`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json' },
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      return (data.check_runs || []).find(check => check.name === 'deploy') || null;
    } catch {
      return null;
    }
  }

  async function pollDeployment(version, changed, commitSha) {
    const marker = changed === 'gallery' ? `gallery-data.js?v=${version}` : `video-data.js?v=${version}`;
    const started = Date.now();
    let lastCheck = null;
    while (Date.now() - started < 180000) {
      await new Promise(resolve => setTimeout(resolve, 8000));
      try {
        const response = await fetch(`${publicSiteUrl}index.html?studio-check=${Date.now()}`, { cache: 'no-store' });
        if (response.ok && (await response.text()).includes(marker)) {
          setPublishState('Pages 已部署，内容已上线', 'success');
          return;
        }
      } catch {}

      lastCheck = await fetchDeploymentCheck(commitSha) || lastCheck;
      if (!lastCheck) continue;
      if (lastCheck.status === 'completed' && lastCheck.conclusion !== 'success') {
        setPublishState('Pages 部署失败，网站尚未更新', 'error', lastCheck.html_url);
        return;
      }
      if (lastCheck.status === 'completed') {
        setPublishState('Pages 已构建，等待官网缓存刷新', 'working', lastCheck.html_url);
      } else {
        setPublishState('正在部署到网站', 'working', lastCheck.html_url);
      }
    }
    setPublishState('部署超时，网站尚未确认更新', 'error', lastCheck?.html_url || '');
  }

  async function decodeImage(blob) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch {}
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('浏览器无法读取这张图片'));
      };
      image.src = url;
    });
  }

  function canvasBlob(canvas, type = 'image/webp', quality = .9) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
    });
  }

  async function renderImage(source, maxEdge, quality, cropRatio = 0, maxBytes = 3_500_000) {
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (cropRatio) {
      const sourceRatio = sourceWidth / sourceHeight;
      if (sourceRatio > cropRatio) {
        cropWidth = sourceHeight * cropRatio;
        cropX = (sourceWidth - cropWidth) / 2;
      } else {
        cropHeight = sourceWidth / cropRatio;
        cropY = (sourceHeight - cropHeight) / 2;
      }
    }
    const scale = Math.min(1, maxEdge / Math.max(cropWidth, cropHeight));
    let width = Math.max(1, Math.round(cropWidth * scale));
    let height = Math.max(1, Math.round(cropHeight * scale));
    let canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { alpha: true }).drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
    let currentQuality = quality;
    let blob = await canvasBlob(canvas, 'image/webp', currentQuality);
    while (blob.size > maxBytes && currentQuality > .62) {
      currentQuality -= .08;
      blob = await canvasBlob(canvas, 'image/webp', currentQuality);
    }
    if (blob.size > maxBytes) {
      const resizeScale = Math.min(.9, Math.sqrt(maxBytes / blob.size) * .94);
      width = Math.max(1, Math.round(width * resizeScale));
      height = Math.max(1, Math.round(height * resizeScale));
      const resized = document.createElement('canvas');
      resized.width = width;
      resized.height = height;
      resized.getContext('2d', { alpha: true }).drawImage(canvas, 0, 0, width, height);
      canvas = resized;
      blob = await canvasBlob(canvas, 'image/webp', .76);
    }
    if (blob.size > maxBytes) throw new Error('图片压缩后仍超过发布服务单文件限制');
    return { blob, width, height };
  }

  async function sha256(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function preparePhotoFile(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('只接受 JPEG、PNG 或 WebP 图片');
    if (file.size > 80 * 1024 * 1024) throw new Error('原片超过 80MB，请先导出较小版本');
    const image = await decodeImage(file);
    const display = await renderImage(image, 3000, .9);
    const preview = await renderImage(image, 1600, .84);
    const thumbnail = await renderImage(image, 640, .76, 0, 500_000);
    image.close?.();
    const hash = await sha256(display.blob);
    return {
      displayBlob: display.blob,
      previewBlob: preview.blob,
      thumbnailBlob: thumbnail.blob,
      width: display.width,
      height: display.height,
      hash,
    };
  }

  async function preparePosterFile(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('只接受 JPEG、PNG 或 WebP 封面');
    const image = await decodeImage(file);
    const poster = await renderImage(image, 1920, .9, 16 / 9);
    const preview = await renderImage(image, 960, .8, 16 / 9, 900_000);
    image.close?.();
    return { posterBlob: poster.blob, previewBlob: preview.blob, hash: await sha256(poster.blob) };
  }

  async function heroFromBlob(blob) {
    const image = await decodeImage(blob);
    const desktop = await renderImage(image, 2560, .9);
    const mobile = await renderImage(image, 1280, .8, 0, 1_500_000);
    image.close?.();
    return {
      desktopBlob: desktop.blob,
      mobileBlob: mobile.blob,
      desktopHash: await sha256(desktop.blob),
      mobileHash: await sha256(mobile.blob),
    };
  }

  async function fetchAsset(path, pendingFiles) {
    const pending = pendingFiles.find(([candidate]) => candidate === path);
    if (pending) return pending[1];
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`无法读取精选图片：${path}`);
    return response.blob();
  }

  function featuredIds(gallery) {
    return Object.fromEntries(categoryOrder.map(category => [
      category,
      gallery.items.find(item => item.category === category && item.featured && item.status === 'published')?.id || '',
    ]));
  }

  function ensureFeatured(gallery) {
    categoryOrder.forEach(category => {
      const published = gallery.items
        .filter(item => item.category === category && item.status === 'published')
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      if (!published.length) throw new Error(`${categoryLabels[category]}不能隐藏全部作品`);
      const selected = published.filter(item => item.featured);
      if (!selected.length) published[0].featured = true;
      if (selected.length > 1) selected.slice(1).forEach(item => { item.featured = false; });
      gallery.items.filter(item => item.category === category && item.status !== 'published').forEach(item => { item.featured = false; });
    });
  }

  async function updateChangedHeroes(previous, next, files, deletions, forcedCategories = []) {
    const before = featuredIds(previous);
    const after = featuredIds(next);
    for (const category of categoryOrder) {
      if (before[category] === after[category] && !forcedCategories.includes(category)) continue;
      const item = next.items.find(candidate => candidate.id === after[category]);
      const hero = await heroFromBlob(await fetchAsset(item.src, files));
      const heroPath = `assets/gallery/hero/${category}-${hero.desktopHash.slice(0, 12)}.webp`;
      const mobilePath = `assets/gallery/hero/${category}-mobile-${hero.mobileHash.slice(0, 12)}.webp`;
      files.push([heroPath, hero.desktopBlob], [mobilePath, hero.mobileBlob]);
      const oldHero = next.categoryConfig[category].homeCover;
      const oldMobile = next.categoryConfig[category].homeMobileCover;
      next.categoryConfig[category].homeCover = heroPath;
      next.categoryConfig[category].homeMobileCover = mobilePath;
      if (/^assets\/gallery\/hero\/[^/]+-[a-f0-9]{12}\.webp$/.test(oldHero)) deletions.push(oldHero);
      if (/^assets\/gallery\/hero\/[^/]+-[a-f0-9]{12}\.webp$/.test(oldMobile)) deletions.push(oldMobile);
    }
  }

  function revokePreview(type) {
    if (type === 'photo' && photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    if (type === 'poster' && posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    if (type === 'photo') photoPreviewUrl = '';
    if (type === 'poster') posterPreviewUrl = '';
  }

  function resetPhotoForm({ clearStoredDraft = true } = {}) {
    suppressDraftSave = true;
    photoForm.reset();
    photoForm.elements.recordId.value = '';
    photoForm.elements.existingSrc.value = '';
    photoForm.elements.existingPreviewSrc.value = '';
    photoForm.elements.existingThumbnailSrc.value = '';
    photoForm.elements.sortOrder.value = Math.max(0, ...repoState.gallery.items.map(item => item.sortOrder || 0)) + 1;
    photoForm.elements.status.value = 'published';
    preparedPhoto = null;
    revokePreview('photo');
    $('[data-photo-preview]').removeAttribute('src');
    $('[data-photo-preview-message]').textContent = '选择图片后显示预览';
    $('[data-photo-file]').textContent = '尚未选择图片';
    $('[data-photo-form-title]').textContent = '新增作品';
    $('[data-delete-photo]').hidden = true;
    setMessage($('[data-photo-message]'), '');
    suppressDraftSave = false;
    if (clearStoredDraft) clearDraft('photo');
  }

  function editPhoto(item, { clearStoredDraft = true, scroll = true } = {}) {
    resetPhotoForm({ clearStoredDraft });
    suppressDraftSave = true;
    photoForm.elements.recordId.value = item.id;
    photoForm.elements.existingSrc.value = item.src;
    photoForm.elements.existingPreviewSrc.value = item.previewSrc;
    photoForm.elements.existingThumbnailSrc.value = item.thumbnailSrc || item.previewSrc;
    photoForm.elements.title.value = item.title;
    photoForm.elements.category.value = item.category;
    photoForm.elements.date.value = item.details?.date || '';
    photoForm.elements.location.value = item.details?.location || '';
    photoForm.elements.sortOrder.value = item.sortOrder;
    photoForm.elements.equipment.value = item.details?.equipment || '';
    photoForm.elements.parameters.value = item.details?.parameters || '';
    photoForm.elements.process.value = item.details?.process || '';
    photoForm.elements.story.value = item.details?.story || '';
    photoForm.elements.notes.value = item.details?.notes || '';
    photoForm.elements.featured.checked = Boolean(item.featured);
    photoForm.elements.status.value = item.status;
    $('[data-photo-preview]').src = item.previewSrc;
    $('[data-photo-preview-message]').textContent = `${item.width} × ${item.height} / 选择新图片可替换`;
    $('[data-photo-file]').textContent = '保留现有图片；选择新文件可替换';
    $('[data-photo-form-title]').textContent = `编辑 / ${item.title}`;
    $('[data-delete-photo]').hidden = false;
    suppressDraftSave = false;
    if (scroll) photoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPhotos() {
    const query = $('[data-photo-search]').value.trim().toLowerCase();
    const category = $('[data-photo-category]').value;
    const status = $('[data-photo-status]').value;
    const items = repoState.gallery.items
      .filter(item => (!query || item.title.toLowerCase().includes(query))
        && (category === 'all' || item.category === category)
        && (status === 'all' || item.status === status))
      .sort((a, b) => {
        const categoryDelta = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
        return categoryDelta || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
      });
    $('[data-photo-count]').textContent = `${items.length} / ${repoState.gallery.items.length}`;
    $('[data-photo-list]').innerHTML = items.length ? items.map(item => `
      <article class="manager-card ${item.status === 'hidden' ? 'is-hidden' : ''}" data-photo-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.thumbnailSrc || item.previewSrc)}" alt="" loading="lazy" decoding="async">
        <div><h3>${escapeHtml(item.title)}${item.featured ? ' · 精选' : ''}</h3><p><span class="status">${item.status === 'published' ? '已发布' : '已隐藏'}</span> / ${categoryLabels[item.category]} / 排序 ${item.sortOrder}</p></div>
        <button type="button" data-edit-photo>编辑</button>
      </article>`).join('') : '<p>没有符合条件的作品</p>';
  }

  function resetVideoForm({ clearStoredDraft = true } = {}) {
    suppressDraftSave = true;
    videoForm.reset();
    videoForm.elements.recordId.value = '';
    videoForm.elements.existingPosterUrl.value = '';
    videoForm.elements.existingPosterPreviewUrl.value = '';
    videoForm.elements.sortOrder.value = Math.max(0, ...repoState.videos.items.map(item => item.sortOrder || 0)) + 1;
    videoForm.elements.aspectRatio.value = '1.7778';
    videoForm.elements.status.value = 'published';
    preparedPoster = null;
    revokePreview('poster');
    $('[data-poster-preview]').removeAttribute('src');
    $('[data-poster-preview-message]').textContent = '封面预览';
    $('[data-poster-file]').textContent = '尚未选择封面';
    $('[data-video-form-title]').textContent = '新增影像';
    $('[data-delete-video]').hidden = true;
    setMessage($('[data-video-message]'), '');
    suppressDraftSave = false;
    if (clearStoredDraft) clearDraft('video');
  }

  function editVideo(item, { clearStoredDraft = true, scroll = true } = {}) {
    resetVideoForm({ clearStoredDraft });
    suppressDraftSave = true;
    videoForm.elements.recordId.value = item.id;
    videoForm.elements.existingPosterUrl.value = item.posterUrl;
    videoForm.elements.existingPosterPreviewUrl.value = item.posterPreviewUrl || item.posterUrl;
    videoForm.elements.videoUrl.value = item.videoUrl;
    videoForm.elements.title.value = item.title;
    videoForm.elements.category.value = item.category;
    videoForm.elements.summary.value = item.summary || '';
    videoForm.elements.date.value = item.date || '';
    videoForm.elements.location.value = item.location || '';
    videoForm.elements.sortOrder.value = item.sortOrder;
    videoForm.elements.duration.value = item.duration;
    videoForm.elements.aspectRatio.value = item.aspectRatio || 16 / 9;
    videoForm.elements.status.value = item.status;
    $('[data-poster-preview]').src = item.posterPreviewUrl || item.posterUrl;
    $('[data-poster-file]').textContent = '保留现有封面；选择新文件可替换';
    $('[data-video-form-title]').textContent = `编辑 / ${item.title}`;
    $('[data-delete-video]').hidden = false;
    suppressDraftSave = false;
    if (scroll) videoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderVideos() {
    const items = repoState.videos.items.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    $('[data-video-count]').textContent = items.length;
    $('[data-video-list]').innerHTML = items.length ? items.map(item => `
      <article class="manager-card ${item.status === 'draft' ? 'is-hidden' : ''}" data-video-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.posterPreviewUrl || item.posterUrl)}" alt="" loading="lazy" decoding="async">
        <div><h3>${escapeHtml(item.title)}</h3><p><span class="status">${item.status === 'published' ? '已发布' : '草稿'}</span> / ${escapeHtml(item.category)} / 排序 ${item.sortOrder}</p></div>
        <button type="button" data-edit-video>编辑</button>
      </article>`).join('') : '<p>暂无影像</p>';
  }

  function renderAll() {
    renderPhotos();
    renderVideos();
  }

  function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  function isCmsPhotoPath(path) {
    return /^assets\/gallery\/(uploads|previews\/uploads|thumbnails\/uploads)\//.test(path);
  }

  function isReferencedOutsideGallery(path) {
    return [repoState.index, repoState.style, repoState.script, JSON.stringify(repoState.videos)].some(source => source.includes(path));
  }

  function isReferencedByOtherPhoto(path, gallery, exceptId) {
    return gallery.items.some(item => item.id !== exceptId
      && (item.src === path || item.previewSrc === path || item.thumbnailSrc === path));
  }

  function isReferencedByOtherVideo(path, videos, exceptId) {
    return videos.items.some(item => item.id !== exceptId && (item.posterUrl === path || item.posterPreviewUrl === path));
  }

  async function confirmPermanent(title) {
    $('[data-confirm-message]').textContent = `“${title}”将从当前网站和仓库中移除。Git 历史仍可用于恢复。`;
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
    return new Promise(resolve => {
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'confirm'), { once: true });
    });
  }

  photoForm.elements.image.addEventListener('change', async () => {
    const file = photoForm.elements.image.files[0];
    if (!file) return;
    markDraftDirty('photo');
    setMessage($('[data-photo-message]'), '正在生成网页图片');
    try {
      preparedPhoto = await preparePhotoFile(file);
      markDraftDirty('photo');
      revokePreview('photo');
      photoPreviewUrl = URL.createObjectURL(preparedPhoto.displayBlob);
      $('[data-photo-preview]').src = photoPreviewUrl;
      $('[data-photo-preview-message]').textContent = `${preparedPhoto.width} × ${preparedPhoto.height} / 展示图与预览图已生成`;
      $('[data-photo-file]').textContent = `${file.name} / ${(file.size / 1024 / 1024).toFixed(1)} MB`;
      setMessage($('[data-photo-message]'), '图片已准备，原片不会上传');
    } catch (error) {
      preparedPhoto = null;
      photoForm.elements.image.value = '';
      setMessage($('[data-photo-message]'), formatError(error), true);
    }
  });

  videoForm.elements.poster.addEventListener('change', async () => {
    const file = videoForm.elements.poster.files[0];
    if (!file) return;
    markDraftDirty('video');
    setMessage($('[data-video-message]'), '正在生成 16:9 封面');
    try {
      preparedPoster = await preparePosterFile(file);
      markDraftDirty('video');
      revokePreview('poster');
      posterPreviewUrl = URL.createObjectURL(preparedPoster.posterBlob);
      $('[data-poster-preview]').src = posterPreviewUrl;
      $('[data-poster-file]').textContent = `${file.name} / 已生成 WebP`;
      setMessage($('[data-video-message]'), '封面已准备');
    } catch (error) {
      preparedPoster = null;
      videoForm.elements.poster.value = '';
      setMessage($('[data-video-message]'), formatError(error), true);
    }
  });

  photoForm.addEventListener('submit', async event => {
    event.preventDefault();
    const recordId = photoForm.elements.recordId.value;
    if (!recordId && !preparedPhoto) return setMessage($('[data-photo-message]'), '新增作品必须选择图片', true);
    const previous = repoState.gallery;
    const next = deepClone(previous);
    const files = [];
    const deletions = [];
    let item = next.items.find(candidate => candidate.id === recordId);
    if (!item) {
      const tentative = `${photoForm.elements.category.value}-${Date.now().toString(36)}`;
      item = {
        id: tentative,
        category: photoForm.elements.category.value,
        title: '',
        src: '',
        previewSrc: '',
        thumbnailSrc: '',
        width: 0,
        height: 0,
        featured: false,
        previewRotation: 0,
        status: 'published',
        sortOrder: 0,
        details: normalizeDetails(),
        updatedAt: '',
      };
      next.items.push(item);
    }
    const oldSrc = item.src;
    const oldPreview = item.previewSrc;
    const oldThumbnail = item.thumbnailSrc;
    item.title = photoForm.elements.title.value.trim();
    item.category = photoForm.elements.category.value;
    item.sortOrder = Number(photoForm.elements.sortOrder.value) || 0;
    item.status = photoForm.elements.status.value;
    item.featured = photoForm.elements.featured.checked && item.status === 'published';
    item.details = normalizeDetails({
      date: photoForm.elements.date.value,
      location: photoForm.elements.location.value,
      equipment: photoForm.elements.equipment.value,
      parameters: photoForm.elements.parameters.value,
      process: photoForm.elements.process.value,
      story: photoForm.elements.story.value,
      notes: photoForm.elements.notes.value,
    });
    item.updatedAt = new Date().toISOString();
    if (item.featured) {
      next.items.forEach(candidate => {
        if (candidate.id !== item.id && candidate.category === item.category) candidate.featured = false;
      });
    }
    if (preparedPhoto) {
      if (!recordId) item.id = `${item.category}-${Date.now().toString(36)}-${preparedPhoto.hash.slice(0, 6)}`;
      const base = `assets/gallery/uploads/${item.category}/${item.id}-${preparedPhoto.hash.slice(0, 12)}`;
      item.src = `${base}.webp`;
      item.previewSrc = `assets/gallery/previews/uploads/${item.category}/${item.id}-${preparedPhoto.hash.slice(0, 12)}.webp`;
      item.thumbnailSrc = `assets/gallery/thumbnails/uploads/${item.category}/${item.id}-${preparedPhoto.hash.slice(0, 12)}.webp`;
      item.width = preparedPhoto.width;
      item.height = preparedPhoto.height;
      item.previewRotation = 0;
      files.push(
        [item.src, preparedPhoto.displayBlob],
        [item.previewSrc, preparedPhoto.previewBlob],
        [item.thumbnailSrc, preparedPhoto.thumbnailBlob],
      );
      if (oldSrc && isCmsPhotoPath(oldSrc) && !isReferencedByOtherPhoto(oldSrc, next, item.id) && !isReferencedOutsideGallery(oldSrc)) deletions.push(oldSrc);
      if (oldPreview && isCmsPhotoPath(oldPreview) && !isReferencedByOtherPhoto(oldPreview, next, item.id) && !isReferencedOutsideGallery(oldPreview)) deletions.push(oldPreview);
      if (oldThumbnail && isCmsPhotoPath(oldThumbnail) && !isReferencedByOtherPhoto(oldThumbnail, next, item.id) && !isReferencedOutsideGallery(oldThumbnail)) deletions.push(oldThumbnail);
    }
    ensureFeatured(next);
    try {
      await updateChangedHeroes(previous, next, files, deletions, preparedPhoto && item.featured ? [item.category] : []);
      await publishChanges({
        gallery: next,
        files,
        deletions,
        message: `[studio] ${recordId ? '更新' : '新增'}摄影作品：${item.title}`,
        changed: 'gallery',
      });
      resetPhotoForm();
      setMessage($('[data-photo-message]'), '作品已提交，正在等待 Pages 上线');
    } catch (error) {
      setPublishState(formatError(error), 'error');
      setMessage($('[data-photo-message]'), formatError(error), true);
    }
  });

  videoForm.addEventListener('submit', async event => {
    event.preventDefault();
    const recordId = videoForm.elements.recordId.value;
    const next = deepClone(repoState.videos);
    const files = [];
    const deletions = [];
    let item = next.items.find(candidate => candidate.id === recordId);
    if (!item) {
      item = { id: '', createdAt: new Date().toISOString() };
      next.items.push(item);
    }
    const title = videoForm.elements.title.value.trim();
    if (!item.id) item.id = `${slug(title) || 'film'}-${Date.now().toString(36)}`;
    const oldPoster = item.posterUrl || '';
    const oldPosterPreview = item.posterPreviewUrl || '';
    item.title = title;
    item.category = videoForm.elements.category.value;
    item.summary = videoForm.elements.summary.value.trim();
    item.date = videoForm.elements.date.value;
    item.location = videoForm.elements.location.value.trim();
    item.videoUrl = videoForm.elements.videoUrl.value.trim();
    item.duration = Number(videoForm.elements.duration.value) || 0;
    item.aspectRatio = Number(videoForm.elements.aspectRatio.value) || 16 / 9;
    item.status = videoForm.elements.status.value;
    item.sortOrder = Number(videoForm.elements.sortOrder.value) || 0;
    item.updatedAt = new Date().toISOString();
    if (preparedPoster) {
      item.posterUrl = `assets/video-posters/uploads/${item.id}-${preparedPoster.hash.slice(0, 12)}.webp`;
      item.posterPreviewUrl = `assets/video-posters/previews/uploads/${item.id}-${preparedPoster.hash.slice(0, 12)}.webp`;
      files.push([item.posterUrl, preparedPoster.posterBlob], [item.posterPreviewUrl, preparedPoster.previewBlob]);
      if (/^assets\/video-posters\/uploads\//.test(oldPoster) && !isReferencedByOtherVideo(oldPoster, next, item.id)) deletions.push(oldPoster);
      if (/^assets\/video-posters\/previews\/uploads\//.test(oldPosterPreview) && !isReferencedByOtherVideo(oldPosterPreview, next, item.id)) deletions.push(oldPosterPreview);
    } else {
      item.posterUrl = oldPoster || videoForm.elements.existingPosterUrl.value;
      item.posterPreviewUrl = oldPosterPreview || videoForm.elements.existingPosterPreviewUrl.value || item.posterUrl;
    }
    if (!item.posterUrl) return setMessage($('[data-video-message]'), '新增影像必须选择封面', true);
    try {
      await publishChanges({
        videos: next,
        files,
        deletions,
        message: `[studio] ${recordId ? '更新' : '新增'}动态影像：${item.title}`,
        changed: 'videos',
      });
      resetVideoForm();
      setMessage($('[data-video-message]'), '影像资料已提交，正在等待 Pages 上线');
    } catch (error) {
      setPublishState(formatError(error), 'error');
      setMessage($('[data-video-message]'), formatError(error), true);
    }
  });

  $('[data-delete-photo]').addEventListener('click', async () => {
    const id = photoForm.elements.recordId.value;
    const current = repoState.gallery.items.find(item => item.id === id);
    if (!current || !(await confirmPermanent(current.title))) return;
    const previous = repoState.gallery;
    const next = deepClone(previous);
    next.items = next.items.filter(item => item.id !== id);
    ensureFeatured(next);
    const files = [];
    const deletions = [];
    for (const path of [current.src, current.previewSrc, current.thumbnailSrc]) {
      if (path && isCmsPhotoPath(path) && !isReferencedByOtherPhoto(path, next, current.id) && !isReferencedOutsideGallery(path)) deletions.push(path);
    }
    try {
      await updateChangedHeroes(previous, next, files, deletions);
      await publishChanges({
        gallery: next,
        files,
        deletions,
        message: `[studio] 永久删除摄影作品：${current.title}`,
        changed: 'gallery',
      });
      clearDraft('photo');
      resetPhotoForm();
    } catch (error) {
      setPublishState(formatError(error), 'error');
      setMessage($('[data-photo-message]'), formatError(error), true);
    }
  });

  $('[data-delete-video]').addEventListener('click', async () => {
    const id = videoForm.elements.recordId.value;
    const current = repoState.videos.items.find(item => item.id === id);
    if (!current || !(await confirmPermanent(current.title))) return;
    const next = deepClone(repoState.videos);
    next.items = next.items.filter(item => item.id !== id);
    const deletions = [current.posterUrl, current.posterPreviewUrl]
      .filter((path, index, values) => path && values.indexOf(path) === index)
      .filter(path => /^assets\/video-posters\/(previews\/)?uploads\//.test(path) && !isReferencedByOtherVideo(path, next, current.id));
    try {
      await publishChanges({
        videos: next,
        deletions,
        message: `[studio] 永久删除动态影像：${current.title}`,
        changed: 'videos',
      });
      clearDraft('video');
      resetVideoForm();
    } catch (error) {
      setPublishState(formatError(error), 'error');
      setMessage($('[data-video-message]'), formatError(error), true);
    }
  });

  $('[data-probe-video]').addEventListener('click', async () => {
    const url = videoForm.elements.videoUrl.value.trim();
    if (!url) return setMessage($('[data-video-message]'), '请先填写公开 MP4 地址', true);
    setMessage($('[data-video-message]'), '正在读取视频信息');
    try {
      const metadata = await new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const timer = setTimeout(() => reject(new Error('读取超时，请手动填写时长与画幅')), 15000);
        video.preload = 'metadata';
        video.crossOrigin = 'anonymous';
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve({ duration: video.duration, aspectRatio: video.videoWidth / video.videoHeight });
          video.removeAttribute('src');
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('该地址不允许跨域读取，请手动填写时长与画幅'));
        };
        video.src = url;
      });
      videoForm.elements.duration.value = metadata.duration.toFixed(3);
      videoForm.elements.aspectRatio.value = metadata.aspectRatio.toFixed(4);
      markDraftDirty('video');
      setMessage($('[data-video-message]'), '视频信息已读取');
    } catch (error) {
      setMessage($('[data-video-message]'), formatError(error), true);
    }
  });

  $('[data-photo-list]').addEventListener('click', event => {
    const card = event.target.closest('[data-photo-id]');
    if (card && event.target.matches('[data-edit-photo]')) editPhoto(repoState.gallery.items.find(item => item.id === card.dataset.photoId));
  });
  $('[data-video-list]').addEventListener('click', event => {
    const card = event.target.closest('[data-video-id]');
    if (card && event.target.matches('[data-edit-video]')) editVideo(repoState.videos.items.find(item => item.id === card.dataset.videoId));
  });

  for (const [kind, form] of [['photo', photoForm], ['video', videoForm]]) {
    const onDraftInput = event => {
      if (event.target.type !== 'file') markDraftDirty(kind);
    };
    form.addEventListener('input', onDraftInput);
    form.addEventListener('change', onDraftInput);
  }

  for (const kind of ['photo', 'video']) {
    $(`[data-${kind}-draft-restore]`).addEventListener('click', () => restoreDraft(kind));
    $(`[data-${kind}-draft-discard]`).addEventListener('click', () => clearDraft(kind));
  }

  window.addEventListener('beforeunload', event => {
    if (!publishing && !draftDirty.photo && !draftDirty.video) return;
    writeDraft('photo');
    writeDraft('video');
    event.preventDefault();
    event.returnValue = '';
  });

  $$('[data-studio-tab]').forEach(tab => tab.addEventListener('click', () => {
    $$('[data-studio-tab]').forEach(button => button.classList.toggle('is-active', button === tab));
    $$('[data-studio-panel]').forEach(panel => {
      const active = panel.dataset.studioPanel === tab.dataset.studioTab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  }));
  $('[data-photo-search]').addEventListener('input', renderPhotos);
  $('[data-photo-category]').addEventListener('change', renderPhotos);
  $('[data-photo-status]').addEventListener('change', renderPhotos);
  $('[data-new-photo]').addEventListener('click', () => { resetPhotoForm(); photoForm.scrollIntoView({ behavior: 'smooth' }); });
  $('[data-new-video]').addEventListener('click', () => { resetVideoForm(); videoForm.scrollIntoView({ behavior: 'smooth' }); });
  $('[data-reset-photo]').addEventListener('click', resetPhotoForm);
  $('[data-reset-video]').addEventListener('click', resetVideoForm);
  $$('[data-refresh-content]').forEach(button => button.addEventListener('click', async () => {
    try { await loadRepositoryContent(); } catch (error) { setPublishState(formatError(error), 'error'); }
  }));

  $('[data-login-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage($('[data-login-message]'), '正在登录');
    try {
      await signIn(form.username.value.trim(), form.password.value);
      form.reset();
      await showDashboard();
    } catch (error) {
      setMessage($('[data-login-message]'), formatError(error), true);
    }
  });

  signOutButton.addEventListener('click', async () => {
    clearDraft('photo');
    clearDraft('video');
    repoState = null;
    publisher.hidden = true;
    await auth.signOut();
    dashboard.hidden = true;
    signOutButton.hidden = true;
    loginPanel.hidden = false;
  });

  async function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
    publisher.hidden = false;
    try {
      await loadRepositoryContent();
      resetPhotoForm({ clearStoredDraft: false });
      resetVideoForm({ clearStoredDraft: false });
      showDraftNotice('photo');
      showDraftNotice('video');
    } catch (error) {
      setPublishState(formatError(error), 'error');
    }
  }

  async function initialize() {
    if (!config.envId || !window.cloudbase) {
      setupPanel.hidden = false;
      return;
    }
    try {
      app = window.cloudbase.init(cloudOptions());
      auth = app.auth({ persistence: 'local' });
      if (await currentUser()) await showDashboard();
      else loginPanel.hidden = false;
    } catch (error) {
      setupPanel.hidden = false;
      $('p', setupPanel).textContent = `CloudBase 初始化失败：${formatError(error)}`;
    }
  }

  initialize();
})();
