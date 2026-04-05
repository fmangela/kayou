const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const { query, execute } = require('../db/init');
const { toPinyin } = require('../services/pinyinService');
const { parseImportFile } = require('../services/importService');
const { getCharacterImageDir } = require('../services/assetPathService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

function removeFileIfExists(relPath) {
  if (!relPath) return;
  const absPath = path.join(__dirname, '..', relPath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
}

function cleanupCharacterAssets(row) {
  const imagePaths = JSON.parse(row.image_paths || '[]');
  const webpPaths = JSON.parse(row.webp_paths || '[]');
  imagePaths.forEach(removeFileIfExists);
  webpPaths.forEach(removeFileIfExists);

  const candidateDirs = new Set([
    getCharacterImageDir(row),
    ...(imagePaths.map(imagePath => path.dirname(path.join(__dirname, '..', imagePath)))),
  ]);

  for (const imageDir of candidateDirs) {
    if (fs.existsSync(imageDir)) {
      try {
        fs.rmdirSync(imageDir);
      } catch {
        // keep non-empty directories
      }
    }
  }
}

function normalizeRow(row) {
  return {
    ...row,
    image_paths: JSON.parse(row.image_paths || '[]'),
    webp_paths: JSON.parse(row.webp_paths || '[]'),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM characters ORDER BY id ASC');
    res.json(rows.map(normalizeRow));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: '名字不能为空' });

  try {
    const pinyin = toPinyin(name);
    const result = await execute('INSERT INTO characters (name, pinyin) VALUES (?, ?)', [name, pinyin]);
    const rows = await query('SELECT * FROM characters WHERE id = ?', [result.insertId]);
    res.json(normalizeRow(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '人物名字已存在' });
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  const { name, pinyin, background, appearance, nb2_prompt, mj_prompt, image_paths, webp_paths } = req.body;
  const fields = [];
  const values = [];

  if (name !== undefined) {
    fields.push('name = ?');
    values.push(name);
  }
  if (pinyin !== undefined) {
    fields.push('pinyin = ?');
    values.push(pinyin);
  }
  if (background !== undefined) {
    fields.push('background = ?');
    values.push(background);
  }
  if (appearance !== undefined) {
    fields.push('appearance = ?');
    values.push(appearance);
  }
  if (nb2_prompt !== undefined) {
    fields.push('nb2_prompt = ?');
    values.push(nb2_prompt);
  }
  if (mj_prompt !== undefined) {
    fields.push('mj_prompt = ?');
    values.push(mj_prompt);
  }
  if (image_paths !== undefined) {
    fields.push('image_paths = ?');
    values.push(JSON.stringify(image_paths));
  }
  if (webp_paths !== undefined) {
    fields.push('webp_paths = ?');
    values.push(JSON.stringify(webp_paths));
  }

  if (!fields.length) return res.status(400).json({ message: '无更新字段' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  try {
    await query(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`, values);
    const rows = await query('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '人物不存在' });
    res.json(normalizeRow(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '人物名字已存在' });
    }
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM characters WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: '人物不存在' });
    cleanupCharacterAssets(row);
    await execute('DELETE FROM characters WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/batch-delete', async (req, res, next) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: '无效ID列表' });

  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(`SELECT * FROM characters WHERE id IN (${placeholders})`, ids);
    rows.forEach(cleanupCharacterAssets);
    await query(`DELETE FROM characters WHERE id IN (${placeholders})`, ids);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const records = parseImportFile(req.file);
    let inserted = 0;

    for (const row of records) {
      const name = row.name || row['人物名字'] || row['名字'];
      if (!name) continue;
      const pinyin = row.pinyin || row['人物名字拼音'] || toPinyin(name);
      const result = await execute('INSERT IGNORE INTO characters (name, pinyin) VALUES (?, ?)', [name, pinyin]);
      if (result.affectedRows) inserted += 1;
    }

    res.json({ inserted });
  } catch (error) {
    res.status(400).json({ message: error.message || '导入失败，请检查文件格式' });
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id,name,pinyin,background,appearance,nb2_prompt,mj_prompt,image_paths,webp_paths FROM characters ORDER BY id'
    );
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="characters.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
