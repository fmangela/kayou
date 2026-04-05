const fs = require('fs');
const sharp = require('sharp');

const CARD_RATIO_X = 2;
const CARD_RATIO_Y = 3;
const CARD_WIDTH = 750;
const CARD_HEIGHT = 1125;

function ensureImageMetadata(meta) {
  if (!meta.width || !meta.height) {
    throw new Error('无法读取图片尺寸');
  }
}

function ensureMinimumImageSize(meta, fileLabel = '图片') {
  ensureImageMetadata(meta);

  if (meta.width < CARD_WIDTH || meta.height < CARD_HEIGHT) {
    throw new Error(`${fileLabel}尺寸不对，至少需要 ${CARD_WIDTH}x${CARD_HEIGHT}，当前为 ${meta.width}x${meta.height}`);
  }
}

function getAutoCropOptions(meta) {
  ensureImageMetadata(meta);

  const scale = Math.max(CARD_WIDTH / meta.width, CARD_HEIGHT / meta.height);
  const resizedWidth = Math.max(CARD_WIDTH, Math.round(meta.width * scale));
  const resizedHeight = Math.max(CARD_HEIGHT, Math.round(meta.height * scale));

  return {
    left: Math.max(0, Math.floor((resizedWidth - CARD_WIDTH) / 2)),
    top: Math.max(0, Math.floor((resizedHeight - CARD_HEIGHT) / 2)),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    resizedWidth,
    resizedHeight,
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
  const croppedBuf = await sharp(absPath)
    .resize(cropOpts.resizedWidth, cropOpts.resizedHeight)
    .extract({
      left: cropOpts.left,
      top: cropOpts.top,
      width: cropOpts.width,
      height: cropOpts.height,
    })
    .toBuffer();
  fs.writeFileSync(absPath, croppedBuf);
  return cropOpts;
}

module.exports = {
  autoCropImage,
  CARD_HEIGHT,
  CARD_WIDTH,
  CARD_RATIO_X,
  CARD_RATIO_Y,
  cropImage,
  ensureMinimumImageSize,
  getAutoCropOptions,
  getManualCropOptions,
};
