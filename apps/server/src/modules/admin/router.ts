import { Router } from 'express';
import { z } from 'zod';
import { requireRole, type AuthedRequest } from '../../lib/auth.js';
import { asyncHandler, parseBody, parseQuery } from '../../lib/http.js';
import {
  adminCardImportSchema,
  adminCardSaveSchema,
  adminConfigUpdateSchema,
  adminLoginSchema,
  adminPlayersQuerySchema,
  buildAdminBootstrap,
  convertCardImages,
  createCard,
  importCardsFromCsv,
  listPlayers,
  loginAdmin,
  updateCard,
  updateConfig,
} from './service.js';

export const adminRouter = Router();

adminRouter.post(
  '/auth/login',
  asyncHandler(async (request, response) => {
    const payload = parseBody(adminLoginSchema, request.body);
    const result = await loginAdmin(payload);

    response.json({
      ok: true,
      data: result,
      message: '管理员登录成功',
    });
  }),
);

adminRouter.get(
  '/bootstrap',
  requireRole('admin'),
  asyncHandler(async (_request, response) => {
    const bootstrap = await buildAdminBootstrap();

    response.json({
      ok: true,
      data: bootstrap,
    });
  }),
);

adminRouter.get(
  '/players',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const query = parseQuery(adminPlayersQuerySchema, request.query);
    const players = await listPlayers(query.keyword);

    response.json({
      ok: true,
      data: players,
    });
  }),
);

adminRouter.put(
  '/configs/:key',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const params = z.object({
      key: z.string().trim().min(1).max(64),
    }).parse(request.params);
    const payload = parseBody(adminConfigUpdateSchema, request.body);
    const configs = await updateConfig({
      key: params.key,
      value: payload.value,
      description: payload.description,
      adminId: (request as AuthedRequest).auth!.sub,
    });

    response.json({
      ok: true,
      data: configs,
      message: '基础配置已更新',
    });
  }),
);

adminRouter.post(
  '/cards',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const payload = parseBody(adminCardSaveSchema, request.body);
    const cards = await createCard(payload, (request as AuthedRequest).auth!.sub);

    response.status(201).json({
      ok: true,
      data: cards,
      message: '卡牌框架已创建',
    });
  }),
);

adminRouter.post(
  '/cards/import',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const payload = parseBody(adminCardImportSchema, request.body);
    const result = await importCardsFromCsv(
      payload,
      (request as AuthedRequest).auth!.sub,
    );

    response.json({
      ok: true,
      data: result,
      message: '卡牌 CSV 批量导入已执行',
    });
  }),
);

adminRouter.put(
  '/cards/:cardId',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const params = z.object({
      cardId: z.coerce.number().int().positive(),
    }).parse(request.params);
    const payload = parseBody(adminCardSaveSchema, request.body);
    const cards = await updateCard(
      params.cardId,
      payload,
      (request as AuthedRequest).auth!.sub,
    );

    response.json({
      ok: true,
      data: cards,
      message: '卡牌配置已更新',
    });
  }),
);

adminRouter.post(
  '/assets/card-images/convert',
  requireRole('admin'),
  asyncHandler(async (request, response) => {
    const report = await convertCardImages((request as AuthedRequest).auth!.sub);

    response.json({
      ok: true,
      data: report,
      message: '卡牌图片批量转换已执行',
    });
  }),
);
