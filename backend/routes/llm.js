const express = require('express');
const axios = require('axios');
const { query, execute } = require('../db/init');

const router = express.Router();

const DEFAULT_DESC_BACKGROUND_TEMPLATE = '你是一个角色设定专家。请为人物“{{name}}”写一段100字左右的人物背景介绍。{{#if series_name}}该人物所属系列为“{{series_name}}”。{{/if}}{{#if faction_name}}阵营为“{{faction_name}}”。{{/if}}{{#if rarity}}稀有度为“{{rarity}}”。{{/if}}{{#if element_name}}属性为“{{element_name}}”。{{/if}}要求内容贴合人物所属题材与世界观，可根据系列自动判断风格。包括其身份定位、主要经历、性格特点或代表性特征。只输出介绍内容，不要标题。';
const DEFAULT_DESC_APPEARANCE_TEMPLATE = '你是一个角色美术设定师。请为人物“{{name}}”写一段80字左右的外形描述。{{#if series_name}}该人物所属系列为“{{series_name}}”。{{/if}}{{#if faction_name}}阵营为“{{faction_name}}”。{{/if}}{{#if rarity}}稀有度为“{{rarity}}”。{{/if}}{{#if element_name}}属性为“{{element_name}}”。{{/if}}要求内容贴合人物所属题材与世界观，描述面部特征、发型、服装、配饰、气质神态与整体视觉风格。只输出描述内容，不要标题。';

function buildLlmUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function getConfig() {
  const rows = await query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'llm_%'");
  const config = {};
  for (const row of rows) {
    config[row.key.replace('llm_', '')] = row.value;
  }
  if (!config.desc_background_template) config.desc_background_template = DEFAULT_DESC_BACKGROUND_TEMPLATE;
  if (!config.desc_appearance_template) config.desc_appearance_template = DEFAULT_DESC_APPEARANCE_TEMPLATE;
  return config;
}

router.get('/config', async (req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (error) {
    next(error);
  }
});

router.post('/config', async (req, res, next) => {
  const { base_url, api_key, model, desc_background_template, desc_appearance_template } = req.body;

  try {
    if (base_url !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['llm_base_url', base_url]
      );
    }
    if (api_key !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['llm_api_key', api_key]
      );
    }
    if (model !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['llm_model', model]
      );
    }
    if (desc_background_template !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['llm_desc_background_template', desc_background_template]
      );
    }
    if (desc_appearance_template !== undefined) {
      await execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['llm_desc_appearance_template', desc_appearance_template]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });

  try {
    const resp = await axios.post(
      buildLlmUrl(cfg.base_url, '/chat/completions'),
      { model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 },
      { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 10000, proxy: false }
    );
    res.json({ ok: true, model: resp.data.model });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function callLLM(cfg, prompt) {
  const resp = await axios.post(
    buildLlmUrl(cfg.base_url, '/chat/completions'),
    { model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 800 },
    { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 60000, proxy: false }
  );
  return resp.data.choices[0].message.content.trim();
}

function renderTemplate(template, payload) {
  let result = template;

  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, block) => {
    const value = payload[key];
    return value === undefined || value === null || value === '' ? '' : block;
  });

  result = result.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = payload[key];
    return value === undefined || value === null ? '' : String(value);
  });

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

router.post('/generate-descriptions', async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });

  const { id, ids, desc_background_template, desc_appearance_template } = req.body;
  const backgroundTemplate = desc_background_template || cfg.desc_background_template || DEFAULT_DESC_BACKGROUND_TEMPLATE;
  const appearanceTemplate = desc_appearance_template || cfg.desc_appearance_template || DEFAULT_DESC_APPEARANCE_TEMPLATE;
  const rows = Array.isArray(ids) && ids.length
    ? await query(
      `SELECT c.*, a.series_name, a.faction_name, a.rarity, a.element_name
       FROM characters c
       LEFT JOIN card_attributes a ON a.character_id = c.id
       WHERE c.id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    : id
      ? await query(
      `SELECT c.*, a.series_name, a.faction_name, a.rarity, a.element_name
       FROM characters c
       LEFT JOIN card_attributes a ON a.character_id = c.id
       WHERE c.id = ?`,
      [id]
    )
      : await query(
      `SELECT c.*, a.series_name, a.faction_name, a.rarity, a.element_name
       FROM characters c
       LEFT JOIN card_attributes a ON a.character_id = c.id
       WHERE c.background IS NULL OR c.appearance IS NULL`
    );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const bgPrompt = renderTemplate(backgroundTemplate, row);
      const apPrompt = renderTemplate(appearanceTemplate, row);
      const [background, appearance] = await Promise.all([callLLM(cfg, bgPrompt), callLLM(cfg, apPrompt)]);

      await execute(
        'UPDATE characters SET background=?, appearance=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [background, appearance, row.id]
      );

      res.write(`data: ${JSON.stringify({ id: row.id, background, appearance })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ id: row.id, error: error.message })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

router.post('/generate-prompts', async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });

  const { id, ids } = req.body;
  const rows = Array.isArray(ids) && ids.length
    ? await query(`SELECT * FROM characters WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
    : id
      ? await query('SELECT * FROM characters WHERE id = ?', [id])
      : await query('SELECT * FROM characters WHERE (nb2_prompt IS NULL OR mj_prompt IS NULL) AND background IS NOT NULL');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const nb2Prompt = `根据以下人物信息，生成适合Nano Banana 2 AI绘画的中文提示词，描述人物外形、服装、场景氛围，不要提及卡牌游戏或卡牌边框，100字以内：\n人物：${row.name}\n背景：${row.background}\n外形：${row.appearance}`;
      const mjPrompt = `根据以下人物信息，生成适合Midjourney AI绘画的中文提示词，描述人物外形、服装、场景氛围，不要提及卡牌游戏或卡牌边框，100字以内：\n人物：${row.name}\n背景：${row.background}\n外形：${row.appearance}`;
      const [nb2_prompt, mj_prompt] = await Promise.all([callLLM(cfg, nb2Prompt), callLLM(cfg, mjPrompt)]);

      await execute(
        'UPDATE characters SET nb2_prompt=?, mj_prompt=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [nb2_prompt, mj_prompt, row.id]
      );

      res.write(`data: ${JSON.stringify({ id: row.id, nb2_prompt, mj_prompt })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ id: row.id, error: error.message })}\n\n`);
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

module.exports = router;
