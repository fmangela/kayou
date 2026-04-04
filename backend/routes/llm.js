const express = require('express');
const axios = require('axios');
const { getDb } = require('../db/init');
const router = express.Router();

function getConfig() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'llm_%'").all();
  const cfg = {};
  for (const r of rows) cfg[r.key.replace('llm_', '')] = r.value;
  return cfg;
}

router.get('/config', (req, res) => {
  res.json(getConfig());
});

router.post('/config', (req, res) => {
  const db = getDb();
  const { base_url, api_key, model } = req.body;
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  if (base_url !== undefined) stmt.run('llm_base_url', base_url);
  if (api_key !== undefined) stmt.run('llm_api_key', api_key);
  if (model !== undefined) stmt.run('llm_model', model);
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const cfg = getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });
  try {
    const resp = await axios.post(
      `${cfg.base_url}/chat/completions`,
      { model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 },
      { headers: { Authorization: `Bearer ${cfg.api_key}` }, timeout: 10000 }
    );
    res.json({ ok: true, model: resp.data.model });
  } catch (e) {
    res.status(500).json({ message: e.message });
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
  const db = getDb();
  const cfg = getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });
  const { id } = req.body; // if id provided, regenerate single
  const rows = id
    ? db.prepare('SELECT * FROM characters WHERE id = ?').all(id)
    : db.prepare('SELECT * FROM characters WHERE background IS NULL OR appearance IS NULL').all();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const bgPrompt = `你是一个历史文化专家。请为人物"${row.name}"写一段100字左右的人物背景介绍，包括其历史地位、主要事迹和性格特点。只输出介绍内容，不要标题。`;
      const apPrompt = `你是一个角色设计师。请为人物"${row.name}"写一段80字左右的外形描述，包括面部特征、服装风格、气质神态。只输出描述内容，不要标题。`;
      const [background, appearance] = await Promise.all([
        callLLM(cfg, bgPrompt),
        callLLM(cfg, apPrompt),
      ]);
      db.prepare('UPDATE characters SET background=?, appearance=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(background, appearance, row.id);
      res.write(`data: ${JSON.stringify({ id: row.id, background, appearance })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ id: row.id, error: e.message })}\n\n`);
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

router.post('/generate-prompts', async (req, res) => {
  const db = getDb();
  const cfg = getConfig();
  if (!cfg.base_url || !cfg.api_key) return res.status(400).json({ message: '请先配置API参数' });
  const { id } = req.body;
  const rows = id
    ? db.prepare('SELECT * FROM characters WHERE id = ?').all(id)
    : db.prepare('SELECT * FROM characters WHERE (nb2_prompt IS NULL OR mj_prompt IS NULL) AND background IS NOT NULL').all();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  for (const row of rows) {
    try {
      const nb2P = `根据以下人物信息，生成适合Nano Banana 2 AI绘画的中文提示词，描述人物外形、服装、场景氛围，不要提及卡牌游戏或卡牌边框，100字以内：\n人物：${row.name}\n背景：${row.background}\n外形：${row.appearance}`;
      const mjP = `根据以下人物信息，生成适合Midjourney AI绘画的中文提示词，描述人物外形、服装、场景氛围，不要提及卡牌游戏或卡牌边框，100字以内：\n人物：${row.name}\n背景：${row.background}\n外形：${row.appearance}`;
      const [nb2_prompt, mj_prompt] = await Promise.all([
        callLLM(cfg, nb2P),
        callLLM(cfg, mjP),
      ]);
      db.prepare('UPDATE characters SET nb2_prompt=?, mj_prompt=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(nb2_prompt, mj_prompt, row.id);
      res.write(`data: ${JSON.stringify({ id: row.id, nb2_prompt, mj_prompt })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ id: row.id, error: e.message })}\n\n`);
    }
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

module.exports = router;
