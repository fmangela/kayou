const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { getDb } = require('../db/init');
const { toPinyin } = require('../services/pinyinService');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM characters ORDER BY id ASC').all();
  res.json(rows.map(r => ({
    ...r,
    image_paths: JSON.parse(r.image_paths || '[]'),
    webp_paths: JSON.parse(r.webp_paths || '[]'),
  })));
});

router.post('/', (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: '名字不能为空' });
  const pinyin = toPinyin(name);
  try {
    const stmt = db.prepare(
      'INSERT INTO characters (name, pinyin) VALUES (?, ?)'
    );
    const result = stmt.run(name, pinyin);
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ...row, image_paths: JSON.parse(row.image_paths || '[]'), webp_paths: JSON.parse(row.webp_paths || '[]') });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ message: '人物名字已存在' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const { name, pinyin, background, appearance, nb2_prompt, mj_prompt, image_paths, webp_paths } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (pinyin !== undefined) { fields.push('pinyin = ?'); values.push(pinyin); }
  if (background !== undefined) { fields.push('background = ?'); values.push(background); }
  if (appearance !== undefined) { fields.push('appearance = ?'); values.push(appearance); }
  if (nb2_prompt !== undefined) { fields.push('nb2_prompt = ?'); values.push(nb2_prompt); }
  if (mj_prompt !== undefined) { fields.push('mj_prompt = ?'); values.push(mj_prompt); }
  if (image_paths !== undefined) { fields.push('image_paths = ?'); values.push(JSON.stringify(image_paths)); }
  if (webp_paths !== undefined) { fields.push('webp_paths = ?'); values.push(JSON.stringify(webp_paths)); }
  if (!fields.length) return res.status(400).json({ message: '无更新字段' });
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);
  db.prepare(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  res.json({ ...row, image_paths: JSON.parse(row.image_paths || '[]'), webp_paths: JSON.parse(row.webp_paths || '[]') });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/batch-delete', (req, res) => {
  const db = getDb();
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: '无效ID列表' });
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM characters WHERE id IN (${placeholders})`).run(...ids);
  res.json({ ok: true });
});

router.post('/import', upload.single('file'), (req, res) => {
  const db = getDb();
  const content = req.file.buffer.toString('utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  const stmt = db.prepare('INSERT OR IGNORE INTO characters (name, pinyin) VALUES (?, ?)');
  let inserted = 0;
  for (const r of records) {
    const name = r['name'] || r['人物名字'] || r['名字'];
    if (!name) continue;
    const pinyin = r['pinyin'] || r['人物名字拼音'] || toPinyin(name);
    const result = stmt.run(name, pinyin);
    if (result.changes) inserted++;
  }
  res.json({ inserted });
});

router.get('/export', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id,name,pinyin,background,appearance,nb2_prompt,mj_prompt,image_paths,webp_paths FROM characters ORDER BY id').all();
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="characters.csv"');
  res.send(csv);
});

module.exports = router;
