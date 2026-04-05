const path = require('path');

const IMAGE_ROOT = path.join(__dirname, '../assets/image');
const WEBP_ROOT = path.join(__dirname, '../assets/webp');

function sanitizePinyin(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCharacterAssetKey(row) {
  const id = Number(row.id || row.character_id);
  const safePinyin = sanitizePinyin(row.pinyin);
  return safePinyin ? `${id}_${safePinyin}` : String(id);
}

function getCharacterImageDir(row) {
  return path.join(IMAGE_ROOT, getCharacterAssetKey(row));
}

function buildImageFilename(row, ext, stamp, index) {
  return `${getCharacterAssetKey(row)}_${stamp}_${index}${ext}`;
}

function buildImagePublicPath(row, filename) {
  return `/assets/image/${getCharacterAssetKey(row)}/${filename}`;
}

function buildWebpFilename(row, suffix = '') {
  return `${getCharacterAssetKey(row)}${suffix}.webp`;
}

function getImageRoot() {
  return IMAGE_ROOT;
}

function getWebpRoot() {
  return WEBP_ROOT;
}

module.exports = {
  buildImageFilename,
  buildImagePublicPath,
  buildWebpFilename,
  getCharacterAssetKey,
  getCharacterImageDir,
  getImageRoot,
  getWebpRoot,
};
