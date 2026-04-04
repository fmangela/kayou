const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'kayou.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      pinyin TEXT,
      background TEXT,
      appearance TEXT,
      nb2_prompt TEXT,
      mj_prompt TEXT,
      image_paths TEXT DEFAULT '[]',
      webp_paths TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

module.exports = { getDb };
