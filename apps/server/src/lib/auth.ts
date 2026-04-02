import { createHmac } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

export type AuthRole = 'player' | 'admin';

export interface AuthTokenPayload {
  sub: number;
  role: AuthRole;
  username?: string;
  account?: string;
  adminRole?: 'super_admin' | 'ops_admin' | 'data_admin';
  exp: number;
}

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
}

const tokenPayloadSchema = z.object({
  sub: z.number().int().positive(),
  role: z.enum(['player', 'admin']),
  username: z.string().optional(),
  account: z.string().optional(),
  adminRole: z.enum(['super_admin', 'ops_admin', 'data_admin']).optional(),
  exp: z.number().int().positive(),
});

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createSignature(header: string, payload: string): string {
  return createHmac('sha256', env.APP_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
}

export function signToken(
  payload: Omit<AuthTokenPayload, 'exp'>,
  expiresInSeconds = 60 * 60 * 12,
): {
  token: string;
  expiresAt: string;
} {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const headerSegment = encodeSegment({
    alg: 'HS256',
    typ: 'JWT',
  });
  const payloadSegment = encodeSegment({
    ...payload,
    exp,
  });
  const signature = createSignature(headerSegment, payloadSegment);

  return {
    token: `${headerSegment}.${payloadSegment}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyToken(token: string): AuthTokenPayload {
  const [headerSegment, payloadSegment, signature] = token.split('.');

  if (!headerSegment || !payloadSegment || !signature) {
    throw new ApiError(401, '登录状态无效，请重新登录');
  }

  const expectedSignature = createSignature(headerSegment, payloadSegment);

  if (signature !== expectedSignature) {
    throw new ApiError(401, '登录状态校验失败，请重新登录');
  }

  const rawPayload = Buffer.from(payloadSegment, 'base64url').toString('utf8');
  const payload = tokenPayloadSchema.parse(JSON.parse(rawPayload));

  if (payload.exp * 1000 <= Date.now()) {
    throw new ApiError(401, '登录状态已过期，请重新登录');
  }

  return payload;
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    throw new ApiError(401, '缺少登录令牌');
  }

  return authorization.slice('Bearer '.length);
}

export function requireRole(role: AuthRole) {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const token = readBearerToken(request);
      const payload = verifyToken(token);

      if (payload.role !== role) {
        throw new ApiError(403, '当前账号无权访问该接口');
      }

      (request as AuthedRequest).auth = payload;
      next();
    } catch (error) {
      next(error);
    }
  };
}

