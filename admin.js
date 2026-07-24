(() => {
  'use strict';

  const $ = (selector, root = document) => root?.querySelector(selector);
  const $$ = (selector, root = document) => [...(root?.querySelectorAll(selector) || [])];
  const config = window.PLUTONOC_CLOUDBASE || {};
  const repository = { owner: 'plutonoc633-lgtm', name: 'plutonoc-astronomy', branch: 'main' };
  const tokenKey = 'plutonoc.github.token';
  const apiVersion = '2022-11-28';
  const detailKeys = ['date', 'location', 'equipment', 'parameters', 'process', 'story', 'notes'];
  const categoryOrder = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
  const categoryLabels = { deepsky: '深空', sunmoon: '日月', planet: '行星', nightscape: '星野', earth: '大地' };
  const setupPanel = $('[data-setup]');
  const loginPanel = $('[data-login]');
  const dashboard = $('[data-dashboard]');
  const publisher = $('[data-publisher]');
  const githubConnect = $('[data-github-connect]');
  const signOutButton = $('[data-sign-out]');
  const disconnectButton = $('[data-disconnect]');
  const githubState = $('[data-github-state]');
  const publishState = $('[data-publish-state]');
  const photoForm = $('[data-photo-form]');
  const videoForm = $('[data-video-form]');
  const confirmDialog = $('[data-confirm-dialog]');
  let app;
  let auth;
  let repoState = null;
  let githubToken = '';
  let preparedPhoto = null;
  let preparedPoster = null;
  let photoPreviewUrl = '';
  let posterPreviewUrl = '';
  let publishing = false;

  function setMessage(target, text, isError = false) {
    if (!target) return;
    target.textContent = text;
    target.classList.toggle('is-error', isError);
  }

  function setPublishState(text, state = '') {
    publishState.textContent = text;
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
    if (/bad credentials|401|token/i.test(detail)) return 'GitHub 令牌无效或已过期';
    if (/403|permission|forbidden|denied|unauthorized/i.test(detail)) return '权限不足，请确认令牌只授权本仓库且 Contents 为可读写';
    if (/409|422|conflict|reference update failed/i.test(detail)) return '远端内容已变化。你的表单仍保留，请刷新内容后再发布';
    if (/password|credential|login|auth/i.test(detail)) return '登录失败，请检查账号和密码';
    if (/network|fetch/i.test(detail)) return '网络请求失败，请检查连接后重试';
    return detail;
  }

  async function githubRequest(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': apiVersion,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch {}
      throw new Error(`${response.status} ${detail || response.statusText}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function decodeGithubText(content) {
    const binary = atob(content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  async function readRepositoryText(path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const result = await githubRequest(`/repos/${repository.owner}/${repository.name}/contents/${encodedPath}?ref=${repository.branch}`);
    return decodeGithubText(result.content);
  }

  async function loadRepositoryContent() {
    setPublishState('正在读取 GitHub 内容', 'working');
    const reference = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/ref/heads/${repository.branch}`);
    const headSha = reference.object.sha;
    const commit = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/commits/${headSha}`);
    const [galleryText, videosText, index, style, script] = await Promise.all([
      readRepositoryText('content/gallery.json'),
      readRepositoryText('content/videos.json'),
      readRepositoryText('index.html'),
      readRepositoryText('style.css'),
      readRepositoryText('script.js'),
    ]);
    const gallery = JSON.parse(galleryText);
    const videos = JSON.parse(videosText);
    validateGallery(gallery);
    validateVideos(videos);
    repoState = {
      headSha,
      treeSha: commit.tree.sha,
      gallery,
      videos,
      index,
      style,
      script,
    };
    renderAll();
    setPublishState(`内容已连接 / ${gallery.items.length} 张照片 / ${videos.items.length} 条影像`, 'success');
  }

  async function connectGithub(token) {
    githubToken = token.trim();
    if (!githubToken) throw new Error('请输入 GitHub 令牌');
    const repo = await githubRequest(`/repos/${repository.owner}/${repository.name}`);
    if (repo.full_name?.toLowerCase() !== `${repository.owner}/${repository.name}`.toLowerCase()) throw new Error('仓库验证失败');
    if (!repo.permissions?.push) throw new Error('令牌缺少该仓库的 Contents: Read and write 权限');
    await loadRepositoryContent();
    sessionStorage.setItem(tokenKey, githubToken);
    githubConnect.hidden = true;
    publisher.hidden = false;
    disconnectButton.hidden = false;
    githubState.hidden = false;
    githubState.textContent = 'GitHub 已连接';
  }

  function disconnectGithub() {
    sessionStorage.removeItem(tokenKey);
    githubToken = '';
    repoState = null;
    publisher.hidden = true;
    githubConnect.hidden = false;
    disconnectButton.hidden = true;
    githubState.hidden = true;
    $('[data-github-form]').reset();
    setMessage($('[data-github-message]'), '');
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

  function galleryRuntime(data) {
    const items = data.items
      .filter(item => item.status === 'published')
      .sort((a, b) => {
        const categoryDelta = (data.categoryConfig[a.category]?.order || 99) - (data.categoryConfig[b.category]?.order || 99);
        return categoryDelta || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
      })
      .map(item => ({
        id: item.id,
        category: item.category,
        title: item.title,
        src: item.src,
        previewSrc: item.previewSrc,
        width: item.width,
        height: item.height,
        featured: Boolean(item.featured),
        previewRotation: Number(item.previewRotation) || 0,
        details: normalizeDetails(item.details),
      }));
    return `window.categoryConfig=${JSON.stringify(data.categoryConfig)};\nwindow.galleryData=${JSON.stringify(items)};\n`;
  }

  function videoRuntime(data) {
    const items = data.items
      .filter(item => item.status === 'published')
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map(item => ({
        id: item.id,
        title: item.title,
        category: item.category,
        summary: item.summary || '',
        date: item.date || '',
        location: item.location || '',
        videoUrl: item.videoUrl,
        posterUrl: item.posterUrl,
        duration: Number(item.duration) || 0,
        aspectRatio: Number(item.aspectRatio) || 16 / 9,
        status: item.status,
        sortOrder: item.sortOrder,
      }));
    return `window.localVideoData=${JSON.stringify(items)};\n`;
  }

  function validateGallery(data) {
    const ids = new Set();
    const featured = new Map();
    if (data?.version !== 1 || !data.categoryConfig || !Array.isArray(data.items)) throw new Error('摄影数据格式无效');
    data.items.forEach(item => {
      if (!item.id || ids.has(item.id)) throw new Error(`摄影作品 ID 重复：${item.id || '空'}`);
      if (!data.categoryConfig[item.category]) throw new Error(`摄影分类无效：${item.title}`);
      if (!item.title || !item.src || !item.previewSrc) throw new Error(`摄影资料不完整：${item.title || item.id}`);
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
    let body;
    if (content instanceof Blob) {
      body = { content: bytesToBase64(new Uint8Array(await content.arrayBuffer())), encoding: 'base64' };
    } else {
      body = { content: String(content), encoding: 'utf-8' };
    }
    const result = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { path, mode: '100644', type: 'blob', sha: result.sha };
  }

  async function publishChanges({ gallery, videos, files = [], deletions = [], message, changed }) {
    if (publishing) throw new Error('已有内容正在发布');
    publishing = true;
    $$('.content-form button').forEach(button => { button.disabled = true; });
    try {
      const liveReference = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/ref/heads/${repository.branch}`);
      if (liveReference.object.sha !== repoState.headSha) throw new Error('conflict: remote head changed');
      const version = contentVersion();
      const nextGallery = gallery || deepClone(repoState.gallery);
      const nextVideos = videos || deepClone(repoState.videos);
      if (changed === 'gallery') nextGallery.contentVersion = version;
      if (changed === 'videos') nextVideos.contentVersion = version;
      validateGallery(nextGallery);
      validateVideos(nextVideos);
      let nextIndex = repoState.index;
      if (changed === 'gallery') nextIndex = nextIndex.replace(/gallery-data\.js\?v=[^"]+/g, `gallery-data.js?v=${version}`);
      if (changed === 'videos') nextIndex = nextIndex.replace(/video-data\.js\?v=[^"]+/g, `video-data.js?v=${version}`);

      setPublishState('正在准备原子提交', 'working');
      const textFiles = [
        ['content/gallery.json', `${JSON.stringify(nextGallery, null, 2)}\n`],
        ['content/videos.json', `${JSON.stringify(nextVideos, null, 2)}\n`],
        ['gallery-data.js', galleryRuntime(nextGallery)],
        ['video-data.js', videoRuntime(nextVideos)],
        ['index.html', nextIndex],
      ];
      const uniqueFiles = new Map([...textFiles, ...files].map(([path, content]) => [path, content]));
      const treeEntries = [];
      let completed = 0;
      for (const [path, content] of uniqueFiles) {
        treeEntries.push(await createBlob(path, content));
        completed += 1;
        setPublishState(`正在上传内容 ${completed} / ${uniqueFiles.size}`, 'working');
      }
      [...new Set(deletions)].filter(path => path && !uniqueFiles.has(path)).forEach(path => {
        treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
      });
      const tree = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ base_tree: repoState.treeSha, tree: treeEntries }),
      });
      const commit = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [repoState.headSha] }),
      });
      await githubRequest(`/repos/${repository.owner}/${repository.name}/git/refs/heads/${repository.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      repoState = {
        ...repoState,
        headSha: commit.sha,
        treeSha: tree.sha,
        gallery: nextGallery,
        videos: nextVideos,
        index: nextIndex,
      };
      renderAll();
      setPublishState(`已提交 ${commit.sha.slice(0, 7)}，等待 Pages 部署`, 'working');
      pollDeployment(version, changed);
      return commit.sha;
    } finally {
      publishing = false;
      $$('.content-form button').forEach(button => { button.disabled = false; });
    }
  }

  async function pollDeployment(version, changed) {
    const marker = changed === 'gallery' ? `gallery-data.js?v=${version}` : `video-data.js?v=${version}`;
    const started = Date.now();
    while (Date.now() - started < 180000) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      try {
        const response = await fetch(`index.html?studio-check=${Date.now()}`, { cache: 'no-store' });
        if (response.ok && (await response.text()).includes(marker)) {
          setPublishState('Pages 已部署，内容已上线', 'success');
          return;
        }
      } catch {}
    }
    setPublishState('提交已完成，Pages 仍在部署；可稍后刷新网站检查', 'working');
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

  async function renderImage(source, maxEdge, quality, cropRatio = 0) {
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
    const width = Math.max(1, Math.round(cropWidth * scale));
    const height = Math.max(1, Math.round(cropHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d', { alpha: true }).drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
    return { blob: await canvasBlob(canvas, 'image/webp', quality), width, height };
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
    image.close?.();
    const hash = await sha256(display.blob);
    return { displayBlob: display.blob, previewBlob: preview.blob, width: display.width, height: display.height, hash };
  }

  async function preparePosterFile(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('只接受 JPEG、PNG 或 WebP 封面');
    const image = await decodeImage(file);
    const poster = await renderImage(image, 1920, .9, 16 / 9);
    image.close?.();
    return { blob: poster.blob, hash: await sha256(poster.blob) };
  }

  async function heroFromBlob(blob) {
    const image = await decodeImage(blob);
    const hero = await renderImage(image, 2560, .9);
    image.close?.();
    return { blob: hero.blob, hash: await sha256(hero.blob) };
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
      const heroPath = `assets/gallery/hero/${category}-${hero.hash.slice(0, 12)}.webp`;
      files.push([heroPath, hero.blob]);
      const oldHero = next.categoryConfig[category].homeCover;
      next.categoryConfig[category].homeCover = heroPath;
      if (/^assets\/gallery\/hero\/[^/]+-[a-f0-9]{12}\.webp$/.test(oldHero)) deletions.push(oldHero);
    }
  }

  function revokePreview(type) {
    if (type === 'photo' && photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    if (type === 'poster' && posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl);
    if (type === 'photo') photoPreviewUrl = '';
    if (type === 'poster') posterPreviewUrl = '';
  }

  function resetPhotoForm() {
    photoForm.reset();
    photoForm.elements.recordId.value = '';
    photoForm.elements.existingSrc.value = '';
    photoForm.elements.existingPreviewSrc.value = '';
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
  }

  function editPhoto(item) {
    resetPhotoForm();
    photoForm.elements.recordId.value = item.id;
    photoForm.elements.existingSrc.value = item.src;
    photoForm.elements.existingPreviewSrc.value = item.previewSrc;
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
    photoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        <img src="${escapeHtml(item.previewSrc)}" alt="" loading="lazy" decoding="async">
        <div><h3>${escapeHtml(item.title)}${item.featured ? ' · 精选' : ''}</h3><p><span class="status">${item.status === 'published' ? '已发布' : '已隐藏'}</span> / ${categoryLabels[item.category]} / 排序 ${item.sortOrder}</p></div>
        <button type="button" data-edit-photo>编辑</button>
      </article>`).join('') : '<p>没有符合条件的作品</p>';
  }

  function resetVideoForm() {
    videoForm.reset();
    videoForm.elements.recordId.value = '';
    videoForm.elements.existingPosterUrl.value = '';
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
  }

  function editVideo(item) {
    resetVideoForm();
    videoForm.elements.recordId.value = item.id;
    videoForm.elements.existingPosterUrl.value = item.posterUrl;
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
    $('[data-poster-preview]').src = item.posterUrl;
    $('[data-poster-file]').textContent = '保留现有封面；选择新文件可替换';
    $('[data-video-form-title]').textContent = `编辑 / ${item.title}`;
    $('[data-delete-video]').hidden = false;
    videoForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderVideos() {
    const items = repoState.videos.items.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    $('[data-video-count]').textContent = items.length;
    $('[data-video-list]').innerHTML = items.length ? items.map(item => `
      <article class="manager-card ${item.status === 'draft' ? 'is-hidden' : ''}" data-video-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.posterUrl)}" alt="" loading="lazy" decoding="async">
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
    return /^assets\/gallery\/(uploads|previews\/uploads)\//.test(path);
  }

  function isReferencedOutsideGallery(path) {
    return [repoState.index, repoState.style, repoState.script, JSON.stringify(repoState.videos)].some(source => source.includes(path));
  }

  function isReferencedByOtherPhoto(path, gallery, exceptId) {
    return gallery.items.some(item => item.id !== exceptId && (item.src === path || item.previewSrc === path));
  }

  function isReferencedByOtherVideo(path, videos, exceptId) {
    return videos.items.some(item => item.id !== exceptId && item.posterUrl === path);
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
    setMessage($('[data-photo-message]'), '正在生成网页图片');
    try {
      preparedPhoto = await preparePhotoFile(file);
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
    setMessage($('[data-video-message]'), '正在生成 16:9 封面');
    try {
      preparedPoster = await preparePosterFile(file);
      revokePreview('poster');
      posterPreviewUrl = URL.createObjectURL(preparedPoster.blob);
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
      item.width = preparedPhoto.width;
      item.height = preparedPhoto.height;
      item.previewRotation = 0;
      files.push([item.src, preparedPhoto.displayBlob], [item.previewSrc, preparedPhoto.previewBlob]);
      if (oldSrc && isCmsPhotoPath(oldSrc) && !isReferencedByOtherPhoto(oldSrc, next, item.id) && !isReferencedOutsideGallery(oldSrc)) deletions.push(oldSrc);
      if (oldPreview && isCmsPhotoPath(oldPreview) && !isReferencedByOtherPhoto(oldPreview, next, item.id) && !isReferencedOutsideGallery(oldPreview)) deletions.push(oldPreview);
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
      files.push([item.posterUrl, preparedPoster.blob]);
      if (/^assets\/video-posters\/uploads\//.test(oldPoster) && !isReferencedByOtherVideo(oldPoster, next, item.id)) deletions.push(oldPoster);
    } else {
      item.posterUrl = oldPoster || videoForm.elements.existingPosterUrl.value;
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
    for (const path of [current.src, current.previewSrc]) {
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
    const deletions = /^assets\/video-posters\/uploads\//.test(current.posterUrl) && !isReferencedByOtherVideo(current.posterUrl, next, current.id)
      ? [current.posterUrl]
      : [];
    try {
      await publishChanges({
        videos: next,
        deletions,
        message: `[studio] 永久删除动态影像：${current.title}`,
        changed: 'videos',
      });
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

  $('[data-github-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage($('[data-github-message]'), '正在验证并读取内容');
    form.querySelector('button').disabled = true;
    try {
      await connectGithub(form.token.value);
      form.reset();
    } catch (error) {
      githubToken = '';
      sessionStorage.removeItem(tokenKey);
      setMessage($('[data-github-message]'), formatError(error), true);
    } finally {
      form.querySelector('button').disabled = false;
    }
  });

  $('[data-login-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage($('[data-login-message]'), '正在登录');
    try {
      await signIn(form.username.value.trim(), form.password.value);
      form.reset();
      showDashboard();
    } catch (error) {
      setMessage($('[data-login-message]'), formatError(error), true);
    }
  });

  disconnectButton.addEventListener('click', disconnectGithub);
  signOutButton.addEventListener('click', async () => {
    disconnectGithub();
    await auth.signOut();
    dashboard.hidden = true;
    signOutButton.hidden = true;
    loginPanel.hidden = false;
  });

  async function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
    const savedToken = sessionStorage.getItem(tokenKey) || '';
    if (savedToken) {
      try {
        await connectGithub(savedToken);
        resetPhotoForm();
        resetVideoForm();
        return;
      } catch {
        disconnectGithub();
      }
    }
    githubConnect.hidden = false;
    publisher.hidden = true;
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
