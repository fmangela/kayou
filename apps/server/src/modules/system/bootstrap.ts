import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../../lib/database.js';
import { hashPassword } from '../../lib/passwords.js';

const defaultAdmin = {
  account: 'admin',
  password: 'kayouadmin',
  role: 'super_admin' as const,
};

const baseConfigs = [
  ['combat.base_hp', { value: 100 }, '玩家基础血量'],
  ['economy.stamina_cost.tower', { value: 10 }, '单人爬塔体力消耗'],
  ['economy.initial', { gold: 300, diamonds: 0, stamina: 120 }, '玩家初始经济数值'],
  ['gacha.card_dust_bonus', { R: 0.03, SR: 0.015, SSR: 0.005 }, '粉尘提升稀有卡获取概率'],
] as const;

const seedCards = [
  {
    code: 'card-flame-001',
    name: '赤焰剑士',
    rarity: 'R',
    attribute: '火',
    series: '晨星远征',
    camp: '王庭军',
    stats: {
      force: 88,
      intelligence: 52,
      defense: 68,
      speed: 70,
      spirit: 54,
      vitality: 82,
    },
    story: '晨星远征军的突击前锋，擅长用高温剑势打出先手压制，现作为第一批可实测的战斗测试卡。',
    multiplier: 1.25,
    imageUrl: '/assets/cards/flame-swordsman.webp',
    skills: [
      {
        skillCode: 'card-flame-001-S1',
        sortIndex: 1,
        name: '灼热连斩',
        type: 'active',
        description: '作为进攻方时，射箭小游戏判定更容易打高分，并提升本槽位结算伤害。',
        valueText: '进攻判定强化',
      },
      {
        skillCode: 'card-flame-001-S2',
        sortIndex: 2,
        name: '焰痕压制',
        type: 'trigger',
        description: '当本槽位取得 great 或 perfect 时，尝试让目标进入失衡状态。',
        valueText: '高评级触发额外压制',
      },
    ],
    relations: [
      {
        relationCode: 'relation-frontline-strike',
        name: '先锋突击',
        triggerType: 'specific_cards',
        triggerDescription: '赤焰剑士与逐风机巧师同时上阵',
        effectType: 'skill_enhance',
        effectDescription: '两者的进攻节奏衔接更顺，攻击结算更强。',
        effectPayload: null,
        memberCardCodes: ['card-flame-001', 'card-storm-003'],
      },
      {
        relationCode: 'relation-test-squad',
        name: '试炼小队',
        triggerType: 'specific_cards',
        triggerDescription: '四张测试卡同时上阵',
        effectType: 'hidden_skill_unlock',
        effectDescription: 'perfect 评级时触发少量生命回复。',
        effectPayload: null,
        memberCardCodes: [
          'card-flame-001',
          'card-frost-002',
          'card-storm-003',
          'card-nature-004',
        ],
      },
    ],
  },
  {
    code: 'card-frost-002',
    name: '霜语祭司',
    rarity: 'SR',
    attribute: '冰',
    series: '极夜回廊',
    camp: '白塔会',
    stats: {
      force: 52,
      intelligence: 93,
      defense: 74,
      speed: 60,
      spirit: 90,
      vitality: 76,
    },
    story: '掌握寒霜祷言的支援核心，偏向高智慧与高精神，用来测试防守稳定性与抗压表现。',
    multiplier: 1.42,
    imageUrl: '/assets/cards/frost-priest.webp',
    skills: [
      {
        skillCode: 'card-frost-002-S1',
        sortIndex: 1,
        name: '寒霜庇护',
        type: 'passive',
        description: '作为防守方时，提供更稳定的判定和额外护盾。',
        valueText: '防守稳定强化',
      },
      {
        skillCode: 'card-frost-002-S2',
        sortIndex: 2,
        name: '静心祷言',
        type: 'trigger',
        description: '防守小游戏取得 great 或 perfect 时，恢复少量生命并尝试解除失衡。',
        valueText: '高评级防守回复',
      },
    ],
    relations: [
      {
        relationCode: 'relation-frost-wood-barrier',
        name: '坚霜结界',
        triggerType: 'specific_cards',
        triggerDescription: '霜语祭司与藤岚守卫同时上阵',
        effectType: 'attribute_bonus',
        effectDescription: '两者共同稳住防线，提高基础判定。',
        effectPayload: null,
        memberCardCodes: ['card-frost-002', 'card-nature-004'],
      },
      {
        relationCode: 'relation-test-squad',
        name: '试炼小队',
        triggerType: 'specific_cards',
        triggerDescription: '四张测试卡同时上阵',
        effectType: 'hidden_skill_unlock',
        effectDescription: 'perfect 评级时触发少量生命回复。',
        effectPayload: null,
        memberCardCodes: [
          'card-flame-001',
          'card-frost-002',
          'card-storm-003',
          'card-nature-004',
        ],
      },
    ],
  },
  {
    code: 'card-storm-003',
    name: '逐风机巧师',
    rarity: 'N',
    attribute: '雷',
    series: '空庭工坊',
    camp: '工坊联盟',
    stats: {
      force: 58,
      intelligence: 70,
      defense: 50,
      speed: 92,
      spirit: 56,
      vitality: 62,
    },
    story: '高速机巧师，负责把先手、节奏和卡槽代理逻辑测出来，是这轮战斗框架里的速度测试卡。',
    multiplier: 1.1,
    imageUrl: '/assets/cards/storm-engineer.webp',
    skills: [
      {
        skillCode: 'card-storm-003-S1',
        sortIndex: 1,
        name: '疾速过载',
        type: 'passive',
        description: '速度优势会更容易体现在先手掷骰与防守护盾上。',
        valueText: '先手与防守节奏强化',
      },
      {
        skillCode: 'card-storm-003-S2',
        sortIndex: 2,
        name: '追风校准',
        type: 'active',
        description: '作为进攻方时，能更快校准射箭节奏，提升本槽位评分。',
        valueText: '进攻判定强化',
      },
    ],
    relations: [
      {
        relationCode: 'relation-frontline-strike',
        name: '先锋突击',
        triggerType: 'specific_cards',
        triggerDescription: '赤焰剑士与逐风机巧师同时上阵',
        effectType: 'skill_enhance',
        effectDescription: '两者的进攻节奏衔接更顺，攻击结算更强。',
        effectPayload: null,
        memberCardCodes: ['card-flame-001', 'card-storm-003'],
      },
      {
        relationCode: 'relation-test-squad',
        name: '试炼小队',
        triggerType: 'specific_cards',
        triggerDescription: '四张测试卡同时上阵',
        effectType: 'hidden_skill_unlock',
        effectDescription: 'perfect 评级时触发少量生命回复。',
        effectPayload: null,
        memberCardCodes: [
          'card-flame-001',
          'card-frost-002',
          'card-storm-003',
          'card-nature-004',
        ],
      },
    ],
  },
  {
    code: 'card-nature-004',
    name: '藤岚守卫',
    rarity: 'R',
    attribute: '木',
    series: '森语圣域',
    camp: '圣域守军',
    stats: {
      force: 72,
      intelligence: 48,
      defense: 92,
      speed: 56,
      spirit: 60,
      vitality: 94,
    },
    story: '偏防御与体力的前排守卫，用于测试多段承伤、左侧代理以及残局生存表现。',
    multiplier: 1.28,
    imageUrl: '/assets/cards/nature-guard.webp',
    skills: [
      {
        skillCode: 'card-nature-004-S1',
        sortIndex: 1,
        name: '枝蔓护盾',
        type: 'passive',
        description: '作为防守方时获得额外护盾，并降低受到的结算伤害。',
        valueText: '护盾与减伤',
      },
      {
        skillCode: 'card-nature-004-S2',
        sortIndex: 2,
        name: '回春根须',
        type: 'trigger',
        description: '防守小游戏取得 great 或 perfect 时，回复少量生命值。',
        valueText: '高评级防守回复',
      },
    ],
    relations: [
      {
        relationCode: 'relation-frost-wood-barrier',
        name: '坚霜结界',
        triggerType: 'specific_cards',
        triggerDescription: '霜语祭司与藤岚守卫同时上阵',
        effectType: 'attribute_bonus',
        effectDescription: '两者共同稳住防线，提高基础判定。',
        effectPayload: null,
        memberCardCodes: ['card-frost-002', 'card-nature-004'],
      },
      {
        relationCode: 'relation-test-squad',
        name: '试炼小队',
        triggerType: 'specific_cards',
        triggerDescription: '四张测试卡同时上阵',
        effectType: 'hidden_skill_unlock',
        effectDescription: 'perfect 评级时触发少量生命回复。',
        effectPayload: null,
        memberCardCodes: [
          'card-flame-001',
          'card-frost-002',
          'card-storm-003',
          'card-nature-004',
        ],
      },
    ],
  },
] as const;

interface AdminRow extends RowDataPacket {
  id: number;
}

async function columnExists(
  connection: PoolConnection,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
}

async function ensureColumn(
  connection: PoolConnection,
  tableName: string,
  columnName: string,
  definition: string,
) {
  if (await columnExists(connection, tableName, columnName)) {
    return;
  }

  await connection.execute(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
  );
}

async function ensureCardFrameworkSchema(connection: PoolConnection) {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS cards (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      rarity VARCHAR(16) NOT NULL DEFAULT 'N',
      element VARCHAR(32) NOT NULL DEFAULT '无',
      series_name VARCHAR(64) NOT NULL,
      camp_name VARCHAR(64) NOT NULL DEFAULT '中立',
      force_value INT UNSIGNED NOT NULL DEFAULT 0,
      intelligence_value INT UNSIGNED NOT NULL DEFAULT 0,
      defense_value INT UNSIGNED NOT NULL DEFAULT 0,
      speed_value INT UNSIGNED NOT NULL DEFAULT 0,
      spirit_value INT UNSIGNED NOT NULL DEFAULT 0,
      vitality_value INT UNSIGNED NOT NULL DEFAULT 0,
      background_story VARCHAR(500) NOT NULL DEFAULT '',
      skill_name VARCHAR(128) NOT NULL DEFAULT '',
      skill_description TEXT NOT NULL,
      damage_multiplier DECIMAL(6, 2) NOT NULL DEFAULT 1.00,
      image_url VARCHAR(255) NOT NULL DEFAULT '',
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_cards_code (code)
    )
  `);
  await connection.execute(`
    ALTER TABLE cards
    MODIFY COLUMN rarity VARCHAR(16) NOT NULL DEFAULT 'N'
  `);
  await ensureColumn(connection, 'cards', 'camp_name', "VARCHAR(64) NOT NULL DEFAULT '中立'");
  await ensureColumn(connection, 'cards', 'force_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'cards', 'intelligence_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'cards', 'defense_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'cards', 'speed_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'cards', 'spirit_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(connection, 'cards', 'vitality_value', 'INT UNSIGNED NOT NULL DEFAULT 0');
  await ensureColumn(
    connection,
    'cards',
    'background_story',
    "VARCHAR(500) NOT NULL DEFAULT ''",
  );

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS card_skills (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      card_id BIGINT UNSIGNED NOT NULL,
      skill_code VARCHAR(64) NOT NULL,
      sort_index TINYINT UNSIGNED NOT NULL DEFAULT 1,
      name VARCHAR(64) NOT NULL,
      skill_type VARCHAR(16) NOT NULL,
      effect_description VARCHAR(500) NOT NULL,
      effect_value VARCHAR(255) NOT NULL DEFAULT '',
      trigger_condition VARCHAR(255) NOT NULL DEFAULT '',
      target_skill_code VARCHAR(64) NULL,
      is_hidden TINYINT(1) NOT NULL DEFAULT 0,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_card_skills_code (skill_code),
      UNIQUE KEY uniq_card_skills_sort (card_id, sort_index),
      CONSTRAINT fk_card_skills_card
        FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS card_relations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      relation_code VARCHAR(64) NOT NULL,
      name VARCHAR(64) NOT NULL,
      trigger_type VARCHAR(32) NOT NULL,
      trigger_description VARCHAR(500) NOT NULL,
      effect_type VARCHAR(32) NOT NULL,
      effect_description VARCHAR(500) NOT NULL,
      effect_payload JSON NULL,
      target_skill_code VARCHAR(64) NULL,
      can_stack TINYINT(1) NOT NULL DEFAULT 1,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_card_relations_code (relation_code)
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS card_relation_members (
      relation_id BIGINT UNSIGNED NOT NULL,
      card_id BIGINT UNSIGNED NOT NULL,
      PRIMARY KEY (relation_id, card_id),
      KEY idx_card_relation_members_card_id (card_id),
      CONSTRAINT fk_card_relation_members_relation
        FOREIGN KEY (relation_id) REFERENCES card_relations (id) ON DELETE CASCADE,
      CONSTRAINT fk_card_relation_members_card
        FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE
    )
  `);
}

async function backfillLegacyCards(connection: PoolConnection) {
  await connection.execute(`
    UPDATE cards
    SET rarity = CASE rarity
      WHEN 'common' THEN 'N'
      WHEN 'rare' THEN 'R'
      WHEN 'epic' THEN 'SR'
      WHEN 'legendary' THEN 'SSR'
      ELSE rarity
    END
  `);
  await connection.execute(`
    UPDATE cards
    SET element = CASE element
      WHEN 'flame' THEN '火'
      WHEN 'frost' THEN '冰'
      WHEN 'storm' THEN '雷'
      WHEN 'nature' THEN '木'
      ELSE element
    END
  `);
  await connection.execute(`
    UPDATE cards
    SET
      camp_name = CASE WHEN TRIM(camp_name) = '' THEN '中立' ELSE camp_name END,
      force_value = CASE
        WHEN force_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 60))
        ELSE force_value
      END,
      intelligence_value = CASE
        WHEN intelligence_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 56))
        ELSE intelligence_value
      END,
      defense_value = CASE
        WHEN defense_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 58))
        ELSE defense_value
      END,
      speed_value = CASE
        WHEN speed_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 54))
        ELSE speed_value
      END,
      spirit_value = CASE
        WHEN spirit_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 52))
        ELSE spirit_value
      END,
      vitality_value = CASE
        WHEN vitality_value = 0 THEN GREATEST(48, ROUND(damage_multiplier * 62))
        ELSE vitality_value
      END,
      background_story = CASE
        WHEN TRIM(background_story) = '' THEN CONCAT(name, ' 的背景设定待后续补充。')
        ELSE background_story
      END,
      skill_name = CASE
        WHEN TRIM(skill_name) = '' THEN '待配置技能'
        ELSE skill_name
      END,
      skill_description = CASE
        WHEN TRIM(skill_description) = '' THEN '当前卡牌尚未配置具体技能效果。'
        ELSE skill_description
      END
  `);

  await connection.execute(`
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
    SELECT
      c.id,
      CONCAT(c.code, '-S1'),
      1,
      c.skill_name,
      'active',
      c.skill_description,
      '待补充',
      '',
      NULL,
      0,
      1
    FROM cards c
    WHERE NOT EXISTS (
      SELECT 1
      FROM card_skills s
      WHERE s.card_id = c.id
    )
  `);
}

function getSeedRelationDefinitions() {
  const relationMap = new Map<
    string,
    (typeof seedCards)[number]['relations'][number]
  >();

  for (const card of seedCards) {
    for (const relation of card.relations) {
      relationMap.set(relation.relationCode, relation);
    }
  }

  return [...relationMap.values()];
}

async function syncSeedCardSkills(
  connection: PoolConnection,
  cardId: number,
  card: (typeof seedCards)[number],
) {
  await connection.execute(
    `
      DELETE FROM card_skills
      WHERE card_id = ?
    `,
    [cardId],
  );

  for (const skill of card.skills) {
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
        VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, 0, 1)
      `,
      [
        cardId,
        skill.skillCode,
        skill.sortIndex,
        skill.name,
        skill.type,
        skill.description,
        skill.valueText,
      ],
    );
  }
}

async function syncSeedRelations(
  connection: PoolConnection,
  cardIdByCode: Map<string, number>,
) {
  const relationDefinitions = getSeedRelationDefinitions();

  if (relationDefinitions.length === 0) {
    return;
  }

  await connection.execute(
    `
      DELETE FROM card_relations
      WHERE relation_code IN (${relationDefinitions.map(() => '?').join(', ')})
    `,
    relationDefinitions.map((relation) => relation.relationCode),
  );

  for (const relation of relationDefinitions) {
    const memberIds = relation.memberCardCodes.map((code) => {
      const cardId = cardIdByCode.get(code);

      if (!cardId) {
        throw new Error(`缺少关系技能成员卡牌：${code}`);
      }

      return cardId;
    });

    await connection.execute(
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
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1, 1)
      `,
      [
        relation.relationCode,
        relation.name,
        relation.triggerType,
        relation.triggerDescription,
        relation.effectType,
        relation.effectDescription,
      ],
    );

    const [relationRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM card_relations
        WHERE relation_code = ?
        LIMIT 1
      `,
      [relation.relationCode],
    );
    const relationId = Number(relationRows[0]?.id);

    if (!relationId) {
      continue;
    }

    for (const memberId of memberIds) {
      await connection.execute(
        `
          INSERT INTO card_relation_members (relation_id, card_id)
          VALUES (?, ?)
        `,
        [relationId, memberId],
      );
    }
  }
}

async function ensureCardCatalog(connection: PoolConnection) {
  const cardIdByCode = new Map<string, number>();

  for (const card of seedCards) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM cards
        WHERE code = ?
        LIMIT 1
      `,
      [card.code],
    );

    if (rows.length === 0) {
      await connection.execute(
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          card.code,
          card.name,
          card.rarity,
          card.attribute,
          card.series,
          card.camp,
          card.stats.force,
          card.stats.intelligence,
          card.stats.defense,
          card.stats.speed,
          card.stats.spirit,
          card.stats.vitality,
          card.story,
          card.skills[0]?.name ?? '待配置技能',
          card.skills[0]?.description ?? '当前卡牌尚未配置具体技能效果。',
          card.multiplier,
          card.imageUrl,
        ],
      );
    } else {
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
            is_enabled = 1
          WHERE code = ?
        `,
        [
          card.name,
          card.rarity,
          card.attribute,
          card.series,
          card.camp,
          card.stats.force,
          card.stats.intelligence,
          card.stats.defense,
          card.stats.speed,
          card.stats.spirit,
          card.stats.vitality,
          card.story,
          card.skills[0]?.name ?? '待配置技能',
          card.skills[0]?.description ?? '当前卡牌尚未配置具体技能效果。',
          card.multiplier,
          card.imageUrl,
          card.code,
        ],
      );
    }

    const [cardRows] = await connection.execute<RowDataPacket[]>(
      `
        SELECT id
        FROM cards
        WHERE code = ?
        LIMIT 1
      `,
      [card.code],
    );
    const cardId = Number(cardRows[0]?.id);

    if (!cardId) {
      continue;
    }

    cardIdByCode.set(card.code, cardId);
    await syncSeedCardSkills(connection, cardId, card);
  }

  await syncSeedRelations(connection, cardIdByCode);
}

async function ensureDefaultAdmin(connection: PoolConnection) {
  const [rows] = await connection.execute<AdminRow[]>(
    'SELECT id FROM admins WHERE account = ? LIMIT 1',
    [defaultAdmin.account],
  );

  if (rows.length > 0) {
    return;
  }

  await connection.execute(
    `
      INSERT INTO admins (account, password_hash, role, status)
      VALUES (?, ?, ?, 'active')
    `,
    [defaultAdmin.account, hashPassword(defaultAdmin.password), defaultAdmin.role],
  );
}

async function ensureBaseConfigs(connection: PoolConnection) {
  for (const [key, value, description] of baseConfigs) {
    await connection.execute(
      `
        INSERT INTO game_configs (
          config_key,
          config_value,
          description
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          config_value = VALUES(config_value),
          description = VALUES(description)
      `,
      [key, JSON.stringify(value), description],
    );
  }
}

export async function ensureSystemData() {
  const connection = await getPool().getConnection();

  try {
    await ensureCardFrameworkSchema(connection);
    await backfillLegacyCards(connection);
    await connection.beginTransaction();
    await ensureCardCatalog(connection);
    await ensureBaseConfigs(connection);
    await ensureDefaultAdmin(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const defaultAdminCredentials = defaultAdmin;
