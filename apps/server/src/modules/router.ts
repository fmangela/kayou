import { Router } from 'express';
import { checkDatabaseConnection } from '../lib/database.js';
import { adminRouter } from './admin/router.js';
import { battleRouter } from './battle/router.js';
import { playerRouter } from './player/router.js';

export const apiRouter = Router();

const appPorts = {
  game: 5173,
  admin: 5174,
  server: 3000,
} as const;

const bootstrapPayload = {
  gameName: 'Kayou',
  preferredViewport: 'mobile-first',
  coreModules: ['login', 'home', 'deck', 'tower', 'admin-console'],
};

apiRouter.get('/health', async (_request, response) => {
  const database = await checkDatabaseConnection();

  response.json({
    ok: true,
    timestamp: new Date().toISOString(),
    database,
  });
});

apiRouter.get('/bootstrap', (_request, response) => {
  response.json({
    ok: true,
    apps: appPorts,
    payload: bootstrapPayload,
  });
});

apiRouter.use('/player', playerRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/battle', battleRouter);
