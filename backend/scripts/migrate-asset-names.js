const fs = require('fs');
const path = require('path');
const { query, execute, closeDb } = require('../db/init');
const {
  buildWebpFilename,
  getCharacterAssetKey,
  getCharacterImageDir,
  getWebpRoot,
} = require('../services/assetPathService');

function replacePrefix(name, oldPrefix, newPrefix) {
  if (name === oldPrefix) return newPrefix;
  if (name.startsWith(`${oldPrefix}_`)) return `${newPrefix}${name.slice(oldPrefix.length)}`;
  if (name.startsWith(`${oldPrefix}-`)) return `${newPrefix}${name.slice(oldPrefix.length)}`;
  return `${newPrefix}_${name}`;
}

function ensureUniquePath(destPath) {
  if (!fs.existsSync(destPath)) return destPath;
  const ext = path.extname(destPath);
  const base = destPath.slice(0, -ext.length);
  let index = 1;
  while (fs.existsSync(`${base}_${index}${ext}`)) {
    index += 1;
  }
  return `${base}_${index}${ext}`;
}

function moveFileIfNeeded(sourcePath, targetPath) {
  if (sourcePath === targetPath) return targetPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const finalPath = ensureUniquePath(targetPath);
  fs.renameSync(sourcePath, finalPath);
  return finalPath;
}

async function migrate() {
  const rows = await query('SELECT id, pinyin, image_paths, webp_paths FROM characters ORDER BY id');
  const webpRoot = getWebpRoot();

  for (const row of rows) {
    const assetKey = getCharacterAssetKey(row);
    const oldPrefix = row.pinyin || String(row.id);
    const imagePaths = JSON.parse(row.image_paths || '[]');
    const webpPaths = JSON.parse(row.webp_paths || '[]');

    const migratedImages = [];
    for (const relPath of imagePaths) {
      const absPath = path.join(__dirname, '..', relPath);
      if (!fs.existsSync(absPath)) {
        migratedImages.push(relPath);
        continue;
      }

      const filename = path.basename(absPath);
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const nextBase = base.startsWith(assetKey) ? base : replacePrefix(base, oldPrefix, assetKey);
      const targetDir = getCharacterImageDir(row);
      const targetPath = path.join(targetDir, `${nextBase}${ext}`);
      const finalPath = moveFileIfNeeded(absPath, targetPath);
      migratedImages.push(`/assets/image/${assetKey}/${path.basename(finalPath)}`);
    }

    const migratedWebp = [];
    for (let i = 0; i < webpPaths.length; i++) {
      const relPath = webpPaths[i];
      const absPath = path.join(__dirname, '..', relPath);
      if (!fs.existsSync(absPath)) {
        migratedWebp.push(relPath);
        continue;
      }

      const suffix = webpPaths.length > 1 ? `-${i + 1}` : '';
      const targetFilename = buildWebpFilename(row, suffix);
      const targetPath = path.join(webpRoot, targetFilename);
      const finalPath = moveFileIfNeeded(absPath, targetPath);
      migratedWebp.push(`/assets/webp/${path.basename(finalPath)}`);
    }

    await execute('UPDATE characters SET image_paths = ?, webp_paths = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      JSON.stringify(migratedImages),
      JSON.stringify(migratedWebp),
      row.id,
    ]);
  }

  console.log(JSON.stringify({ migratedCharacters: rows.length }));
  await closeDb();
}

migrate().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
