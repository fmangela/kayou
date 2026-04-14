const express = require('express');
const { execute, query } = require('../db/init');
const {
  STRUCTURED_STATUSES,
  normalizeSkillPayload,
  normalizeTemplatePayload,
  parseDefinitionRow,
  parseTemplateRow,
} = require('../services/skillEngineService');

const router = express.Router();

const SKILL_SELECT_SQL = `
  SELECT
    sd.*,
    st.name AS template_name,
    st.template_key,
    st.status AS template_status,
    st.skill_type AS template_skill_type,
    st.effect_atom AS template_effect_atom,
    st.param_slots AS template_param_slots,
    st.description_template AS template_description_template
  FROM skill_definitions sd
  LEFT JOIN skill_templates st ON sd.template_id = st.id
`;

router.get('/templates', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM skill_templates ORDER BY status ASC, id ASC');
    res.json(rows.map(parseTemplateRow));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const template = await loadTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: '未找到技能模板' });
    res.json(template);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/templates', async (req, res) => {
  try {
    const normalized = normalizeTemplatePayload(req.body, { requireTemplateKey: true });
    if (normalized.errors.length) {
      return res.status(400).json({ message: normalized.errors.join('；') });
    }

    const payload = normalized.value;
    const result = await execute(
      `INSERT INTO skill_templates
        (template_key, name, skill_type, trigger_domain, effect_atom, param_slots,
         description_template, applicable_rarities, strength_budget, status)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.template_key,
        payload.name,
        payload.skill_type,
        payload.trigger_domain,
        payload.effect_atom,
        JSON.stringify(payload.param_slots),
        payload.description_template,
        JSON.stringify(payload.applicable_rarities),
        JSON.stringify(payload.strength_budget),
        payload.status,
      ]
    );

    const template = await loadTemplate(result.insertId);
    res.status(201).json(template);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'template_key 已存在' });
    }
    respondError(res, error);
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const current = await loadTemplate(req.params.id);
    if (!current) return res.status(404).json({ message: '未找到技能模板' });

    const normalized = normalizeTemplatePayload(
      { ...current, ...req.body, template_key: current.template_key },
      { requireTemplateKey: false }
    );
    if (normalized.errors.length) {
      return res.status(400).json({ message: normalized.errors.join('；') });
    }

    const payload = normalized.value;
    await execute(
      `UPDATE skill_templates SET
        name = ?, skill_type = ?, trigger_domain = ?, effect_atom = ?,
        param_slots = ?, description_template = ?, applicable_rarities = ?,
        strength_budget = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name,
        payload.skill_type,
        payload.trigger_domain,
        payload.effect_atom,
        JSON.stringify(payload.param_slots),
        payload.description_template,
        JSON.stringify(payload.applicable_rarities),
        JSON.stringify(payload.strength_budget),
        payload.status,
        req.params.id,
      ]
    );

    const template = await loadTemplate(req.params.id);
    res.json(template);
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/', async (req, res) => {
  try {
    const { status, source, slot_semantic, search } = req.query;
    let sql = `${SKILL_SELECT_SQL} WHERE 1 = 1`;
    const params = [];

    if (status) {
      sql += ' AND sd.status = ?';
      params.push(status);
    }
    if (source) {
      sql += ' AND sd.source = ?';
      params.push(source);
    }
    if (slot_semantic) {
      sql += ' AND sd.slot_semantic = ?';
      params.push(slot_semantic);
    }
    if (search) {
      sql += `
        AND (
          sd.skill_uid LIKE ?
          OR sd.name LIKE ?
          OR COALESCE(sd.short_desc, '') LIKE ?
          OR COALESCE(sd.long_desc, '') LIKE ?
          OR COALESCE(sd.tags, '') LIKE ?
          OR COALESCE(st.name, '') LIKE ?
        )
      `;
      params.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    sql += ' ORDER BY sd.updated_at DESC, sd.id DESC';
    const rows = await query(sql, params);
    res.json(rows.map(parseDefinitionRow));
  } catch (error) {
    respondError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const skill = await loadSkill(req.params.id);
    if (!skill) return res.status(404).json({ message: '未找到技能' });
    res.json(skill);
  } catch (error) {
    respondError(res, error);
  }
});

router.post('/', async (req, res) => {
  try {
    const template = await loadTemplateFromPayload(req.body.template_id);
    const normalized = normalizeSkillPayload(req.body, template);

    if (normalized.errors.length) {
      return res.status(400).json({ message: normalized.errors.join('；') });
    }
    if (STRUCTURED_STATUSES.has(normalized.value.status) && normalized.inspection.errors.length) {
      return res.status(400).json({ message: normalized.inspection.errors.join('；') });
    }

    const result = await insertSkillDefinition(normalized.value);
    const skill = await loadSkill(result.insertId);
    res.status(201).json(skill);
  } catch (error) {
    respondError(res, error);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const current = await loadSkill(req.params.id);
    if (!current) return res.status(404).json({ message: '未找到技能' });

    const nextTemplateId = Object.prototype.hasOwnProperty.call(req.body || {}, 'template_id')
      ? req.body.template_id
      : current.template_id;
    const nextInput = { ...current, ...req.body, template_id: nextTemplateId };
    const template = await loadTemplateFromPayload(nextInput.template_id);
    const normalized = normalizeSkillPayload(nextInput, template);

    if (normalized.errors.length) {
      return res.status(400).json({ message: normalized.errors.join('；') });
    }
    if (STRUCTURED_STATUSES.has(normalized.value.status) && normalized.inspection.errors.length) {
      return res.status(400).json({ message: normalized.inspection.errors.join('；') });
    }

    await execute(
      `UPDATE skill_definitions SET
        version = version + 1,
        name = ?, short_desc = ?, long_desc = ?, template_id = ?, params = ?,
        skill_type = ?, trigger_event = ?, effect_atom = ?, target = ?, tags = ?,
        applicable_rarities = ?, slot_semantic = ?, source = ?, status = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        normalized.value.name,
        normalized.value.short_desc,
        normalized.value.long_desc,
        normalized.value.template_id,
        JSON.stringify(normalized.value.params),
        normalized.value.skill_type,
        normalized.value.trigger_event,
        normalized.value.effect_atom,
        normalized.value.target,
        JSON.stringify(normalized.value.tags),
        JSON.stringify(normalized.value.applicable_rarities),
        normalized.value.slot_semantic,
        normalized.value.source,
        normalized.value.status,
        req.params.id,
      ]
    );

    const skill = await loadSkill(req.params.id);
    res.json(skill);
  } catch (error) {
    respondError(res, error);
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const current = await loadSkill(req.params.id);
    if (!current) return res.status(404).json({ message: '未找到技能' });

    const nextInput = { ...current, status };
    const template = current.template_id ? await loadTemplate(current.template_id) : null;
    const normalized = normalizeSkillPayload(nextInput, template);

    if (normalized.errors.length) {
      return res.status(400).json({ message: normalized.errors.join('；') });
    }
    if (STRUCTURED_STATUSES.has(normalized.value.status) && normalized.inspection.errors.length) {
      return res.status(400).json({ message: normalized.inspection.errors.join('；') });
    }

    await execute(
      'UPDATE skill_definitions SET status = ?, updated_at = NOW() WHERE id = ?',
      [normalized.value.status, req.params.id]
    );

    const skill = await loadSkill(req.params.id);
    res.json(skill);
  } catch (error) {
    respondError(res, error);
  }
});

async function loadTemplate(id) {
  const rows = await query('SELECT * FROM skill_templates WHERE id = ?', [id]);
  return rows.length ? parseTemplateRow(rows[0]) : null;
}

async function loadTemplateFromPayload(templateId) {
  if (templateId === null || templateId === undefined || templateId === '') return null;
  const template = await loadTemplate(templateId);
  if (!template) {
    const error = new Error('绑定的技能模板不存在');
    error.statusCode = 400;
    throw error;
  }
  return template;
}

async function loadSkill(id) {
  const rows = await query(`${SKILL_SELECT_SQL} WHERE sd.id = ?`, [id]);
  return rows.length ? parseDefinitionRow(rows[0]) : null;
}

async function insertSkillDefinition(payload) {
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const skillUid = await generateNextSkillUid();

    try {
      return await execute(
        `INSERT INTO skill_definitions
          (skill_uid, version, name, short_desc, long_desc, template_id, params, skill_type,
           trigger_event, effect_atom, target, tags, applicable_rarities,
           slot_semantic, source, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          skillUid,
          payload.version,
          payload.name,
          payload.short_desc,
          payload.long_desc,
          payload.template_id,
          JSON.stringify(payload.params),
          payload.skill_type,
          payload.trigger_event,
          payload.effect_atom,
          payload.target,
          JSON.stringify(payload.tags),
          JSON.stringify(payload.applicable_rarities),
          payload.slot_semantic,
          payload.source,
          payload.status,
        ]
      );
    } catch (error) {
      lastError = error;
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
  }

  throw lastError || new Error('技能 ID 生成失败，请重试');
}

async function generateNextSkillUid() {
  const rows = await query(
    `SELECT MAX(CAST(SUBSTRING(skill_uid, 4) AS UNSIGNED)) AS max_num
     FROM skill_definitions
     WHERE skill_uid REGEXP '^sk_[0-9]+$'`
  );
  const nextNum = String((rows[0]?.max_num || 0) + 1).padStart(4, '0');
  return `sk_${nextNum}`;
}

function respondError(res, error) {
  const statusCode = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
  res.status(statusCode).json({ message: error.message });
}

module.exports = router;
