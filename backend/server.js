const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { SECRET } = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: '未登录' });
  try {
    jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token无效或已过期' });
  }
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/characters', authMiddleware, require('./routes/characters'));
app.use('/api/llm', authMiddleware, require('./routes/llm'));
app.use('/api/drawing', authMiddleware, require('./routes/drawing'));
app.use('/api/images', authMiddleware, require('./routes/images'));

const PORT = 3174;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
