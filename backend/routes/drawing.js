const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/init');
const router = express.Router();

const IMAGE_DIR = path.join(__dirname, '../assets/image');

function getMxConfig() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'mx_%'").all();
  const cfg = {};
  for (const r of rows) cfg[r.key.replace('mx_', '')] = r.value;
  return cfg;
}

router.get('/config', (req, res) => {
  res.json(getMxConfig());
});

router.post('/config', (req, res) => {
  const db = getDb();
  const { api_key, base_url } = req.body;
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  if (api_key !== undefined) stmt.run('mx_api_key', api_key);
  if (base_url !== undefined) stmt.run('mx_base_url', base_url);
  res.json({ ok: true });
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
    await new Promise(r => setTimeout(r, 5000));
    const resp = await axios.get(
      `${baseUrl}/api/mj/task/${taskId}/fetch`,
      { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 15000 }
    );
    const data = resp.data;
    if (data.status === 'SUCCESS') return data;
    if (data.status === 'FAILURE') throw new Error(data.failReason || '绘图失败');
  }
  throw new Error('绘图超时');
}

router.post('/generate', async (req, res) => {
  const db = getDb();
  const cfg = getMxConfig();
  if (!cfg.api_key) return res.status(400).json({ message: '请先配置MX AI API Key' });

  const { id } = req.body;
  const rows = id
    ? db.prepare('SELECT * FROM characters WHERE id = ?').all(id)
    : db.prepare('SELECT * FROM characters WHERE mj_prompt IS NOT NULL').all();

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

      const charDir = path.join(IMAGE_DIR, row.pinyin || String(row.id));
      fs.mkdirSync(charDir, { recursive: true });

      const savedPaths = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const ext = path.extname(new URL(imageUrls[i]).pathname) || '.png';
        const filename = `${row.pinyin || row.id}_${Date.now()}_${i}${ext}`;
        const destPath = path.join(charDir, filename);
        await downloadImage(imageUrls[i], destPath);
        savedPaths.push(`/assets/image/${row.pinyin || row.id}/${filename}`);
      }

      const existing = JSON.parse(row.image_paths || '[]');
      const merged = [...existing, ...savedPaths];
      db.prepare('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(JSON.stringify(merged), row.id);

      res.write(`data: ${JSON.stringify({ id: row.id, status: 'done', paths: savedPaths })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ id: row.id, status: 'error', error: e.message })}\n\n`);
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

router.delete('/image', (req, res) => {
  const db = getDb();
  const { id, imagePath } = req.body;
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ message: '人物不存在' });

  const paths = JSON.parse(row.image_paths || '[]').filter(p => p !== imagePath);
  db.prepare('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(JSON.stringify(paths), id);

  const absPath = path.join(__dirname, '..', imagePath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);

  res.json({ ok: true, image_paths: paths });
});

module.exports = router;
