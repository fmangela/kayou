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
    ('archery', '射箭', '{"swing_speed":"1*(1-2*(my_speed-enemy_speed)/(my_speed+enemy_speed))","time_limit":"5*(1+(my_force-enemy_force)/enemy_force)"}')
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
