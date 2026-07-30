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
      duration: Number(item.duration) || 0,
      aspectRatio: Number(item.aspectRatio) || 16 / 9,
      status: item.status,
      sortOrder: Number(item.sortOrder) || 0,
    }));
  return `window.localVideoData=${JSON.stringify(items)};\n`;
}

module.exports = {
  detailKeys,
  normalizeDetails,
  galleryRuntime,
  videoRuntime,
};
