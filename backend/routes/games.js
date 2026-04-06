const express = require('express');
const { query, execute } = require('../db/init');

const router = express.Router();

// List all games
router.get('/', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM games ORDER BY id ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Get game config
router.get('/:id', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: '未找到' });
    const game = rows[0];
    if (game.formula_config) game.formula_config = JSON.parse(game.formula_config);
    res.json(game);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Save game config (upsert by game_key)
router.put('/:id', async (req, res) => {
  try {
    const { formula_config } = req.body;
    await execute(
      'UPDATE games SET formula_config = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(formula_config || {}), req.params.id]
    );
    const rows = await query('SELECT * FROM games WHERE id = ?', [req.params.id]);
    const game = rows[0];
    if (game.formula_config) game.formula_config = JSON.parse(game.formula_config);
    res.json(game);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
