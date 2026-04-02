export const APP_PORTS = {
  game: 5173,
  admin: 5174,
  server: 3000,
} as const;

export const DECK_LIMIT = 4;
export const DEFAULT_DECK_PRESET_SLOTS = 3;

export const CARD_RARITY_OPTIONS = [
  { code: 'N', label: 'N' },
  { code: 'R', label: 'R' },
  { code: 'SR', label: 'SR' },
  { code: 'SSR', label: 'SSR' },
  { code: 'UR', label: 'UR' },
  { code: 'PR', label: 'PR' },
  { code: 'HR', label: 'HR' },
] as const;

export const CARD_SKILL_TYPE_OPTIONS = [
  { code: 'active', label: '主动技能' },
  { code: 'passive', label: '被动技能' },
  { code: 'trigger', label: '触发技能' },
] as const;

export const CARD_RELATION_TRIGGER_OPTIONS = [
  { code: 'same_series', label: '同系列组合' },
  { code: 'same_camp', label: '同阵营组合' },
  { code: 'specific_cards', label: '特定人物组合' },
  { code: 'attribute_combo', label: '属性组合' },
] as const;

export const CARD_RELATION_EFFECT_OPTIONS = [
  { code: 'attribute_bonus', label: '属性加成' },
  { code: 'skill_enhance', label: '技能强化' },
  { code: 'special_effect', label: '特殊效果' },
  { code: 'hidden_skill_unlock', label: '隐藏技能解锁' },
] as const;

export type CardRarity = (typeof CARD_RARITY_OPTIONS)[number]['code'];
export type CardSkillType = (typeof CARD_SKILL_TYPE_OPTIONS)[number]['code'];
export type CardRelationTriggerType =
  (typeof CARD_RELATION_TRIGGER_OPTIONS)[number]['code'];
export type CardRelationEffectType =
  (typeof CARD_RELATION_EFFECT_OPTIONS)[number]['code'];
export type AdminRole = 'super_admin' | 'ops_admin' | 'data_admin';

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

export interface CardStats {
  force: number;
  intelligence: number;
  defense: number;
  speed: number;
  spirit: number;
  vitality: number;
}

export interface CardSkillRecord {
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

export interface CardRelationMember {
  id: number;
  code: string;
  name: string;
}

export interface CardRelationRecord {
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
  members: CardRelationMember[];
}

export interface CardCatalogItem {
  id: number;
  code: string;
  name: string;
  rarity: CardRarity;
  series: string;
  camp: string;
  attribute: string;
  element: string;
  stats: CardStats;
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

export interface CardCollectionItem extends CardCatalogItem {
  skillName: string;
  skillDescription: string;
  owned: boolean;
  quantity: number;
  level: number;
  obtainedAt: string | null;
}

export interface DeckPreset {
  id: number;
  slotIndex: number;
  presetName: string;
  cardIds: number[];
  isActive: boolean;
}

export interface AchievementProgress {
  key: string;
  label: string;
  completed: boolean;
  progressText: string;
}

export interface PlayerProfile {
  id: number;
  username: string;
  level: number;
  experience: number;
  nextLevelExperience: number;
  stamina: number;
  gold: number;
  diamonds: number;
  cardDust: number;
  towerFloor: number;
  pvpWins: number;
  pvpLosses: number;
  totalPower: number;
  ownedCardCount: number;
  activeDeck: CardCollectionItem[];
  achievements: AchievementProgress[];
}

export interface TowerSnapshot {
  currentFloor: number;
  maxFloor: number;
  remainingFloors: number;
  difficultyTier: number;
  negativeEffect: string;
  availableRooms: string[];
  staminaCost: number;
}

export interface GameConfigRecord {
  key: string;
  description: string;
  value: JsonValue;
  updatedAt: string;
}

export interface PlayerBootstrapPayload {
  profile: PlayerProfile;
  collection: CardCollectionItem[];
  deckPresets: DeckPreset[];
  tower: TowerSnapshot;
  configs: GameConfigRecord[];
}

export interface PlayerSession {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    username: string;
    role: 'player';
  };
}

export interface PlayerAuthResponse {
  session: PlayerSession;
  bootstrap: PlayerBootstrapPayload;
}

export interface AdminPlayerSummary {
  id: number;
  username: string;
  level: number;
  stamina: number;
  gold: number;
  diamonds: number;
  cardDust: number;
  towerFloor: number;
  pvpWins: number;
  pvpLosses: number;
  collectionCount: number;
  createdAt: string;
}

export interface AdminSession {
  token: string;
  expiresAt: string;
  user: {
    id: number;
    account: string;
    role: AdminRole;
  };
}

export interface AdminBootstrapPayload {
  players: AdminPlayerSummary[];
  configs: GameConfigRecord[];
  cards: CardCatalogItem[];
}

export interface AdminAuthResponse {
  session: AdminSession;
  bootstrap: AdminBootstrapPayload;
}

export interface ApiEnvelope<T> {
  ok: true;
  data: T;
  message?: string;
}

export interface ApiErrorEnvelope {
  ok: false;
  message: string;
  details?: JsonValue;
}

export const MINI_GAME_GRADE_OPTIONS = [
  'miss',
  'poor',
  'good',
  'great',
  'perfect',
] as const;

export const TOWER_BATTLE_MINI_GAMES = ['archery', 'catch'] as const;

export type BattleSide = 'player' | 'enemy';
export type MiniGameGrade = (typeof MINI_GAME_GRADE_OPTIONS)[number];
export type TowerBattleMiniGameType = (typeof TOWER_BATTLE_MINI_GAMES)[number];
export type TowerBattleStatus = 'in_progress' | 'won' | 'lost' | 'abandoned';

export interface TowerBattleCardStatus {
  key: 'dazed';
  label: string;
  remainingPhases: number;
}

export interface TowerBattleCardSnapshot {
  slotIndex: number;
  cardId: number;
  code: string;
  name: string;
  rarity: CardRarity;
  imageUrl: string;
  stats: CardStats;
  primarySkillName: string;
  currentHp: number;
  maxHp: number;
  shield: number;
  isKnockedOut: boolean;
  statuses: TowerBattleCardStatus[];
}

export interface TowerBattleTeamSnapshot {
  side: BattleSide;
  aliveCount: number;
  totalHp: number;
  initiativeRoll: number;
  cards: TowerBattleCardSnapshot[];
}

export interface TowerBattleMiniGameTask {
  slotIndex: number;
  actingSlotIndex: number | null;
  targetSlotIndex: number | null;
  miniGameType: TowerBattleMiniGameType;
  durationMs: number;
  difficulty: number;
  actorCardName: string | null;
  targetCardName: string | null;
  instruction: string;
}

export interface TowerBattleSlotResult {
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

export interface TowerBattlePhaseSummary {
  round: number;
  phase: number;
  actingSide: BattleSide;
  playerRole: 'attack' | 'defense';
  miniGameType: TowerBattleMiniGameType;
  initiative: {
    player: number;
    enemy: number;
    winner: BattleSide;
  };
  slotResults: TowerBattleSlotResult[];
  feed: string[];
}

export interface TowerBattleSnapshot {
  battleId: string;
  status: TowerBattleStatus;
  floor: number;
  difficultyTier: number;
  round: number;
  phase: number;
  actingSide: BattleSide | null;
  playerRole: 'attack' | 'defense' | null;
  nextMiniGameType: TowerBattleMiniGameType | null;
  nextTasks: TowerBattleMiniGameTask[];
  player: TowerBattleTeamSnapshot;
  enemy: TowerBattleTeamSnapshot;
  recentSummary: TowerBattlePhaseSummary | null;
  feed: string[];
}

export interface TowerBattleTurnResultInput {
  slotIndex: number;
  score: number;
  grade: MiniGameGrade;
}

export interface TowerBattleTurnInput {
  battleId: string;
  results: TowerBattleTurnResultInput[];
}

export const resourceHints = {
  stamina: '体力会用于爬塔与对战，当前版本可通过自然恢复与活动奖励补充。',
  gold: '金币主要用于商店购买与后续拓展内容，是最基础的循环货币。',
  diamonds: '钻石用于稀有资源和高价值刷新，当前版本主要保留作后续扩展。',
  cardDust: '卡牌粉尘用于提升拆包时抽到稀有卡牌的概率。',
} as const;

export const towerNegativeEffects = [
  '前10层暂无负面效果，适合熟悉卡组。',
  '第11层起怪物获得护甲强化，回合伤害更难打满。',
  '第21层起小游戏容错下降，分数波动会更明显。',
  '第31层起敌方反击增强，需要更稳的卡组与体力规划。',
] as const;

export const roomTypeLabels = [
  '休息',
  '商店',
  '普通人机对战',
  '精英人机对战',
  'BOSS战',
  '选择性事件',
] as const;

export const bootstrapPayload = {
  gameName: 'Kayou',
  preferredViewport: 'mobile-first',
  coreModules: ['login', 'home', 'status', 'deck', 'tower', 'admin-console'],
};

const legacyRarityMap = {
  common: 'N',
  rare: 'R',
  epic: 'SR',
  legendary: 'SSR',
} as const;

export function normalizeCardRarity(value: string): CardRarity {
  const rarity = (legacyRarityMap[value as keyof typeof legacyRarityMap] ?? value) as string;
  const matched = CARD_RARITY_OPTIONS.find((item) => item.code === rarity);

  return matched?.code ?? 'N';
}

export function getCardRarityRank(value: string): number {
  const rarity = normalizeCardRarity(value);
  const index = CARD_RARITY_OPTIONS.findIndex((item) => item.code === rarity);

  return index >= 0 ? index : 0;
}
