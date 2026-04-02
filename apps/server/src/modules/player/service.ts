import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import { getPool, withTransaction } from '../../lib/database.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { signToken } from '../../lib/auth.js';
import { getStarterCardIds, listPlayerCollection } from '../card/service.js';

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[\p{L}\p{N}_-]+$/u, '用户名仅支持中英文、数字、下划线与短横线');

const passwordSchema = z
  .string()
  .min(6)
  .max(32)
  .refine(
    (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
    '密码需包含字母和数字',
  );

export const playerCredentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const saveDeckSchema = z.object({
  slotIndex: z.coerce.number().int().positive(),
  presetName: z.string().trim().min(2).max(20),
  cardIds: z
    .array(z.number().int().positive())
    .length(4, '出战卡组必须恰好保存 4 张卡牌'),
});

interface PlayerRow extends RowDataPacket {
  id: number;
  username: string;
  password_hash: string;
  level: number;
  experience: number;
  stamina: number;
  gold: number;
  diamonds: number;
  card_dust: number;
  tower_floor: number;
  pvp_wins: number;
  pvp_losses: number;
}

interface DeckPresetRow extends RowDataPacket {
  id: number;
  slot_index: number;
  preset_name: string;
  card_ids_json: string;
  is_active: number;
}

interface ConfigRow extends RowDataPacket {
  config_key: string;
  config_value: string;
  description: string;
  updated_at: Date;
}

const towerNegativeEffects = [
  '前10层暂无负面效果，适合熟悉卡组。',
  '第11层起怪物获得护甲强化，回合伤害更难打满。',
  '第21层起小游戏容错下降，分数波动会更明显。',
  '第31层起敌方反击增强，需要更稳的卡组与体力规划。',
] as const;

const roomTypes = ['休息', '商店', '普通人机对战', '精英人机对战', 'BOSS战', '选择性事件'];

function parseJsonArray(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

function parseConfigValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildTowerRooms(playerId: number, floor: number): string[] {
  return Array.from({ length: 3 }, (_item, index) => {
    const offset = (playerId + floor + index * 3) % roomTypes.length;
    return roomTypes[offset];
  });
}

async function findPlayerByUsername(
  connection: PoolConnection,
  username: string,
): Promise<PlayerRow | null> {
  const [rows] = await connection.execute<PlayerRow[]>(
    `
      SELECT
        id,
        username,
        password_hash,
        level,
        experience,
        stamina,
        gold,
        diamonds,
        card_dust,
        tower_floor,
        pvp_wins,
        pvp_losses
      FROM players
      WHERE username = ?
      LIMIT 1
    `,
    [username],
  );

  return rows[0] ?? null;
}

async function findPlayerById(playerId: number): Promise<PlayerRow> {
  const [rows] = await getPool().execute<PlayerRow[]>(
    `
      SELECT
        id,
        username,
        password_hash,
        level,
        experience,
        stamina,
        gold,
        diamonds,
        card_dust,
        tower_floor,
        pvp_wins,
        pvp_losses
      FROM players
      WHERE id = ?
      LIMIT 1
    `,
    [playerId],
  );

  const player = rows[0];

  if (!player) {
    throw new ApiError(404, '未找到玩家账号');
  }

  return player;
}

async function listDeckPresets(playerId: number) {
  const [rows] = await getPool().execute<DeckPresetRow[]>(
    `
      SELECT
        id,
        slot_index,
        preset_name,
        card_ids_json,
        is_active
      FROM deck_presets
      WHERE player_id = ?
      ORDER BY slot_index ASC
    `,
    [playerId],
  );

  return rows.map((row) => ({
    id: row.id,
    slotIndex: row.slot_index,
    presetName: row.preset_name,
    cardIds: parseJsonArray(row.card_ids_json),
    isActive: row.is_active === 1,
  }));
}

async function listConfigs() {
  const [rows] = await getPool().execute<ConfigRow[]>(
    `
      SELECT
        config_key,
        config_value,
        description,
        updated_at
      FROM game_configs
      ORDER BY config_key ASC
    `,
  );

  return rows.map((row) => ({
    key: row.config_key,
    description: row.description,
    value: parseConfigValue(row.config_value),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

function buildAchievements(profile: {
  towerFloor: number;
  pvpWins: number;
  ownedCardCount: number;
}) {
  return [
    {
      key: 'first_tower_clear',
      label: '首次通关',
      completed: profile.towerFloor > 1,
      progressText: `当前已到 ${profile.towerFloor} 层`,
    },
    {
      key: 'pvp_victory',
      label: '对战首胜',
      completed: profile.pvpWins > 0,
      progressText: `累计 ${profile.pvpWins} 胜`,
    },
    {
      key: 'card_collection',
      label: '卡牌收集',
      completed: profile.ownedCardCount >= 8,
      progressText: `已收集 ${profile.ownedCardCount} 张`,
    },
  ];
}

function computeTowerSnapshot(
  playerId: number,
  currentFloor: number,
  configs: { key: string; value: unknown }[],
) {
  const maxFloor = 40;
  const difficultyTier = Math.min(
    towerNegativeEffects.length,
    Math.floor((currentFloor - 1) / 10) + 1,
  );
  const staminaConfig = configs.find(
    (item) => item.key === 'economy.stamina_cost.tower',
  )?.value as { value?: number } | undefined;

  return {
    currentFloor,
    maxFloor,
    remainingFloors: Math.max(0, maxFloor - currentFloor + 1),
    difficultyTier,
    negativeEffect: towerNegativeEffects[difficultyTier - 1],
    availableRooms: buildTowerRooms(playerId, currentFloor),
    staminaCost: Number(staminaConfig?.value ?? 10),
  };
}

export async function buildPlayerBootstrap(playerId: number) {
  const [player, collection, deckPresets, configs] = await Promise.all([
    findPlayerById(playerId),
    listPlayerCollection(playerId),
    listDeckPresets(playerId),
    listConfigs(),
  ]);

  const activePreset =
    deckPresets.find((preset) => preset.isActive) ??
    deckPresets[0] ?? {
      cardIds: [],
    };
  const activeDeck = activePreset.cardIds
    .map((cardId) => collection.find((card) => card.id === cardId))
    .filter((card): card is NonNullable<typeof card> => Boolean(card));
  const ownedCardCount = collection.filter((card) => card.owned).length;
  const totalPower = Math.round(
    activeDeck.reduce((sum, card) => sum + card.multiplier * card.level * 100, 0),
  );

  return {
    profile: {
      id: player.id,
      username: player.username,
      level: player.level,
      experience: player.experience,
      nextLevelExperience: player.level * 100,
      stamina: player.stamina,
      gold: player.gold,
      diamonds: player.diamonds,
      cardDust: player.card_dust,
      towerFloor: player.tower_floor,
      pvpWins: player.pvp_wins,
      pvpLosses: player.pvp_losses,
      totalPower,
      ownedCardCount,
      activeDeck,
      achievements: buildAchievements({
        towerFloor: player.tower_floor,
        pvpWins: player.pvp_wins,
        ownedCardCount,
      }),
    },
    collection,
    deckPresets,
    tower: computeTowerSnapshot(player.id, player.tower_floor, configs),
    configs,
  };
}

export async function registerPlayer(input: {
  username: string;
  password: string;
}) {
  const payload = playerCredentialsSchema.parse(input);

  const player = await withTransaction(async (connection) => {
    const existingPlayer = await findPlayerByUsername(connection, payload.username);

    if (existingPlayer) {
      throw new ApiError(409, '用户名已存在，请更换后重试');
    }

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO players (
          username,
          password_hash,
          level,
          experience,
          stamina,
          gold,
          diamonds,
          card_dust,
          tower_floor,
          pvp_wins,
          pvp_losses
        )
        VALUES (?, ?, 1, 0, 120, 300, 0, 0, 1, 0, 0)
      `,
      [payload.username, hashPassword(payload.password)],
    );
    const playerId = insertResult.insertId;
    const starterCardIds = await getStarterCardIds(connection);

    for (const cardId of starterCardIds) {
      await connection.execute(
        `
          INSERT INTO player_cards (player_id, card_id, level, quantity)
          VALUES (?, ?, 1, 1)
        `,
        [playerId, cardId],
      );
    }

    const baseDeck = starterCardIds.slice(0, 4);
    const presetNames = ['默认出战', '爬塔专用', '对战专用'];

    for (const [index, presetName] of presetNames.entries()) {
      await connection.execute(
        `
          INSERT INTO deck_presets (
            player_id,
            preset_name,
            slot_index,
            card_ids_json,
            is_active
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          playerId,
          presetName,
          index + 1,
          JSON.stringify(baseDeck),
          index === 0 ? 1 : 0,
        ],
      );
    }

    return {
      id: playerId,
      username: payload.username,
    };
  });

  const session = signToken({
    sub: player.id,
    role: 'player',
    username: player.username,
  });
  const bootstrap = await buildPlayerBootstrap(player.id);

  return {
    session: {
      ...session,
      user: {
        id: player.id,
        username: player.username,
        role: 'player' as const,
      },
    },
    bootstrap,
  };
}

export async function loginPlayer(input: {
  username: string;
  password: string;
}) {
  const payload = playerCredentialsSchema.parse(input);
  const connection = await getPool().getConnection();

  try {
    const player = await findPlayerByUsername(connection, payload.username);

    if (!player || !verifyPassword(payload.password, player.password_hash)) {
      throw new ApiError(401, '用户名或密码错误');
    }

    const session = signToken({
      sub: player.id,
      role: 'player',
      username: player.username,
    });
    const bootstrap = await buildPlayerBootstrap(player.id);

    return {
      session: {
        ...session,
        user: {
          id: player.id,
          username: player.username,
          role: 'player' as const,
        },
      },
      bootstrap,
    };
  } finally {
    connection.release();
  }
}

export async function saveDeck(
  playerId: number,
  input: {
    slotIndex: number;
    presetName: string;
    cardIds: number[];
  },
) {
  const payload = saveDeckSchema.parse(input);
  const uniqueIds = [...new Set(payload.cardIds)];

  if (uniqueIds.length !== payload.cardIds.length) {
    throw new ApiError(400, '出战卡组不能包含重复卡牌');
  }

  await withTransaction(async (connection) => {
    const [ownedRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT card_id
        FROM player_cards
        WHERE player_id = ?
          AND quantity > 0
      `,
      [playerId],
    );
    const ownedCardIds = new Set(ownedRows.map((row) => Number(row.card_id)));
    const missingCard = payload.cardIds.find((cardId) => !ownedCardIds.has(cardId));

    if (missingCard) {
      throw new ApiError(400, '当前卡组中包含未拥有的卡牌');
    }

    await connection.execute(
      `
        UPDATE deck_presets
        SET is_active = 0
        WHERE player_id = ?
      `,
      [playerId],
    );
    await connection.execute(
      `
        INSERT INTO deck_presets (
          player_id,
          preset_name,
          slot_index,
          card_ids_json,
          is_active
        )
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          preset_name = VALUES(preset_name),
          card_ids_json = VALUES(card_ids_json),
          is_active = VALUES(is_active)
      `,
      [playerId, payload.presetName, payload.slotIndex, JSON.stringify(payload.cardIds)],
    );
  });

  return buildPlayerBootstrap(playerId);
}
