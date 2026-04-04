const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { getDb } = require('../db/init');
const router = express.Router();

const IMAGE_DIR = path.join(__dirname, '../assets/image');
const WEBP_DIR = path.join(__dirname, '../assets/webp');

// Crop image (auto center 2:3 or manual)
router.post('/crop', async (req, res) => {
  const { imagePath, mode, left, top, width, height } = req.body;
  const absPath = path.join(__dirname, '..', imagePath);
  if (!fs.existsSync(absPath)) return res.status(404).json({ message: '图片不存在' });

  try {
    const img = sharp(absPath);
    const meta = await img.metadata();
    let cropOpts;
    if (mode === 'auto') {
      // center crop to 2:3
      const targetW = Math.min(meta.width, Math.floor(meta.height * 2 / 3));
      const targetH = Math.floor(targetW * 3 / 2);
      cropOpts = {
        left: Math.floor((meta.width - targetW) / 2),
        top: Math.floor((meta.height - targetH) / 2),
        width: targetW,
        height: targetH,
      };
    } else {
      cropOpts = { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
    }
    const croppedBuf = await sharp(absPath).extract(cropOpts).toBuffer();
    fs.writeFileSync(absPath, croppedBuf);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Convert to WebP
router.post('/to-webp', async (req, res) => {
  const db = getDb();
  const { id, imagePaths } = req.body; // imagePaths: array of paths to convert
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ message: '人物不存在' });

  fs.mkdirSync(WEBP_DIR, { recursive: true });

  const pinyin = row.pinyin || String(row.id);
  const existingWebp = JSON.parse(row.webp_paths || '[]');
  const newWebpPaths = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const absPath = path.join(__dirname, '..', imagePaths[i]);
    if (!fs.existsSync(absPath)) continue;
    const suffix = imagePaths.length > 1 ? `-${existingWebp.length + i + 1}` : (existingWebp.length > 0 ? `-${existingWebp.length + 1}` : '');
    const filename = `${pinyin}${suffix}.webp`;
    const destPath = path.join(WEBP_DIR, filename);
    await sharp(absPath).webp({ quality: 90 }).toFile(destPath);
    newWebpPaths.push(`/assets/webp/${filename}`);
  }

  const merged = [...existingWebp, ...newWebpPaths];
  db.prepare('UPDATE characters SET webp_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(JSON.stringify(merged), id);

  res.json({ ok: true, webp_paths: merged });
});

// Delete webp
router.delete('/webp', (req, res) => {
  const db = getDb();
  const { id, webpPath } = req.body;
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ message: '人物不存在' });

  const paths = JSON.parse(row.webp_paths || '[]').filter(p => p !== webpPath);
  db.prepare('UPDATE characters SET webp_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(JSON.stringify(paths), id);

  const absPath = path.join(__dirname, '..', webpPath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  res.json({ ok: true, webp_paths: paths });
});

module.exports = router;
