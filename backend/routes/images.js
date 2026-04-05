const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { query, execute } = require('../db/init');
const { autoCropImage, getManualCropOptions, cropImage } = require('../services/imageService');

const router = express.Router();

const WEBP_DIR = path.join(__dirname, '../assets/webp');

router.post('/crop', async (req, res) => {
  const { imagePath, mode, left, top, width, height } = req.body;
  const absPath = path.join(__dirname, '..', imagePath);
  if (!fs.existsSync(absPath)) return res.status(404).json({ message: '图片不存在' });

  try {
    if (mode === 'auto') {
      await autoCropImage(absPath);
    } else {
      const meta = await sharp(absPath).metadata();
      const cropOpts = getManualCropOptions(meta, left, top, width, height);
      await cropImage(absPath, cropOpts);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/to-webp', async (req, res) => {
  const { id, imagePaths } = req.body;
  const rows = await query('SELECT * FROM characters WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: '人物不存在' });

  fs.mkdirSync(WEBP_DIR, { recursive: true });

  const pinyin = row.pinyin || String(row.id);
  const existingWebp = JSON.parse(row.webp_paths || '[]');
  const newWebpPaths = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const absPath = path.join(__dirname, '..', imagePaths[i]);
    if (!fs.existsSync(absPath)) continue;
    const suffix = imagePaths.length > 1
      ? `-${existingWebp.length + i + 1}`
      : (existingWebp.length > 0 ? `-${existingWebp.length + 1}` : '');
    const filename = `${pinyin}${suffix}.webp`;
    const destPath = path.join(WEBP_DIR, filename);
    await sharp(absPath).webp({ quality: 90 }).toFile(destPath);
    newWebpPaths.push(`/assets/webp/${filename}`);
  }

  const merged = [...existingWebp, ...newWebpPaths];
  await execute('UPDATE characters SET webp_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
    JSON.stringify(merged),
    id,
  ]);

  res.json({ ok: true, webp_paths: merged });
});

router.delete('/webp', async (req, res) => {
  const { id, webpPath } = req.body;
  const rows = await query('SELECT * FROM characters WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: '人物不存在' });

  const paths = JSON.parse(row.webp_paths || '[]').filter(item => item !== webpPath);
  await execute('UPDATE characters SET webp_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
    JSON.stringify(paths),
    id,
  ]);

  const absPath = path.join(__dirname, '..', webpPath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  res.json({ ok: true, webp_paths: paths });
});

module.exports = router;
