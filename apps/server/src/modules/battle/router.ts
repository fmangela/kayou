import { Router } from 'express';
import { requireRole, type AuthedRequest } from '../../lib/auth.js';
import { asyncHandler, parseBody } from '../../lib/http.js';
import { battlePreviewSchema, previewBattleSkillRound } from './service.js';
import {
  playTowerBattleTurn,
  startTowerBattle,
  towerBattleTurnSchema,
} from './tower-service.js';

export const battleRouter = Router();

battleRouter.post(
  '/tower/start',
  requireRole('player'),
  asyncHandler(async (request, response) => {
    const result = await startTowerBattle((request as AuthedRequest).auth!.sub);

    response.status(201).json({
      ok: true,
      data: result,
      message: '测试战斗已开始',
    });
  }),
);

battleRouter.post(
  '/tower/turn',
  requireRole('player'),
  asyncHandler(async (request, response) => {
    const payload = parseBody(towerBattleTurnSchema, request.body);
    const result = await playTowerBattleTurn(
      (request as AuthedRequest).auth!.sub,
      payload,
    );

    response.json({
      ok: true,
      data: result,
      message: '本阶段小游戏结算完成',
    });
  }),
);

battleRouter.post(
  '/preview',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const payload = parseBody(battlePreviewSchema, request.body);
    const result = await previewBattleSkillRound(payload);

    response.json({
      ok: true,
      data: result,
      message: '技能引擎预演完成',
    });
  }),
);
