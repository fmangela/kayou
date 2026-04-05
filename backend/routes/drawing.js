const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { query, execute } = require('../db/init');
const { autoCropImage, ensureMinimumImageSize } = require('../services/imageService');
const { buildImageFilename, buildImagePublicPath, getCharacterImageDir } = require('../services/assetPathService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const MX_CONFIG_DEFS = {
  api_key: { type: 'string', default: '' },
  base_url: { type: 'string', default: 'https://open.mxapi.org' },
  draw_mode: { type: 'string', default: 'jimeng5' },
  poll_interval_ms: { type: 'number', default: 5000 },
  max_wait_ms: { type: 'number', default: 300000 },
  nano2_prompt_field: { type: 'string', default: 'nb2_prompt' },
  nano2_image_size: { type: 'string', default: '1K' },
  nano2_aspect_ratio: { type: 'string', default: '1:1' },
  nano2_reference_images: { type: 'json', default: [] },
  nano2_x_channel: { type: 'string', default: '' },
  jimeng5_prompt_field: { type: 'string', default: 'mj_prompt' },
  jimeng5_model: { type: 'string', default: 'doubao-seedream-5-0-260128' },
  jimeng5_size: { type: 'string', default: '2K' },
  jimeng5_web_search: { type: 'boolean', default: false },
  jimeng5_output_format: { type: 'string', default: 'jpeg' },
  jimeng5_reference_images: { type: 'json', default: [] },
};

const PROMPT_FIELDS = ['nb2_prompt', 'mj_prompt', 'appearance', 'background'];
const DRAW_MODE_ENGINES = {
  nano2: ['nano2'],
  jimeng5: ['jimeng5'],
  dual: ['nano2', 'jimeng5'],
};

function buildMxUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeStringArray(parsed);
    } catch {}

    return trimmed
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseMxSetting(def, value) {
  if (value === undefined || value === null || value === '') return def.default;

  if (def.type === 'boolean') return parseBoolean(value, def.default);

  if (def.type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : def.default;
  }

  if (def.type === 'json') return normalizeStringArray(value);

  return String(value);
}

function serializeMxSetting(def, value) {
  if (value === undefined) return undefined;

  if (def.type === 'boolean') return parseBoolean(value, def.default) ? 'true' : 'false';
  if (def.type === 'number') return String(Number.isFinite(Number(value)) ? Number(value) : def.default);
  if (def.type === 'json') return JSON.stringify(normalizeStringArray(value));

  return String(value ?? '');
}

function normalizeMxConfig(config) {
  const drawMode = DRAW_MODE_ENGINES[config.draw_mode] ? config.draw_mode : MX_CONFIG_DEFS.draw_mode.default;
  const pollInterval = Math.max(1000, Number(config.poll_interval_ms) || MX_CONFIG_DEFS.poll_interval_ms.default);
  const maxWait = Math.max(10000, Number(config.max_wait_ms) || MX_CONFIG_DEFS.max_wait_ms.default);

  return {
    ...config,
    base_url: String(config.base_url || MX_CONFIG_DEFS.base_url.default),
    draw_mode: drawMode,
    poll_interval_ms: pollInterval,
    max_wait_ms: maxWait,
    nano2_prompt_field: PROMPT_FIELDS.includes(config.nano2_prompt_field) ? config.nano2_prompt_field : MX_CONFIG_DEFS.nano2_prompt_field.default,
    nano2_image_size: String(config.nano2_image_size || MX_CONFIG_DEFS.nano2_image_size.default),
    nano2_aspect_ratio: String(config.nano2_aspect_ratio || MX_CONFIG_DEFS.nano2_aspect_ratio.default),
    nano2_reference_images: normalizeStringArray(config.nano2_reference_images),
    nano2_x_channel: String(config.nano2_x_channel || ''),
    jimeng5_prompt_field: PROMPT_FIELDS.includes(config.jimeng5_prompt_field) ? config.jimeng5_prompt_field : MX_CONFIG_DEFS.jimeng5_prompt_field.default,
    jimeng5_model: String(config.jimeng5_model || MX_CONFIG_DEFS.jimeng5_model.default),
    jimeng5_size: String(config.jimeng5_size || MX_CONFIG_DEFS.jimeng5_size.default),
    jimeng5_web_search: parseBoolean(config.jimeng5_web_search, MX_CONFIG_DEFS.jimeng5_web_search.default),
    jimeng5_output_format: String(config.jimeng5_output_format || MX_CONFIG_DEFS.jimeng5_output_format.default),
    jimeng5_reference_images: normalizeStringArray(config.jimeng5_reference_images),
  };
}

async function getMxConfig() {
  const rows = await query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'mx_%'");
  const rawConfig = {};
  for (const row of rows) {
    rawConfig[row.key.replace('mx_', '')] = row.value;
  }

  const config = {};
  for (const [key, def] of Object.entries(MX_CONFIG_DEFS)) {
    config[key] = parseMxSetting(def, rawConfig[key]);
  }

  return normalizeMxConfig(config);
}

router.get('/config', async (req, res, next) => {
  try {
    res.json(await getMxConfig());
  } catch (error) {
    next(error);
  }
});

router.post('/config', async (req, res, next) => {
  try {
    const entries = Object.entries(MX_CONFIG_DEFS)
      .filter(([key]) => req.body[key] !== undefined)
      .map(([key, def]) => [key, serializeMxSetting(def, req.body[key])]);

    for (const [key, value] of entries) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [`mx_${key}`, value]
      );
    }

    res.json({ ok: true, config: await getMxConfig() });
  } catch (error) {
    next(error);
  }
});

function getErrorMessage(error, fallback = '请求失败') {
  return error?.response?.data?.message || error?.response?.data?.error || error.message || fallback;
}

function buildMxHeaders(cfg, extraHeaders = {}) {
  return {
    Authorization: `Bearer ${cfg.api_key}`,
    ...extraHeaders,
  };
}

async function downloadImage(url, destPath) {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000, proxy: false });
  fs.writeFileSync(destPath, resp.data);
}

function unwrapMxData(payload) {
  if (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function pickTaskId(payload) {
  const data = unwrapMxData(payload) || {};
  return data.task_id || data.taskId || data.id || payload?.task_id || payload?.taskId || payload?.id;
}

function normalizeTaskStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function pickTaskError(taskData) {
  return taskData?.error_msg || taskData?.error || taskData?.message || taskData?.failReason || '';
}

function pickImageUrls(taskData) {
  const result = taskData?.result || {};
  const urlCandidates = [
    result.images,
    result.imageUrls,
    result.image_urls,
    result.url,
    result.image,
    taskData?.images,
    taskData?.imageUrls,
    taskData?.image_urls,
    taskData?.url,
    taskData?.image,
    result.imageUrl,
    result.image_url,
    taskData?.imageUrl,
    taskData?.image_url,
  ];

  const urls = [];
  for (const candidate of urlCandidates) {
    if (!candidate) continue;

    if (Array.isArray(candidate)) {
      candidate.forEach((item) => {
        if (typeof item === 'string' && item.trim()) urls.push(item.trim());
        if (item && typeof item === 'object' && typeof item.url === 'string' && item.url.trim()) urls.push(item.url.trim());
        if (item && typeof item === 'object' && typeof item.image_url === 'string' && item.image_url.trim()) urls.push(item.image_url.trim());
      });
      continue;
    }

    if (typeof candidate === 'string' && candidate.trim()) {
      urls.push(candidate.trim());
    }
  }

  return Array.from(new Set(urls));
}

function resolvePrompt(row, preferredField) {
  const candidates = Array.from(new Set([preferredField, ...PROMPT_FIELDS]));
  for (const field of candidates) {
    const value = String(row[field] || '').trim();
    if (value) return value;
  }

  return '';
}

function getDrawEngines(drawMode) {
  return DRAW_MODE_ENGINES[drawMode] || DRAW_MODE_ENGINES.jimeng5;
}

function getFallbackExtension(engine, cfg) {
  if (engine === 'jimeng5') {
    return cfg.jimeng5_output_format === 'png' ? '.png' : '.jpg';
  }

  return '.png';
}

async function submitNano2Job(cfg, prompt) {
  const headers = cfg.nano2_x_channel
    ? buildMxHeaders(cfg, { 'X-Channel': cfg.nano2_x_channel })
    : buildMxHeaders(cfg);

  const resp = await axios.post(
    buildMxUrl(cfg.base_url, '/api/v2/nano2'),
    {
      prompt,
      image_size: cfg.nano2_image_size,
      aspect_ratio: cfg.nano2_aspect_ratio,
      reference_images: cfg.nano2_reference_images,
    },
    { headers, timeout: 30000, proxy: false }
  );

  const taskId = pickTaskId(resp.data);
  if (!taskId) throw new Error('Nano Banana2 未返回 task_id');
  return taskId;
}

async function submitJimeng5Job(cfg, prompt) {
  const resp = await axios.post(
    buildMxUrl(cfg.base_url, '/api/v2/draw-5-0'),
    {
      prompt,
      reference_images: cfg.jimeng5_reference_images,
      model: cfg.jimeng5_model,
      size: cfg.jimeng5_size,
      web_search: cfg.jimeng5_web_search,
      output_format: cfg.jimeng5_output_format,
    },
    { headers: buildMxHeaders(cfg), timeout: 30000, proxy: false }
  );

  const taskId = pickTaskId(resp.data);
  if (!taskId) throw new Error('即梦绘画 5.0 未返回 task_id');
  return taskId;
}

async function pollMxTask(cfg, taskPath, taskId) {
  const start = Date.now();

  while (Date.now() - start < cfg.max_wait_ms) {
    await new Promise(resolve => setTimeout(resolve, cfg.poll_interval_ms));

    const resp = await axios.get(buildMxUrl(cfg.base_url, taskPath), {
      params: { task_id: taskId },
      headers: buildMxHeaders(cfg),
      timeout: 15000,
      proxy: false,
    });

    const taskData = unwrapMxData(resp.data) || {};
    const status = normalizeTaskStatus(taskData.status);

    if (status === 'completed' || status === 'success') return taskData;
    if (status === 'failed' || status === 'failure' || status === 'cancelled') {
      throw new Error(pickTaskError(taskData) || '绘图失败');
    }
  }

  throw new Error('绘图超时');
}

function getEngineConfig(engine, cfg, row) {
  if (engine === 'nano2') {
    return {
      label: 'Nano Banana2',
      prompt: resolvePrompt(row, cfg.nano2_prompt_field),
      taskPath: '/api/v2/nano/task',
      submit: () => submitNano2Job(cfg, resolvePrompt(row, cfg.nano2_prompt_field)),
    };
  }

  return {
    label: '即梦绘画5.0',
    prompt: resolvePrompt(row, cfg.jimeng5_prompt_field),
    taskPath: '/api/v2/draw/task',
    submit: () => submitJimeng5Job(cfg, resolvePrompt(row, cfg.jimeng5_prompt_field)),
  };
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

  try {
    const invalidMessages = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileLabel = file.originalname || `图片${i + 1}`;

      try {
        const meta = await sharp(file.buffer).metadata();
        ensureMinimumImageSize(meta, `${fileLabel} `);
      } catch (error) {
        invalidMessages.push(error.message || `${fileLabel} 无法读取尺寸`);
      }
    }

    if (invalidMessages.length) {
      return res.status(400).json({ message: invalidMessages.join('；') });
    }

    const charDir = getCharacterImageDir(row);
    fs.mkdirSync(charDir, { recursive: true });

    const savedPaths = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = getUploadExtension(file);
      const filename = buildImageFilename(row, ext, Date.now(), i);
      const destPath = path.join(charDir, filename);
      fs.writeFileSync(destPath, file.buffer);
      await autoCropImage(destPath);
      savedPaths.push(buildImagePublicPath(row, filename));
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
    : await query('SELECT * FROM characters ORDER BY id');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    const engines = getDrawEngines(cfg.draw_mode);

    for (const engine of engines) {
      try {
        const engineConfig = getEngineConfig(engine, cfg, row);
        if (!engineConfig.prompt) {
          res.write(`data: ${JSON.stringify({ id: row.id, engine, status: 'skipped', error: `${engineConfig.label} 缺少可用提示词` })}\n\n`);
          continue;
        }

        res.write(`data: ${JSON.stringify({ id: row.id, engine, status: 'submitting' })}\n\n`);

        const taskId = await engineConfig.submit();
        res.write(`data: ${JSON.stringify({ id: row.id, engine, status: 'waiting', taskId })}\n\n`);

        const taskResult = await pollMxTask(cfg, engineConfig.taskPath, taskId);
        const imageUrls = pickImageUrls(taskResult);

        if (!imageUrls.length) {
          throw new Error(`${engineConfig.label} 未返回图片地址`);
        }

        const charDir = getCharacterImageDir(row);
        fs.mkdirSync(charDir, { recursive: true });

        const savedPaths = [];
        const stamp = Date.now();
        for (let i = 0; i < imageUrls.length; i++) {
          let ext = '.png';
          try {
            ext = path.extname(new URL(imageUrls[i]).pathname) || getFallbackExtension(engine, cfg);
          } catch {
            ext = getFallbackExtension(engine, cfg);
          }

          const filename = buildImageFilename(row, ext, stamp, i);
          const destPath = path.join(charDir, filename);
          await downloadImage(imageUrls[i], destPath);
          savedPaths.push(buildImagePublicPath(row, filename));
        }

        const existing = JSON.parse(row.image_paths || '[]');
        const merged = [...existing, ...savedPaths];
        await execute('UPDATE characters SET image_paths=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [
          JSON.stringify(merged),
          row.id,
        ]);
        row.image_paths = JSON.stringify(merged);

        res.write(`data: ${JSON.stringify({ id: row.id, engine, status: 'done', paths: savedPaths })}\n\n`);
      } catch (error) {
        res.write(`data: ${JSON.stringify({ id: row.id, engine, status: 'error', error: getErrorMessage(error, '绘图失败') })}\n\n`);
      }
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
