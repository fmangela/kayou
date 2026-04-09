const mysql = require('mysql2/promise');

const MYSQL_HOST = process.env.MYSQL_HOST || '127.0.0.1';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'kayou';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'kayou';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'kayou';

let poolPromise;

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    charset: 'utf8mb4',
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );
  await connection.end();
}

async function initSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      pinyin VARCHAR(255) DEFAULT NULL,
      background TEXT DEFAULT NULL,
      appearance TEXT DEFAULT NULL,
      nb2_prompt TEXT DEFAULT NULL,
      mj_prompt TEXT DEFAULT NULL,
      image_paths LONGTEXT,
      webp_paths LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) NOT NULL PRIMARY KEY,
      \`value\` TEXT DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_attributes (
      character_id INT NOT NULL PRIMARY KEY,
      card_code VARCHAR(64) DEFAULT NULL,
      series_name VARCHAR(255) DEFAULT NULL,
      faction_name VARCHAR(255) DEFAULT NULL,
      rarity VARCHAR(64) DEFAULT NULL,
      force_value INT DEFAULT NULL,
      intellect_value INT DEFAULT NULL,
      speed_value INT DEFAULT NULL,
      stamina_value INT DEFAULT NULL,
      element_name VARCHAR(255) DEFAULT NULL,
      skill1_id VARCHAR(64) DEFAULT NULL,
      skill1_name VARCHAR(255) DEFAULT NULL,
      skill1_desc TEXT DEFAULT NULL,
      skill2_id VARCHAR(64) DEFAULT NULL,
      skill2_name VARCHAR(255) DEFAULT NULL,
      skill2_desc TEXT DEFAULT NULL,
      skill3_id VARCHAR(64) DEFAULT NULL,
      skill3_name VARCHAR(255) DEFAULT NULL,
      skill3_desc TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_card_attributes_character
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      CONSTRAINT uq_card_attributes_card_code UNIQUE (card_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      game_key VARCHAR(64) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      formula_config LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  await pool.query(`
    INSERT IGNORE INTO games (game_key, name, formula_config) VALUES
    ('archery', '射箭', '{"swing_speed":"1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","time_limit":"5*(1+(my_force-enemy_force)/enemy_force)"}'),
    ('soccer', '足球', '{"goalkeeper_speed":"1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","swing_speed":"1*(1+(enemy_intellect-my_intellect)/my_intellect)","time_limit":"10*(1+(my_force-enemy_force)/enemy_force)"}'),
    ('tennis', '网球', '{"ball_speed":"1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","landing_range":"0.5*(1+(enemy_intellect-my_intellect)/my_intellect)","time_limit":"15*(1+(my_force-enemy_force)/enemy_force)"}'),
    ('golf', '高尔夫', '{"power_speed":"1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","green_zone":"0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)","time_limit":"10*(1+(my_force-enemy_force)/enemy_force)"}'),
    ('swimming', '游泳', '{"opponent_speed":"1*(1+(enemy_speed-my_speed)/my_speed)","rhythm_window":"0.5*(1-(my_intellect-enemy_intellect)/(my_intellect+enemy_intellect))","time_limit":"15*(1+(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('running', '跑步', '{"opponent_base_speed":"5*(1+(enemy_speed-my_speed)/my_speed)","overtake_window_count":"3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)","stamina_drain_rate":"1*(1+(enemy_stamina-my_stamina)/my_stamina)","sprint_reserve":"2.5*(1+(my_force-enemy_force)/enemy_force)"}'),
    ('gymnastics', '体操', '{"sequence_length":"3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)","beat_speed":"1*(1+(enemy_speed-my_speed)/my_speed)","balance_speed":"1*(1+(enemy_stamina-my_stamina)/my_stamina)","judge_window":"0.3*(1+(my_intellect-enemy_intellect)/enemy_intellect)"}'),
    ('boxing', '拳击', '{"punch_interval":"1.2*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","fake_prob":"0.2*(1+(enemy_intellect-my_intellect)/my_intellect)","counter_window":"0.5*(1+(my_force-enemy_force)/enemy_force)","exchange_count":"6*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)"}'),
    ('equestrian', '马术', '{"obstacle_interval":"2*(1+(my_intellect-enemy_intellect)/enemy_intellect)","jump_window":"0.4*(1+(my_speed-enemy_speed)/enemy_speed)","horse_restless":"1*(1+(enemy_stamina-my_stamina)/my_stamina)","obstacle_count":"5*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)"}'),
    ('racing', '赛车', '{"curve_count":"3*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)","grip":"1*(1+(my_speed-enemy_speed)/enemy_speed)","drift_window":"0.35*(1+(my_intellect-enemy_intellect)/enemy_intellect)","collision_tolerance":"2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('chopping', '切菜', '{"belt_speed":"2*(1+(enemy_speed-my_speed)/my_speed)","recipe_length":"4*(1+0.5*(enemy_intellect-my_intellect)/my_intellect)","distract_ratio":"0.2*(1+(enemy_intellect-my_intellect)/my_intellect)","mistake_limit":"2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('guitar', '吉他', '{"chord_preview_time":"1.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)","strum_density":"4*(1+(enemy_speed-my_speed)/my_speed)","fill_length":"3*(1+(enemy_intellect-my_intellect)/my_intellect)","section_length":"2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('nosehair', '拔鼻毛', '{"hair_swing":"1*(1+(enemy_speed-my_speed)/my_speed)","clamp_width":"20*(1+(my_intellect-enemy_intellect)/enemy_intellect)","root_firmness":"1*(1+(enemy_force-my_force)/my_force)","target_count":"3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)"}'),
    ('volleyball', '垫球', '{"toss_speed":"4*(1+(enemy_speed-my_speed)/my_speed)","target_window_width_value":"18*(1+(my_intellect-enemy_intellect)/enemy_intellect)","spin_drift":"0.15*(1+(enemy_intellect-my_intellect)/my_intellect)","target_ball_count":"5*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)"}'),
    ('jumprope', '跳绳', '{"rope_speed":"1*(1+(enemy_speed-my_speed)/my_speed)","speed_change_freq":"0.2*(1+(enemy_intellect-my_intellect)/my_intellect)","jump_window":"0.22*(1+(my_stamina-enemy_stamina)/enemy_stamina)","target_jump_count":"12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('snake', '贪吃蛇', '{"move_speed":"4*(1+(enemy_speed-my_speed)/my_speed)","obstacle_freq":"0.25*(1+(enemy_intellect-my_intellect)/my_intellect)","gold_duration":"2*(1+(my_intellect-enemy_intellect)/enemy_intellect)","target_food_count":"5*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('tetris', '俄罗斯方块', '{"drop_speed":"1*(1+(enemy_speed-my_speed)/my_speed)","preview_count":"3*(1+(my_intellect-enemy_intellect)/enemy_intellect)","garbage_prob":"0.1*(1+(enemy_force-my_force)/my_force)","piece_limit":"8*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('breakout', '打砖块', '{"initial_ball_count":"10*(1+(my_speed-enemy_speed)/enemy_speed)","brick_hp":"3*(1+(enemy_force-my_force)/my_force)","obstacle_ratio":"0.15*(1+(enemy_intellect-my_intellect)/my_intellect)","round_count":"4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('pinball', '弹球', '{"launch_speed":"5*(1+(enemy_speed-my_speed)/my_speed)","drain_width":"0.15*(1+(enemy_intellect-my_intellect)/my_intellect)","multiplier_freq":"0.25*(1+(enemy_intellect-my_intellect)/my_intellect)","ball_count":"2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)","target_count":"3*(1+0.5*(enemy_stamina-my_stamina)/my_stamina)"}'),
    ('tank', '坦克', '{"enemy_aim_speed":"1*(1+(enemy_speed-my_speed)/my_speed)","shell_speed":"6*(1+(enemy_force-my_force)/my_force)","cover_count":"6*(1+(my_intellect-enemy_intellect)/enemy_intellect)","battle_hp":"2*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('airplane', '飞机', '{"bullet_density":"3*(1+(enemy_speed-my_speed)/my_speed)","item_prob":"0.2*(1+(my_intellect-enemy_intellect)/enemy_intellect)","elite_freq":"0.167*(1+(enemy_force-my_force)/my_force)","wave_count":"3*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('coincatch', '接金币', '{"drop_speed":"4*(1+(enemy_speed-my_speed)/my_speed)","trap_ratio":"0.2*(1+(enemy_intellect-my_intellect)/my_intellect)","move_inertia":"0.15*(1+(enemy_stamina-my_stamina)/my_stamina)","drop_count":"12*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('fruitslice', '切水果', '{"throw_freq":"3*(1+(enemy_speed-my_speed)/my_speed)","bomb_ratio":"0.15*(1+(enemy_intellect-my_intellect)/my_intellect)","combo_window":"0.8*(1+(my_speed-enemy_speed)/enemy_speed)","throw_rounds":"4*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}'),
    ('pianotiles', '钢琴块', '{"drop_speed":"4*(1+(enemy_speed-my_speed)/my_speed)","double_tap_prob":"0.1*(1+(enemy_intellect-my_intellect)/my_intellect)","hold_ratio":"0.2*(1+(enemy_stamina-my_stamina)/my_stamina)","pattern_length":"16*(1+0.5*(my_stamina-enemy_stamina)/enemy_stamina)"}')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_designs (
      character_id INT NOT NULL PRIMARY KEY,
      selected_webp_path VARCHAR(1024) DEFAULT NULL,
      visible_fields LONGTEXT,
      font_config LONGTEXT,
      layout_config LONGTEXT,
      effect_config LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_card_designs_character
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

async function createPool() {
  await ensureDatabase();
  const pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    charset: 'utf8mb4',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await initSchema(pool);
  return pool;
}

async function getDb() {
  if (!poolPromise) {
    poolPromise = createPool().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

async function query(sql, params = []) {
  const db = await getDb();
  const [rows] = await db.query(sql, params);
  return rows;
}

async function execute(sql, params = []) {
  const db = await getDb();
  const [result] = await db.execute(sql, params);
  return result;
}

async function closeDb() {
  if (!poolPromise) return;
  const db = await poolPromise;
  await db.end();
  poolPromise = null;
}

module.exports = {
  MYSQL_DATABASE,
  MYSQL_HOST,
  MYSQL_PASSWORD,
  MYSQL_PORT,
  MYSQL_USER,
  closeDb,
  execute,
  getDb,
  query,
};
