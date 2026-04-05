const express = require('express');
const axios = require('axios');
const { query, execute } = require('../db/init');

const router = express.Router();

async function getConfig() {
  const rows = await query("SELECT `key`, `value` FROM settings WHERE `key` LIKE 'llm_%'");
  const config = {};
  for (const row of rows) {
    config[row.key.replace('llm_', '')] = row.value;
  }
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
  const { base_url, api_key, model } = req.body;

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
      `${cfg.base_url}/chat/completions`,
      { model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 },
      { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 10000 }
    );
    res.json({ ok: true, model: resp.data.model });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function callLLM(cfg, prompt) {
  const resp = await axios.post(
    `${cfg.base_url}/chat/completions`,
    { model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: prompt }], max_tokens: 800 },
    { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 60000 }
  );
  return resp.data.choices[0].message.content.trim();
}

router.post('/generate-descriptions', async (req, res) => {
  const cfg = await getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });

  const { id } = req.body;
  const rows = id
    ? await query('SELECT * FROM characters WHERE id = ?', [id])
    : await query('SELECT * FROM characters WHERE background IS NULL OR appearance IS NULL');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const bgPrompt = `你是一个历史文化专家。请为人物"${row.name}"写一段100字左右的人物背景介绍，包括其历史地位、主要事迹和性格特点。只输出介绍内容，不要标题。`;
      const apPrompt = `你是一个角色设计师。请为人物"${row.name}"写一段80字左右的外形描述，包括面部特征、服装风格、气质神态。只输出描述内容，不要标题。`;
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

  const { id } = req.body;
  const rows = id
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
