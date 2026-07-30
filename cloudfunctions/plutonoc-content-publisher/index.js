'use strict';

const cloudbase = require('@cloudbase/js-sdk');
const {
  normalizeDetails,
  galleryRuntime,
  videoRuntime,
} = require('./content-runtime');

const app = cloudbase.init({ env: 'activity-book-web-d7djhe7bb1e834' });
const repository = { owner: 'plutonoc633-lgtm', name: 'plutonoc-astronomy', branch: 'main' };
const apiVersion = '2022-11-28';
const administratorUid = '2066559012906586114';
const categories = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
const maxBlobBase64Length = 5_000_000;

class PublisherError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function callerUid(context) {
  const contextual = context?.extendedContext?.userId || context?.userId || '';
  try {
    return app.auth.getUserInfo()?.uid || contextual;
  } catch {
    return contextual;
  }
}

function assertAdministrator(context) {
  const uid = callerUid(context);
  if (!uid || uid !== administratorUid) throw new PublisherError('FORBIDDEN', '当前账号无权发布内容');
}

function githubToken() {
  const token = String(process.env.plutonoc_github_token || '').trim();
  if (!token) throw new PublisherError('CONFIG_REQUIRED', '发布服务尚未配置 GitHub 凭据');
  return token;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken()}`,
      'X-GitHub-Api-Version': apiVersion,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.message || '';
    } catch {}
    if (response.status === 401) throw new PublisherError('GITHUB_AUTH', '服务器端 GitHub 凭据无效或已过期');
    if (response.status === 403) throw new PublisherError('GITHUB_PERMISSION', '服务器端 GitHub 凭据权限不足');
    if (response.status === 409 || response.status === 422) throw new PublisherError('CONFLICT', '远端内容已发生变化');
    throw new PublisherError('GITHUB_ERROR', `GitHub 请求失败（${response.status}${detail ? `：${detail}` : ''}）`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function decodeGithubText(content) {
  return Buffer.from(String(content || '').replace(/\s/g, ''), 'base64').toString('utf8');
}

async function readRepositoryText(path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const result = await githubRequest(`/repos/${repository.owner}/${repository.name}/contents/${encodedPath}?ref=${repository.branch}`);
  return decodeGithubText(result.content);
}

function isAllowedAssetPath(path) {
  const value = String(path || '');
  return [
    /^assets\/gallery\/uploads\/(deepsky|sunmoon|planet|nightscape|earth)\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/,
    /^assets\/gallery\/previews\/uploads\/(deepsky|sunmoon|planet|nightscape|earth)\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/,
    /^assets\/gallery\/hero\/(deepsky|sunmoon|planet|nightscape|earth)-[a-f0-9]{12}\.webp$/,
    /^assets\/video-posters\/uploads\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/,
  ].some(pattern => pattern.test(value));
}

function validateGallery(data) {
  if (data?.version !== 1 || !data.categoryConfig || !Array.isArray(data.items)) {
    throw new PublisherError('INVALID_CONTENT', '摄影数据格式无效');
  }
  const ids = new Set();
  const featured = new Set();
  for (const item of data.items) {
    if (!item.id || ids.has(item.id)) throw new PublisherError('INVALID_CONTENT', '摄影作品 ID 重复');
    if (!categories.includes(item.category) || !item.title || !item.src || !item.previewSrc) {
      throw new PublisherError('INVALID_CONTENT', `摄影资料不完整：${item.title || item.id}`);
    }
    if (!['published', 'hidden'].includes(item.status)) throw new PublisherError('INVALID_CONTENT', '摄影状态无效');
    item.details = normalizeDetails(item.details);
    ids.add(item.id);
    if (item.featured && item.status === 'published') {
      if (featured.has(item.category)) throw new PublisherError('INVALID_CONTENT', '同一分类只能有一张首页精选');
      featured.add(item.category);
    }
  }
  if (categories.some(category => !featured.has(category))) {
    throw new PublisherError('INVALID_CONTENT', '每个分类必须保留一张已发布的首页精选');
  }
}

function validateVideos(data) {
  if (data?.version !== 1 || !Array.isArray(data.items)) throw new PublisherError('INVALID_CONTENT', '视频数据格式无效');
  const ids = new Set();
  for (const item of data.items) {
    if (!item.id || ids.has(item.id)) throw new PublisherError('INVALID_CONTENT', '视频 ID 重复');
    if (!item.title || !item.videoUrl || !item.posterUrl) throw new PublisherError('INVALID_CONTENT', `视频资料不完整：${item.title || item.id}`);
    if (!['published', 'draft'].includes(item.status)) throw new PublisherError('INVALID_CONTENT', '视频状态无效');
    ids.add(item.id);
  }
}

async function createTextBlob(content) {
  const result = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: String(content), encoding: 'utf-8' }),
  });
  return result.sha;
}

async function createBinaryBlob(data) {
  const path = String(data.path || '');
  const content = String(data.content || '');
  if (!isAllowedAssetPath(path)) throw new PublisherError('INVALID_PATH', '图片上传路径不受允许');
  if (!content || content.length > maxBlobBase64Length || !/^[A-Za-z0-9+/=\r\n]+$/.test(content)) {
    throw new PublisherError('FILE_TOO_LARGE', '图片超过发布服务单文件限制，请换用更小的网页图片');
  }
  const result = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content, encoding: 'base64' }),
  });
  return { sha: result.sha };
}

async function loadContent() {
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
  return { headSha, treeSha: commit.tree.sha, gallery, videos, index, style, script };
}

async function publish(data) {
  const gallery = data.gallery;
  const videos = data.videos;
  const changed = data.changed;
  const expectedHeadSha = String(data.expectedHeadSha || '');
  validateGallery(gallery);
  validateVideos(videos);
  if (!['gallery', 'videos'].includes(changed)) throw new PublisherError('INVALID_CONTENT', '发布类型无效');

  const reference = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/ref/heads/${repository.branch}`);
  if (!expectedHeadSha || reference.object.sha !== expectedHeadSha) {
    throw new PublisherError('CONFLICT', '远端内容已变化，请刷新内容后重试');
  }
  const parentCommit = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/commits/${expectedHeadSha}`);
  let nextIndex = await readRepositoryText('index.html');
  const version = changed === 'gallery' ? gallery.contentVersion : videos.contentVersion;
  if (!version || version.length > 80) throw new PublisherError('INVALID_CONTENT', '内容版本无效');
  if (changed === 'gallery') nextIndex = nextIndex.replace(/gallery-data\.js\?v=[^"]+/g, `gallery-data.js?v=${version}`);
  if (changed === 'videos') nextIndex = nextIndex.replace(/video-data\.js\?v=[^"]+/g, `video-data.js?v=${version}`);

  const fileEntries = Array.isArray(data.fileEntries) ? data.fileEntries : [];
  if (fileEntries.length > 12) throw new PublisherError('INVALID_CONTENT', '单次发布图片数量过多');
  const treeEntries = [];
  for (const entry of fileEntries) {
    if (!isAllowedAssetPath(entry.path) || !/^[a-f0-9]{40}$/.test(String(entry.sha || ''))) {
      throw new PublisherError('INVALID_PATH', '图片提交记录无效');
    }
    treeEntries.push({ path: entry.path, mode: '100644', type: 'blob', sha: entry.sha });
  }

  const textFiles = changed === 'gallery'
    ? [
        ['content/gallery.json', `${JSON.stringify(gallery, null, 2)}\n`],
        ['gallery-data.js', galleryRuntime(gallery)],
        ['index.html', nextIndex],
      ]
    : [
        ['content/videos.json', `${JSON.stringify(videos, null, 2)}\n`],
        ['video-data.js', videoRuntime(videos)],
        ['index.html', nextIndex],
      ];
  for (const [path, content] of textFiles) {
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: await createTextBlob(content) });
  }

  const deletions = [...new Set(Array.isArray(data.deletions) ? data.deletions : [])];
  if (deletions.length > 20 || deletions.some(path => !isAllowedAssetPath(path))) {
    throw new PublisherError('INVALID_PATH', '删除路径不受允许');
  }
  const uploadedPaths = new Set(fileEntries.map(entry => entry.path));
  deletions.filter(path => !uploadedPaths.has(path)).forEach(path => {
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
  });

  const tree = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries }),
  });
  const safeMessage = String(data.message || '[studio] 更新网站内容').replace(/[\r\n]+/g, ' ').slice(0, 160);
  const commit = await githubRequest(`/repos/${repository.owner}/${repository.name}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: safeMessage, tree: tree.sha, parents: [expectedHeadSha] }),
  });
  await githubRequest(`/repos/${repository.owner}/${repository.name}/git/refs/heads/${repository.branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return { sha: commit.sha, treeSha: tree.sha, index: nextIndex };
}

exports.main = async (event, context) => {
  try {
    assertAdministrator(context);
    const action = String(event?.action || '');
    let data;
    if (action === 'load') data = await loadContent();
    else if (action === 'createBlob') data = await createBinaryBlob(event);
    else if (action === 'publish') data = await publish(event);
    else throw new PublisherError('INVALID_ACTION', '不支持的发布操作');
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error?.code || 'PUBLISHER_ERROR',
        message: error?.message || '发布服务发生错误',
      },
    };
  }
};
