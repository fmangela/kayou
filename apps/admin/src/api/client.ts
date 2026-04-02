import type { ApiEnvelope, ApiErrorEnvelope } from '@kayou/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiRequestError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & {
    token?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let requestBody: BodyInit | null | undefined;
  const rawBody = options.body;

  if (
    rawBody &&
    typeof rawBody === 'object' &&
    !(rawBody instanceof FormData) &&
    !(rawBody instanceof URLSearchParams) &&
    !(rawBody instanceof Blob)
  ) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(rawBody);
  } else {
    requestBody = rawBody as BodyInit | null | undefined;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body: requestBody,
    });
  } catch (error) {
    throw new ApiRequestError(
      '无法连接后端服务，请确认开发环境已启动，或检查 Vite 代理与 3000 端口状态',
      0,
      error,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiErrorEnvelope
    | null;

  if (!response.ok || !payload || !payload.ok) {
    throw new ApiRequestError(
      payload && 'message' in payload ? payload.message ?? '后台请求失败' : '后台请求失败',
      response.status || 500,
      payload && 'details' in payload ? payload.details : undefined,
    );
  }

  return payload.data;
}
