import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_URL: z.string().url().default('http://localhost:5174'),
  APP_SECRET: z.string().min(12).default('kayou-local-secret'),
  MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().min(1).default('kayou'),
  MYSQL_USER: z.string().min(1).default('kayou'),
  MYSQL_PASSWORD: z.string().default('kayou'),
});

export const env = envSchema.parse(process.env);
