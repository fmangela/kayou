import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HASH_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, HASH_BYTES).toString('hex');

  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, storedHash] = hashedPassword.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const derivedKey = scryptSync(password, salt, HASH_BYTES);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
}

