import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../../lib/database.js';
import { ApiError } from '../../lib/errors.js';
import { listCardsByIds } from '../card/service.js';
import {
  createBattleState,
  runBattleRound,
  type BattleCardRuntime,
  type BattleRoundInput,
  type CardStatKey,
  type MiniGameGrade,
  type RuntimeSkillDefinition,
  type RuntimeSkillEffect,
  type RuntimeSkillTrigger,
} from './engine.js';

const battlePhaseSchema = z.enum([
  'battle_start',
  'round_start',
  'before_minigame',
  'after_minigame',
  'before_attack',
  'after_attack',
  'round_end',
]);

const cardStatKeySchema = z.enum([
  'force',
  'intelligence',
  'defense',
  'speed',
  'spirit',
  'vitality',
]);

const miniGameGradeSchema = z.enum([
  'miss',
  'poor',
  'good',
  'great',
  'perfect',
]);

const skillTriggerSchema = z.object({
  phases: z.array(battlePhaseSchema).min(1),
  minGrade: miniGameGradeSchema.optional(),
  minScore: z.coerce.number().int().optional(),
  maxScore: z.coerce.number().int().optional(),
  ownerHpLtePct: z.coerce.number().min(0).max(1).optional(),
  ownerHpGtePct: z.coerce.number().min(0).max(1).optional(),
  targetHpLtePct: z.coerce.number().min(0).max(1).optional(),
  targetHpGtePct: z.coerce.number().min(0).max(1).optional(),
  chance: z.coerce.number().min(0).max(1).optional(),
  maxTriggersPerBattle: z.coerce.number().int().positive().optional(),
  maxTriggersPerRound: z.coerce.number().int().positive().optional(),
  requireOwnerTags: z.array(z.string().trim().min(1)).optional(),
  forbidOwnerTags: z.array(z.string().trim().min(1)).optional(),
  requireTargetTags: z.array(z.string().trim().min(1)).optional(),
  forbidTargetTags: z.array(z.string().trim().min(1)).optional(),
});

const skillEffectSchema = z.object({
  type: z.enum([
    'modify_score',
    'modify_damage',
    'modify_incoming_damage',
    'damage',
    'heal',
    'grant_shield',
    'add_tag',
    'remove_tag',
  ]),
  target: z.enum(['self', 'opponent']),
  mode: z.enum(['add', 'multiply']).optional(),
  value: z.coerce.number(),
  scaleStat: cardStatKeySchema.optional(),
  scaleRatio: z.coerce.number().optional(),
  finalScoreRatio: z.coerce.number().optional(),
  tag: z.string().trim().min(1).optional(),
});

const skillEffectDocumentSchema = z.object({
  trigger: skillTriggerSchema.optional(),
  effects: z.array(skillEffectSchema).min(1),
});

export const battlePreviewSchema = z.object({
  playerCardIds: z.array(z.coerce.number().int().positive()).min(1).max(4),
  enemyCardIds: z.array(z.coerce.number().int().positive()).min(1).max(4),
  actingSide: z.enum(['player', 'enemy']).optional().default('player'),
  baseScore: z.coerce.number().int().min(0).max(10000),
  grade: miniGameGradeSchema,
  baseHp: z.coerce.number().int().positive().max(999999).optional(),
  round: z.coerce.number().int().positive().optional().default(1),
  seed: z.coerce.number().int().optional(),
});

type LoadedCard = Awaited<ReturnType<typeof listCardsByIds>>[number];

interface ConfigRow extends RowDataPacket {
  config_value: string;
}

function tryParseJsonString(value: string): unknown | null {
  const raw = value.trim();

  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseTriggerFromUnknown(value: unknown): RuntimeSkillTrigger | null {
  const parsed = skillTriggerSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function parseEffectDocumentFromUnknown(
  value: unknown,
): { trigger?: RuntimeSkillTrigger; effects: RuntimeSkillEffect[] } | null {
  if (Array.isArray(value)) {
    const parsed = z.array(skillEffectSchema).min(1).safeParse(value);

    return parsed.success ? { effects: parsed.data } : null;
  }

  const parsed = skillEffectDocumentSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}

function buildLegacyCardSkill(
  card: LoadedCard,
  skill: LoadedCard['skills'][number],
): RuntimeSkillDefinition {
  const forceBonus = Math.max(8, Math.round(card.stats.force * 0.18));
  const scoreBonus = Math.max(10, Math.round(card.stats.intelligence * 0.12));

  if (skill.type === 'passive') {
    return {
      code: skill.skillCode,
      name: skill.name,
      description: skill.description,
      source: 'card_skill',
      ownerCardCode: card.code,
      trigger: {
        phases: ['before_minigame'],
        maxTriggersPerRound: 1,
      },
      effects: [
        {
          type: 'modify_score',
          target: 'self',
          mode: 'add',
          value: scoreBonus,
        },
      ],
    };
  }

  if (skill.type === 'trigger') {
    return {
      code: skill.skillCode,
      name: skill.name,
      description: skill.description,
      source: 'card_skill',
      ownerCardCode: card.code,
      trigger: {
        phases: ['after_minigame'],
        minGrade: 'good',
        maxTriggersPerRound: 1,
      },
      effects: [
        {
          type: 'damage',
          target: 'opponent',
          value: forceBonus,
          finalScoreRatio: 0.06,
        },
      ],
    };
  }

  return {
    code: skill.skillCode,
    name: skill.name,
    description: skill.description,
    source: 'card_skill',
    ownerCardCode: card.code,
    trigger: {
      phases: ['after_minigame'],
      maxTriggersPerRound: 1,
    },
    effects: [
      {
        type: 'modify_damage',
        target: 'self',
        mode: 'multiply',
        value: Math.max(1, Number(card.multiplier.toFixed(2))),
      },
    ],
  };
}

function buildLegacyRelationSkill(
  card: LoadedCard,
  relation: LoadedCard['relations'][number],
): RuntimeSkillDefinition {
  if (relation.effectType === 'attribute_bonus') {
    return {
      code: relation.relationCode,
      name: relation.name,
      description: relation.effectDescription,
      source: 'relation_skill',
      ownerCardCode: card.code,
      relationMembers: relation.members.map((member) => member.code),
      trigger: {
        phases: ['before_minigame'],
        maxTriggersPerRound: 1,
      },
      effects: [
        {
          type: 'modify_score',
          target: 'self',
          mode: 'add',
          value: 12,
        },
      ],
    };
  }

  if (relation.effectType === 'special_effect') {
    return {
      code: relation.relationCode,
      name: relation.name,
      description: relation.effectDescription,
      source: 'relation_skill',
      ownerCardCode: card.code,
      relationMembers: relation.members.map((member) => member.code),
      trigger: {
        phases: ['after_attack'],
        maxTriggersPerRound: 1,
      },
      effects: [
        {
          type: 'damage',
          target: 'opponent',
          value: 15,
        },
      ],
    };
  }

  return {
    code: relation.relationCode,
    name: relation.name,
    description: relation.effectDescription,
    source: 'relation_skill',
    ownerCardCode: card.code,
    relationMembers: relation.members.map((member) => member.code),
    trigger: {
      phases: ['before_attack'],
      maxTriggersPerRound: 1,
    },
    effects: [
      {
        type: 'modify_damage',
        target: 'self',
        mode: 'multiply',
        value: 1.1,
      },
    ],
  };
}

function buildRuntimeCardSkill(
  card: LoadedCard,
  skill: LoadedCard['skills'][number],
): RuntimeSkillDefinition {
  const rawTrigger = tryParseJsonString(skill.triggerCondition);
  const rawEffectValue = tryParseJsonString(skill.valueText);
  const parsedTrigger = parseTriggerFromUnknown(rawTrigger);
  const parsedEffectDocument = parseEffectDocumentFromUnknown(rawEffectValue);

  if (parsedEffectDocument) {
    return {
      code: skill.skillCode,
      name: skill.name,
      description: skill.description,
      source: 'card_skill',
      ownerCardCode: card.code,
      trigger:
        parsedTrigger ??
        parsedEffectDocument.trigger ?? {
          phases: ['after_minigame'],
          maxTriggersPerRound: 1,
        },
      effects: parsedEffectDocument.effects,
    };
  }

  return buildLegacyCardSkill(card, skill);
}

function buildRuntimeRelationSkill(
  card: LoadedCard,
  relation: LoadedCard['relations'][number],
): RuntimeSkillDefinition {
  const parsedEffectDocument = parseEffectDocumentFromUnknown(relation.effectPayload);

  if (parsedEffectDocument) {
    return {
      code: relation.relationCode,
      name: relation.name,
      description: relation.effectDescription,
      source: 'relation_skill',
      ownerCardCode: card.code,
      relationMembers: relation.members.map((member) => member.code),
      trigger:
        parsedEffectDocument.trigger ?? {
          phases: ['before_minigame'],
          maxTriggersPerRound: 1,
        },
      effects: parsedEffectDocument.effects,
    };
  }

  return buildLegacyRelationSkill(card, relation);
}

function toBattleCardRuntime(
  card: LoadedCard,
  relationCodeRegistry: Set<string>,
): BattleCardRuntime {
  const relationSkills = card.relations
    .filter((relation) => {
      if (relationCodeRegistry.has(relation.relationCode)) {
        return false;
      }

      relationCodeRegistry.add(relation.relationCode);
      return true;
    })
    .map((relation) => buildRuntimeRelationSkill(card, relation));

  return {
    id: card.id,
    code: card.code,
    name: card.name,
    multiplier: card.multiplier,
    stats: {
      force: card.stats.force,
      intelligence: card.stats.intelligence,
      defense: card.stats.defense,
      speed: card.stats.speed,
      spirit: card.stats.spirit,
      vitality: card.stats.vitality,
    } satisfies Record<CardStatKey, number>,
    skills: [
      ...card.skills.map((skill) => buildRuntimeCardSkill(card, skill)),
      ...relationSkills,
    ],
  };
}

async function getBattleBaseHp(): Promise<number> {
  const [rows] = await getPool().execute<ConfigRow[]>(
    `
      SELECT config_value
      FROM game_configs
      WHERE config_key = 'combat.base_hp'
      LIMIT 1
    `,
  );
  const config = rows[0];

  if (!config) {
    return 100;
  }

  try {
    const value = JSON.parse(config.config_value) as { value?: number };
    return Number(value.value ?? 100);
  } catch {
    return 100;
  }
}

function ensureUniqueCardIds(cardIds: number[], sideLabel: string) {
  if (new Set(cardIds).size !== cardIds.length) {
    throw new ApiError(400, `${sideLabel}阵容存在重复卡牌`);
  }
}

export async function previewBattleSkillRound(
  input: z.input<typeof battlePreviewSchema>,
) {
  const payload = battlePreviewSchema.parse(input);

  ensureUniqueCardIds(payload.playerCardIds, '玩家');
  ensureUniqueCardIds(payload.enemyCardIds, '敌方');

  const [playerCards, enemyCards, configBaseHp] = await Promise.all([
    listCardsByIds(payload.playerCardIds),
    listCardsByIds(payload.enemyCardIds),
    getBattleBaseHp(),
  ]);

  if (playerCards.length === 0 || enemyCards.length === 0) {
    throw new ApiError(400, '战斗双方至少需要各自提供 1 张卡牌');
  }

  const baseHp = payload.baseHp ?? configBaseHp;
  const playerRelationRegistry = new Set<string>();
  const enemyRelationRegistry = new Set<string>();
  const state = createBattleState({
    playerCards: playerCards.map((card) =>
      toBattleCardRuntime(card, playerRelationRegistry),
    ),
    enemyCards: enemyCards.map((card) => toBattleCardRuntime(card, enemyRelationRegistry)),
    baseHp,
    round: payload.round,
    seed: payload.seed,
  });
  const roundInput: BattleRoundInput = {
    actingSide: payload.actingSide,
    baseScore: payload.baseScore,
    grade: payload.grade as MiniGameGrade,
  };
  const result = runBattleRound(state, roundInput);

  return {
    input: payload,
    summary: {
      actingSide: payload.actingSide,
      finalScore: result.state.minigame.finalScore,
      damage: result.damage,
      winner:
        result.state.player.hp === 0
          ? 'enemy'
          : result.state.enemy.hp === 0
            ? 'player'
            : null,
    },
    state: result.state,
  };
}
