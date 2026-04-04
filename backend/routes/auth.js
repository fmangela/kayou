const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const SECRET = 'kayou_secret_2026';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'kayouadmin';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ username }, SECRET, { expiresIn: '24h' });
    return res.json({ token });
  }
  res.status(401).json({ message: '用户名或密码错误' });
});

module.exports = router;
module.exports.SECRET = SECRET;
