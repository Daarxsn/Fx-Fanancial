import { existsSync } from "node:fs";

/**
 * Load local-only environment files for standalone CLI scripts.
 * Variables already provided by the execution environment are never overwritten.
 * 
 */
export function loadProjectEnv(): void {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;

    try {
      process.loadEnvFile(file);
    } catch {
      throw new Error(`Unable to load ${file}; validate its syntax locally without sharing its contents.`);
    }
  }
}
