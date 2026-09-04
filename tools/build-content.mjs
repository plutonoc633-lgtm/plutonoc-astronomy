#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import contentRuntime from '../cloudfunctions/plutonoc-content-publisher/content-runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.join(root, 'content');
const galleryPath = path.join(contentRoot, 'gallery.json');
const videoPath = path.join(contentRoot, 'videos.json');
const galleryRuntimePath = path.join(root, 'gallery-data.js');
const videoRuntimePath = path.join(root, 'video-data.js');
const categoryOrder = ['deepsky', 'sunmoon', 'planet', 'nightscape', 'earth'];
const { normalizeDetails, galleryRuntime, videoRuntime, applyHomepageImages } = contentRuntime;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stableJson(value, pretty = false) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

function validateGallery(data) {
  if (!data || data.version !== 1 || !data.categoryConfig || !Array.isArray(data.items)) {
    throw new Error('content/gallery.json 格式无效');
  }
  const ids = new Set();
  const featured = new Map();
  data.items.forEach((item, index) => {
    if (!item.id || ids.has(item.id)) throw new Error(`摄影作品 ID 重复或为空：${item.id || index}`);
    if (!data.categoryConfig[item.category]) throw new Error(`摄影作品分类无效：${item.id}`);
    if (!item.title || !item.src || !item.previewSrc || !item.thumbnailSrc) throw new Error(`摄影作品字段不完整：${item.id}`);
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height)) throw new Error(`摄影作品尺寸无效：${item.id}`);
    if (!['published', 'hidden'].includes(item.status)) throw new Error(`摄影作品状态无效：${item.id}`);
    if (!Number.isFinite(item.sortOrder)) throw new Error(`摄影作品排序无效：${item.id}`);
    ids.add(item.id);
    if (item.featured && item.status === 'published') {
      if (featured.has(item.category)) throw new Error(`分类 ${item.category} 存在多个首页精选`);
      featured.set(item.category, item.id);
    }
  });
  for (const category of categoryOrder) {
    if (!featured.has(category)) throw new Error(`分类 ${category} 缺少已发布的首页精选`);
    if (!data.categoryConfig[category].homeCover || !data.categoryConfig[category].homeMobileCover) {
      throw new Error(`分类 ${category} 缺少响应式首页封面`);
    }
  }
}

function validateVideos(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.items)) throw new Error('content/videos.json 格式无效');
  const ids = new Set();
  data.items.forEach((item, index) => {
    if (!item.id || ids.has(item.id)) throw new Error(`视频 ID 重复或为空：${item.id || index}`);
    const sourceType = item.sourceType === 'bilibili' ? 'bilibili' : 'direct';
    const playable = sourceType === 'bilibili'
      ? /^BV[0-9A-Za-z]{10,20}$/.test(item.bvid || '')
      : Boolean(item.videoUrl);
    if (!item.title || !playable || !item.posterUrl || !item.posterPreviewUrl) throw new Error(`视频字段不完整：${item.id}`);
    if (!['published', 'draft'].includes(item.status)) throw new Error(`视频状态无效：${item.id}`);
    if (!Number.isFinite(item.sortOrder)) throw new Error(`视频排序无效：${item.id}`);
    ids.add(item.id);
  });
}

function migrate() {
  fs.mkdirSync(contentRoot, { recursive: true });
  if (!fs.existsSync(galleryPath)) {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(galleryRuntimePath, 'utf8'), context);
    const counters = {};
    const items = context.window.galleryData.map(item => {
      counters[item.category] = (counters[item.category] || 0) + 1;
      return {
        ...item,
        status: 'published',
        sortOrder: counters[item.category],
        details: normalizeDetails(item.details),
        updatedAt: '',
      };
    });
    fs.writeFileSync(galleryPath, stableJson({
      version: 1,
      contentVersion: '20260724-migration-1',
      categoryConfig: context.window.categoryConfig,
      items,
    }, true));
  }
  if (!fs.existsSync(videoPath)) {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(videoRuntimePath, 'utf8'), context);
    const items = context.window.localVideoData.map(item => ({
      ...item,
      summary: item.summary || '',
      date: item.date || '',
      location: item.location || '',
      aspectRatio: Number(item.aspectRatio) || 16 / 9,
      createdAt: '',
      updatedAt: '',
    }));
    fs.writeFileSync(videoPath, stableJson({
      version: 1,
      contentVersion: '20260724-migration-1',
      items,
    }, true));
  }
}

function build(checkOnly = false) {
  const gallery = readJson(galleryPath);
  const videos = readJson(videoPath);
  const indexPath = path.join(root, 'index.html');
  validateGallery(gallery);
  validateVideos(videos);
  const outputs = [
    [galleryRuntimePath, galleryRuntime(gallery)],
    [videoRuntimePath, videoRuntime(videos)],
  ];
  if (checkOnly) {
    for (const [file, expected] of outputs) {
      if (fs.readFileSync(file, 'utf8') !== expected) throw new Error(`${path.basename(file)} 未由规范内容生成`);
    }
    const index = fs.readFileSync(indexPath, 'utf8');
    if (applyHomepageImages(index, gallery) !== index) {
      throw new Error('index.html 首页精选图片未与规范摄影数据同步');
    }
    return;
  }
  for (const [file, output] of outputs) fs.writeFileSync(file, output, 'utf8');
  const index = fs.readFileSync(indexPath, 'utf8');
  const nextIndex = applyHomepageImages(index, gallery);
  if (nextIndex !== index) fs.writeFileSync(indexPath, nextIndex, 'utf8');
}

const args = new Set(process.argv.slice(2));
if (args.has('--migrate')) migrate();
build(args.has('--check'));
console.log(args.has('--check') ? 'Content files are valid and current.' : 'Content runtime files generated.');
