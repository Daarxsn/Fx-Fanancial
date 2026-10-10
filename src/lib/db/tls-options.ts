import { readFileSync } from "node:fs";

/**
 * MySQL TLS options with server-certificate verification enabled.
 * DATABASE_SSL_CA_PATH is useful for local PEM files; DATABASE_SSL_CA is
 * intended for deployment secret managers that provide the PEM as an env value.
 */
export function verifiedMysqlTlsOptions() {
  const caPath = process.env.DATABASE_SSL_CA_PATH?.trim();
  const caPem = process.env.DATABASE_SSL_CA?.trim();

  if (caPath && caPem) {
    throw new Error("Set only one of DATABASE_SSL_CA_PATH or DATABASE_SSL_CA");
  }

  if (caPath) {
    return {
      rejectUnauthorized: true,
      ca: readFileSync(caPath, "utf8"),
    };
  }

  if (caPem) {
    return {
      rejectUnauthorized: true,
      ca: caPem,
    };
  }

  return { rejectUnauthorized: true };
}
