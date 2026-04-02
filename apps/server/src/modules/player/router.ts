import { Router } from 'express';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { requireRole, type AuthedRequest } from '../../lib/auth.js';
import {
  buildPlayerBootstrap,
  loginPlayer,
  playerCredentialsSchema,
  registerPlayer,
  saveDeck,
  saveDeckSchema,
} from './service.js';

export const playerRouter = Router();

playerRouter.post(
  '/auth/register',
  asyncHandler(async (request, response) => {
    const payload = parseBody(playerCredentialsSchema, request.body);
    const result = await registerPlayer(payload);

    response.status(201).json({
      ok: true,
      data: result,
      message: '注册成功，欢迎来到 Kayou',
    });
  }),
);

playerRouter.post(
  '/auth/login',
  asyncHandler(async (request, response) => {
    const payload = parseBody(playerCredentialsSchema, request.body);
    const result = await loginPlayer(payload);

    response.json({
      ok: true,
      data: result,
      message: '登录成功',
    });
  }),
);

playerRouter.get(
  '/bootstrap',
  requireRole('player'),
  asyncHandler(async (request, response) => {
    const bootstrap = await buildPlayerBootstrap((request as AuthedRequest).auth!.sub);

    response.json({
      ok: true,
      data: bootstrap,
    });
  }),
);

playerRouter.put(
  '/deck',
  requireRole('player'),
  asyncHandler(async (request, response) => {
    const payload = parseBody(saveDeckSchema, request.body);
    const bootstrap = await saveDeck((request as AuthedRequest).auth!.sub, payload);

    response.json({
      ok: true,
      data: bootstrap,
      message: '出战卡组已保存',
    });
  }),
);

