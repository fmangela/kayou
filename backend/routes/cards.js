const express = require('express');
const multer = require('multer');
const { stringify } = require('csv-stringify/sync');
const { query, execute } = require('../db/init');
const { parseImportFile } = require('../services/importService');

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

  const values = ATTRIBUTE_FIELDS.map(field => normalizeAttributeValue(field, req.body[field]));

  try {
    await execute(
      `
        INSERT INTO card_attributes (
          character_id,
          ${ATTRIBUTE_FIELDS.join(', ')}
        ) VALUES (
          ?,
          ${ATTRIBUTE_FIELDS.map(() => '?').join(', ')}
        )
        ON DUPLICATE KEY UPDATE
          ${ATTRIBUTE_FIELDS.map(field => `${field} = VALUES(${field})`).join(', ')},
          updated_at = CURRENT_TIMESTAMP
      `,
      [characterId, ...values]
    );

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

      const payload = ATTRIBUTE_FIELDS.map(field => normalizeAttributeValue(field, record[field]));

      await execute(
        `
          INSERT INTO card_attributes (
            character_id,
            ${ATTRIBUTE_FIELDS.join(', ')}
          ) VALUES (
            ?,
            ${ATTRIBUTE_FIELDS.map(() => '?').join(', ')}
          )
          ON DUPLICATE KEY UPDATE
            ${ATTRIBUTE_FIELDS.map(field => `${field} = VALUES(${field})`).join(', ')},
            updated_at = CURRENT_TIMESTAMP
        `,
        [characterId, ...payload]
      );
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

module.exports = router;
