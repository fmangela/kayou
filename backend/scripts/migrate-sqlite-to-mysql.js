const path = require('path');
const Database = require('better-sqlite3');
const { getDb, MYSQL_DATABASE, closeDb } = require('../db/init');

const SQLITE_PATH = path.join(__dirname, '../db/kayou.sqlite');

async function migrate() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const mysql = await getDb();
  const connection = await mysql.getConnection();

  try {
    const characters = sqlite.prepare('SELECT * FROM characters ORDER BY id ASC').all();
    const settings = sqlite.prepare('SELECT key, value FROM settings ORDER BY key ASC').all();

    await connection.beginTransaction();

    for (const row of settings) {
      await connection.execute(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [row.key, row.value]
      );
    }

    for (const row of characters) {
      await connection.execute(
        `INSERT INTO characters
          (id, name, pinyin, background, appearance, nb2_prompt, mj_prompt, image_paths, webp_paths, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          pinyin = VALUES(pinyin),
          background = VALUES(background),
          appearance = VALUES(appearance),
          nb2_prompt = VALUES(nb2_prompt),
          mj_prompt = VALUES(mj_prompt),
          image_paths = VALUES(image_paths),
          webp_paths = VALUES(webp_paths),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)`,
        [
          row.id,
          row.name,
          row.pinyin,
          row.background,
          row.appearance,
          row.nb2_prompt,
          row.mj_prompt,
          row.image_paths || '[]',
          row.webp_paths || '[]',
          row.created_at,
          row.updated_at,
        ]
      );
    }

    const nextId = characters.length ? Math.max(...characters.map(row => row.id)) + 1 : 1;
    await connection.query(`ALTER TABLE characters AUTO_INCREMENT = ${nextId}`);

    await connection.commit();

    console.log(
      JSON.stringify({
        database: MYSQL_DATABASE,
        migratedSettings: settings.length,
        migratedCharacters: characters.length,
      })
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    sqlite.close();
    await closeDb();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
