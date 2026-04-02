import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../../lib/database.js';
import { ApiError } from '../../lib/errors.js';
import { listCardsByIds } from '../card/service.js';

type LoadedCard = Awaited<ReturnType<typeof listCardsByIds>>[number];
type BattleSide = 'player' | 'enemy';
type PlayerRole = 'attack' | 'defense';
type BattleStatus = 'in_progress' | 'won' | 'lost' | 'abandoned';
type MiniGameGrade = 'miss' | 'poor' | 'good' | 'great' | 'perfect';
type TowerBattleMiniGameType = 'archery' | 'catch';

interface TowerBattleCardStatus {
  key: 'dazed';
  label: string;
  remainingPhases: number;
}

interface TowerBattleSlotResult {
  slotIndex: number;
  actedBySlotIndex: number | null;
  actedByName: string | null;
  targetSlotIndex: number | null;
  targetName: string | null;
  score: number;
  grade: MiniGameGrade;
  damage: number;
  targetRemainingHp: number | null;
  note: string;
  specialEvent: string | null;
}

interface TowerBattlePhaseSummary {
  round: number;
  phase: number;
  actingSide: BattleSide;
  playerRole: PlayerRole;
  miniGameType: TowerBattleMiniGameType;
  initiative: InitiativeState;
  slotResults: TowerBattleSlotResult[];
  feed: string[];
}

interface TowerBattleSnapshot {
  battleId: string;
  status: BattleStatus;
  floor: number;
  difficultyTier: number;
  round: number;
  phase: number;
  actingSide: BattleSide | null;
  playerRole: PlayerRole | null;
  nextMiniGameType: TowerBattleMiniGameType | null;
  nextTasks: Array<{
    slotIndex: number;
    actingSlotIndex: number | null;
    targetSlotIndex: number | null;
    miniGameType: TowerBattleMiniGameType;
    durationMs: number;
    difficulty: number;
    actorCardName: string | null;
    targetCardName: string | null;
    instruction: string;
  }>;
  player: {
    side: 'player';
    aliveCount: number;
    totalHp: number;
    initiativeRoll: number;
    cards: Array<{
      slotIndex: number;
      cardId: number;
      code: string;
      name: string;
      rarity: LoadedCard['rarity'];
      imageUrl: string;
      stats: LoadedCard['stats'];
      primarySkillName: string;
      currentHp: number;
      maxHp: number;
      shield: number;
      isKnockedOut: boolean;
      statuses: RuntimeStatus[];
    }>;
  };
  enemy: {
    side: 'enemy';
    aliveCount: number;
    totalHp: number;
    initiativeRoll: number;
    cards: Array<{
      slotIndex: number;
      cardId: number;
      code: string;
      name: string;
      rarity: LoadedCard['rarity'];
      imageUrl: string;
      stats: LoadedCard['stats'];
      primarySkillName: string;
      currentHp: number;
      maxHp: number;
      shield: number;
      isKnockedOut: boolean;
      statuses: RuntimeStatus[];
    }>;
  };
  recentSummary: TowerBattlePhaseSummary | null;
  feed: string[];
}

interface PlayerRow extends RowDataPacket {
  id: number;
  tower_floor: number;
}

interface DeckRow extends RowDataPacket {
  card_ids_json: string;
}

interface CardRow extends RowDataPacket {
  id: number;
}

interface RuntimeStatus extends TowerBattleCardStatus {
  key: 'dazed';
}

interface RuntimeCardState {
  slotIndex: number;
  card: LoadedCard;
  currentHp: number;
  maxHp: number;
  shield: number;
  statuses: RuntimeStatus[];
}

interface InitiativeState {
  player: number;
  enemy: number;
  winner: BattleSide;
}

interface RuntimeBattleSession {
  id: string;
  playerId: number;
  floor: number;
  difficultyTier: number;
  round: number;
  phase: number;
  actingSide: BattleSide | null;
  status: BattleStatus;
  playerCards: RuntimeCardState[];
  enemyCards: RuntimeCardState[];
  initiative: InitiativeState;
  recentSummary: TowerBattlePhaseSummary | null;
  feed: string[];
  createdAt: number;
  updatedAt: number;
}

interface PhaseModifiers {
  scoreFlatBonus: number;
  damageMultiplier: number;
  incomingDamageMultiplier: number;
  shieldGain: number;
  notes: string[];
}

const battleSessions = new Map<string, RuntimeBattleSession>();
const MAX_FEED_SIZE = 24;
const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000;
const BATTLE_SLOT_COUNT = 4;
const GRADE_RANK: Record<MiniGameGrade, number> = {
  miss: 0,
  poor: 1,
  good: 2,
  great: 3,
  perfect: 4,
};

export const towerBattleTurnSchema = z
  .object({
    battleId: z.string().trim().min(1),
    results: z
      .array(
        z.object({
          slotIndex: z.coerce.number().int().min(1).max(BATTLE_SLOT_COUNT),
          score: z.coerce.number().min(0).max(100),
          grade: z.enum(['miss', 'poor', 'good', 'great', 'perfect']),
        }),
      )
      .length(BATTLE_SLOT_COUNT),
  })
  .superRefine((value, context) => {
    const slotIndexes = new Set<number>();

    for (const result of value.results) {
      if (slotIndexes.has(result.slotIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: '同一回合的槽位结果不能重复',
          path: ['results'],
        });
      }

      slotIndexes.add(result.slotIndex);
    }
  });

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseCardIds(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
      : [];
  } catch {
    return [];
  }
}

function getOpponentSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'enemy' : 'player';
}

function getPlayerRole(actingSide: BattleSide | null): PlayerRole | null {
  if (!actingSide) {
    return null;
  }

  return actingSide === 'player' ? 'attack' : 'defense';
}

function getMiniGameType(role: PlayerRole | null): TowerBattleMiniGameType | null {
  if (!role) {
    return null;
  }

  return role === 'attack' ? 'archery' : 'catch';
}

function getGradeFromScore(score: number): MiniGameGrade {
  if (score >= 90) {
    return 'perfect';
  }

  if (score >= 75) {
    return 'great';
  }

  if (score >= 55) {
    return 'good';
  }

  if (score >= 30) {
    return 'poor';
  }

  return 'miss';
}

function computeCardMaxHp(card: LoadedCard, difficultyTier: number, side: BattleSide) {
  const base = 110 + card.stats.vitality * 7 + card.stats.defense * 2;
  const tierMultiplier = side === 'enemy' ? 1 + (difficultyTier - 1) * 0.06 : 1;

  return Math.round(base * tierMultiplier);
}

function buildRuntimeCardState(
  card: LoadedCard,
  slotIndex: number,
  difficultyTier: number,
  side: BattleSide,
): RuntimeCardState {
  const maxHp = computeCardMaxHp(card, difficultyTier, side);

  return {
    slotIndex,
    card,
    currentHp: maxHp,
    maxHp,
    shield: 0,
    statuses: [],
  };
}

function trimFeed(feed: string[]) {
  if (feed.length <= MAX_FEED_SIZE) {
    return feed;
  }

  return feed.slice(feed.length - MAX_FEED_SIZE);
}

function appendFeed(session: RuntimeBattleSession, message: string) {
  session.feed = trimFeed([...session.feed, message]);
}

function cleanupExpiredSessions() {
  const now = Date.now();

  for (const [sessionId, session] of battleSessions.entries()) {
    if (now - session.updatedAt > MAX_SESSION_AGE_MS) {
      battleSessions.delete(sessionId);
    }
  }
}

function clearPlayerSessions(playerId: number) {
  for (const [sessionId, session] of battleSessions.entries()) {
    if (session.playerId === playerId) {
      battleSessions.delete(sessionId);
    }
  }
}

function getAliveCards(cards: RuntimeCardState[]) {
  return cards.filter((card) => card.currentHp > 0);
}

function hasAliveCards(cards: RuntimeCardState[]) {
  return getAliveCards(cards).length > 0;
}

function getEffectiveCardState(
  cards: RuntimeCardState[],
  slotIndex: number,
): RuntimeCardState | null {
  const self = cards[slotIndex];

  if (self && self.currentHp > 0) {
    return self;
  }

  for (let index = slotIndex - 1; index >= 0; index -= 1) {
    if (cards[index].currentHp > 0) {
      return cards[index];
    }
  }

  return null;
}

function getActiveRelations(cards: RuntimeCardState[]) {
  const lineupCodes = new Set(cards.map((card) => card.card.code));
  const relationMap = new Map<string, LoadedCard['relations'][number]>();

  for (const card of cards) {
    for (const relation of card.card.relations) {
      if (relationMap.has(relation.relationCode) || !relation.isEnabled) {
        continue;
      }

      const allMembersPresent = relation.members.every((member) =>
        lineupCodes.has(member.code),
      );

      if (allMembersPresent) {
        relationMap.set(relation.relationCode, relation);
      }
    }
  }

  return [...relationMap.values()];
}

function getRelationsForCard(
  card: RuntimeCardState,
  relations: ReturnType<typeof getActiveRelations>,
) {
  return relations.filter((relation) =>
    relation.members.some((member) => member.code === card.card.code),
  );
}

function buildPhaseModifiers(
  card: RuntimeCardState,
  role: PlayerRole,
  relations: ReturnType<typeof getActiveRelations>,
): PhaseModifiers {
  const modifiers: PhaseModifiers = {
    scoreFlatBonus: 0,
    damageMultiplier: 1,
    incomingDamageMultiplier: 1,
    shieldGain: 0,
    notes: [],
  };

  for (const skill of card.card.skills) {
    if (!skill.isEnabled) {
      continue;
    }

    if (skill.type === 'active' && role === 'attack') {
      modifiers.scoreFlatBonus += 8 + Math.round(card.card.multiplier * 4);
      modifiers.damageMultiplier += 0.08;
      modifiers.notes.push(`${skill.name} 提升了进攻判定`);
    }

    if (skill.type === 'passive') {
      modifiers.notes.push(`${skill.name} 持续生效`);

      if (role === 'defense') {
        modifiers.scoreFlatBonus += 10;
        modifiers.incomingDamageMultiplier *= 0.88;
        modifiers.shieldGain += 8;
      }
    }
  }

  for (const relation of getRelationsForCard(card, relations)) {
    if (!relation.isEnabled) {
      continue;
    }

    if (relation.effectType === 'attribute_bonus') {
      modifiers.scoreFlatBonus += 6;
      modifiers.notes.push(`${relation.name} 提升了基础判定`);
    }

    if (relation.effectType === 'skill_enhance') {
      if (role === 'attack') {
        modifiers.damageMultiplier += 0.12;
      } else {
        modifiers.incomingDamageMultiplier *= 0.94;
      }

      modifiers.notes.push(`${relation.name} 强化了本次结算`);
    }

    if (relation.effectType === 'special_effect') {
      modifiers.scoreFlatBonus += 4;
      modifiers.notes.push(`${relation.name} 提供了额外压制`);
    }

    if (relation.effectType === 'hidden_skill_unlock') {
      modifiers.scoreFlatBonus += 3;
      modifiers.notes.push(`${relation.name} 已就绪`);
    }
  }

  for (const status of card.statuses) {
    if (status.key === 'dazed') {
      modifiers.scoreFlatBonus -= 12;
      modifiers.notes.push(`${status.label} 让判定下滑`);
    }
  }

  return modifiers;
}

function normalizePlayerScore(
  rawScore: number,
  actor: RuntimeCardState | null,
  target: RuntimeCardState | null,
  role: PlayerRole,
  modifiers: PhaseModifiers,
) {
  if (!actor) {
    return 0;
  }

  const statBonus =
    role === 'attack'
      ? Math.round((actor.card.stats.force - (target?.card.stats.defense ?? 0)) * 0.12)
      : Math.round((actor.card.stats.defense - (target?.card.stats.force ?? 0)) * 0.1);

  return clamp(Math.round(rawScore + statBonus + modifiers.scoreFlatBonus), 0, 100);
}

function generateAiScore(
  actor: RuntimeCardState | null,
  target: RuntimeCardState | null,
  role: PlayerRole,
  difficulty: number,
  difficultyTier: number,
  modifiers: PhaseModifiers,
) {
  if (!actor) {
    return 0;
  }

  const attackStat =
    role === 'attack'
      ? actor.card.stats.force * 0.34 + actor.card.stats.intelligence * 0.18
      : actor.card.stats.defense * 0.32 + actor.card.stats.spirit * 0.2;
  const counterStat =
    role === 'attack'
      ? (target?.card.stats.defense ?? 0) * 0.18
      : (target?.card.stats.force ?? 0) * 0.14;
  const randomness = Math.round(Math.random() * 18 - 8);
  const tierBias = (difficultyTier - 1) * 4;

  return clamp(
    Math.round(32 + attackStat - counterStat - difficulty * 5 + randomness + tierBias + modifiers.scoreFlatBonus),
    0,
    100,
  );
}

function applyDamage(target: RuntimeCardState, rawDamage: number) {
  const damage = Math.max(0, Math.round(rawDamage));
  const absorbed = Math.min(target.shield, damage);
  target.shield -= absorbed;
  const hpLoss = damage - absorbed;
  target.currentHp = Math.max(0, target.currentHp - hpLoss);

  return {
    damage,
    absorbed,
    remainingHp: target.currentHp,
  };
}

function healCard(card: RuntimeCardState, amount: number) {
  const heal = Math.max(0, Math.round(amount));

  if (heal <= 0) {
    return 0;
  }

  const nextHp = Math.min(card.maxHp, card.currentHp + heal);
  const healed = nextHp - card.currentHp;
  card.currentHp = nextHp;

  return healed;
}

function clearStatus(card: RuntimeCardState, key: RuntimeStatus['key']) {
  const before = card.statuses.length;
  card.statuses = card.statuses.filter((status) => status.key !== key);

  return before !== card.statuses.length;
}

function applyStatus(card: RuntimeCardState, status: RuntimeStatus) {
  const existing = card.statuses.find((item) => item.key === status.key);

  if (existing) {
    existing.remainingPhases = Math.max(existing.remainingPhases, status.remainingPhases);
    return;
  }

  card.statuses.push(status);
}

function tickStatuses(cards: RuntimeCardState[]) {
  for (const card of cards) {
    card.statuses = card.statuses
      .map((status) => ({
        ...status,
        remainingPhases: status.remainingPhases - 1,
      }))
      .filter((status) => status.remainingPhases > 0);
  }
}

function computeTaskDifficulty(
  actor: RuntimeCardState | null,
  target: RuntimeCardState | null,
  role: PlayerRole,
) {
  if (!actor || !target) {
    return 1;
  }

  const intelligenceGap = target.card.stats.intelligence - actor.card.stats.intelligence;
  const pressureGap =
    role === 'attack'
      ? target.card.stats.speed - actor.card.stats.speed
      : target.card.stats.force - actor.card.stats.defense;
  const difficulty = 3 + Math.round(intelligenceGap / 35) + Math.round(pressureGap / 45);

  return clamp(difficulty, 1, 5);
}

function rollTeamInitiative(
  cards: RuntimeCardState[],
  difficultyTier: number,
  side: BattleSide,
) {
  const aliveCards = getAliveCards(cards);
  const speedTotal = aliveCards.reduce((sum, card) => sum + card.card.stats.speed, 0);
  const passiveBonus = aliveCards.reduce((sum, card) => {
    return (
      sum +
      card.card.skills.filter((skill) => skill.isEnabled && skill.type === 'passive').length
    );
  }, 0);
  const tierBias = side === 'enemy' ? difficultyTier - 1 : 0;

  return Math.round(Math.random() * 5) + 1 + Math.round(speedTotal / 120) + passiveBonus + tierBias;
}

function rollInitiative(session: RuntimeBattleSession): InitiativeState {
  const player = rollTeamInitiative(session.playerCards, session.difficultyTier, 'player');
  const enemy = rollTeamInitiative(session.enemyCards, session.difficultyTier, 'enemy');

  return {
    player,
    enemy,
    winner: player >= enemy ? 'player' : 'enemy',
  };
}

function buildPhaseInstruction(
  role: PlayerRole,
  slotIndex: number,
  actor: RuntimeCardState | null,
  target: RuntimeCardState | null,
) {
  if (!actor) {
    return `第 ${slotIndex + 1} 槽位已无可代理的存活卡，本次小游戏会记录但不会产生结算。`;
  }

  if (actor.slotIndex !== slotIndex + 1) {
    return `第 ${slotIndex + 1} 槽位的卡牌已倒下，本次由左侧第 ${actor.slotIndex} 槽位的 ${actor.card.name} 代为判定。`;
  }

  if (!target) {
    return `对位槽位暂无可代理目标，本次更适合稳住手感。`;
  }

  return role === 'attack'
    ? `${actor.card.name} 将进攻 ${target.card.name}，武力影响得分，智慧会影响难度。`
    : `${actor.card.name} 需要防住 ${target.card.name} 的压制，防御和精神会更关键。`;
}

function getCurrentTeams(session: RuntimeBattleSession) {
  if (session.actingSide === 'player') {
    return {
      attackingSide: 'player' as const,
      attackingCards: session.playerCards,
      defendingCards: session.enemyCards,
    };
  }

  return {
    attackingSide: 'enemy' as const,
    attackingCards: session.enemyCards,
    defendingCards: session.playerCards,
  };
}

function buildBattleSnapshot(session: RuntimeBattleSession): TowerBattleSnapshot {
  const role = getPlayerRole(session.actingSide);
  const nextMiniGameType = getMiniGameType(role);
  const { attackingCards, defendingCards } = getCurrentTeams(session);
  const nextTasks =
    session.status !== 'in_progress' || !role || !nextMiniGameType
      ? []
      : Array.from({ length: BATTLE_SLOT_COUNT }, (_item, index) => {
          const actor =
            role === 'attack'
              ? getEffectiveCardState(attackingCards, index)
              : getEffectiveCardState(defendingCards, index);
          const target =
            role === 'attack'
              ? getEffectiveCardState(defendingCards, index)
              : getEffectiveCardState(attackingCards, index);

          return {
            slotIndex: index + 1,
            actingSlotIndex: actor?.slotIndex ?? null,
            targetSlotIndex: target?.slotIndex ?? null,
            miniGameType: nextMiniGameType,
            durationMs: 5000,
            difficulty: computeTaskDifficulty(actor, target, role),
            actorCardName: actor?.card.name ?? null,
            targetCardName: target?.card.name ?? null,
            instruction: buildPhaseInstruction(role, index, actor, target),
          };
        });

  return {
    battleId: session.id,
    status: session.status,
    floor: session.floor,
    difficultyTier: session.difficultyTier,
    round: session.round,
    phase: session.phase,
    actingSide: session.actingSide,
    playerRole: role,
    nextMiniGameType,
    nextTasks,
    player: {
      side: 'player',
      aliveCount: getAliveCards(session.playerCards).length,
      totalHp: session.playerCards.reduce((sum, card) => sum + card.currentHp, 0),
      initiativeRoll: session.initiative.player,
      cards: session.playerCards.map((card) => ({
        slotIndex: card.slotIndex,
        cardId: card.card.id,
        code: card.card.code,
        name: card.card.name,
        rarity: card.card.rarity,
        imageUrl: card.card.imageUrl,
        stats: card.card.stats,
        primarySkillName: card.card.primarySkillName,
        currentHp: card.currentHp,
        maxHp: card.maxHp,
        shield: card.shield,
        isKnockedOut: card.currentHp <= 0,
        statuses: card.statuses,
      })),
    },
    enemy: {
      side: 'enemy',
      aliveCount: getAliveCards(session.enemyCards).length,
      totalHp: session.enemyCards.reduce((sum, card) => sum + card.currentHp, 0),
      initiativeRoll: session.initiative.enemy,
      cards: session.enemyCards.map((card) => ({
        slotIndex: card.slotIndex,
        cardId: card.card.id,
        code: card.card.code,
        name: card.card.name,
        rarity: card.card.rarity,
        imageUrl: card.card.imageUrl,
        stats: card.card.stats,
        primarySkillName: card.card.primarySkillName,
        currentHp: card.currentHp,
        maxHp: card.maxHp,
        shield: card.shield,
        isKnockedOut: card.currentHp <= 0,
        statuses: card.statuses,
      })),
    },
    recentSummary: session.recentSummary,
    feed: session.feed,
  };
}

async function getPlayerBattleSetup(playerId: number) {
  const pool = getPool();
  const [playerResult, deckResults, cardResult] = await Promise.all([
    pool.execute<PlayerRow[]>(
      `
        SELECT id, tower_floor
        FROM players
        WHERE id = ?
        LIMIT 1
      `,
      [playerId],
    ),
    Promise.all([
      pool.execute<DeckRow[]>(
        `
          SELECT card_ids_json
          FROM deck_presets
          WHERE player_id = ?
            AND is_active = 1
          ORDER BY slot_index ASC
          LIMIT 1
        `,
        [playerId],
      ),
      pool.execute<DeckRow[]>(
        `
          SELECT card_ids_json
          FROM deck_presets
          WHERE player_id = ?
          ORDER BY is_active DESC, slot_index ASC
          LIMIT 1
        `,
        [playerId],
      ),
    ]),
    pool.execute<CardRow[]>(
      `
        SELECT id
        FROM cards
        WHERE is_enabled = 1
        ORDER BY id ASC
      `,
    ),
  ]);
  const [playerRows] = playerResult;
  const [[activeDeckRows], [fallbackDeckRows]] = deckResults;
  const [cardRows] = cardResult;

  const player = playerRows[0];

  if (!player) {
    throw new ApiError(404, '未找到玩家数据');
  }

  const deckRow = activeDeckRows[0] ?? fallbackDeckRows[0];
  const deckCardIds = parseCardIds(deckRow?.card_ids_json ?? '[]').slice(0, BATTLE_SLOT_COUNT);

  if (deckCardIds.length !== BATTLE_SLOT_COUNT) {
    throw new ApiError(400, '请先在卡牌包中配置恰好 4 张出战卡牌');
  }

  if (new Set(deckCardIds).size !== deckCardIds.length) {
    throw new ApiError(400, '当前出战卡组存在重复卡牌，请先调整后再开始战斗');
  }

  const enabledCardIds = cardRows.map((row) => Number(row.id));

  if (enabledCardIds.length < BATTLE_SLOT_COUNT) {
    throw new ApiError(500, '当前可用卡牌不足 4 张，无法开始测试战斗');
  }

  return {
    floor: Number(player.tower_floor ?? 1),
    deckCardIds,
    enabledCardIds,
  };
}

function pickEnemyCardIds(cardIds: number[]) {
  const shuffled = [...cardIds].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, BATTLE_SLOT_COUNT);
}

function finalizeSessionIfNeeded(session: RuntimeBattleSession) {
  const playerAlive = hasAliveCards(session.playerCards);
  const enemyAlive = hasAliveCards(session.enemyCards);

  if (!playerAlive && !enemyAlive) {
    session.status = 'lost';
    session.actingSide = null;
    appendFeed(session, '双方同时倒下，测试战斗判定为失败。');
    return;
  }

  if (!enemyAlive) {
    session.status = 'won';
    session.actingSide = null;
    appendFeed(session, `第 ${session.floor} 层测试战斗已胜利，本次不扣体力也不推进层数。`);
    return;
  }

  if (!playerAlive) {
    session.status = 'lost';
    session.actingSide = null;
    appendFeed(session, '你的全部卡牌都已倒下，测试战斗失败。');
  }
}

function advanceToNextPhase(session: RuntimeBattleSession) {
  finalizeSessionIfNeeded(session);

  if (session.status !== 'in_progress') {
    return;
  }

  if (session.phase === 1) {
    session.phase = 2;
    session.actingSide = getOpponentSide(session.initiative.winner);
    appendFeed(
      session,
      `第 ${session.round} 回合进入攻守互换阶段，由 ${session.actingSide === 'player' ? '我方' : '敌方'} 先攻。`,
    );
    return;
  }

  session.round += 1;
  session.phase = 1;
  session.initiative = rollInitiative(session);
  session.actingSide = session.initiative.winner;
  appendFeed(
    session,
    `第 ${session.round} 回合重新掷骰：我方 ${session.initiative.player} 点，敌方 ${session.initiative.enemy} 点，${session.actingSide === 'player' ? '我方' : '敌方'} 先攻。`,
  );
}

export async function startTowerBattle(playerId: number) {
  cleanupExpiredSessions();
  clearPlayerSessions(playerId);

  const setup = await getPlayerBattleSetup(playerId);
  const difficultyTier = Math.min(4, Math.floor((setup.floor - 1) / 10) + 1);
  const enemyCardIds = pickEnemyCardIds(setup.enabledCardIds);
  const [playerCards, enemyCards] = await Promise.all([
    listCardsByIds(setup.deckCardIds),
    listCardsByIds(enemyCardIds),
  ]);

  const session: RuntimeBattleSession = {
    id: randomUUID(),
    playerId,
    floor: setup.floor,
    difficultyTier,
    round: 1,
    phase: 1,
    actingSide: 'player',
    status: 'in_progress',
    playerCards: playerCards.map((card, index) =>
      buildRuntimeCardState(card, index + 1, difficultyTier, 'player'),
    ),
    enemyCards: enemyCards.map((card, index) =>
      buildRuntimeCardState(card, index + 1, difficultyTier, 'enemy'),
    ),
    initiative: {
      player: 0,
      enemy: 0,
      winner: 'player',
    },
    recentSummary: null,
    feed: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  session.initiative = rollInitiative(session);
  session.actingSide = session.initiative.winner;

  appendFeed(
    session,
    `第 ${setup.floor} 层测试战斗开始：我方 ${session.initiative.player} 点，敌方 ${session.initiative.enemy} 点，${session.actingSide === 'player' ? '我方' : '敌方'} 先攻。`,
  );
  appendFeed(session, '当前为测试战斗模式，不消耗体力，也不会推进真实塔层。');

  battleSessions.set(session.id, session);

  return buildBattleSnapshot(session);
}

export async function playTowerBattleTurn(
  playerId: number,
  input: z.input<typeof towerBattleTurnSchema>,
) {
  cleanupExpiredSessions();
  const payload = towerBattleTurnSchema.parse(input);
  const session = battleSessions.get(payload.battleId);

  if (!session || session.playerId !== playerId) {
    throw new ApiError(404, '未找到当前测试战斗，会话可能已经过期');
  }

  if (session.status !== 'in_progress' || !session.actingSide) {
    throw new ApiError(400, '当前测试战斗已经结束，请重新开始');
  }

  const playerRole = getPlayerRole(session.actingSide);

  if (!playerRole) {
    throw new ApiError(400, '当前测试战斗阶段异常');
  }

  const playerResults = payload.results
    .slice()
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const activeRelations = {
    player: getActiveRelations(session.playerCards),
    enemy: getActiveRelations(session.enemyCards),
  };
  const phaseFeeds: string[] = [];
  const slotResults: TowerBattleSlotResult[] = [];
  const modifierCache = new Map<string, PhaseModifiers>();
  const preparedShieldKeys = new Set<string>();
  const { attackingSide, attackingCards, defendingCards } = getCurrentTeams(session);

  function getModifiers(
    side: BattleSide,
    card: RuntimeCardState | null,
    role: PlayerRole,
  ): PhaseModifiers {
    if (!card) {
      return {
        scoreFlatBonus: 0,
        damageMultiplier: 1,
        incomingDamageMultiplier: 1,
        shieldGain: 0,
        notes: [],
      };
    }

    const cacheKey = `${side}:${card.slotIndex}:${role}`;
    const cached = modifierCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const modifiers = buildPhaseModifiers(
      card,
      role,
      side === 'player' ? activeRelations.player : activeRelations.enemy,
    );
    const shieldKey = `${cacheKey}:shield`;

    if (modifiers.shieldGain > 0 && !preparedShieldKeys.has(shieldKey) && card.currentHp > 0) {
      card.shield += modifiers.shieldGain;
      preparedShieldKeys.add(shieldKey);
      phaseFeeds.push(`${card.card.name} 获得 ${modifiers.shieldGain} 点护盾。`);
    }

    modifierCache.set(cacheKey, modifiers);

    return modifiers;
  }

  for (const result of playerResults) {
    const slotIndex = result.slotIndex - 1;
    const attackingCard = getEffectiveCardState(attackingCards, slotIndex);
    const defendingCard = getEffectiveCardState(defendingCards, slotIndex);
    const attackModifiers = getModifiers(attackingSide, attackingCard, 'attack');
    const defenseModifiers = getModifiers(getOpponentSide(attackingSide), defendingCard, 'defense');
    const taskDifficulty = computeTaskDifficulty(
      playerRole === 'attack' ? attackingCard : defendingCard,
      playerRole === 'attack' ? defendingCard : attackingCard,
      playerRole,
    );
    const playerScore = normalizePlayerScore(
      result.score,
      playerRole === 'attack' ? attackingCard : defendingCard,
      playerRole === 'attack' ? defendingCard : attackingCard,
      playerRole,
      playerRole === 'attack' ? attackModifiers : defenseModifiers,
    );
    const aiScore = generateAiScore(
      playerRole === 'attack' ? defendingCard : attackingCard,
      playerRole === 'attack' ? attackingCard : defendingCard,
      playerRole === 'attack' ? 'defense' : 'attack',
      taskDifficulty,
      session.difficultyTier,
      playerRole === 'attack' ? defenseModifiers : attackModifiers,
    );
    const attackingScore = playerRole === 'attack' ? playerScore : aiScore;
    const defendingScore = playerRole === 'attack' ? aiScore : playerScore;
    const attackingGrade = playerRole === 'attack' ? result.grade : getGradeFromScore(aiScore);
    const defendingGrade = playerRole === 'attack' ? getGradeFromScore(aiScore) : result.grade;
    const attackRank = GRADE_RANK[attackingGrade];
    const defenseRank = GRADE_RANK[defendingGrade];

    if (!attackingCard || !defendingCard) {
      const note = !attackingCard
        ? '本槽位已无可用进攻卡，判定直接落空。'
        : '对位已无可用防守卡，本次只记录操作不造成结算。';

      slotResults.push({
        slotIndex: result.slotIndex,
        actedBySlotIndex: attackingCard?.slotIndex ?? null,
        actedByName: attackingCard?.card.name ?? null,
        targetSlotIndex: defendingCard?.slotIndex ?? null,
        targetName: defendingCard?.card.name ?? null,
        score: attackingScore,
        grade: attackingGrade,
        damage: 0,
        targetRemainingHp: defendingCard?.currentHp ?? null,
        note,
        specialEvent: null,
      });
      phaseFeeds.push(`第 ${result.slotIndex} 槽位：${note}`);
      continue;
    }

    let extraDamage = 0;
    let specialEvent: string | null = null;

    if (
      attackingCard.card.skills.some((skill) => skill.isEnabled && skill.type === 'trigger') &&
      attackRank >= GRADE_RANK.great
    ) {
      const pressure =
        attackingCard.card.stats.intelligence + attackingScore * 0.32 + attackRank * 4;
      const resistance =
        defendingCard.card.stats.spirit + defendingScore * 0.24 + defenseRank * 3;

      if (pressure > resistance + 12) {
        applyStatus(defendingCard, {
          key: 'dazed',
          label: '失衡',
          remainingPhases: 2,
        });
        specialEvent = `${defendingCard.card.name} 进入失衡状态`;
      } else {
        specialEvent = `${defendingCard.card.name} 抵抗了特殊压制`;
      }
    }

    const attackerRelations = getRelationsForCard(
      attackingCard,
      activeRelations[attackingSide],
    );
    const defenderRelations = getRelationsForCard(
      defendingCard,
      activeRelations[getOpponentSide(attackingSide)],
    );

    if (
      attackerRelations.some((relation) => relation.effectType === 'special_effect') &&
      attackRank >= GRADE_RANK.great
    ) {
      extraDamage += 8;
      specialEvent = specialEvent ?? `${attackingCard.card.name} 触发了额外压制`;
    }

    const attackPressure =
      attackingScore +
      attackingCard.card.stats.force * 0.62 +
      attackingCard.card.stats.intelligence * 0.16 +
      attackingCard.card.multiplier * 16;
    const defenseGuard =
      defendingScore +
      defendingCard.card.stats.defense * 0.68 +
      defendingCard.card.stats.spirit * 0.24 +
      defendingCard.card.multiplier * 10;
    const rawDamage =
      Math.max(
        0,
        (attackPressure - defenseGuard * 0.8) * attackModifiers.damageMultiplier,
      ) *
        defenseModifiers.incomingDamageMultiplier +
      Math.max(0, attackRank - defenseRank) * 5 +
      extraDamage;
    const settled = applyDamage(defendingCard, rawDamage);

    if (
      defendingCard.card.skills.some((skill) => skill.isEnabled && skill.type === 'trigger') &&
      defenseRank >= GRADE_RANK.great
    ) {
      const healed = healCard(
        defendingCard,
        8 + Math.round(defendingCard.card.stats.spirit * 0.05),
      );

      if (healed > 0) {
        phaseFeeds.push(`${defendingCard.card.name} 在防守后恢复了 ${healed} 点生命。`);
      }

      if (clearStatus(defendingCard, 'dazed')) {
        phaseFeeds.push(`${defendingCard.card.name} 通过稳住节奏解除了失衡。`);
      }
    }

    if (
      attackerRelations.some((relation) => relation.effectType === 'hidden_skill_unlock') &&
      attackingGrade === 'perfect'
    ) {
      const healed = healCard(attackingCard, 10);

      if (healed > 0) {
        phaseFeeds.push(`${attackingCard.card.name} 借由隐藏羁绊回复了 ${healed} 点生命。`);
      }
    }

    if (
      defenderRelations.some((relation) => relation.effectType === 'hidden_skill_unlock') &&
      defendingGrade === 'perfect'
    ) {
      const healed = healCard(defendingCard, 10);

      if (healed > 0) {
        phaseFeeds.push(`${defendingCard.card.name} 借由隐藏羁绊回复了 ${healed} 点生命。`);
      }
    }

    const noteParts = [
      `攻方 ${attackingCard.card.name} ${attackingGrade} / ${attackingScore} 分`,
      `守方 ${defendingCard.card.name} ${defendingGrade} / ${defendingScore} 分`,
    ];

    if (attackModifiers.notes[0]) {
      noteParts.push(attackModifiers.notes[0]);
    }

    if (defenseModifiers.notes[0]) {
      noteParts.push(defenseModifiers.notes[0]);
    }

    if (settled.absorbed > 0) {
      noteParts.push(`护盾吸收 ${settled.absorbed}`);
    }

    slotResults.push({
      slotIndex: result.slotIndex,
      actedBySlotIndex: attackingCard.slotIndex,
      actedByName: attackingCard.card.name,
      targetSlotIndex: defendingCard.slotIndex,
      targetName: defendingCard.card.name,
      score: attackingScore,
      grade: attackingGrade,
      damage: settled.damage,
      targetRemainingHp: settled.remainingHp,
      note: noteParts.join('，'),
      specialEvent,
    });

    phaseFeeds.push(
      `第 ${result.slotIndex} 槽位：${attackingCard.card.name} 对 ${defendingCard.card.name} 造成 ${settled.damage} 点伤害，目标剩余 ${settled.remainingHp} 点生命。`,
    );

    if (specialEvent) {
      phaseFeeds.push(`第 ${result.slotIndex} 槽位额外效果：${specialEvent}。`);
    }
  }

  tickStatuses(session.playerCards);
  tickStatuses(session.enemyCards);

  session.recentSummary = {
    round: session.round,
    phase: session.phase,
    actingSide: session.actingSide,
    playerRole,
    miniGameType: getMiniGameType(playerRole)!,
    initiative: session.initiative,
    slotResults,
    feed: phaseFeeds,
  };

  for (const message of phaseFeeds) {
    appendFeed(session, message);
  }

  advanceToNextPhase(session);
  session.updatedAt = Date.now();

  return buildBattleSnapshot(session);
}
