import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { ApiError } from '../../lib/errors.js';
import { getPool } from '../../lib/database.js';
import { signToken } from '../../lib/auth.js';
import { verifyPassword } from '../../lib/passwords.js';
import {
  adminCardSaveSchema,
  createCardDefinition,
  importCardDefinitions,
  listAdminCards,
  updateCardDefinition,
} from '../card/service.js';
import { convertCardImagesToWebp } from './image-service.js';

export const adminLoginSchema = z.object({
  account: z.string().trim().min(3).max(32),
  password: z.string().min(6).max(32),
});

export const adminPlayersQuerySchema = z.object({
  keyword: z.string().trim().max(32).optional().default(''),
});

export const adminConfigUpdateSchema = z.object({
  value: z.unknown(),
  description: z.string().trim().min(1).max(255),
});

export const adminCardImportSchema = z.object({
  csvText: z.string().min(1, 'CSV 内容不能为空'),
});

export { adminCardSaveSchema };

interface AdminRow extends RowDataPacket {
  id: number;
  account: string;
  password_hash: string;
  role: 'super_admin' | 'ops_admin' | 'data_admin';
  status: 'active' | 'locked';
}

interface PlayerSummaryRow extends RowDataPacket {
  id: number;
  username: string;
  level: number;
  stamina: number;
  gold: number;
  diamonds: number;
  card_dust: number;
  tower_floor: number;
  pvp_wins: number;
  pvp_losses: number;
  collection_count: number;
  created_at: Date;
}

interface ConfigRow extends RowDataPacket {
  config_key: string;
  config_value: string;
  description: string;
  updated_at: Date;
}

function parseConfigValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function findAdminByAccount(account: string): Promise<AdminRow | null> {
  const [rows] = await getPool().execute<AdminRow[]>(
    `
      SELECT
        id,
        account,
        password_hash,
        role,
        status
      FROM admins
      WHERE account = ?
      LIMIT 1
    `,
    [account],
  );

  return rows[0] ?? null;
}

export async function listPlayers(keyword = '') {
  const searchTerm = `%${keyword}%`;
  const [rows] = await getPool().execute<PlayerSummaryRow[]>(
    `
      SELECT
        p.id,
        p.username,
        p.level,
        p.stamina,
        p.gold,
        p.diamonds,
        p.card_dust,
        p.tower_floor,
        p.pvp_wins,
        p.pvp_losses,
        p.created_at,
        COUNT(pc.id) AS collection_count
      FROM players p
      LEFT JOIN player_cards pc
        ON pc.player_id = p.id
       AND pc.quantity > 0
      WHERE
        (? = '' OR p.username LIKE ? OR CAST(p.id AS CHAR) = ?)
      GROUP BY
        p.id,
        p.username,
        p.level,
        p.stamina,
        p.gold,
        p.diamonds,
        p.card_dust,
        p.tower_floor,
        p.pvp_wins,
        p.pvp_losses,
        p.created_at
      ORDER BY p.created_at DESC
      LIMIT 100
    `,
    [keyword, searchTerm, keyword],
  );

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    level: row.level,
    stamina: row.stamina,
    gold: row.gold,
    diamonds: row.diamonds,
    cardDust: row.card_dust,
    towerFloor: row.tower_floor,
    pvpWins: row.pvp_wins,
    pvpLosses: row.pvp_losses,
    collectionCount: Number(row.collection_count),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function listConfigs() {
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

export async function buildAdminBootstrap() {
  const [players, configs, cards] = await Promise.all([
    listPlayers(''),
    listConfigs(),
    listAdminCards(),
  ]);

  return {
    players,
    configs,
    cards,
  };
}

export async function loginAdmin(input: {
  account: string;
  password: string;
}) {
  const payload = adminLoginSchema.parse(input);
  const admin = await findAdminByAccount(payload.account);

  if (!admin || !verifyPassword(payload.password, admin.password_hash)) {
    throw new ApiError(401, '管理员账号或密码错误');
  }

  if (admin.status !== 'active') {
    throw new ApiError(403, '当前管理员账号已被锁定');
  }

  const session = signToken({
    sub: admin.id,
    role: 'admin',
    account: admin.account,
    adminRole: admin.role,
  });
  const bootstrap = await buildAdminBootstrap();

  return {
    session: {
      ...session,
      user: {
        id: admin.id,
        account: admin.account,
        role: admin.role,
      },
    },
    bootstrap,
  };
}

export async function updateConfig(input: {
  key: string;
  value: unknown;
  description: string;
  adminId: number;
}) {
  const payload = adminConfigUpdateSchema.parse({
    value: input.value,
    description: input.description,
  });

  await getPool().execute<ResultSetHeader>(
    `
      INSERT INTO game_configs (
        config_key,
        config_value,
        description,
        updated_by
      )
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        config_value = VALUES(config_value),
        description = VALUES(description),
        updated_by = VALUES(updated_by)
    `,
    [input.key, JSON.stringify(payload.value), payload.description, input.adminId],
  );
  await getPool().execute(
    `
      INSERT INTO operation_logs (
        admin_id,
        action_type,
        target_type,
        target_id,
        action_payload,
        ip_address
      )
      VALUES (?, 'config.update', 'game_config', ?, ?, '127.0.0.1')
    `,
    [input.adminId, input.key, JSON.stringify(payload.value)],
  );

  return listConfigs();
}

export async function createCard(
  input: z.input<typeof adminCardSaveSchema>,
  adminId: number,
) {
  return createCardDefinition(input, adminId);
}

export async function updateCard(
  cardId: number,
  input: z.input<typeof adminCardSaveSchema>,
  adminId: number,
) {
  return updateCardDefinition(cardId, input, adminId);
}

export async function convertCardImages(adminId: number) {
  return convertCardImagesToWebp(adminId);
}

function parseCsvRowText(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  const normalized = csvText.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      const hasContent = currentRow.some((cell) => cell.trim() !== '');

      if (hasContent) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);

  if (currentRow.some((cell) => cell.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

function parseBooleanText(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  throw new ApiError(400, `无法识别布尔值：${value}`);
}

const requiredCardImportHeaders = [
  'code',
  'name',
  'rarity',
  'series',
  'camp',
  'attribute',
  'force',
  'intelligence',
  'defense',
  'speed',
  'spirit',
  'vitality',
  'story',
  'imageUrl',
  'multiplier',
  'enabled',
  'skillsJson',
  'relationsJson',
] as const;

function parseCardImportCsv(csvText: string) {
  const rows = parseCsvRowText(csvText);

  if (rows.length < 2) {
    throw new ApiError(400, 'CSV 至少需要包含表头和一行数据');
  }

  const headers = rows[0].map((header) => header.trim());
  const missingHeader = requiredCardImportHeaders.find(
    (header) => !headers.includes(header),
  );

  if (missingHeader) {
    throw new ApiError(400, `CSV 缺少必要字段：${missingHeader}`);
  }

  return rows.slice(1).map((row, index) => {
    const record = Object.fromEntries(
      headers.map((header, columnIndex) => [header, (row[columnIndex] ?? '').trim()]),
    ) as Record<string, string>;

    try {
      const skills = JSON.parse(record.skillsJson || '[]') as unknown;
      const relations = JSON.parse(record.relationsJson || '[]') as unknown;

      return adminCardSaveSchema.parse({
        code: record.code,
        name: record.name,
        rarity: record.rarity,
        series: record.series,
        camp: record.camp,
        attribute: record.attribute,
        stats: {
          force: Number(record.force),
          intelligence: Number(record.intelligence),
          defense: Number(record.defense),
          speed: Number(record.speed),
          spirit: Number(record.spirit),
          vitality: Number(record.vitality),
        },
        story: record.story,
        imageUrl: record.imageUrl,
        multiplier: Number(record.multiplier),
        enabled: parseBooleanText(record.enabled),
        skills,
        relations,
      });
    } catch (error) {
      throw new ApiError(
        400,
        `CSV 第 ${index + 2} 行解析失败`,
        error instanceof Error ? error.message : '未知解析错误',
      );
    }
  });
}

export async function importCardsFromCsv(
  input: z.input<typeof adminCardImportSchema>,
  adminId: number,
) {
  const payload = adminCardImportSchema.parse(input);
  const cards = parseCardImportCsv(payload.csvText);

  return importCardDefinitions(cards, adminId);
}
