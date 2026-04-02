export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getErrorPayload(error: unknown): {
  statusCode: number;
  message: string;
  details?: unknown;
} {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
    };
  }

  return {
    statusCode: 500,
    message: error instanceof Error ? error.message : 'Unexpected server error',
  };
}

