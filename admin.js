(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const config = window.PLUTONOC_CLOUDBASE || {};
  const setupPanel = $('[data-setup]');
  const loginPanel = $('[data-login]');
  const dashboard = $('[data-dashboard]');
  const signOutButton = $('[data-sign-out]');
  const form = $('[data-video-form]');
  const canvas = $('[data-poster-canvas]');
  const canvasContext = canvas.getContext('2d');
  const maxVideoSize = 1024 * 1024 * 1024;
  let app;
  let auth;
  let database;
  let records = [];
  let generatedPoster = null;

  function message(target, text, isError = false) {
    target.textContent = text;
    target.style.color = isError ? '#cf6e61' : '#9fba87';
  }

  function setProgress(percent, label) {
    const progress = $('[data-progress]');
    progress.hidden = false;
    $('i', progress).style.width = `${Math.max(0, Math.min(100, percent))}%`;
    $('span', progress).textContent = label;
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
    if (username.includes('@') && typeof auth.signInWithEmailAndPassword === 'function') return auth.signInWithEmailAndPassword(username, password);
    return auth.signInWithUsernameAndPassword(username, password);
  }

  async function resolveUrls(fileIds) {
    const uniqueIds = [...new Set(fileIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map();
    const result = await app.getTempFileURL({ fileList: uniqueIds });
    return new Map((result.fileList || []).map(item => [item.fileID, item.tempFileURL || item.download_url]));
  }

  function formatError(error) {
    const detail = error?.message || error?.error_description || error?.code || String(error);
    if (/password|credential|login|auth/i.test(detail)) return '登录失败，请检查账号、密码和 CloudBase 登录方式';
    if (/permission|denied|unauthorized/i.test(detail)) return '权限不足，请检查数据库与云存储安全规则';
    return detail;
  }

  async function uploadFile(file, cloudPath, startPercent, endPercent) {
    const task = app.uploadFile({ cloudPath, filePath: file });
    if (typeof task.onProgressUpdate === 'function') {
      task.onProgressUpdate(progress => {
        const ratio = progress.totalBytesSent / progress.totalBytesExpectedToSend;
        setProgress(startPercent + ratio * (endPercent - startPercent), `上传中 ${Math.round(ratio * 100)}%`);
      });
    } else {
      setProgress(startPercent, '正在上传');
    }
    return task;
  }

  function safeFileName(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  }

  function videoMetadata(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(Math.max(duration * 0.12, 0.1), Math.max(duration - 0.1, 0.1));
      };
      video.onseeked = () => {
        const sourceWidth = video.videoWidth || 1600;
        const sourceHeight = video.videoHeight || 900;
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        canvasContext.drawImage(video, 0, 0, sourceWidth, sourceHeight);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('无法从视频生成封面'));
          generatedPoster = new File([blob], 'poster.jpg', { type: 'image/jpeg' });
          $('[data-poster-message]').textContent = `已自动截取封面 / ${sourceWidth} × ${sourceHeight}`;
          resolve({ duration, aspectRatio: sourceWidth / sourceHeight });
        }, 'image/jpeg', 0.88);
      };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('浏览器无法读取此 MP4，请确认编码为 H.264 + AAC')); };
      video.src = url;
    });
  }

  function drawPosterFile(file) {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvasContext.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      $('[data-poster-message]').textContent = `自定义封面 / ${image.naturalWidth} × ${image.naturalHeight}`;
    };
    image.src = url;
  }

  function resetForm() {
    form.reset();
    form.recordId.value = '';
    form.existingVideoFileId.value = '';
    form.existingPosterFileId.value = '';
    generatedPoster = null;
    canvas.width = 1600;
    canvas.height = 900;
    canvasContext.fillStyle = '#050505';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    $('[data-video-file]').textContent = '尚未选择文件';
    $('[data-poster-message]').textContent = '选择视频后生成封面预览';
    $('[data-progress]').hidden = true;
    $('[data-form-message]').textContent = '';
  }

  async function loadRecords() {
    const container = $('[data-manager-list]');
    container.innerHTML = '<p>正在读取</p>';
    try {
      const result = await database.collection(config.collection || 'videos').orderBy('sortOrder', 'asc').get();
      records = result.data || [];
      const urls = await resolveUrls(records.map(record => record.posterFileId));
      if (!records.length) {
        container.innerHTML = '<p>还没有云端影像，上传第一条即可开始。</p>';
        return;
      }
      container.innerHTML = records.map((record, index) => `<article class="manager-card" data-record-index="${index}">
        <img src="${urls.get(record.posterFileId) || 'assets/gallery/planetary/planetary-02.jpg'}" alt="">
        <div><h3>${record.title || '未命名影像'}</h3><p><span class="status">${record.status === 'published' ? '已发布' : '草稿'}</span> / ${record.category || '未分类'} / 排序 ${record.sortOrder ?? 0}</p></div>
        <div><button type="button" data-edit>编辑</button><button type="button" data-delete>删除</button></div>
      </article>`).join('');
    } catch (error) {
      container.innerHTML = `<p>${formatError(error)}</p>`;
    }
  }

  function editRecord(record) {
    form.recordId.value = record._id || record.id;
    form.existingVideoFileId.value = record.videoFileId || '';
    form.existingPosterFileId.value = record.posterFileId || '';
    form.title.value = record.title || '';
    form.category.value = record.category || '其他';
    form.summary.value = record.summary || '';
    form.date.value = typeof record.date === 'string' ? record.date.slice(0, 10) : '';
    form.location.value = record.location || '';
    form.sortOrder.value = record.sortOrder ?? 0;
    $('[data-video-file]').textContent = '保留现有视频；选择新文件可替换';
    window.scrollTo({ top: form.offsetTop - 30, behavior: 'smooth' });
  }

  async function deleteRecord(record) {
    if (!window.confirm(`确定删除“${record.title}”及其云端文件吗？此操作不可恢复。`)) return;
    try {
      await database.collection(config.collection || 'videos').doc(record._id || record.id).remove();
      const fileList = [record.videoFileId, record.posterFileId].filter(Boolean);
      if (fileList.length && typeof app.deleteFile === 'function') await app.deleteFile({ fileList });
      await loadRecords();
    } catch (error) {
      window.alert(formatError(error));
    }
  }

  $('[data-manager-list]').addEventListener('click', event => {
    const card = event.target.closest('.manager-card');
    if (!card) return;
    const record = records[Number(card.dataset.recordIndex)];
    if (event.target.matches('[data-edit]')) editRecord(record);
    if (event.target.matches('[data-delete]')) deleteRecord(record);
  });

  form.video.addEventListener('change', async () => {
    const file = form.video.files[0];
    if (!file) return;
    $('[data-video-file]').textContent = `${file.name} / ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    try {
      if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) throw new Error('只接受 MP4 文件');
      if (file.size > maxVideoSize) throw new Error('视频超过 1 GB，请压缩后重试');
      await videoMetadata(file);
      message($('[data-form-message]'), '视频可以读取，封面已生成');
    } catch (error) {
      message($('[data-form-message]'), error.message, true);
      form.video.value = '';
    }
  });
  form.poster.addEventListener('change', () => {
    const file = form.poster.files[0];
    if (file) drawPosterFile(file);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const intent = event.submitter?.value || 'draft';
    const videoFile = form.video.files[0];
    const customPoster = form.poster.files[0];
    const recordId = form.recordId.value;
    if (!videoFile && !form.existingVideoFileId.value) return message($('[data-form-message]'), '请选择 MP4 视频文件', true);
    const submitButtons = [...form.querySelectorAll('button')];
    submitButtons.forEach(button => button.disabled = true);
    try {
      let videoFileId = form.existingVideoFileId.value;
      let posterFileId = form.existingPosterFileId.value;
      const existingRecord = records.find(record => (record._id || record.id) === recordId);
      let duration = existingRecord?.duration || 0;
      let aspectRatio = existingRecord?.aspectRatio || 16 / 9;
      if (videoFile) {
        const metadata = await videoMetadata(videoFile);
        duration = metadata.duration;
        aspectRatio = metadata.aspectRatio;
        const result = await uploadFile(videoFile, `videos/${safeFileName(videoFile.name)}`, 0, 80);
        videoFileId = result.fileID;
      }
      const posterFile = customPoster || generatedPoster;
      if (posterFile) {
        const result = await uploadFile(posterFile, `video-posters/${safeFileName(posterFile.name || 'poster.jpg')}`, 80, 96);
        posterFileId = result.fileID;
      }
      const now = new Date().toISOString();
      const data = {
        title: form.title.value.trim(), summary: form.summary.value.trim(), date: form.date.value,
        location: form.location.value.trim(), category: form.category.value, videoFileId, posterFileId,
        duration, aspectRatio, status: intent, sortOrder: Number(form.sortOrder.value) || 0, updatedAt: now
      };
      setProgress(97, '正在保存资料');
      if (recordId) {
        await database.collection(config.collection || 'videos').doc(recordId).update(data);
      } else {
        data.createdAt = now;
        await database.collection(config.collection || 'videos').add(data);
      }
      const obsoleteFiles = [];
      if (videoFile && form.existingVideoFileId.value && form.existingVideoFileId.value !== videoFileId) obsoleteFiles.push(form.existingVideoFileId.value);
      if (posterFile && form.existingPosterFileId.value && form.existingPosterFileId.value !== posterFileId) obsoleteFiles.push(form.existingPosterFileId.value);
      if (obsoleteFiles.length && typeof app.deleteFile === 'function') {
        try { await app.deleteFile({ fileList: obsoleteFiles }); } catch (cleanupError) { console.warn('Old files could not be removed.', cleanupError); }
      }
      setProgress(100, intent === 'published' ? '发布完成' : '草稿已保存');
      message($('[data-form-message]'), intent === 'published' ? '影像已发布到网站' : '草稿已保存');
      await loadRecords();
      window.setTimeout(resetForm, 1200);
    } catch (error) {
      message($('[data-form-message]'), formatError(error), true);
      setProgress(0, '上传失败，可修正后重试');
    } finally {
      submitButtons.forEach(button => button.disabled = false);
    }
  });

  $('[data-reset-form]').addEventListener('click', resetForm);
  $('[data-refresh]').addEventListener('click', loadRecords);
  $('[data-login-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const loginForm = event.currentTarget;
    message($('[data-login-message]'), '正在登录');
    try {
      await signIn(loginForm.username.value.trim(), loginForm.password.value);
      loginForm.reset();
      await showDashboard();
    } catch (error) {
      message($('[data-login-message]'), formatError(error), true);
    }
  });
  signOutButton.addEventListener('click', async () => {
    await auth.signOut();
    dashboard.hidden = true;
    signOutButton.hidden = true;
    loginPanel.hidden = false;
  });

  async function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
    resetForm();
    await loadRecords();
  }

  async function initialize() {
    canvasContext.fillStyle = '#050505';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    if (!config.envId || !window.cloudbase) {
      setupPanel.hidden = false;
      return;
    }
    try {
      app = window.cloudbase.init(cloudOptions());
      auth = app.auth({ persistence: 'local' });
      database = app.database();
      const user = await currentUser();
      if (user) await showDashboard(); else loginPanel.hidden = false;
    } catch (error) {
      setupPanel.hidden = false;
      $('p', setupPanel).textContent = `CloudBase 初始化失败：${formatError(error)}`;
    }
  }
  initialize();
})();
