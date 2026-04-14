const express = require('express');
const multer = require('multer');
const { stringify } = require('csv-stringify/sync');
const { query, execute } = require('../db/init');
const { parseImportFile } = require('../services/importService');
const { toPinyinInitials } = require('../services/pinyinService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const ATTRIBUTE_FIELDS = [
  'card_code',
  'series_name',
  'faction_name',
  'rarity',
  'force_value',
  'intellect_value',
  'speed_value',
  'stamina_value',
  'element_name',
  'skill1_id',
  'skill1_name',
  'skill1_desc',
  'skill2_id',
  'skill2_name',
  'skill2_desc',
  'skill3_id',
  'skill3_name',
  'skill3_desc',
];

const ATTRIBUTE_EXPORT_HEADERS = [
  'character_id',
  'name',
  'pinyin',
  'card_code',
  'series_name',
  'faction_name',
  'rarity',
  'force_value',
  'intellect_value',
  'speed_value',
  'stamina_value',
  'element_name',
  'skill1_id',
  'skill1_name',
  'skill1_desc',
  'skill2_id',
  'skill2_name',
  'skill2_desc',
  'skill3_id',
  'skill3_name',
  'skill3_desc',
];

const SORTABLE_FIELDS = new Set([
  'character_id',
  'name',
  'pinyin',
  'card_code',
  'series_name',
  'faction_name',
  'rarity',
  'force_value',
  'intellect_value',
  'speed_value',
  'stamina_value',
  'element_name',
]);

const NUMERIC_FIELDS = new Set([
  'force_value',
  'intellect_value',
  'speed_value',
  'stamina_value',
]);

const CARD_MAKER_SETTING_KEY = 'card_maker_design';
const LM_CONFIG_KEY = 'lm_config';
const ELEMENT_POOL = {
  chinese: ['金', '木', '水', '火', '土'],
  overseas: ['火', '土', '水', '电', '风', '冰', '光', '暗', '心灵'],
  tokusatsu: ['战斗', '技术', '能量'],
};

const DEFAULT_LM_CONFIG = {
  api_url: '',
  api_key: '',
  model: 'gpt-4o',
  system_prompt_series: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '请根据这个人物在该系列中的身份、经历、立场与关系，判断其阵营归属。',
    '如果是三国系列，优先判断为：魏、蜀、吴、群雄中的一个。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"faction_name":"阵营名"}。',
  ].join('\n'),
  system_prompt_stats: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '{{#if rarity}}当前稀有度为“{{rarity}}”，请优先沿用该稀有度。{{/if}}',
    '请根据这个人物的特点与下列规则，确定稀有度并设计武力、智力、速度、体力四项属性：',
    '1. 稀有度只能从 N、R、CP、SR、SSR、UR、PR、HR 中选择一个。',
    '2. 四项都必须是 1-9999 的整数。',
    '3. 四项总和规则：N=5000，R=5500，CP=5800，SR=6000，SSR=6500，UR=7000，PR=6300，HR=6600。',
    '4. 四项总和不能超过所选稀有度对应总值，也不能低于对应总值100以上。',
    '5. 数值需要体现人物定位、经历、智谋、爆发力或耐久特色。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"rarity":"稀有度","force_value":数字,"intellect_value":数字,"speed_value":数字,"stamina_value":数字}。',
  ].join('\n'),
  system_prompt_skills: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”，稀有度为“{{rarity}}”。',
    '请根据这个人物的特点、身份与代表事件，设计 {{skill_count}} 个技能。',
    '每个技能只需要名字与描述，名称要简洁，描述要体现人物特色与玩法感。',
    '技能目前只输出描述，不需要返回底层技能模板、脚本字段、数值公式或触发器结构。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON 数组，格式：[{"name":"技能名","desc":"技能描述"}]。',
  ].join('\n'),
  system_prompt_element: [
    '现在有个卡牌游戏需要设定角色，是“{{series_name}}”里的“{{character_name}}”。',
    '请根据系列题材和人物气质，为其分配一个元素属性。',
    '中国题材统一且只能从：金、木、水、火、土 中选择。',
    '国外或科幻题材统一且只能从：火、土、水、电、风、冰、光、暗、心灵 中选择。',
    '特摄角色统一且只能从：战斗、技术、能量 中选择。',
    '{{#if background}}人物背景：{{background}}{{/if}}',
    '{{#if appearance}}人物外形：{{appearance}}{{/if}}',
    '只返回 JSON，格式：{"element_name":"属性名"}。',
  ].join('\n'),
};

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAttributeValue(field, value) {
  if (value === undefined || value === null || value === '') return null;
  if (NUMERIC_FIELDS.has(field)) return Number(value);
  return value;
}

function normalizeAttributeRow(row) {
  return {
    ...row,
    character_id: row.character_id,
    image_paths: parseJson(row.image_paths, []),
    webp_paths: parseJson(row.webp_paths, []),
  };
}

function renderPromptTemplate(template, payload) {
  let result = String(template || '');

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

function buildSeriesPrefix(seriesName) {
  return toPinyinInitials(seriesName).slice(0, 4) || 'XX';
}

function resolveLmRequestUrl(apiUrl) {
  const value = String(apiUrl || '').trim();
  if (!value) return null;

  const url = new URL(value);
  const normalizedPath = url.pathname.replace(/\/+$/, '');

  if (normalizedPath.endsWith('/chat/completions')) {
    return url;
  }

  url.pathname = `${normalizedPath || ''}/chat/completions`;
  return url;
}

function extractJsonContent(content, type) {
  if (!content) return null;
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = String(content).match(pattern);
  if (!match) return null;
  return parseJson(match[0], null);
}

function normalizeRarityValue(value) {
  const rarity = String(value || '').trim().toUpperCase();
  return RARITY_TOTAL[rarity] ? rarity : null;
}

function inferRarityFromStats(stats) {
  const keys = ['force_value', 'intellect_value', 'speed_value', 'stamina_value'];
  const values = keys.map(key => Number(stats?.[key]));
  if (values.some(value => !Number.isFinite(value))) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  let matchedRarity = null;
  let matchedGap = Infinity;

  for (const [rarity, target] of Object.entries(RARITY_TOTAL)) {
    const gap = Math.abs(target - total);
    if (gap <= 100 && gap < matchedGap) {
      matchedGap = gap;
      matchedRarity = rarity;
    }
  }

  return matchedRarity;
}

function ensureStatsPromptSupportsRarity(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return text;
  if (text.includes('"rarity"') || text.includes("'rarity'")) return text;

  return [
    '请在返回武力、智力、速度、体力的同时，一并返回 rarity 字段。',
    'rarity 只能从 N、R、CP、SR、SSR、UR、PR、HR 中选择一个。',
    '若当前没有稀有度，请先判断最合适的 rarity，再让四项总和匹配该 rarity 对应规则。',
    text,
  ].join('\n');
}

function buildRarityFallbackPrompt(context) {
  return [
    `现在有个卡牌游戏需要设定角色，是“${context.series_name || ''}”里的“${context.character_name || ''}”。`,
    '请只判断这个角色最合适的稀有度。',
    '稀有度只能从 N、R、CP、SR、SSR、UR、PR、HR 中选择一个。',
    '判断时请结合人物知名度、战斗定位、剧情地位、历史影响力或代表事件综合给出结果。',
    context.background ? `人物背景：${context.background}` : '',
    context.appearance ? `人物外形：${context.appearance}` : '',
    '只返回 JSON，格式：{"rarity":"稀有度"}。',
  ].filter(Boolean).join('\n');
}

function getSeriesElementDomain(seriesName) {
  const source = String(seriesName || '').trim();
  const normalized = source.toLowerCase();

  const tokusatsuKeywords = ['特摄', '奥特曼', '假面骑士', '骑士', '战队', '哥斯拉'];
  if (tokusatsuKeywords.some(keyword => source.includes(keyword))) {
    return 'tokusatsu';
  }

  const overseasKeywords = [
    '科幻', '未来', '机甲', '宇宙', '星际', '赛博', '外星', '漫威', 'marvel', 'dc',
    'star wars', 'star trek', 'gundam', 'ultra', 'transformers',
  ];
  if (overseasKeywords.some(keyword => normalized.includes(keyword.toLowerCase()))) {
    return 'overseas';
  }

  if (/[a-z]/i.test(source)) {
    return 'overseas';
  }

  return 'chinese';
}

function normalizeElementValue(seriesName, value) {
  const domain = getSeriesElementDomain(seriesName);
  const allowed = ELEMENT_POOL[domain] || [];
  const normalized = String(value || '').trim();
  return allowed.includes(normalized) ? normalized : null;
}

function clampStatValue(value) {
  if (!Number.isFinite(value)) return null;
  return Math.min(9999, Math.max(1, Math.round(value)));
}

function fitStatsToTarget(stats, totalTarget) {
  const keys = ['force_value', 'intellect_value', 'speed_value', 'stamina_value'];
  const values = keys.map(key => clampStatValue(Number(stats[key])));
  if (values.some(value => value === null)) return null;

  const minTotal = Math.max(4, totalTarget - 100);
  const currentTotal = values.reduce((sum, value) => sum + value, 0);
  const desiredTotal = Math.min(totalTarget, Math.max(minTotal, currentTotal));

  if (currentTotal !== desiredTotal) {
    const ratio = desiredTotal / currentTotal;
    for (let index = 0; index < values.length; index += 1) {
      values[index] = clampStatValue(values[index] * ratio);
    }
  }

  let diff = desiredTotal - values.reduce((sum, value) => sum + value, 0);
  while (diff !== 0) {
    let changed = false;
    const indexes = diff > 0
      ? [0, 1, 2, 3]
      : [0, 1, 2, 3].sort((left, right) => values[right] - values[left]);

    for (const index of indexes) {
      if (diff > 0 && values[index] < 9999) {
        values[index] += 1;
        diff -= 1;
        changed = true;
      } else if (diff < 0 && values[index] > 1) {
        values[index] -= 1;
        diff += 1;
        changed = true;
      }

      if (diff === 0) break;
    }

    if (!changed) break;
  }

  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

function normalizeDesignRow(row) {
  return {
    ...row,
    selected_webp_path: row.selected_webp_path || null,
    visible_fields: parseJson(row.visible_fields, []),
    font_config: parseJson(row.font_config, {}),
    layout_config: parseJson(row.layout_config, {}),
    effect_config: parseJson(row.effect_config, {}),
  };
}

function normalizeStoredDesign(payload = {}) {
  return {
    selected_webp_path: payload.selected_webp_path || null,
    visible_fields: Array.isArray(payload.visible_fields) ? payload.visible_fields : [],
    font_config: payload.font_config && typeof payload.font_config === 'object' ? payload.font_config : {},
    layout_config: payload.layout_config && typeof payload.layout_config === 'object' ? payload.layout_config : {},
    effect_config: payload.effect_config && typeof payload.effect_config === 'object' ? payload.effect_config : {},
    scope: payload.scope || 'global',
    schema_version: Number(payload.schema_version) || 1,
  };
}

async function getSharedCardMakerDesign() {
  const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', [CARD_MAKER_SETTING_KEY]);
  if (!rows.length) return null;
  const payload = parseJson(rows[0].value, null);
  if (!payload || typeof payload !== 'object') return null;
  return normalizeStoredDesign({
    ...payload,
    selected_webp_path: null,
    scope: 'global',
    schema_version: Number(payload.schema_version) || 2,
  });
}

async function getLegacyCardMakerDesign(characterId) {
  const rows = await query('SELECT * FROM card_designs ORDER BY updated_at DESC, character_id ASC LIMIT 1');
  if (!rows.length) return null;

  const design = normalizeDesignRow(rows[0]);
  return normalizeStoredDesign({
    ...design,
    selected_webp_path: rows[0].character_id === characterId ? design.selected_webp_path : null,
    scope: 'legacy-character',
    schema_version: 1,
  });
}

async function getCardMakerDesign(characterId) {
  return (await getSharedCardMakerDesign()) || (await getLegacyCardMakerDesign(characterId));
}

function buildAttributeWhereClause(filters) {
  const where = [];
  const params = [];

  if (filters.keyword) {
    const keyword = `%${filters.keyword}%`;
    where.push(`(
      c.name LIKE ? OR
      c.pinyin LIKE ? OR
      COALESCE(a.card_code, '') LIKE ? OR
      COALESCE(a.series_name, '') LIKE ? OR
      COALESCE(a.faction_name, '') LIKE ? OR
      COALESCE(a.rarity, '') LIKE ? OR
      COALESCE(a.element_name, '') LIKE ? OR
      COALESCE(a.skill1_name, '') LIKE ? OR
      COALESCE(a.skill2_name, '') LIKE ? OR
      COALESCE(a.skill3_name, '') LIKE ?
    )`);
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }

  const equalsFields = [
    ['series_name', 'a.series_name'],
    ['faction_name', 'a.faction_name'],
    ['rarity', 'a.rarity'],
    ['element_name', 'a.element_name'],
    ['character_id', 'c.id'],
  ];
  for (const [inputKey, sqlField] of equalsFields) {
    if (filters[inputKey] !== undefined && filters[inputKey] !== '') {
      where.push(`${sqlField} = ?`);
      params.push(filters[inputKey]);
    }
  }

  for (const field of ['card_code', 'skill1_name', 'skill2_name', 'skill3_name']) {
    if (filters[field]) {
      where.push(`COALESCE(a.${field}, '') LIKE ?`);
      params.push(`%${filters[field]}%`);
    }
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

async function getAttributeRows(filters = {}) {
  const { whereSql, params } = buildAttributeWhereClause(filters);
  const sortField = SORTABLE_FIELDS.has(filters.sortField) ? filters.sortField : 'character_id';
  const sortOrder = String(filters.sortOrder || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const orderSql = sortField === 'character_id'
    ? `ORDER BY c.id ${sortOrder}`
    : `ORDER BY ${sortField.startsWith('c.') || sortField.startsWith('a.') ? sortField : (['name', 'pinyin'].includes(sortField) ? `c.${sortField}` : `a.${sortField}`)} ${sortOrder}, c.id ASC`;

  const rows = await query(
    `
      SELECT
        c.id AS character_id,
        c.name,
        c.pinyin,
        c.background,
        c.appearance,
        c.image_paths,
        c.webp_paths,
        a.card_code,
        a.series_name,
        a.faction_name,
        a.rarity,
        a.force_value,
        a.intellect_value,
        a.speed_value,
        a.stamina_value,
        a.element_name,
        a.skill1_id,
        a.skill1_name,
        a.skill1_desc,
        a.skill2_id,
        a.skill2_name,
        a.skill2_desc,
        a.skill3_id,
        a.skill3_name,
        a.skill3_desc,
        a.created_at,
        a.updated_at
      FROM characters c
      LEFT JOIN card_attributes a ON a.character_id = c.id
      ${whereSql}
      ${orderSql}
    `,
    params
  );

  return rows.map(normalizeAttributeRow);
}

async function upsertAttributeRow(characterId, payload) {
  const fields = ATTRIBUTE_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(payload, field));
  if (!fields.length) return;

  const values = fields.map(field => normalizeAttributeValue(field, payload[field]));
  await execute(
    `
      INSERT INTO card_attributes (
        character_id,
        ${fields.join(', ')}
      ) VALUES (
        ?,
        ${fields.map(() => '?').join(', ')}
      )
      ON DUPLICATE KEY UPDATE
        ${fields.map(field => `${field} = VALUES(${field})`).join(', ')},
        updated_at = CURRENT_TIMESTAMP
    `,
    [characterId, ...values]
  );
}

router.get('/attributes', async (req, res, next) => {
  try {
    const rows = await getAttributeRows(req.query);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/attributes/options', async (req, res, next) => {
  try {
    const [seriesRows, factionRows, rarityRows, elementRows] = await Promise.all([
      query("SELECT DISTINCT series_name AS value FROM card_attributes WHERE series_name IS NOT NULL AND series_name <> '' ORDER BY series_name"),
      query("SELECT DISTINCT faction_name AS value FROM card_attributes WHERE faction_name IS NOT NULL AND faction_name <> '' ORDER BY faction_name"),
      query("SELECT DISTINCT rarity AS value FROM card_attributes WHERE rarity IS NOT NULL AND rarity <> '' ORDER BY rarity"),
      query("SELECT DISTINCT element_name AS value FROM card_attributes WHERE element_name IS NOT NULL AND element_name <> '' ORDER BY element_name"),
    ]);

    res.json({
      series: seriesRows.map(row => row.value),
      factions: factionRows.map(row => row.value),
      rarities: rarityRows.map(row => row.value),
      elements: elementRows.map(row => row.value),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/attributes/:characterId', async (req, res, next) => {
  const characterId = Number(req.params.characterId);
  if (!characterId) return res.status(400).json({ message: '人物 ID 无效' });

  try {
    await upsertAttributeRow(characterId, req.body);

    const rows = await getAttributeRows({ character_id: characterId });
    res.json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '卡牌编号已存在' });
    }
    next(error);
  }
});

router.get('/attributes/template', async (req, res, next) => {
  try {
    const csv = stringify([Object.fromEntries(ATTRIBUTE_EXPORT_HEADERS.map(key => [key, '']))], { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="card-attributes-template.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.post('/attributes/import', upload.single('file'), async (req, res, next) => {
  try {
    const records = parseImportFile(req.file);
    const nameMapRows = await query('SELECT id, name FROM characters');
    const nameToId = new Map(nameMapRows.map(row => [row.name, row.id]));
    let updated = 0;

    for (const record of records) {
      const characterId = Number(record.character_id) || nameToId.get(record.name);
      if (!characterId) continue;

      await upsertAttributeRow(characterId, record);
      updated += 1;
    }

    res.json({ updated });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '导入内容中存在重复卡牌编号' });
    }
    res.status(400).json({ message: error.message || '导入失败，请检查文件格式' });
  }
});

router.get('/attributes/export', async (req, res, next) => {
  try {
    const rows = await getAttributeRows(req.query);
    const csv = stringify(
      rows.map(row => {
        const data = {};
        for (const key of ATTRIBUTE_EXPORT_HEADERS) {
          data[key] = row[key] ?? '';
        }
        return data;
      }),
      { header: true }
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="card-attributes.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get('/maker/design', async (req, res, next) => {
  try {
    const design = await getSharedCardMakerDesign();
    res.json(design);
  } catch (error) {
    next(error);
  }
});

router.get('/maker/characters', async (req, res, next) => {
  try {
    const rows = await getAttributeRows({});
    res.json(rows.filter(row => row.webp_paths?.length));
  } catch (error) {
    next(error);
  }
});

router.get('/maker/:characterId', async (req, res, next) => {
  const characterId = Number(req.params.characterId);
  if (!characterId) return res.status(400).json({ message: '人物 ID 无效' });

  try {
    const rows = await getAttributeRows({ character_id: characterId });
    if (!rows.length) return res.status(404).json({ message: '人物不存在' });
    res.json({
      attribute: rows[0],
      design: await getCardMakerDesign(characterId),
    });
  } catch (error) {
    next(error);
  }
});

router.put('/maker/:characterId', async (req, res, next) => {
  const characterId = Number(req.params.characterId);
  if (!characterId) return res.status(400).json({ message: '人物 ID 无效' });

  const {
    visible_fields = [],
    font_config = {},
    layout_config = {},
    effect_config = {},
  } = req.body;

  try {
    const characterRows = await query('SELECT id FROM characters WHERE id = ?', [characterId]);
    if (!characterRows.length) return res.status(404).json({ message: '人物不存在' });

    const payload = {
      selected_webp_path: null,
      visible_fields: Array.isArray(visible_fields) ? visible_fields : [],
      font_config: font_config && typeof font_config === 'object' ? font_config : {},
      layout_config: layout_config && typeof layout_config === 'object' ? layout_config : {},
      effect_config: effect_config && typeof effect_config === 'object' ? effect_config : {},
      scope: 'global',
      schema_version: 2,
    };

    await execute(
      `
        INSERT INTO settings (
          \`key\`,
          \`value\`
        ) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          \`value\` = VALUES(\`value\`)
      `,
      [
        CARD_MAKER_SETTING_KEY,
        JSON.stringify(payload),
      ]
    );

    res.json(await getCardMakerDesign(characterId));
  } catch (error) {
    next(error);
  }
});

// ── LM Config ──────────────────────────────────────────────────────────────
async function getLmConfig() {
  const rows = await query('SELECT `value` FROM settings WHERE `key` = ?', [LM_CONFIG_KEY]);
  const stored = rows.length ? parseJson(rows[0].value, {}) : {};
  return {
    ...DEFAULT_LM_CONFIG,
    ...(stored && typeof stored === 'object' ? stored : {}),
  };
}

router.get('/lm-config', async (req, res, next) => {
  try {
    res.json(await getLmConfig());
  } catch (error) {
    next(error);
  }
});

router.put('/lm-config', async (req, res, next) => {
  try {
    const current = await getLmConfig();
    const cfg = {
      ...current,
      ...req.body,
    };
    await execute(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [LM_CONFIG_KEY, JSON.stringify(cfg)]
    );
    res.json(cfg);
  } catch (error) {
    next(error);
  }
});

// ── Generate card codes ─────────────────────────────────────────────────────

router.post('/attributes/generate-code', async (req, res, next) => {
  const episode = Number(req.body.episode);
  if (!episode || episode < 1 || episode > 99) {
    return res.status(400).json({ message: '弹数必须在 1-99 之间' });
  }

  try {
    const candidates = await query(
      `SELECT c.id AS character_id, a.series_name
       FROM characters c
       JOIN card_attributes a ON a.character_id = c.id
       WHERE a.series_name IS NOT NULL AND a.series_name <> ''
         AND (a.card_code IS NULL OR a.card_code = '')
       ORDER BY a.series_name ASC, c.id ASC`
    );

    if (!candidates.length) {
      return res.json({ updated: 0, message: '没有需要生成编号的记录（需有系列且无编号）' });
    }

    const episodeStr = String(episode).padStart(2, '0');
    const groups = new Map();

    for (const candidate of candidates) {
      const prefix = buildSeriesPrefix(candidate.series_name);
      const groupKey = `${prefix}-${episodeStr}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          prefix,
          characterIds: [],
        });
      }
      groups.get(groupKey).characterIds.push(candidate.character_id);
    }

    let updated = 0;

    for (const group of groups.values()) {
      const existingRows = await query(
        'SELECT card_code FROM card_attributes WHERE card_code LIKE ?',
        [`${group.prefix}-${episodeStr}-%`]
      );

      const usedNumbers = new Set();
      for (const row of existingRows) {
        const parts = row.card_code ? row.card_code.split('-') : [];
        if (parts.length !== 3) continue;
        const number = Number(parts[2]);
        if (Number.isInteger(number) && number > 0) usedNumbers.add(number);
      }

      let nextNumber = 1;
      for (const characterId of group.characterIds) {
        while (usedNumbers.has(nextNumber)) nextNumber += 1;

        const cardCode = `${group.prefix}-${episodeStr}-${String(nextNumber).padStart(3, '0')}`;
        usedNumbers.add(nextNumber);
        nextNumber += 1;

        await execute(
          'UPDATE card_attributes SET card_code = ?, updated_at = CURRENT_TIMESTAMP WHERE character_id = ?',
          [cardCode, characterId]
        );
        updated += 1;
      }
    }

    res.json({ updated });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '生成的卡牌编号与已有编号冲突，请检查数据' });
    }
    next(error);
  }
});

// ── Generate attributes via LM ──────────────────────────────────────────────

async function callLmApi(cfg, messages) {
  const url = resolveLmRequestUrl(cfg.api_url);
  if (!url) {
    throw new Error('LM API 地址未配置');
  }
  const body = JSON.stringify({
    model: cfg.model || 'gpt-4o',
    messages,
    temperature: 0.7,
  });

  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? require('https') : require('http');
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.api_key}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const reqHttp = lib.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (resp.statusCode >= 400) {
            return reject(new Error(parsed.error?.message || `LM API 请求失败（${resp.statusCode}）`));
          }
          if (parsed.error) return reject(new Error(parsed.error.message || 'LM API error'));
          const content = parsed.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (e) {
          if (resp.statusCode >= 400) {
            return reject(new Error(`LM API 请求失败（${resp.statusCode}）`));
          }
          reject(new Error('LM API 返回格式错误'));
        }
      });
    });

    reqHttp.setTimeout(60000, () => {
      reqHttp.destroy(new Error('LM API 请求超时'));
    });
    reqHttp.on('error', reject);
    reqHttp.write(body);
    reqHttp.end();
  });
}

const RARITY_TOTAL = { N: 5000, R: 5500, SR: 6000, SSR: 6500, UR: 7000, PR: 6300, HR: 6600, CP: 5800 };
const RARITY_SKILLS = { N: 1, R: 1, CP: 1, SR: 1, PR: 1, SSR: 2, HR: 2, UR: 2 };

function buildLmPromptContext(row) {
  const rarity = normalizeRarityValue(row.rarity) || '';
  const targetTotal = rarity ? RARITY_TOTAL[rarity] : null;
  const skillCount = rarity ? RARITY_SKILLS[rarity] : null;

  return {
    series_name: row.series_name || '',
    character_name: row.name || '',
    rarity,
    target_total: targetTotal || '',
    target_total_min: targetTotal ? (targetTotal - 100) : '',
    skill_count: skillCount,
    background: row.background || '',
    appearance: row.appearance || '',
    faction_name: row.faction_name || '',
    element_name: row.element_name || '',
  };
}

router.post('/attributes/generate-ai', async (req, res, next) => {
  const { character_ids, prompts } = req.body;
  if (!Array.isArray(character_ids) || !character_ids.length) {
    return res.status(400).json({ message: '请选择至少一个人物' });
  }

  try {
    const cfg = await getLmConfig();
    if (!cfg.api_url || !cfg.api_key) {
      return res.status(400).json({ message: '请先配置 LM API 接口参数' });
    }

    const results = [];
    const errors = [];

    for (const characterId of character_ids) {
      const rows = await getAttributeRows({ character_id: characterId });
      if (!rows.length) continue;
      const row = rows[0];
      const basePromptContext = buildLmPromptContext(row);
      const existingRarity = normalizeRarityValue(row.rarity);

      const systemPromptStats = renderPromptTemplate(
        ensureStatsPromptSupportsRarity((prompts && prompts.stats) || cfg.system_prompt_stats),
        basePromptContext
      );

      let statsResult = {};
      let skillsResult = [];
      let elementResult = {};
      let factionResult = {};
      const stageErrors = [];

      try {
        const statsContent = await callLmApi(cfg, [
          { role: 'system', content: systemPromptStats },
          { role: 'user', content: '请严格只返回所需 JSON，不要补充说明。' },
        ]);
        statsResult = extractJsonContent(statsContent, 'object') || {};
      } catch (e) {
        stageErrors.push(`属性值生成失败：${e.message}`);
      }

      let generatedRarity = normalizeRarityValue(statsResult.rarity);
      if (!existingRarity && !generatedRarity) {
        try {
          const rarityContent = await callLmApi(cfg, [
            { role: 'system', content: buildRarityFallbackPrompt(basePromptContext) },
            { role: 'user', content: '请严格只返回所需 JSON，不要补充说明。' },
          ]);
          const rarityResult = extractJsonContent(rarityContent, 'object') || {};
          generatedRarity = normalizeRarityValue(rarityResult.rarity);
        } catch (e) {
          stageErrors.push(`稀有度生成失败：${e.message}`);
        }
      }

      const inferredRarity = inferRarityFromStats(statsResult);
      const resolvedRarity = existingRarity || generatedRarity || inferredRarity || 'R';
      const totalTarget = RARITY_TOTAL[resolvedRarity] || RARITY_TOTAL.R;
      const skillCount = RARITY_SKILLS[resolvedRarity] || 1;
      const resolvedPromptContext = {
        ...basePromptContext,
        rarity: resolvedRarity,
        target_total: totalTarget,
        target_total_min: totalTarget - 100,
        skill_count: skillCount,
      };

      const systemPromptSkills = renderPromptTemplate(
        (prompts && prompts.skills) || cfg.system_prompt_skills,
        resolvedPromptContext
      );
      const systemPromptElement = renderPromptTemplate(
        (prompts && prompts.element) || cfg.system_prompt_element,
        resolvedPromptContext
      );
      const systemPromptFaction = renderPromptTemplate(
        (prompts && prompts.faction) || cfg.system_prompt_series,
        resolvedPromptContext
      );

      try {
        const skillsContent = await callLmApi(cfg, [
          { role: 'system', content: systemPromptSkills },
          { role: 'user', content: '请严格只返回所需 JSON，不要补充说明。' },
        ]);
        skillsResult = extractJsonContent(skillsContent, 'array') || [];
      } catch (e) {
        stageErrors.push(`技能生成失败：${e.message}`);
      }

      try {
        const elementContent = await callLmApi(cfg, [
          { role: 'system', content: systemPromptElement },
          { role: 'user', content: '请严格只返回所需 JSON，不要补充说明。' },
        ]);
        elementResult = extractJsonContent(elementContent, 'object') || {};
      } catch (e) {
        stageErrors.push(`元素生成失败：${e.message}`);
      }

      try {
        const factionContent = await callLmApi(cfg, [
          { role: 'system', content: systemPromptFaction },
          { role: 'user', content: '请严格只返回所需 JSON，不要补充说明。' },
        ]);
        factionResult = extractJsonContent(factionContent, 'object') || {};
      } catch (e) {
        stageErrors.push(`阵营生成失败：${e.message}`);
      }

      const normalizedStats = fitStatsToTarget(statsResult, totalTarget);
      const updatePayload = {};

      if (!existingRarity) {
        updatePayload.rarity = resolvedRarity;
      }

      if (normalizedStats) {
        Object.assign(updatePayload, normalizedStats);
      }

      const normalizedElement = normalizeElementValue(row.series_name, elementResult.element_name);
      if (normalizedElement) {
        updatePayload.element_name = normalizedElement;
      }

      if (typeof factionResult.faction_name === 'string' && factionResult.faction_name.trim()) {
        updatePayload.faction_name = factionResult.faction_name.trim();
      }

      if (Array.isArray(skillsResult) && skillsResult.length) {
        const firstSkill = skillsResult[0] || {};
        if (typeof firstSkill.name === 'string' && firstSkill.name.trim()) {
          updatePayload.skill1_name = firstSkill.name.trim();
        }
        if (typeof firstSkill.desc === 'string' && firstSkill.desc.trim()) {
          updatePayload.skill1_desc = firstSkill.desc.trim();
        }

        if (skillCount >= 2) {
          const secondSkill = skillsResult[1] || {};
          updatePayload.skill2_name = typeof secondSkill.name === 'string' && secondSkill.name.trim()
            ? secondSkill.name.trim()
            : row.skill2_name ?? null;
          updatePayload.skill2_desc = typeof secondSkill.desc === 'string' && secondSkill.desc.trim()
            ? secondSkill.desc.trim()
            : row.skill2_desc ?? null;
        }
      }

      const hasExistingSkill2 = row.skill2_id || row.skill2_name || row.skill2_desc;
      const hasExistingSkill3 = row.skill3_id || row.skill3_name || row.skill3_desc;

      if (skillCount < 2 && hasExistingSkill2) {
        updatePayload.skill2_id = null;
        updatePayload.skill2_name = null;
        updatePayload.skill2_desc = null;
      }

      if (hasExistingSkill3) {
        updatePayload.skill3_id = null;
        updatePayload.skill3_name = null;
        updatePayload.skill3_desc = null;
      }

      if (!Object.keys(updatePayload).length) {
        errors.push({
          character_id: characterId,
          name: row.name,
          stage_errors: stageErrors,
          message: stageErrors[0] || '未生成到任何可写入的属性结果',
        });
        continue;
      }

      await upsertAttributeRow(characterId, updatePayload);

      const updated = await getAttributeRows({ character_id: characterId });
      if (updated.length) results.push(updated[0]);
    }

    if (!results.length && errors.length) {
      return res.status(502).json({
        message: errors[0].message || '大模型生成失败',
        results,
        errors,
      });
    }

    res.json({ results, errors });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
