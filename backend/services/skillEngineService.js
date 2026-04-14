const RARITIES = ['N', 'R', 'CP', 'SR', 'SSR', 'HR', 'UR', 'PR'];
const SKILL_TYPES = ['active', 'passive', 'trigger', 'continuous', 'conditional', 'ultimate', 'aura', 'captain'];
const TRIGGER_DOMAINS = ['card', 'battle', 'settle', 'growth', 'display'];
const TEMPLATE_STATUSES = ['active', 'deprecated'];
const TRIGGER_EVENTS = [
  'on_loadout_ready',
  'on_battle_prepare',
  'on_battle_start',
  'on_turn_start',
  'on_action_declare',
  'on_action_hit',
  'on_action_fail',
  'on_receive_damage',
  'on_hp_low',
  'on_status_apply',
  'on_status_remove',
  'on_battle_end',
  'before_settle',
  'after_settle',
];
const EFFECT_ATOMS = [
  'modify_stat_flat',
  'modify_stat_ratio',
  'add_status',
  'remove_status',
  'apply_value_clamp',
  'grant_extra_trigger',
  'reduce_cooldown',
  'modify_damage_flat',
  'modify_damage_ratio',
  'apply_trigger_limit',
];
const TARGETS = [
  'self_card',
  'enemy_card',
  'self_team',
  'enemy_team',
  'current_slot',
  'current_attribute',
  'current_status',
  'allied_same_faction',
  'allied_same_series',
  'random_valid_target',
];
const SLOT_SEMANTICS = ['main', 'sub', 'awakening'];
const SKILL_SOURCES = ['lm_generated', 'manual', 'template_copy', 'imported'];
const SKILL_STATUSES = ['draft', 'pending', 'published', 'disabled', 'archived'];
const STRUCTURED_STATUSES = new Set(['pending', 'published']);
const VALUE_LABELS = {
  force_value: '武力',
  intellect_value: '智力',
  speed_value: '速度',
  stamina_value: '体力',
  self_card: '自身',
  enemy_card: '敌方',
  self_team: '我方全体',
  enemy_team: '敌方全体',
  current_slot: '当前槽位',
  current_attribute: '当前属性字段',
  current_status: '当前状态',
  allied_same_faction: '同阵营',
  allied_same_series: '同系列',
  random_valid_target: '随机有效目标',
};

function parseTemplateRow(row) {
  return {
    ...row,
    param_slots: tryParseJson(row.param_slots, []),
    applicable_rarities: tryParseJson(row.applicable_rarities, []),
    strength_budget: tryParseJson(row.strength_budget, {}),
  };
}

function parseDefinitionRow(row) {
  const parsed = {
    ...row,
    params: tryParseJson(row.params, {}),
    tags: tryParseJson(row.tags, []),
    applicable_rarities: tryParseJson(row.applicable_rarities, []),
  };

  const template = row.template_id
    ? {
        id: row.template_id,
        name: row.template_name || '',
        template_key: row.template_key || '',
        status: row.template_status || 'active',
        skill_type: row.template_skill_type || null,
        effect_atom: row.template_effect_atom || null,
        description_template: row.template_description_template || '',
        param_slots: tryParseJson(row.template_param_slots, []),
      }
    : null;

  const validation = inspectSkillDefinition(parsed, template);

  delete parsed.template_param_slots;
  delete parsed.template_description_template;
  delete parsed.template_status;
  delete parsed.template_skill_type;
  delete parsed.template_effect_atom;

  return {
    ...parsed,
    template_meta: template,
    rendered_short_desc: validation.renderedShortDesc,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings,
    validation_passed: validation.errors.length === 0,
  };
}

function normalizeTemplatePayload(input, options = {}) {
  const { requireTemplateKey = false } = options;
  const errors = [];

  const templateKey = normalizeString(input.template_key);
  if (requireTemplateKey && !templateKey) {
    errors.push('template_key 必填');
  } else if (templateKey && !/^[a-z0-9_]+$/.test(templateKey)) {
    errors.push('template_key 只能包含小写字母、数字和下划线');
  }

  const name = normalizeString(input.name);
  if (!name) errors.push('模板名必填');

  const skillType = normalizeEnum(input.skill_type, SKILL_TYPES, 'skill_type', errors, 'passive');
  const triggerDomain = normalizeEnum(input.trigger_domain, TRIGGER_DOMAINS, 'trigger_domain', errors, 'card');
  const effectAtom = normalizeEnum(input.effect_atom, EFFECT_ATOMS, 'effect_atom', errors, 'modify_stat_flat');
  const status = normalizeEnum(input.status, TEMPLATE_STATUSES, 'status', errors, 'active');

  const descriptionTemplate = normalizeString(input.description_template);
  if (!descriptionTemplate) errors.push('描述模板必填');

  const paramSlots = normalizeParamSlots(input.param_slots, errors);
  validateDescriptionTemplate(descriptionTemplate, paramSlots, errors);

  const applicableRarities = normalizeRarities(input.applicable_rarities, errors);
  const strengthBudget = normalizeStrengthBudget(input.strength_budget, errors);

  return {
    errors,
    value: {
      template_key: templateKey,
      name,
      skill_type: skillType,
      trigger_domain: triggerDomain,
      effect_atom: effectAtom,
      param_slots: paramSlots,
      description_template: descriptionTemplate,
      applicable_rarities: applicableRarities,
      strength_budget: strengthBudget,
      status,
    },
  };
}

function normalizeSkillPayload(input, template) {
  const errors = [];

  const name = normalizeString(input.name);
  if (!name) errors.push('技能名必填');

  const requestedSkillType = normalizeEnum(input.skill_type, SKILL_TYPES, 'skill_type', errors, template?.skill_type || 'passive');
  const triggerEvent = normalizeNullableEnum(input.trigger_event, TRIGGER_EVENTS, 'trigger_event', errors);
  const requestedEffectAtom = normalizeNullableEnum(input.effect_atom, EFFECT_ATOMS, 'effect_atom', errors, template?.effect_atom || null);
  const target = normalizeEnum(input.target, TARGETS, 'target', errors, 'self_card');
  const slotSemantic = normalizeEnum(input.slot_semantic, SLOT_SEMANTICS, 'slot_semantic', errors, 'main');
  const source = normalizeEnum(input.source, SKILL_SOURCES, 'source', errors, 'manual');
  const status = normalizeEnum(input.status, SKILL_STATUSES, 'status', errors, 'draft');
  const version = normalizePositiveInteger(input.version, 'version', errors, 1);
  const templateId = normalizeNullableId(input.template_id, 'template_id', errors);
  const skillType = template?.skill_type || requestedSkillType;
  const effectAtom = template?.effect_atom || requestedEffectAtom;

  const tags = normalizeStringArray(input.tags);
  const applicableRarities = normalizeRarities(input.applicable_rarities, errors);
  const shortDesc = normalizeString(input.short_desc);
  const longDesc = normalizeString(input.long_desc);

  const paramsInput = normalizeObject(input.params, 'params', errors);
  const paramsResult = normalizeSkillParams(paramsInput, template, errors);
  const renderedShortDesc = renderDescriptionTemplate(template, paramsResult.value);

  return {
    errors,
    value: {
      name,
      short_desc: shortDesc || renderedShortDesc,
      long_desc: longDesc,
      template_id: templateId,
      params: paramsResult.value,
      skill_type: skillType,
      trigger_event: triggerEvent,
      effect_atom: effectAtom,
      target,
      tags,
      applicable_rarities: applicableRarities,
      slot_semantic: slotSemantic,
      source,
      status,
      version,
    },
    inspection: inspectSkillDefinition(
      {
        name,
        short_desc: shortDesc || renderedShortDesc,
        long_desc: longDesc,
        params: paramsResult.value,
        skill_type: skillType,
        trigger_event: triggerEvent,
        effect_atom: effectAtom,
        target,
        tags,
        applicable_rarities: applicableRarities,
        slot_semantic: slotSemantic,
        source,
        status,
        version,
        template_id: templateId,
      },
      template,
      { missingParamKeys: paramsResult.missingRequiredKeys }
    ),
  };
}

function inspectSkillDefinition(skill, template, options = {}) {
  const warnings = [];
  const errors = [];
  const missingParamKeys = options.missingParamKeys || collectMissingParamKeys(skill.params, template);
  const renderedShortDesc = skill.short_desc || renderDescriptionTemplate(template, skill.params);
  const requiresStructure = STRUCTURED_STATUSES.has(skill.status);

  if (!template) {
    pushIssue(
      requiresStructure ? errors : warnings,
      requiresStructure ? '待审核/已发布技能必须绑定模板' : '建议绑定模板以完成结构化归档'
    );
  } else {
    if (template.status !== 'active') {
      pushIssue(
        requiresStructure ? errors : warnings,
        requiresStructure ? '待审核/已发布技能不能绑定已停用模板' : '当前模板已停用，建议更换为启用模板'
      );
    }
    if (skill.skill_type !== template.skill_type) {
      warnings.push('技能类型与模板类型不一致，已建议以模板定义为准');
    }
    if (skill.effect_atom && skill.effect_atom !== template.effect_atom) {
      warnings.push('效果原子与模板定义不一致，建议保持同步');
    }
  }

  if (missingParamKeys.length) {
    pushIssue(
      requiresStructure ? errors : warnings,
      `缺少模板参数: ${missingParamKeys.join('、')}`
    );
  }

  if (!renderedShortDesc) {
    pushIssue(
      requiresStructure ? errors : warnings,
      requiresStructure ? '待审核/已发布技能需要可展示的简述摘要' : '建议补充简述，方便卡面与后台展示'
    );
  }

  if (skill.skill_type === 'trigger' && !skill.trigger_event) {
    pushIssue(
      requiresStructure ? errors : warnings,
      requiresStructure ? '触发类技能必须指定触发事件' : '触发类技能建议补充触发事件'
    );
  }

  if (!skill.applicable_rarities?.length) {
    warnings.push('尚未配置适用稀有度');
  }

  if (!skill.tags?.length) {
    warnings.push('尚未配置标签');
  }

  return { errors, warnings, renderedShortDesc };
}

function renderDescriptionTemplate(template, params = {}) {
  if (!template?.description_template) return '';
  const placeholders = extractPlaceholders(template.description_template);
  if (!placeholders.length) return template.description_template;

  for (const key of placeholders) {
    const value = params[key];
    if (value === undefined || value === null || value === '') return '';
  }

  return template.description_template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => formatParamValue(params[key]));
}

function normalizeParamSlots(input, errors) {
  if (input !== undefined && input !== null && !Array.isArray(input)) {
    errors.push('param_slots 必须为数组');
    return [];
  }
  const slots = Array.isArray(input) ? input : [];
  const normalized = [];
  const keySet = new Set();

  slots.forEach((slot, index) => {
    const prefix = `param_slots[${index}]`;
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
      errors.push(`${prefix} 必须是对象`);
      return;
    }

    const key = normalizeString(slot.key);
    const label = normalizeString(slot.label);
    const unit = normalizeString(slot.unit);
    const options = normalizeSlotOptions(slot.options, `${prefix}.options`, errors);
    const inputType = inferSlotInputType(slot, options);
    const min = normalizeNullableNumber(slot.min, `${prefix}.min`, errors);
    const max = normalizeNullableNumber(slot.max, `${prefix}.max`, errors);

    if (!key) {
      errors.push(`${prefix}.key 必填`);
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      errors.push(`${prefix}.key 只能包含字母、数字和下划线`);
      return;
    }
    if (!label) {
      errors.push(`${prefix}.label 必填`);
      return;
    }
    if (keySet.has(key)) {
      errors.push(`模板参数 key 重复: ${key}`);
      return;
    }
    keySet.add(key);

    if (min !== null && max !== null && min > max) {
      errors.push(`${prefix} 的 min 不能大于 max`);
    }

    const normalizedSlot = {
      key,
      label,
      unit,
      default: slot.default ?? null,
      min,
      max,
      options,
      input_type: inputType,
    };

    validateSlotDefault(normalizedSlot, prefix, errors);
    normalized.push(normalizedSlot);
  });

  return normalized;
}

function normalizeSkillParams(input, template, errors) {
  if (!template) {
    if (Object.keys(input).length) {
      errors.push('未绑定模板时不能填写模板参数');
    }
    return { value: {}, missingRequiredKeys: [] };
  }

  const value = {};
  const missingRequiredKeys = [];
  const knownKeys = new Set(template.param_slots.map((slot) => slot.key));

  for (const key of Object.keys(input)) {
    if (!knownKeys.has(key)) {
      errors.push(`存在未在模板中声明的参数: ${key}`);
    }
  }

  template.param_slots.forEach((slot) => {
    const rawValue = input[slot.key];
    const hasValue = rawValue !== undefined && rawValue !== null && rawValue !== '';
    const nextValue = hasValue ? rawValue : slot.default;

    if (nextValue === undefined || nextValue === null || nextValue === '') {
      value[slot.key] = null;
      missingRequiredKeys.push(slot.label || slot.key);
      return;
    }

    if (slot.options?.length) {
      if (!slot.options.includes(nextValue)) {
        errors.push(`${slot.label || slot.key} 必须为预设选项之一`);
        value[slot.key] = null;
        return;
      }
      value[slot.key] = nextValue;
      return;
    }

    if (slot.input_type === 'number') {
      const numeric = Number(nextValue);
      if (!Number.isFinite(numeric)) {
        errors.push(`${slot.label || slot.key} 必须为数字`);
        value[slot.key] = null;
        return;
      }
      if (slot.min !== null && numeric < slot.min) {
        errors.push(`${slot.label || slot.key} 不能小于 ${slot.min}`);
      }
      if (slot.max !== null && numeric > slot.max) {
        errors.push(`${slot.label || slot.key} 不能大于 ${slot.max}`);
      }
      value[slot.key] = numeric;
      return;
    }

    value[slot.key] = normalizeString(nextValue);
    if (!value[slot.key]) {
      missingRequiredKeys.push(slot.label || slot.key);
    }
  });

  return { value, missingRequiredKeys };
}

function normalizeStrengthBudget(input, errors) {
  const budget = normalizeObject(input, 'strength_budget', errors);
  const recommended = normalizeNullableNumber(budget.recommended, 'strength_budget.recommended', errors);
  const min = normalizeNullableNumber(budget.min, 'strength_budget.min', errors);
  const max = normalizeNullableNumber(budget.max, 'strength_budget.max', errors);

  if (min !== null && max !== null && min > max) {
    errors.push('strength_budget.min 不能大于 strength_budget.max');
  }
  if (recommended !== null && min !== null && recommended < min) {
    errors.push('strength_budget.recommended 不能小于 min');
  }
  if (recommended !== null && max !== null && recommended > max) {
    errors.push('strength_budget.recommended 不能大于 max');
  }

  return {
    ...(recommended !== null ? { recommended } : {}),
    ...(min !== null ? { min } : {}),
    ...(max !== null ? { max } : {}),
  };
}

function validateDescriptionTemplate(template, paramSlots, errors) {
  if (!template) return;
  const placeholders = extractPlaceholders(template);
  const slotKeys = new Set(paramSlots.map((slot) => slot.key));
  placeholders.forEach((placeholder) => {
    if (!slotKeys.has(placeholder)) {
      errors.push(`描述模板引用了未声明参数: ${placeholder}`);
    }
  });
}

function validateSlotDefault(slot, prefix, errors) {
  if (slot.default === undefined || slot.default === null || slot.default === '') return;

  if (slot.options?.length) {
    if (!slot.options.includes(slot.default)) {
      errors.push(`${prefix}.default 必须落在 options 中`);
    }
    return;
  }

  if (slot.input_type === 'number') {
    const numeric = Number(slot.default);
    if (!Number.isFinite(numeric)) {
      errors.push(`${prefix}.default 必须为数字`);
      return;
    }
    if (slot.min !== null && numeric < slot.min) {
      errors.push(`${prefix}.default 不能小于 min`);
    }
    if (slot.max !== null && numeric > slot.max) {
      errors.push(`${prefix}.default 不能大于 max`);
    }
    slot.default = numeric;
    return;
  }

  slot.default = normalizeString(slot.default);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => normalizeString(item)).filter(Boolean))];
}

function normalizeRarities(input, errors) {
  const rarities = normalizeStringArray(input);
  rarities.forEach((rarity) => {
    if (!RARITIES.includes(rarity)) {
      errors.push(`无效稀有度: ${rarity}`);
    }
  });
  return rarities.filter((rarity) => RARITIES.includes(rarity));
}

function normalizeEnum(value, allowed, field, errors, fallback) {
  const normalized = normalizeString(value) || fallback;
  if (!allowed.includes(normalized)) {
    errors.push(`${field} 无效`);
    return fallback;
  }
  return normalized;
}

function normalizeNullableEnum(value, allowed, field, errors, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = normalizeString(value);
  if (!allowed.includes(normalized)) {
    errors.push(`${field} 无效`);
    return fallback;
  }
  return normalized;
}

function normalizeNullableId(value, field, errors) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    errors.push(`${field} 必须为正整数`);
    return null;
  }
  return numeric;
}

function normalizePositiveInteger(value, field, errors, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    errors.push(`${field} 必须为正整数`);
    return fallback;
  }
  return numeric;
}

function normalizeNullableNumber(value, field, errors) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    errors.push(`${field} 必须为数字`);
    return null;
  }
  return numeric;
}

function normalizeObject(value, field, errors) {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} 必须为对象`);
    return {};
  }
  return value;
}

function normalizeSlotOptions(input, field, errors) {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input)) {
    errors.push(`${field} 必须为数组`);
    return null;
  }
  const options = [...new Set(input.map((item) => normalizeString(String(item))).filter(Boolean))];
  if (!options.length) {
    errors.push(`${field} 不能为空数组`);
    return null;
  }
  return options;
}

function inferSlotInputType(slot, options) {
  if (options?.length) return 'select';
  if (slot.input_type === 'text') return 'text';
  if (slot.input_type === 'number') return 'number';
  if (typeof slot.default === 'number') return 'number';
  if (slot.min !== undefined || slot.max !== undefined) return 'number';
  return 'text';
}

function extractPlaceholders(template) {
  return [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
}

function formatParamValue(value) {
  if (typeof value === 'string') {
    return VALUE_LABELS[value] || value;
  }
  return `${value}`;
}

function collectMissingParamKeys(params = {}, template) {
  if (!template?.param_slots?.length) return [];
  return template.param_slots
    .filter((slot) => params[slot.key] === undefined || params[slot.key] === null || params[slot.key] === '')
    .map((slot) => slot.label || slot.key);
}

function tryParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function pushIssue(target, message) {
  if (!target.includes(message)) target.push(message);
}

module.exports = {
  EFFECT_ATOMS,
  RARITIES,
  SKILL_SOURCES,
  SKILL_STATUSES,
  SKILL_TYPES,
  SLOT_SEMANTICS,
  TARGETS,
  TEMPLATE_STATUSES,
  TRIGGER_DOMAINS,
  TRIGGER_EVENTS,
  STRUCTURED_STATUSES,
  inspectSkillDefinition,
  normalizeSkillPayload,
  normalizeTemplatePayload,
  parseDefinitionRow,
  parseTemplateRow,
  renderDescriptionTemplate,
};
