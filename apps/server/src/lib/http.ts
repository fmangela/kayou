import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from './errors.js';

export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, '请求参数不合法', error.flatten());
    }

    throw error;
  }
}

export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  try {
    return schema.parse(query);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(400, '查询参数不合法', error.flatten());
    }

    throw error;
  }
}

