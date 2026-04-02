import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from 'mysql2/promise';
import { env } from '../config/env.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      connectionLimit: 10,
      waitForConnections: true,
      namedPlaceholders: true,
    });
  }

  return pool;
}

export async function withTransaction<T>(
  runner: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await runner(connection);
    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export type QueryRow = RowDataPacket;
export type QueryResult = ResultSetHeader;

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  message: string;
}> {
  try {
    const connection = await getPool().getConnection();
    await connection.ping();
    connection.release();

    return {
      connected: true,
      message: 'MySQL connection ready',
    };
  } catch (error) {
    return {
      connected: false,
      message:
        error instanceof Error ? error.message : 'Unknown database connection error',
    };
  }
}
