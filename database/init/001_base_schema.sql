CREATE DATABASE IF NOT EXISTS kayou
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'kayou'@'localhost' IDENTIFIED BY 'kayou';
CREATE USER IF NOT EXISTS 'kayou'@'127.0.0.1' IDENTIFIED BY 'kayou';
GRANT ALL PRIVILEGES ON kayou.* TO 'kayou'@'localhost';
GRANT ALL PRIVILEGES ON kayou.* TO 'kayou'@'127.0.0.1';
FLUSH PRIVILEGES;

USE kayou;

CREATE TABLE IF NOT EXISTS players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  level INT UNSIGNED NOT NULL DEFAULT 1,
  experience INT UNSIGNED NOT NULL DEFAULT 0,
  stamina INT UNSIGNED NOT NULL DEFAULT 120,
  gold INT UNSIGNED NOT NULL DEFAULT 300,
  diamonds INT UNSIGNED NOT NULL DEFAULT 0,
  card_dust INT UNSIGNED NOT NULL DEFAULT 0,
  tower_floor INT UNSIGNED NOT NULL DEFAULT 1,
  pvp_wins INT UNSIGNED NOT NULL DEFAULT 0,
  pvp_losses INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_players_username (username)
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin', 'ops_admin', 'data_admin') NOT NULL DEFAULT 'ops_admin',
  status ENUM('active', 'locked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_admins_account (account)
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS card_relation_members (
  relation_id BIGINT UNSIGNED NOT NULL,
  card_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (relation_id, card_id),
  KEY idx_card_relation_members_card_id (card_id),
  CONSTRAINT fk_card_relation_members_relation
    FOREIGN KEY (relation_id) REFERENCES card_relations (id) ON DELETE CASCADE,
  CONSTRAINT fk_card_relation_members_card
    FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_cards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id BIGINT UNSIGNED NOT NULL,
  card_id BIGINT UNSIGNED NOT NULL,
  level INT UNSIGNED NOT NULL DEFAULT 1,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_player_card (player_id, card_id),
  CONSTRAINT fk_player_cards_player
    FOREIGN KEY (player_id) REFERENCES players (id),
  CONSTRAINT fk_player_cards_card
    FOREIGN KEY (card_id) REFERENCES cards (id)
);

CREATE TABLE IF NOT EXISTS deck_presets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id BIGINT UNSIGNED NOT NULL,
  preset_name VARCHAR(32) NOT NULL,
  slot_index INT UNSIGNED NOT NULL,
  card_ids_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_player_slot (player_id, slot_index),
  CONSTRAINT fk_deck_presets_player
    FOREIGN KEY (player_id) REFERENCES players (id)
);

CREATE TABLE IF NOT EXISTS game_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_key VARCHAR(64) NOT NULL,
  config_value JSON NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_game_configs_key (config_key),
  CONSTRAINT fk_game_configs_admin
    FOREIGN KEY (updated_by) REFERENCES admins (id)
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  action_payload JSON NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operation_logs_admin_id (admin_id),
  CONSTRAINT fk_operation_logs_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
);

INSERT INTO game_configs (config_key, config_value, description)
VALUES
  ('combat.base_hp', JSON_OBJECT('value', 100), '玩家基础血量'),
  ('economy.stamina_cost.tower', JSON_OBJECT('value', 10), '单人爬塔体力消耗'),
  ('economy.initial', JSON_OBJECT('gold', 300, 'diamonds', 0, 'stamina', 120), '玩家初始经济数值'),
  ('gacha.card_dust_bonus', JSON_OBJECT('R', 0.03, 'SR', 0.015, 'SSR', 0.005), '粉尘提升稀有卡获取概率')
ON DUPLICATE KEY UPDATE
  config_value = VALUES(config_value),
  description = VALUES(description);

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
VALUES
  (
    'card-flame-001',
    '赤焰剑士',
    'R',
    '火',
    '晨星远征',
    '王庭军',
    88,
    52,
    68,
    70,
    54,
    82,
    '晨星远征军前锋，以高温剑技撕开敌阵，作为当前工程阶段的卡牌占位数据保留。',
    '灼热连斩',
    '完成小游戏后提升本回合伤害倍率。',
    1.25,
    '/assets/cards/flame-swordsman.webp',
    1
  ),
  (
    'card-frost-002',
    '霜语祭司',
    'SR',
    '冰',
    '极夜回廊',
    '白塔会',
    52,
    93,
    74,
    60,
    90,
    76,
    '掌握寒霜祷言的支援角色，用于验证高智慧与高精神卡牌在新框架中的数据承载。',
    '寒霜庇护',
    '稳定小游戏结算，降低分数波动。',
    1.42,
    '/assets/cards/frost-priest.webp',
    1
  ),
  (
    'card-storm-003',
    '逐风机巧师',
    'N',
    '雷',
    '空庭工坊',
    '工坊联盟',
    58,
    70,
    50,
    92,
    56,
    62,
    '速度型占位卡，保留给当前开发流程做卡组、排序和基础收藏逻辑验证。',
    '疾速过载',
    '缩短小游戏准备时间并提高基础连击。',
    1.10,
    '/assets/cards/storm-engineer.webp',
    1
  ),
  (
    'card-nature-004',
    '藤岚守卫',
    'R',
    '木',
    '森语圣域',
    '圣域守军',
    72,
    48,
    92,
    56,
    60,
    94,
    '防御型占位卡，方便后续把卡牌数值、后台编辑和玩家收藏展示串起来。',
    '枝蔓护盾',
    '怪物反击前获得一次减伤效果。',
    1.28,
    '/assets/cards/nature-guard.webp',
    1
  )
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  rarity = VALUES(rarity),
  element = VALUES(element),
  series_name = VALUES(series_name),
  camp_name = VALUES(camp_name),
  force_value = VALUES(force_value),
  intelligence_value = VALUES(intelligence_value),
  defense_value = VALUES(defense_value),
  speed_value = VALUES(speed_value),
  spirit_value = VALUES(spirit_value),
  vitality_value = VALUES(vitality_value),
  background_story = VALUES(background_story),
  skill_name = VALUES(skill_name),
  skill_description = VALUES(skill_description),
  damage_multiplier = VALUES(damage_multiplier),
  image_url = VALUES(image_url),
  is_enabled = VALUES(is_enabled);

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
SELECT id, CONCAT(code, '-S1'), 1, skill_name, 'active', skill_description, '待补充', '', NULL, 0, 1
FROM cards
WHERE code IN ('card-flame-001', 'card-frost-002', 'card-storm-003', 'card-nature-004')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  effect_description = VALUES(effect_description),
  effect_value = VALUES(effect_value),
  is_enabled = VALUES(is_enabled);
