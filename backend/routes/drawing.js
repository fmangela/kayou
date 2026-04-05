const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query, execute } = require('../db/init');
const { autoCropImage } = require('../services/imageService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const IMAGE_DIR = path.join(__dirname, '../assets/image');

async function getMxConfig() {
  const rows = await query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'mx_%'");
  const config = {};
  for (const row of rows) {
    config[row.key.replace('mx_', '')] = row.value;
  }
  return config;
}

router.get('/config', async (req, res, next) => {
  try {
    res.json(await getMxConfig());
  } catch (error) {
    next(error);
  }
});

router.post('/config', async (req, res, next) => {
  const { api_key, base_url } = req.body;

  try {
    if (api_key !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['mx_api_key', api_key]
      );
    }
    if (base_url !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['mx_base_url', base_url]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function downloadImage(url, destPath) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(destPath, resp.data);
}

async function submitMjJob(cfg, prompt) {
  const baseUrl = cfg.base_url || 'https://www.mxai.cn';
  const resp = await axios.post(
    `${baseUrl}/api/mj/submit/imagine`,
    { prompt, botType: 'MID_JOURNEY' },
    { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 30000 }
  );
  return resp.data;
}

async function pollMjJob(cfg, taskId, maxWait = 300000) {
  const baseUrl = cfg.base_url || 'https://www.mxai.cn';
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const resp = await axios.get(`${baseUrl}/api/mj/task/${taskId}/fetch`, {
      headers: { Authorization: `Bearer ${cfg.api_key}` },
      timeout: 15000,
    });
    const data = resp.data;
    if (data.status === 'SUCCESS') return data;
    if (data.status === 'FAILURE') throw new Error(data.failReason || '绘图失败');
  }
  throw new Error('绘图超时');
}

function getUploadExtension(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext) return ext;

  const byMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return byMime[file.mimetype] || '.png';
}

router.post('/upload', upload.array('images'), async (req, res) => {
  const id = Number(req.body.id);
  if (!id) return res.status(400).json({ message: '人物 ID 无效' });

  const rows = await query('SELECT * FROM characters WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: '人物不存在' });
  if (!req.files?.length) return res.status(400).json({ message: '请先选择图片' });

  const charDirName = row.pinyin || String(row.id);
  const charDir = path.join(IMAGE_DIR, charDirName);
  fs.mkdirSync(charDir, { recursive: true });

  try {
    const savedPaths = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = getUploadExtension(file);
      const filename = `${charDirName}_${Date.now()}_${i}${ext}`;
      const destPath = path.join(charDir, filename);
      fs.writeFileSync(destPath, file.buffer);
      await autoCropImage(destPath);
      savedPaths.push(`/assets/image/${charDirName}/${filename}`);
    }

    const existing = JSON.parse(row.image_paths || '[]');
    const merged = [...existing, ...savedPaths];
    await execute('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
      JSON.stringify(merged),
      id,
    ]);

    res.json({ ok: true, paths: savedPaths, image_paths: merged });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/generate', async (req, res) => {
  const cfg = await getMxConfig();
  if (!cfg.api_key) return res.status(400).json({ message: '请先配置MX AI API Key' });

  const { id } = req.body;
  const rows = id
    ? await query('SELECT * FROM characters WHERE id = ?', [id])
    : await query('SELECT * FROM characters WHERE mj_prompt IS NOT NULL');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const prompt = row.mj_prompt;
      res.write(`data: ${JSON.stringify({ id: row.id, status: 'submitting' })}\n\n`);

      const submitResult = await submitMjJob(cfg, prompt);
      const taskId = submitResult.result || submitResult.id;
      res.write(`data: ${JSON.stringify({ id: row.id, status: 'waiting', taskId })}\n\n`);

      const result = await pollMjJob(cfg, taskId);
      const imageUrls = result.imageUrl ? [result.imageUrl] : (result.imageUrls || []);

      const charDirName = row.pinyin || String(row.id);
      const charDir = path.join(IMAGE_DIR, charDirName);
      fs.mkdirSync(charDir, { recursive: true });

      const savedPaths = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const ext = path.extname(new URL(imageUrls[i]).pathname) || '.png';
        const filename = `${charDirName}_${Date.now()}_${i}${ext}`;
        const destPath = path.join(charDir, filename);
        await downloadImage(imageUrls[i], destPath);
        savedPaths.push(`/assets/image/${charDirName}/${filename}`);
      }

      const existing = JSON.parse(row.image_paths || '[]');
      const merged = [...existing, ...savedPaths];
      await execute('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
        JSON.stringify(merged),
        row.id,
      ]);

      res.write(`data: ${JSON.stringify({ id: row.id, status: 'done', paths: savedPaths })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ id: row.id, status: 'error', error: error.message })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

router.delete('/image', async (req, res) => {
  const { id, imagePath } = req.body;
  const rows = await query('SELECT * FROM characters WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: '人物不存在' });

  const paths = JSON.parse(row.image_paths || '[]').filter(item => item !== imagePath);
  await execute('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
    JSON.stringify(paths),
    id,
  ]);

  const absPath = path.join(__dirname, '..', imagePath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  res.json({ ok: true, image_paths: paths });
});

router.delete('/images', async (req, res) => {
  const { id, imagePaths } = req.body;
  if (!Array.isArray(imagePaths) || !imagePaths.length) {
    return res.status(400).json({ message: '请选择要删除的图片' });
  }

  const rows = await query('SELECT * FROM characters WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: '人物不存在' });

  const selected = new Set(imagePaths);
  const existing = JSON.parse(row.image_paths || '[]');
  const paths = existing.filter(item => !selected.has(item));

  await execute('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
    JSON.stringify(paths),
    id,
  ]);

  for (const imagePath of imagePaths) {
    const absPath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }

  res.json({ ok: true, image_paths: paths });
});

module.exports = router;
