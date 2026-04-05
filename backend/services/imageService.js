const fs = require('fs');
const sharp = require('sharp');

const CARD_RATIO_X = 2;
const CARD_RATIO_Y = 3;
const CARD_RATIO = CARD_RATIO_X / CARD_RATIO_Y;

function ensureImageMetadata(meta) {
  if (!meta.width || !meta.height) {
    throw new Error('无法读取图片尺寸');
  }
}

function getAutoCropOptions(meta) {
  ensureImageMetadata(meta);

  const sourceRatio = meta.width / meta.height;

  let targetW;
  let targetH;
  if (sourceRatio > CARD_RATIO) {
    targetH = meta.height;
    targetW = Math.floor(targetH * CARD_RATIO);
  } else {
    targetW = meta.width;
    targetH = Math.floor(targetW / CARD_RATIO);
  }

  return {
    left: Math.max(0, Math.floor((meta.width - targetW) / 2)),
    top: Math.max(0, Math.floor((meta.height - targetH) / 2)),
    width: targetW,
    height: targetH,
  };
}

function getManualCropOptions(meta, left, top, width, height) {
  ensureImageMetadata(meta);

  const crop = {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
    width: Math.round(width),
    height: Math.round(height),
  };

  if (crop.width <= 0 || crop.height <= 0) {
    throw new Error('裁切尺寸必须大于 0');
  }

  if (crop.left + crop.width > meta.width || crop.top + crop.height > meta.height) {
    throw new Error('裁切区域超出图片范围');
  }

  return crop;
}

async function cropImage(absPath, cropOpts) {
  const croppedBuf = await sharp(absPath).extract(cropOpts).toBuffer();
  fs.writeFileSync(absPath, croppedBuf);
}

async function autoCropImage(absPath) {
  const meta = await sharp(absPath).metadata();
  const cropOpts = getAutoCropOptions(meta);
  await cropImage(absPath, cropOpts);
  return cropOpts;
}

module.exports = {
  autoCropImage,
  CARD_RATIO_X,
  CARD_RATIO_Y,
  cropImage,
  getAutoCropOptions,
  getManualCropOptions,
};
