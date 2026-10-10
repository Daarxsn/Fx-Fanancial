import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAXMEM = 64 * 1024 * 1024;

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128) return "Use no more than 128 characters.";
  if (password.trim().length === 0) return "Password cannot be blank.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const policyError = validatePasswordPolicy(password);
  if (policyError) throw new Error("Password does not meet the password policy");
  const salt = randomBytes(16);
  const key = (await deriveKey(password, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAXMEM,
  })) as Buffer;
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (!encoded || password.length > 128) {
    await burnPasswordCheck(password.slice(0, 128));
    return false;
  }
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    await burnPasswordCheck(password.slice(0, 128));
    return false;
  }
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (
    !Number.isInteger(n) || n < 16384 || n > 65536 || (n & (n - 1)) !== 0 ||
    !Number.isInteger(r) || r !== 8 ||
    !Number.isInteger(p) || p !== 1 ||
    salt.length !== 16 || expected.length !== KEY_LENGTH
  ) {
    await burnPasswordCheck(password.slice(0, 128));
    return false;
  }
  try {
    const actual = (await deriveKey(password, salt, expected.length, {
      N: n, r, p, maxmem: MAXMEM,
    })) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function burnPasswordCheck(value: string): Promise<void> {
  const salt = Buffer.from("FxAuthDummySalt01");
  await deriveKey(value, salt, KEY_LENGTH, {
    N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAXMEM,
  });
}
