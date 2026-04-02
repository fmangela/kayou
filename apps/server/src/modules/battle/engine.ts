export type BattlePhase =
  | 'battle_start'
  | 'round_start'
  | 'before_minigame'
  | 'after_minigame'
  | 'before_attack'
  | 'after_attack'
  | 'round_end';

export type BattleSide = 'player' | 'enemy';
export type MiniGameGrade = 'miss' | 'poor' | 'good' | 'great' | 'perfect';
export type SkillSource = 'card_skill' | 'relation_skill';
export type SkillTarget = 'self' | 'opponent';
export type CardStatKey =
  | 'force'
  | 'intelligence'
  | 'defense'
  | 'speed'
  | 'spirit'
  | 'vitality';
export type SkillEffectType =
  | 'modify_score'
  | 'modify_damage'
  | 'modify_incoming_damage'
  | 'damage'
  | 'heal'
  | 'grant_shield'
  | 'add_tag'
  | 'remove_tag';
export type SkillNumericMode = 'add' | 'multiply';

export interface RuntimeSkillTrigger {
  phases: BattlePhase[];
  minGrade?: MiniGameGrade;
  minScore?: number;
  maxScore?: number;
  ownerHpLtePct?: number;
  ownerHpGtePct?: number;
  targetHpLtePct?: number;
  targetHpGtePct?: number;
  chance?: number;
  maxTriggersPerBattle?: number;
  maxTriggersPerRound?: number;
  requireOwnerTags?: string[];
  forbidOwnerTags?: string[];
  requireTargetTags?: string[];
  forbidTargetTags?: string[];
}

export interface RuntimeSkillEffect {
  type: SkillEffectType;
  target: SkillTarget;
  mode?: SkillNumericMode;
  value: number;
  scaleStat?: CardStatKey;
  scaleRatio?: number;
  finalScoreRatio?: number;
  tag?: string;
}

export interface RuntimeSkillDefinition {
  code: string;
  name: string;
  description: string;
  source: SkillSource;
  ownerCardCode: string;
  trigger: RuntimeSkillTrigger;
  effects: RuntimeSkillEffect[];
  relationMembers?: string[];
}

export interface BattleCardRuntime {
  id: number;
  code: string;
  name: string;
  multiplier: number;
  stats: Record<CardStatKey, number>;
  skills: RuntimeSkillDefinition[];
}

export interface BattleRoundModifierState {
  scoreFlatBonus: number;
  scoreMultiplier: number;
  outgoingDamageFlat: number;
  outgoingDamageMultiplier: number;
  incomingDamageMultiplier: number;
}

export interface BattleTeamState {
  side: BattleSide;
  hp: number;
  maxHp: number;
  shield: number;
  tags: string[];
  cards: BattleCardRuntime[];
  round: BattleRoundModifierState;
}

export interface BattleMiniGameState {
  baseScore: number;
  finalScore: number;
  grade: MiniGameGrade;
}

export interface BattleLogEntry {
  phase: BattlePhase;
  type:
    | 'phase'
    | 'skill_triggered'
    | 'effect_applied'
    | 'minigame_settled'
    | 'damage_settled';
  sourceSide?: BattleSide;
  targetSide?: BattleSide;
  skillCode?: string;
  skillName?: string;
  message: string;
  value?: number;
}

export interface BattleState {
  round: number;
  currentPhase: BattlePhase;
  seed: number;
  actingSide: BattleSide;
  player: BattleTeamState;
  enemy: BattleTeamState;
  minigame: BattleMiniGameState;
  logs: BattleLogEntry[];
  skillUsage: Record<
    string,
    {
      total: number;
      lastTriggeredRound: number;
      roundCount: number;
    }
  >;
}

export interface BattleRoundInput {
  actingSide: BattleSide;
  baseScore: number;
  grade: MiniGameGrade;
}

const gradeRank: Record<MiniGameGrade, number> = {
  miss: 0,
  poor: 1,
  good: 2,
  great: 3,
  perfect: 4,
};

function createRoundModifierState(): BattleRoundModifierState {
  return {
    scoreFlatBonus: 0,
    scoreMultiplier: 1,
    outgoingDamageFlat: 0,
    outgoingDamageMultiplier: 1,
    incomingDamageMultiplier: 1,
  };
}

function nextRandom(state: BattleState): number {
  let seed = state.seed >>> 0;

  seed += 0x6d2b79f5;
  let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  state.seed = seed >>> 0;

  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function getTeam(state: BattleState, side: BattleSide): BattleTeamState {
  return side === 'player' ? state.player : state.enemy;
}

function getOpponentSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'enemy' : 'player';
}

function getUsageKey(side: BattleSide, skillCode: string): string {
  return `${side}:${skillCode}`;
}

function hasAllTags(source: string[], expected?: string[]): boolean {
  if (!expected || expected.length === 0) {
    return true;
  }

  return expected.every((tag) => source.includes(tag));
}

function hasNoneTags(source: string[], forbidden?: string[]): boolean {
  if (!forbidden || forbidden.length === 0) {
    return true;
  }

  return forbidden.every((tag) => !source.includes(tag));
}

function getHpPct(team: BattleTeamState): number {
  if (team.maxHp <= 0) {
    return 0;
  }

  return team.hp / team.maxHp;
}

function addTag(team: BattleTeamState, tag: string) {
  if (!team.tags.includes(tag)) {
    team.tags.push(tag);
  }
}

function removeTag(team: BattleTeamState, tag: string) {
  team.tags = team.tags.filter((item) => item !== tag);
}

function resolveEffectMagnitude(
  effect: RuntimeSkillEffect,
  ownerCard: BattleCardRuntime,
  state: BattleState,
): number {
  const statScale =
    effect.scaleStat && effect.scaleRatio
      ? ownerCard.stats[effect.scaleStat] * effect.scaleRatio
      : 0;
  const scoreScale =
    effect.finalScoreRatio && state.minigame.finalScore > 0
      ? state.minigame.finalScore * effect.finalScoreRatio
      : 0;

  return effect.value + statScale + scoreScale;
}

function applyShieldOrDamage(team: BattleTeamState, amount: number) {
  const rounded = Math.max(0, Math.round(amount));

  if (rounded <= 0) {
    return 0;
  }

  const absorbed = Math.min(team.shield, rounded);
  team.shield -= absorbed;
  const remaining = rounded - absorbed;
  team.hp = Math.max(0, team.hp - remaining);

  return rounded;
}

function healTeam(team: BattleTeamState, amount: number) {
  const rounded = Math.max(0, Math.round(amount));

  if (rounded <= 0) {
    return 0;
  }

  const nextHp = Math.min(team.maxHp, team.hp + rounded);
  const healed = nextHp - team.hp;
  team.hp = nextHp;

  return healed;
}

function appendLog(state: BattleState, entry: BattleLogEntry) {
  state.logs.push(entry);
}

function getTeamBattlePower(team: BattleTeamState): number {
  return team.cards.reduce((sum, card) => {
    const attackWeight =
      card.stats.force * 0.58 +
      card.stats.intelligence * 0.22 +
      card.stats.speed * 0.1 +
      card.stats.spirit * 0.1;

    return sum + attackWeight * card.multiplier;
  }, 0);
}

function canTriggerRelation(
  team: BattleTeamState,
  skill: RuntimeSkillDefinition,
): boolean {
  if (!skill.relationMembers || skill.relationMembers.length === 0) {
    return true;
  }

  const cardCodes = new Set(team.cards.map((card) => card.code));

  return skill.relationMembers.every((code) => cardCodes.has(code));
}

function canTriggerSkill(
  state: BattleState,
  ownerSide: BattleSide,
  ownerTeam: BattleTeamState,
  targetTeam: BattleTeamState,
  skill: RuntimeSkillDefinition,
  ownerCard: BattleCardRuntime,
): boolean {
  if (!skill.trigger.phases.includes(state.currentPhase)) {
    return false;
  }

  if (skill.source === 'relation_skill' && !canTriggerRelation(ownerTeam, skill)) {
    return false;
  }

  const usageKey = getUsageKey(ownerSide, skill.code);
  const usage = state.skillUsage[usageKey] ?? {
    total: 0,
    lastTriggeredRound: 0,
    roundCount: 0,
  };

  if (
    skill.trigger.maxTriggersPerBattle &&
    usage.total >= skill.trigger.maxTriggersPerBattle
  ) {
    return false;
  }

  if (
    skill.trigger.maxTriggersPerRound &&
    usage.lastTriggeredRound === state.round &&
    usage.roundCount >= skill.trigger.maxTriggersPerRound
  ) {
    return false;
  }

  if (
    typeof skill.trigger.minGrade !== 'undefined' &&
    gradeRank[state.minigame.grade] < gradeRank[skill.trigger.minGrade]
  ) {
    return false;
  }

  if (
    typeof skill.trigger.minScore === 'number' &&
    state.minigame.finalScore < skill.trigger.minScore
  ) {
    return false;
  }

  if (
    typeof skill.trigger.maxScore === 'number' &&
    state.minigame.finalScore > skill.trigger.maxScore
  ) {
    return false;
  }

  const ownerHpPct = getHpPct(ownerTeam);
  const targetHpPct = getHpPct(targetTeam);

  if (
    typeof skill.trigger.ownerHpLtePct === 'number' &&
    ownerHpPct > skill.trigger.ownerHpLtePct
  ) {
    return false;
  }

  if (
    typeof skill.trigger.ownerHpGtePct === 'number' &&
    ownerHpPct < skill.trigger.ownerHpGtePct
  ) {
    return false;
  }

  if (
    typeof skill.trigger.targetHpLtePct === 'number' &&
    targetHpPct > skill.trigger.targetHpLtePct
  ) {
    return false;
  }

  if (
    typeof skill.trigger.targetHpGtePct === 'number' &&
    targetHpPct < skill.trigger.targetHpGtePct
  ) {
    return false;
  }

  if (!hasAllTags(ownerTeam.tags, skill.trigger.requireOwnerTags)) {
    return false;
  }

  if (!hasNoneTags(ownerTeam.tags, skill.trigger.forbidOwnerTags)) {
    return false;
  }

  if (!hasAllTags(targetTeam.tags, skill.trigger.requireTargetTags)) {
    return false;
  }

  if (!hasNoneTags(targetTeam.tags, skill.trigger.forbidTargetTags)) {
    return false;
  }

  if (typeof skill.trigger.chance === 'number' && skill.trigger.chance < 1) {
    if (nextRandom(state) > skill.trigger.chance) {
      return false;
    }
  }

  if (!ownerCard.name) {
    return false;
  }

  return true;
}

function markSkillTriggered(
  state: BattleState,
  ownerSide: BattleSide,
  skillCode: string,
) {
  const usageKey = getUsageKey(ownerSide, skillCode);
  const current = state.skillUsage[usageKey];

  if (!current) {
    state.skillUsage[usageKey] = {
      total: 1,
      lastTriggeredRound: state.round,
      roundCount: 1,
    };
    return;
  }

  const nextRoundCount =
    current.lastTriggeredRound === state.round ? current.roundCount + 1 : 1;

  state.skillUsage[usageKey] = {
    total: current.total + 1,
    lastTriggeredRound: state.round,
    roundCount: nextRoundCount,
  };
}

function applyNumericModifier(
  current: number,
  mode: SkillNumericMode,
  magnitude: number,
): number {
  return mode === 'multiply' ? current * magnitude : current + magnitude;
}

function applySkillEffect(
  state: BattleState,
  ownerSide: BattleSide,
  ownerCard: BattleCardRuntime,
  skill: RuntimeSkillDefinition,
  effect: RuntimeSkillEffect,
) {
  const targetSide = effect.target === 'self' ? ownerSide : getOpponentSide(ownerSide);
  const targetTeam = getTeam(state, targetSide);
  const magnitude = resolveEffectMagnitude(effect, ownerCard, state);
  const mode = effect.mode ?? 'add';

  if (effect.type === 'modify_score') {
    if (mode === 'multiply') {
      targetTeam.round.scoreMultiplier = applyNumericModifier(
        targetTeam.round.scoreMultiplier,
        mode,
        magnitude,
      );
    } else {
      targetTeam.round.scoreFlatBonus = applyNumericModifier(
        targetTeam.round.scoreFlatBonus,
        mode,
        magnitude,
      );
    }

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 调整了 ${targetSide} 方的小游戏得分修正`,
      value: Number(magnitude.toFixed(2)),
    });
    return;
  }

  if (effect.type === 'modify_damage') {
    if (mode === 'multiply') {
      targetTeam.round.outgoingDamageMultiplier = applyNumericModifier(
        targetTeam.round.outgoingDamageMultiplier,
        mode,
        magnitude,
      );
    } else {
      targetTeam.round.outgoingDamageFlat = applyNumericModifier(
        targetTeam.round.outgoingDamageFlat,
        mode,
        magnitude,
      );
    }

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 调整了 ${targetSide} 方的伤害修正`,
      value: Number(magnitude.toFixed(2)),
    });
    return;
  }

  if (effect.type === 'modify_incoming_damage') {
    targetTeam.round.incomingDamageMultiplier = applyNumericModifier(
      targetTeam.round.incomingDamageMultiplier,
      mode,
      magnitude,
    );

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 调整了 ${targetSide} 方的承伤修正`,
      value: Number(magnitude.toFixed(2)),
    });
    return;
  }

  if (effect.type === 'damage') {
    const damage = applyShieldOrDamage(targetTeam, magnitude);

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 造成了额外伤害`,
      value: damage,
    });
    return;
  }

  if (effect.type === 'heal') {
    const healed = healTeam(targetTeam, magnitude);

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 触发了治疗`,
      value: healed,
    });
    return;
  }

  if (effect.type === 'grant_shield') {
    const shield = Math.max(0, Math.round(magnitude));
    targetTeam.shield += shield;

    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 为 ${targetSide} 方施加了护盾`,
      value: shield,
    });
    return;
  }

  if (effect.type === 'add_tag' && effect.tag) {
    addTag(targetTeam, effect.tag);
    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 为 ${targetSide} 方添加了标签 ${effect.tag}`,
    });
    return;
  }

  if (effect.type === 'remove_tag' && effect.tag) {
    removeTag(targetTeam, effect.tag);
    appendLog(state, {
      phase: state.currentPhase,
      type: 'effect_applied',
      sourceSide: ownerSide,
      targetSide,
      skillCode: skill.code,
      skillName: skill.name,
      message: `${ownerCard.name} 移除了 ${targetSide} 方的标签 ${effect.tag}`,
    });
  }
}

function resolvePhaseForTeam(
  state: BattleState,
  ownerSide: BattleSide,
) {
  const ownerTeam = getTeam(state, ownerSide);
  const targetTeam = getTeam(state, getOpponentSide(ownerSide));

  for (const card of ownerTeam.cards) {
    for (const skill of card.skills) {
      if (!canTriggerSkill(state, ownerSide, ownerTeam, targetTeam, skill, card)) {
        continue;
      }

      appendLog(state, {
        phase: state.currentPhase,
        type: 'skill_triggered',
        sourceSide: ownerSide,
        targetSide: getOpponentSide(ownerSide),
        skillCode: skill.code,
        skillName: skill.name,
        message: `${card.name} 触发技能 ${skill.name}`,
      });
      markSkillTriggered(state, ownerSide, skill.code);

      for (const effect of skill.effects) {
        applySkillEffect(state, ownerSide, card, skill, effect);
      }
    }
  }
}

export function createBattleState(input: {
  playerCards: BattleCardRuntime[];
  enemyCards: BattleCardRuntime[];
  baseHp: number;
  round?: number;
  seed?: number;
}): BattleState {
  return {
    round: input.round ?? 1,
    currentPhase: 'battle_start',
    seed: input.seed ?? Date.now(),
    actingSide: 'player',
    player: {
      side: 'player',
      hp: input.baseHp,
      maxHp: input.baseHp,
      shield: 0,
      tags: [],
      cards: input.playerCards,
      round: createRoundModifierState(),
    },
    enemy: {
      side: 'enemy',
      hp: input.baseHp,
      maxHp: input.baseHp,
      shield: 0,
      tags: [],
      cards: input.enemyCards,
      round: createRoundModifierState(),
    },
    minigame: {
      baseScore: 0,
      finalScore: 0,
      grade: 'miss',
    },
    logs: [],
    skillUsage: {},
  };
}

export function enterBattlePhase(state: BattleState, phase: BattlePhase) {
  state.currentPhase = phase;

  appendLog(state, {
    phase,
    type: 'phase',
    message: `进入阶段 ${phase}`,
  });

  if (phase === 'round_start') {
    state.player.round = createRoundModifierState();
    state.enemy.round = createRoundModifierState();
  }

  resolvePhaseForTeam(state, 'player');
  resolvePhaseForTeam(state, 'enemy');
}

export function settleMiniGame(
  state: BattleState,
  actingSide: BattleSide,
  input: {
    baseScore: number;
    grade: MiniGameGrade;
  },
) {
  const actingTeam = getTeam(state, actingSide);
  const finalScore = Math.max(
    0,
    Math.round(
      (input.baseScore + actingTeam.round.scoreFlatBonus) *
        actingTeam.round.scoreMultiplier,
    ),
  );

  state.minigame = {
    baseScore: input.baseScore,
    finalScore,
    grade: input.grade,
  };

  appendLog(state, {
    phase: state.currentPhase,
    type: 'minigame_settled',
    sourceSide: actingSide,
    message: `${actingSide} 方小游戏结算完成`,
    value: finalScore,
  });
}

export function settleBattleDamage(state: BattleState, actingSide: BattleSide) {
  const attackingTeam = getTeam(state, actingSide);
  const defendingSide = getOpponentSide(actingSide);
  const defendingTeam = getTeam(state, defendingSide);
  const scoreFactor = Math.max(0.4, state.minigame.finalScore / 100);
  const teamPower = getTeamBattlePower(attackingTeam);
  const rawDamage =
    (teamPower * 0.38 * scoreFactor + attackingTeam.round.outgoingDamageFlat) *
    attackingTeam.round.outgoingDamageMultiplier *
    defendingTeam.round.incomingDamageMultiplier;
  const damage = applyShieldOrDamage(defendingTeam, rawDamage);

  appendLog(state, {
    phase: state.currentPhase,
    type: 'damage_settled',
    sourceSide: actingSide,
    targetSide: defendingSide,
    message: `${actingSide} 方完成本回合伤害结算`,
    value: damage,
  });

  return damage;
}

export function runBattleRound(
  state: BattleState,
  input: BattleRoundInput,
) {
  state.actingSide = input.actingSide;
  enterBattlePhase(state, 'round_start');
  enterBattlePhase(state, 'before_minigame');
  settleMiniGame(state, input.actingSide, {
    baseScore: input.baseScore,
    grade: input.grade,
  });
  enterBattlePhase(state, 'after_minigame');
  enterBattlePhase(state, 'before_attack');
  const damage = settleBattleDamage(state, input.actingSide);
  enterBattlePhase(state, 'after_attack');
  enterBattlePhase(state, 'round_end');

  return {
    state,
    damage,
  };
}
