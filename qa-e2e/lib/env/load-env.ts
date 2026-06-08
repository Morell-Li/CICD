import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { QaTargetEnv } from './resolve-env.ts';

/** 不覆盖已存在的环境变量（先加载的优先）。 */
function applyEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function projectRootFromConfig(): string {
  const configDir = dirname(fileURLToPath(import.meta.url));
  return resolve(configDir, '..', '..', '..');
}

/**
 * 加载顺序（后者仅在 key 未设置时生效）：
 * 1. 项目根 `.env`（QA_ENV、账号等）
 * 2. `env/.env.<QA_ENV>`（Test3 / Testnet / Prd 的 URL、Token）
 * 3. `qa-e2e/.env`（可选本地覆盖）
 */
export function loadProjectEnvFiles(options?: { rootDir?: string }): QaTargetEnv | undefined {
  const root = options?.rootDir ?? projectRootFromConfig();
  const qaE2eDir = resolve(root, 'qa-e2e');

  applyEnvFile(resolve(root, '.env'));

  const qaEnv = process.env['QA_ENV']?.trim().toLowerCase();
  if (qaEnv) {
    applyEnvFile(resolve(root, 'env', `.env.${qaEnv}`));
  }

  applyEnvFile(resolve(qaE2eDir, '.env'));

  return qaEnv === 'test3' || qaEnv === 'testnet' || qaEnv === 'prd'
    ? qaEnv
    : undefined;
}
