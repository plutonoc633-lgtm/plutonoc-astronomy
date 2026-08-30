'use strict';

const detailKeys = ['date', 'location', 'equipment', 'parameters', 'process', 'story', 'notes'];

function normalizeDetails(details = {}) {
  return Object.fromEntries(detailKeys.map(key => [key, String(details[key] || '').trim()]));
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
      thumbnailSrc: item.thumbnailSrc || item.previewSrc,
      width: item.width,
      height: item.height,
      featured: Boolean(item.featured),
      previewRotation: Number(item.previewRotation) || 0,
      sortOrder: Number(item.sortOrder) || 0,
      details: normalizeDetails(item.details),
    }));
  return `window.categoryConfig=${JSON.stringify(data.categoryConfig)};\nwindow.galleryData=${JSON.stringify(items)};\n`;
}

function videoRuntime(data) {
  const items = data.items
    .filter(item => item.status === 'published')
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
      posterPreviewUrl: item.posterPreviewUrl || item.posterUrl,
      duration: Number(item.duration) || 0,
      aspectRatio: Number(item.aspectRatio) || 16 / 9,
      status: item.status,
      sortOrder: Number(item.sortOrder) || 0,
    }));
  return `window.localVideoData=${JSON.stringify(items)};\n`;
}

function replacePictureSources(index, pictureName, mobilePath, desktopPath) {
  const picturePattern = new RegExp(
    `(<picture\\b[^>]*\\bdata-home-picture="${pictureName}"[^>]*>)([\\s\\S]*?)(</picture>)`,
  );
  let found = false;
  const output = index.replace(picturePattern, (picture, open, content, close) => {
    found = true;
    let next = content.replace(
      /(<source\b[^>]*\bdata-home-mobile\b[^>]*\b(?:data-deferred-)?srcset=")[^"]*(")/,
      `$1${mobilePath}$2`,
    );
    next = next.replace(
      /(<img\b[^>]*\bdata-home-desktop\b[^>]*\b(?:data-deferred-)?src=")[^"]*(")/,
      `$1${desktopPath}$2`,
    );
    if (next === content && (!content.includes(mobilePath) || !content.includes(desktopPath))) {
      throw new Error(`首页图片标记不完整：${pictureName}`);
    }
    return `${open}${next}${close}`;
  });
  if (!found) throw new Error(`首页图片标记缺失：${pictureName}`);
  return output;
}

function applyHomepageImages(index, data) {
  let output = String(index);
  for (const category of ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth']) {
    const featured = data.items.find(
      item => item.category === category && item.featured && item.status === 'published',
    );
    const config = data.categoryConfig?.[category];
    const desktopPath = config?.homeCover;
    const mobilePath = config?.homeMobileCover || featured?.previewSrc;
    if (!mobilePath || !desktopPath) {
      throw new Error(`首页精选资料不完整：${category}`);
    }
    output = replacePictureSources(output, `card-${category}`, mobilePath, desktopPath);
    if (category === 'earth') {
      output = replacePictureSources(output, 'profile-earth', mobilePath, desktopPath);
    }
  }
  return output;
}

module.exports = {
  detailKeys,
  normalizeDetails,
  galleryRuntime,
  videoRuntime,
  applyHomepageImages,
};
