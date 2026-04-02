import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { z } from 'zod';
import { getPool, withTransaction } from '../../lib/database.js';
import { ApiError } from '../../lib/errors.js';

type QueryExecutor = Pool | PoolConnection;
type CardRarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR' | 'PR' | 'HR';
type CardSkillType = 'active' | 'passive' | 'trigger';
type CardRelationTriggerType =
  | 'same_series'
  | 'same_camp'
  | 'specific_cards'
  | 'attribute_combo';
type CardRelationEffectType =
  | 'attribute_bonus'
  | 'skill_enhance'
  | 'special_effect'
  | 'hidden_skill_unlock';
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

interface CardSkillRecord {
  id: number;
  skillCode: string;
  sortIndex: number;
  name: string;
  type: CardSkillType;
  description: string;
  valueText: string;
  triggerCondition: string;
  targetSkillCode: string | null;
  isHidden: boolean;
  isEnabled: boolean;
}

interface CardRelationRecord {
  id: number;
  relationCode: string;
  name: string;
  triggerType: CardRelationTriggerType;
  triggerDescription: string;
  effectType: CardRelationEffectType;
  effectDescription: string;
  effectPayload: JsonValue | null;
  targetSkillCode: string | null;
  canStack: boolean;
  isEnabled: boolean;
  members: Array<{
    id: number;
    code: string;
    name: string;
  }>;
}

interface CardCatalogItem {
  id: number;
  code: string;
  name: string;
  rarity: CardRarity;
  series: string;
  camp: string;
  attribute: string;
  element: string;
  stats: {
    force: number;
    intelligence: number;
    defense: number;
    speed: number;
    spirit: number;
    vitality: number;
  };
  story: string;
  imageUrl: string;
  multiplier: number;
  enabled: boolean;
  primarySkillName: string;
  primarySkillDescription: string;
  skills: CardSkillRecord[];
  relations: CardRelationRecord[];
  createdAt: string;
  updatedAt: string;
}

interface CardCollectionItem extends CardCatalogItem {
  skillName: string;
  skillDescription: string;
  owned: boolean;
  quantity: number;
  level: number;
  obtainedAt: string | null;
}

function normalizeCardRarity(value: string): CardRarity {
  const legacyMap: Record<string, CardRarity> = {
    common: 'N',
    rare: 'R',
    epic: 'SR',
    legendary: 'SSR',
  };

  return legacyMap[value] ?? (['N', 'R', 'SR', 'SSR', 'UR', 'PR', 'HR'].includes(value) ? (value as CardRarity) : 'N');
}

const cardRaritySchema = z.enum(['N', 'R', 'SR', 'SSR', 'UR', 'PR', 'HR']);
const cardSkillTypeSchema = z.enum(['active', 'passive', 'trigger']);
const cardRelationTriggerTypeSchema = z.enum([
  'same_series',
  'same_camp',
  'specific_cards',
  'attribute_combo',
]);
const cardRelationEffectTypeSchema = z.enum([
  'attribute_bonus',
  'skill_enhance',
  'special_effect',
  'hidden_skill_unlock',
]);

const cardStatsSchema = z.object({
  force: z.coerce.number().int().min(0).max(9999),
  intelligence: z.coerce.number().int().min(0).max(9999),
  defense: z.coerce.number().int().min(0).max(9999),
  speed: z.coerce.number().int().min(0).max(9999),
  spirit: z.coerce.number().int().min(0).max(9999),
  vitality: z.coerce.number().int().min(0).max(9999),
});

const adminCardSkillInputSchema = z.object({
  skillCode: z.string().trim().max(64).optional().default(''),
  sortIndex: z.coerce.number().int().min(1).max(3),
  name: z.string().trim().min(1).max(64),
  type: cardSkillTypeSchema,
  description: z.string().trim().min(1).max(500),
  valueText: z.string().trim().max(255).optional().default(''),
  triggerCondition: z.string().trim().max(255).optional().default(''),
  targetSkillCode: z.string().trim().max(64).nullable().optional().default(null),
  isHidden: z.coerce.boolean().optional().default(false),
  isEnabled: z.coerce.boolean().optional().default(true),
});

const adminCardRelationInputSchema = z.object({
  relationCode: z.string().trim().max(64).optional().default(''),
  name: z.string().trim().min(1).max(64),
  triggerType: cardRelationTriggerTypeSchema,
  triggerDescription: z.string().trim().min(1).max(500),
  effectType: cardRelationEffectTypeSchema,
  effectDescription: z.string().trim().min(1).max(500),
  effectPayload: z.unknown().optional().default(null),
  targetSkillCode: z.string().trim().max(64).nullable().optional().default(null),
  memberCardCodes: z.array(z.string().trim().min(1).max(64)).min(1),
  canStack: z.coerce.boolean().optional().default(true),
  isEnabled: z.coerce.boolean().optional().default(true),
});

export const adminCardSaveSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  rarity: cardRaritySchema,
  series: z.string().trim().min(1).max(64),
  camp: z.string().trim().min(1).max(64),
  attribute: z.string().trim().min(1).max(64),
  stats: cardStatsSchema,
  story: z.string().trim().max(500).optional().default(''),
  imageUrl: z.string().trim().max(255).optional().default(''),
  multiplier: z.coerce.number().min(0.1).max(99).optional().default(1),
  enabled: z.coerce.boolean().optional().default(true),
  skills: z.array(adminCardSkillInputSchema).min(1).max(3),
  relations: z.array(adminCardRelationInputSchema).optional().default([]),
}).superRefine((value, context) => {
  const sortIndexes = new Set<number>();
  const skillCodes = new Set<string>();
  const relationCodes = new Set<string>();

  for (const skill of value.skills) {
    if (sortIndexes.has(skill.sortIndex)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '技能序号不能重复',
        path: ['skills'],
      });
    }

    sortIndexes.add(skill.sortIndex);

    if (skill.skillCode) {
      if (skillCodes.has(skill.skillCode)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '技能编码不能重复',
          path: ['skills'],
        });
      }

      skillCodes.add(skill.skillCode);
    }
  }

  for (const relation of value.relations) {
    if (relation.relationCode) {
      if (relationCodes.has(relation.relationCode)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '关系技能编码不能重复',
          path: ['relations'],
        });
      }

      relationCodes.add(relation.relationCode);
    }
  }
});

type AdminCardSaveInput = z.infer<typeof adminCardSaveSchema>;

interface CardRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  rarity: string;
  element: string;
  series_name: string;
  camp_name: string;
  force_value: number;
  intelligence_value: number;
  defense_value: number;
  speed_value: number;
  spirit_value: number;
  vitality_value: number;
  background_story: string;
  skill_name: string;
  skill_description: string;
  damage_multiplier: number | string;
  image_url: string;
  is_enabled: number;
  quantity?: number | null;
  card_level?: number | null;
  obtained_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SkillRow extends RowDataPacket {
  id: number;
  card_id: number;
  skill_code: string;
  sort_index: number;
  name: string;
  skill_type: CardSkillType;
  effect_description: string;
  effect_value: string;
  trigger_condition: string;
  target_skill_code: string | null;
  is_hidden: number;
  is_enabled: number;
}

interface RelationRow extends RowDataPacket {
  owner_card_id: number;
  relation_id: number;
  relation_code: string;
  name: string;
  trigger_type: CardRelationTriggerType;
  trigger_description: string;
  effect_type: CardRelationEffectType;
  effect_description: string;
  effect_payload: string | null;
  target_skill_code: string | null;
  can_stack: number;
  is_enabled: number;
  member_card_id: number;
  member_card_code: string;
  member_card_name: string;
}

function getExecutor(connection?: PoolConnection): QueryExecutor {
  return connection ?? getPool();
}

function buildInClause(ids: number[]): string {
  return ids.map(() => '?').join(', ');
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function parseJsonValue(value: unknown): JsonValue | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as JsonValue;
    } catch {
      return value;
    }
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return value as JsonValue;
}

function getPrimarySkillFromRows(
  row: CardRow,
  skills: CardSkillRecord[],
): Pick<CardCatalogItem, 'primarySkillName' | 'primarySkillDescription'> {
  const primarySkill =
    skills.find((item) => item.isEnabled && !item.isHidden) ??
    skills[0] ?? {
      name: row.skill_name || '待配置技能',
      description: row.skill_description || '当前卡牌尚未配置具体技能效果。',
    };

  return {
    primarySkillName: primarySkill.name,
    primarySkillDescription: primarySkill.description,
  };
}

function toCardSkillRecord(row: SkillRow): CardSkillRecord {
  return {
    id: row.id,
    skillCode: row.skill_code,
    sortIndex: row.sort_index,
    name: row.name,
    type: row.skill_type,
    description: row.effect_description,
    valueText: row.effect_value,
    triggerCondition: row.trigger_condition,
    targetSkillCode: row.target_skill_code,
    isHidden: row.is_hidden === 1,
    isEnabled: row.is_enabled === 1,
  };
}

function buildCardCatalogItem(
  row: CardRow,
  skills: CardSkillRecord[],
  relations: CardRelationRecord[],
): CardCatalogItem {
  const primarySkill = getPrimarySkillFromRows(row, skills);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    rarity: normalizeCardRarity(row.rarity) as CardRarity,
    series: row.series_name,
    camp: row.camp_name,
    attribute: row.element,
    element: row.element,
    stats: {
      force: Number(row.force_value ?? 0),
      intelligence: Number(row.intelligence_value ?? 0),
      defense: Number(row.defense_value ?? 0),
      speed: Number(row.speed_value ?? 0),
      spirit: Number(row.spirit_value ?? 0),
      vitality: Number(row.vitality_value ?? 0),
    },
    story: row.background_story,
    imageUrl: row.image_url,
    multiplier: Number(row.damage_multiplier ?? 1),
    enabled: row.is_enabled === 1,
    primarySkillName: primarySkill.primarySkillName,
    primarySkillDescription: primarySkill.primarySkillDescription,
    skills,
    relations,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function buildCardCollectionItem(
  row: CardRow,
  skills: CardSkillRecord[],
  relations: CardRelationRecord[],
): CardCollectionItem {
  const base = buildCardCatalogItem(row, skills, relations);

  return {
    ...base,
    skillName: base.primarySkillName,
    skillDescription: base.primarySkillDescription,
    owned: Number(row.quantity ?? 0) > 0,
    quantity: Number(row.quantity ?? 0),
    level: Number(row.card_level ?? 1),
    obtainedAt: toIsoString(row.obtained_at),
  };
}

async function listCardRows(
  options: {
    playerId?: number;
    includeDisabled?: boolean;
    connection?: PoolConnection;
  } = {},
): Promise<CardRow[]> {
  const executor = getExecutor(options.connection);
  const includeDisabled = options.includeDisabled ?? false;

  if (typeof options.playerId === 'number') {
    const [rows] = await executor.execute<CardRow[]>(
      `
        SELECT
          c.id,
          c.code,
          c.name,
          c.rarity,
          c.element,
          c.series_name,
          c.camp_name,
          c.force_value,
          c.intelligence_value,
          c.defense_value,
          c.speed_value,
          c.spirit_value,
          c.vitality_value,
          c.background_story,
          c.skill_name,
          c.skill_description,
          c.damage_multiplier,
          c.image_url,
          c.is_enabled,
          pc.quantity,
          pc.level AS card_level,
          pc.created_at AS obtained_at,
          c.created_at,
          c.updated_at
        FROM cards c
        LEFT JOIN player_cards pc
          ON pc.card_id = c.id
         AND pc.player_id = ?
        WHERE (? = 1 OR c.is_enabled = 1)
        ORDER BY
          FIELD(c.rarity, 'HR', 'PR', 'UR', 'SSR', 'SR', 'R', 'N', 'legendary', 'epic', 'rare', 'common'),
          c.series_name ASC,
          c.id ASC
      `,
      [options.playerId, includeDisabled ? 1 : 0],
    );

    return rows;
  }

  const [rows] = await executor.execute<CardRow[]>(
    `
      SELECT
        id,
        code,
        name,
        rarity,
        element,
        series_name,
        camp_name,
        force_value,
        intelligence_value,
        defense_value,
        speed_value,
        spirit_value,
        vitality_value,
        background_story,
        skill_name,
        skill_description,
        damage_multiplier,
        image_url,
        is_enabled,
        created_at,
        updated_at
      FROM cards
      WHERE (? = 1 OR is_enabled = 1)
      ORDER BY
        FIELD(rarity, 'HR', 'PR', 'UR', 'SSR', 'SR', 'R', 'N', 'legendary', 'epic', 'rare', 'common'),
        series_name ASC,
        id ASC
    `,
    [includeDisabled ? 1 : 0],
  );

  return rows;
}

async function listCardSkillsByCardIds(
  cardIds: number[],
  connection?: PoolConnection,
): Promise<Map<number, CardSkillRecord[]>> {
  if (cardIds.length === 0) {
    return new Map();
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.execute<SkillRow[]>(
    `
      SELECT
        id,
        card_id,
        skill_code,
        sort_index,
        name,
        skill_type,
        effect_description,
        effect_value,
        trigger_condition,
        target_skill_code,
        is_hidden,
        is_enabled
      FROM card_skills
      WHERE card_id IN (${buildInClause(cardIds)})
      ORDER BY card_id ASC, sort_index ASC, id ASC
    `,
    cardIds,
  );

  const result = new Map<number, CardSkillRecord[]>();

  for (const row of rows) {
    const list = result.get(row.card_id) ?? [];
    list.push(toCardSkillRecord(row));
    result.set(row.card_id, list);
  }

  return result;
}

async function listCardRelationsByCardIds(
  cardIds: number[],
  connection?: PoolConnection,
): Promise<Map<number, CardRelationRecord[]>> {
  if (cardIds.length === 0) {
    return new Map();
  }

  const executor = getExecutor(connection);
  const [rows] = await executor.execute<RelationRow[]>(
    `
      SELECT
        owner.card_id AS owner_card_id,
        cr.id AS relation_id,
        cr.relation_code,
        cr.name,
        cr.trigger_type,
        cr.trigger_description,
        cr.effect_type,
        cr.effect_description,
        cr.effect_payload,
        cr.target_skill_code,
        cr.can_stack,
        cr.is_enabled,
        member.card_id AS member_card_id,
        member_card.code AS member_card_code,
        member_card.name AS member_card_name
      FROM card_relation_members owner
      INNER JOIN card_relations cr
        ON cr.id = owner.relation_id
      INNER JOIN card_relation_members member
        ON member.relation_id = cr.id
      INNER JOIN cards member_card
        ON member_card.id = member.card_id
      WHERE owner.card_id IN (${buildInClause(cardIds)})
      ORDER BY owner.card_id ASC, cr.id ASC, member.card_id ASC
    `,
    cardIds,
  );

  const relationBuckets = new Map<number, Map<number, CardRelationRecord>>();

  for (const row of rows) {
    const ownerMap = relationBuckets.get(row.owner_card_id) ?? new Map<number, CardRelationRecord>();
    let relation = ownerMap.get(row.relation_id);

    if (!relation) {
      relation = {
        id: row.relation_id,
        relationCode: row.relation_code,
        name: row.name,
        triggerType: row.trigger_type,
        triggerDescription: row.trigger_description,
        effectType: row.effect_type,
        effectDescription: row.effect_description,
        effectPayload: parseJsonValue(row.effect_payload),
        targetSkillCode: row.target_skill_code,
        canStack: row.can_stack === 1,
        isEnabled: row.is_enabled === 1,
        members: [],
      };
      ownerMap.set(row.relation_id, relation);
      relationBuckets.set(row.owner_card_id, ownerMap);
    }

    if (!relation.members.find((member) => member.id === row.member_card_id)) {
      relation.members.push({
        id: row.member_card_id,
        code: row.member_card_code,
        name: row.member_card_name,
      });
    }
  }

  const result = new Map<number, CardRelationRecord[]>();

  for (const [cardId, relationMap] of relationBuckets.entries()) {
    result.set(cardId, [...relationMap.values()]);
  }

  return result;
}

async function loadCardCatalogItems(
  options: {
    playerId?: number;
    includeDisabled?: boolean;
    connection?: PoolConnection;
  } = {},
): Promise<CardCatalogItem[]> {
  const rows = await listCardRows(options);
  const cardIds = rows.map((row) => row.id);
  const [skillsByCardId, relationsByCardId] = await Promise.all([
    listCardSkillsByCardIds(cardIds, options.connection),
    listCardRelationsByCardIds(cardIds, options.connection),
  ]);

  return rows.map((row) =>
    buildCardCatalogItem(
      row,
      skillsByCardId.get(row.id) ?? [],
      relationsByCardId.get(row.id) ?? [],
    ),
  );
}

async function loadPlayerCollectionItems(
  playerId: number,
  connection?: PoolConnection,
): Promise<CardCollectionItem[]> {
  const rows = await listCardRows({
    playerId,
    includeDisabled: false,
    connection,
  });
  const cardIds = rows.map((row) => row.id);
  const [skillsByCardId, relationsByCardId] = await Promise.all([
    listCardSkillsByCardIds(cardIds, connection),
    listCardRelationsByCardIds(cardIds, connection),
  ]);

  return rows.map((row) =>
    buildCardCollectionItem(
      row,
      skillsByCardId.get(row.id) ?? [],
      relationsByCardId.get(row.id) ?? [],
    ),
  );
}

async function findCardRowById(
  cardId: number,
  connection?: PoolConnection,
): Promise<CardRow | null> {
  const executor = getExecutor(connection);
  const [rows] = await executor.execute<CardRow[]>(
    `
      SELECT
        id,
        code,
        name,
        rarity,
        element,
        series_name,
        camp_name,
        force_value,
        intelligence_value,
        defense_value,
        speed_value,
        spirit_value,
        vitality_value,
        background_story,
        skill_name,
        skill_description,
        damage_multiplier,
        image_url,
        is_enabled,
        created_at,
        updated_at
      FROM cards
      WHERE id = ?
      LIMIT 1
    `,
    [cardId],
  );

  return rows[0] ?? null;
}

async function findCardRowByCode(
  code: string,
  connection?: PoolConnection,
): Promise<CardRow | null> {
  const executor = getExecutor(connection);
  const [rows] = await executor.execute<CardRow[]>(
    `
      SELECT
        id,
        code,
        name,
        rarity,
        element,
        series_name,
        camp_name,
        force_value,
        intelligence_value,
        defense_value,
        speed_value,
        spirit_value,
        vitality_value,
        background_story,
        skill_name,
        skill_description,
        damage_multiplier,
        image_url,
        is_enabled,
        created_at,
        updated_at
      FROM cards
      WHERE code = ?
      LIMIT 1
    `,
    [code],
  );

  return rows[0] ?? null;
}

async function ensureUniqueCardCode(
  connection: PoolConnection,
  code: string,
  currentCardId?: number,
) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT id
      FROM cards
      WHERE code = ?
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `,
    [code, currentCardId ?? null, currentCardId ?? null],
  );

  if (rows.length > 0) {
    throw new ApiError(409, '卡牌编号已存在，请更换后重试');
  }
}

function buildSkillRows(
  payload: AdminCardSaveInput,
): Array<{
  skillCode: string;
  sortIndex: number;
  name: string;
  type: CardSkillType;
  description: string;
  valueText: string;
  triggerCondition: string;
  targetSkillCode: string | null;
  isHidden: boolean;
  isEnabled: boolean;
}> {
  return [...payload.skills]
    .sort((left, right) => left.sortIndex - right.sortIndex)
    .map((skill) => ({
      skillCode: skill.skillCode || `${payload.code}-S${skill.sortIndex}`,
      sortIndex: skill.sortIndex,
      name: skill.name,
      type: skill.type,
      description: skill.description,
      valueText: skill.valueText,
      triggerCondition: skill.triggerCondition,
      targetSkillCode: skill.targetSkillCode,
      isHidden: skill.isHidden,
      isEnabled: skill.isEnabled,
    }));
}

function buildRelationRows(
  payload: AdminCardSaveInput,
  cardCode: string,
): Array<{
  relationCode: string;
  name: string;
  triggerType: CardRelationTriggerType;
  triggerDescription: string;
  effectType: CardRelationEffectType;
  effectDescription: string;
  effectPayload: JsonValue | null;
  targetSkillCode: string | null;
  memberCardCodes: string[];
  canStack: boolean;
  isEnabled: boolean;
}> {
  return payload.relations.map((relation, index) => {
    const memberCodes = Array.from(
      new Set([cardCode, ...relation.memberCardCodes]),
    );

    return {
      relationCode: relation.relationCode || `${cardCode}-R${index + 1}`,
      name: relation.name,
      triggerType: relation.triggerType,
      triggerDescription: relation.triggerDescription,
      effectType: relation.effectType,
      effectDescription: relation.effectDescription,
      effectPayload: parseJsonValue(relation.effectPayload),
      targetSkillCode: relation.targetSkillCode,
      memberCardCodes: memberCodes,
      canStack: relation.canStack,
      isEnabled: relation.isEnabled,
    };
  });
}

async function syncCardSkills(
  connection: PoolConnection,
  cardId: number,
  skills: ReturnType<typeof buildSkillRows>,
) {
  await connection.execute(
    `
      DELETE FROM card_skills
      WHERE card_id = ?
    `,
    [cardId],
  );

  for (const skill of skills) {
    await connection.execute(
      `
        INSERT INTO card_skills (
          card_id,
          skill_code,
          sort_index,
          name,
          skill_type,
          effect_description,
          effect_value,
          trigger_condition,
          target_skill_code,
          is_hidden,
          is_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cardId,
        skill.skillCode,
        skill.sortIndex,
        skill.name,
        skill.type,
        skill.description,
        skill.valueText,
        skill.triggerCondition,
        skill.targetSkillCode,
        skill.isHidden ? 1 : 0,
        skill.isEnabled ? 1 : 0,
      ],
    );
  }
}

async function resolveMemberCardIds(
  connection: PoolConnection,
  memberCardCodes: string[],
): Promise<number[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT id, code
      FROM cards
      WHERE code IN (${memberCardCodes.map(() => '?').join(', ')})
    `,
    memberCardCodes,
  );
  const idByCode = new Map(rows.map((row) => [String(row.code), Number(row.id)]));
  const missingCode = memberCardCodes.find((code) => !idByCode.has(code));

  if (missingCode) {
    throw new ApiError(400, `关系技能引用了不存在的卡牌编号：${missingCode}`);
  }

  return memberCardCodes
    .map((code) => idByCode.get(code))
    .filter((id): id is number => typeof id === 'number');
}

async function syncCardRelations(
  connection: PoolConnection,
  cardId: number,
  cardCode: string,
  relations: ReturnType<typeof buildRelationRows>,
) {
  const [relationRows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT relation_id
      FROM card_relation_members
      WHERE card_id = ?
    `,
    [cardId],
  );
  const relationIds = relationRows.map((row) => Number(row.relation_id));

  if (relationIds.length > 0) {
    await connection.execute(
      `
        DELETE FROM card_relations
        WHERE id IN (${buildInClause(relationIds)})
      `,
      relationIds,
    );
  }

  for (const relation of relations) {
    const memberIds = await resolveMemberCardIds(
      connection,
      relation.memberCardCodes.includes(cardCode)
        ? relation.memberCardCodes
        : [cardCode, ...relation.memberCardCodes],
    );
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO card_relations (
          relation_code,
          name,
          trigger_type,
          trigger_description,
          effect_type,
          effect_description,
          effect_payload,
          target_skill_code,
          can_stack,
          is_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        relation.relationCode,
        relation.name,
        relation.triggerType,
        relation.triggerDescription,
        relation.effectType,
        relation.effectDescription,
        relation.effectPayload == null ? null : JSON.stringify(relation.effectPayload),
        relation.targetSkillCode,
        relation.canStack ? 1 : 0,
        relation.isEnabled ? 1 : 0,
      ],
    );

    for (const memberId of memberIds) {
      await connection.execute(
        `
          INSERT INTO card_relation_members (relation_id, card_id)
          VALUES (?, ?)
        `,
        [insertResult.insertId, memberId],
      );
    }
  }
}

async function logCardOperation(
  connection: PoolConnection,
  input: {
    adminId: number;
    actionType: string;
    targetId: number;
    before: CardCatalogItem | null;
    after: CardCatalogItem;
  },
) {
  await connection.execute(
    `
      INSERT INTO operation_logs (
        admin_id,
        action_type,
        target_type,
        target_id,
        action_payload,
        ip_address
      )
      VALUES (?, ?, 'card', ?, ?, '127.0.0.1')
    `,
    [
      input.adminId,
      input.actionType,
      String(input.targetId),
      JSON.stringify({
        before: input.before,
        after: input.after,
      }),
    ],
  );
}

async function getCardCatalogItemById(
  cardId: number,
  connection?: PoolConnection,
): Promise<CardCatalogItem> {
  const row = await findCardRowById(cardId, connection);

  if (!row) {
    throw new ApiError(404, '未找到对应卡牌');
  }

  const [skillsByCardId, relationsByCardId] = await Promise.all([
    listCardSkillsByCardIds([cardId], connection),
    listCardRelationsByCardIds([cardId], connection),
  ]);

  return buildCardCatalogItem(
    row,
    skillsByCardId.get(cardId) ?? [],
    relationsByCardId.get(cardId) ?? [],
  );
}

async function persistCardDefinition(
  connection: PoolConnection,
  payload: z.input<typeof adminCardSaveSchema>,
  adminId: number,
  currentCardId?: number,
): Promise<CardCatalogItem> {
  const normalizedPayload = adminCardSaveSchema.parse(payload);
  const skillRows = buildSkillRows(normalizedPayload);
  const relationRows = buildRelationRows(normalizedPayload, normalizedPayload.code);
  const primarySkill = skillRows[0];
  const existingCard =
    typeof currentCardId === 'number'
      ? await getCardCatalogItemById(currentCardId, connection)
      : null;

  if (existingCard && existingCard.code !== normalizedPayload.code) {
    throw new ApiError(400, '卡牌编号创建后不可修改');
  }

  await ensureUniqueCardCode(connection, normalizedPayload.code, currentCardId);

  let cardId = currentCardId ?? 0;

  if (typeof currentCardId === 'number') {
    await connection.execute(
      `
        UPDATE cards
        SET
          name = ?,
          rarity = ?,
          element = ?,
          series_name = ?,
          camp_name = ?,
          force_value = ?,
          intelligence_value = ?,
          defense_value = ?,
          speed_value = ?,
          spirit_value = ?,
          vitality_value = ?,
          background_story = ?,
          skill_name = ?,
          skill_description = ?,
          damage_multiplier = ?,
          image_url = ?,
          is_enabled = ?
        WHERE id = ?
      `,
      [
        normalizedPayload.name,
        normalizedPayload.rarity,
        normalizedPayload.attribute,
        normalizedPayload.series,
        normalizedPayload.camp,
        normalizedPayload.stats.force,
        normalizedPayload.stats.intelligence,
        normalizedPayload.stats.defense,
        normalizedPayload.stats.speed,
        normalizedPayload.stats.spirit,
        normalizedPayload.stats.vitality,
        normalizedPayload.story,
        primarySkill?.name ?? '待配置技能',
        primarySkill?.description ?? '当前卡牌尚未配置具体技能效果。',
        normalizedPayload.multiplier,
        normalizedPayload.imageUrl,
        normalizedPayload.enabled ? 1 : 0,
        currentCardId,
      ],
    );
  } else {
    const [insertResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO cards (
          code,
          name,
          rarity,
          element,
          series_name,
          camp_name,
          force_value,
          intelligence_value,
          defense_value,
          speed_value,
          spirit_value,
          vitality_value,
          background_story,
          skill_name,
          skill_description,
          damage_multiplier,
          image_url,
          is_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalizedPayload.code,
        normalizedPayload.name,
        normalizedPayload.rarity,
        normalizedPayload.attribute,
        normalizedPayload.series,
        normalizedPayload.camp,
        normalizedPayload.stats.force,
        normalizedPayload.stats.intelligence,
        normalizedPayload.stats.defense,
        normalizedPayload.stats.speed,
        normalizedPayload.stats.spirit,
        normalizedPayload.stats.vitality,
        normalizedPayload.story,
        primarySkill?.name ?? '待配置技能',
        primarySkill?.description ?? '当前卡牌尚未配置具体技能效果。',
        normalizedPayload.multiplier,
        normalizedPayload.imageUrl,
        normalizedPayload.enabled ? 1 : 0,
      ],
    );
    cardId = insertResult.insertId;
  }

  await syncCardSkills(connection, cardId, skillRows);
  await syncCardRelations(connection, cardId, normalizedPayload.code, relationRows);

  const savedCard = await getCardCatalogItemById(cardId, connection);

  await logCardOperation(connection, {
    adminId,
    actionType: existingCard ? 'card.update' : 'card.create',
    targetId: cardId,
    before: existingCard,
    after: savedCard,
  });

  return savedCard;
}

export async function listAdminCards() {
  return loadCardCatalogItems({
    includeDisabled: true,
  });
}

export async function listPlayerCollection(playerId: number) {
  return loadPlayerCollectionItems(playerId);
}

export async function getCardById(cardId: number) {
  return getCardCatalogItemById(cardId);
}

export async function listCardsByIds(cardIds: number[]) {
  return Promise.all(cardIds.map((cardId) => getCardCatalogItemById(cardId)));
}

export async function createCardDefinition(
  input: z.input<typeof adminCardSaveSchema>,
  adminId: number,
) {
  await withTransaction(async (connection) => {
    await persistCardDefinition(connection, input, adminId);
  });

  return listAdminCards();
}

export async function updateCardDefinition(
  cardId: number,
  input: z.input<typeof adminCardSaveSchema>,
  adminId: number,
) {
  await withTransaction(async (connection) => {
    const existingCard = await findCardRowById(cardId, connection);

    if (!existingCard) {
      throw new ApiError(404, '未找到对应卡牌');
    }

    await persistCardDefinition(connection, input, adminId, cardId);
  });

  return listAdminCards();
}

export async function importCardDefinitions(
  inputs: Array<z.input<typeof adminCardSaveSchema>>,
  adminId: number,
) {
  const report = {
    totalRows: inputs.length,
    successCount: 0,
    createdCount: 0,
    updatedCount: 0,
    failureCount: 0,
    failures: [] as Array<{
      rowNumber: number;
      code: string;
      name: string;
      message: string;
    }>,
  };

  for (const [index, input] of inputs.entries()) {
    try {
      const normalizedCode =
        typeof input.code === 'string' ? input.code.trim() : String(input.code ?? '').trim();

      await withTransaction(async (connection) => {
        const existingCard = await findCardRowByCode(normalizedCode, connection);

        await persistCardDefinition(
          connection,
          input,
          adminId,
          existingCard ? existingCard.id : undefined,
        );

        report.successCount += 1;

        if (existingCard) {
          report.updatedCount += 1;
        } else {
          report.createdCount += 1;
        }
      });
    } catch (error) {
      report.failureCount += 1;
      report.failures.push({
        rowNumber: index + 2,
        code:
          typeof input.code === 'string' ? input.code.trim() : String(input.code ?? '').trim(),
        name:
          typeof input.name === 'string' ? input.name.trim() : String(input.name ?? '').trim(),
        message: error instanceof Error ? error.message : '未知导入错误',
      });
    }
  }

  return {
    report,
    cards: await listAdminCards(),
  };
}

export async function getStarterCardIds(
  connection: PoolConnection,
  limit = 5,
): Promise<number[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT id
      FROM cards
      WHERE is_enabled = 1
      ORDER BY
        FIELD(rarity, 'HR', 'PR', 'UR', 'SSR', 'SR', 'R', 'N', 'legendary', 'epic', 'rare', 'common'),
        id ASC
      LIMIT ?
    `,
    [limit],
  );

  const ids = rows.map((row) => Number(row.id));

  if (ids.length < 4) {
    throw new ApiError(500, '基础卡牌目录尚未准备完成，请先初始化卡牌数据');
  }

  return ids;
}
