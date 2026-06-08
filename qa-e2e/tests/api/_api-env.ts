import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { APIRequestContext } from '@playwright/test';
import { getRunOnLabel, resolveApiBaseUrl } from '@qa-e2e/env';
import { loadProjectEnvFiles } from '@qa-e2e/env/load-env';
import { hasApiAuth } from '@qa-e2e/api';
import { publicGet } from '@qa-e2e/api/signed-request';

/** 项目根目录（基于本文件位置，绕开 cwd / worker 加载链不一致） */
function specProjectRoot(): string {
  // _api-env.ts 在 qa-e2e/tests/api/，向上三层即项目根
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

// Module-init：spec 加载就保证 env 文件已读，绕开 worker 进程未继承 / config 加载顺序问题。
// 这是 idempotent（applyEnvFile 不覆盖已有 key），多 spec 多 worker 重复调用安全。
loadProjectEnvFiles({ rootDir: specProjectRoot() });

/**
 * Spec 应在 module 顶层 `test.use({ baseURL: API_BASE_URL })` 中使用此常量，
 * 强制覆盖 worker 中可能为空的 use.baseURL（playwright.config.ts 的 apiBaseURL
 * 在 worker 进程未必能正确解析；此处以 spec-side 为准）。
 */
export const API_BASE_URL = resolveApiBaseUrl();

/** Zoomex OpenAPI V3 公共时间接口（无需签名） */
export const OPENAPI_TIME_PATH = '/cloud/trade/v3/market/time';

/**
 * 只 cache 成功结果；失败不缓存以便后续重试（避免一次 flake 传染整个 worker）。
 */
let cachedLive: true | undefined;

/** 探测 OpenAPI 网关是否可达（`retCode === 0`）。失败时输出诊断到 console。 */
export async function isOpenApiLive(request: APIRequestContext): Promise<boolean> {
  if (cachedLive === true) return true;
  let status = 0;
  let bodyHead = '';
  let errMsg = '';
  try {
    const res = await publicGet(request, OPENAPI_TIME_PATH);
    status = res.status();
    if (!res.ok()) {
      bodyHead = (await res.text()).slice(0, 200);
    } else {
      const body = (await res.json()) as { retCode?: number };
      if (body.retCode === 0) {
        cachedLive = true;
        return true;
      }
      bodyHead = JSON.stringify(body).slice(0, 200);
    }
  } catch (err) {
    errMsg = (err as Error).message;
  }
  // eslint-disable-next-line no-console
  console.error(
    `[qa-api] isOpenApiLive=false 诊断:\n` +
      `  请求路径: ${OPENAPI_TIME_PATH} (相对 baseURL)\n` +
      `  status: ${status || '(no response)'}\n` +
      (errMsg ? `  error: ${errMsg}\n` : '') +
      (bodyHead ? `  body[0..200]: ${bodyHead}\n` : '') +
      `  期望 baseURL = https://openapi-testnet.zoomex.com（QA_ENV=testnet）。\n` +
      `  若 baseURL 错（如指向 https://testnet.zoomex.com web 站），说明 playwright config 的\n` +
      `  apiBaseURL 在 worker 加载时未拿到 QA_ENV；最稳跑法：\n` +
      `    QA_ENV=testnet pnpm exec playwright test --config=qa-e2e/playwright.config.ts --project=api --grep order-v3`,
  );
  return false;
}

export function apiCaseAnnotations(caseRef: string): Array<{ type: string; description: string }> {
  return [
    { type: 'jira', description: 'null' },
    { type: 'productVersion', description: '3.0' },
    { type: 'runOn', description: getRunOnLabel() },
    { type: 'dataCleaner', description: 'inherit' },
    { type: 'tags', description: '@feature-deposit-withdraw-optimize-3,@api' },
    { type: 'caseRef', description: caseRef },
  ];
}

/**
 * 要求当前进程具备 signed API 凭据，否则 throw（让整个 describe red-fail）。
 *
 * 用于"必须签名才能跑"的回归 spec：
 * - 凭据缺失 = 配置错误，应红出来让人看见，不能被 TUI 静默 skip 吞掉。
 * - 网络抖动 / OpenAPI 网关临时不可达不在此处理（仍由 isOpenApiLive 触发 skip）。
 *
 * 兜底：在 throw 之前主动 reload 一次 `.env` + `env/.env.<QA_ENV>`，
 * 处理 playwright worker 进程没继承 / 顺序加载导致变量缺失的情况。
 *
 * 调用位置建议放在 `test.beforeAll(...)` —— 比 module-top throw 更友好（不会破坏
 * `playwright test --list` / verify loop）。
 */
export function requireSignedApiAuth(specName: string): void {
  if (hasApiAuth()) return;

  // 兜底：worker 进程可能没走 playwright.config.ts 的 loadProjectEnvFiles，
  // 或顺序加载导致 QA_ENV 注入晚于 env-file 解析；此处主动再 reload 一次。
  const root = specProjectRoot();
  loadProjectEnvFiles({ rootDir: root });
  if (hasApiAuth()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[qa-api] ${specName} 凭据通过 spec-fallback 加载（playwright.config.ts 的 loadProjectEnvFiles 未生效）；建议检查 worker 启动顺序。`,
    );
    return;
  }

  // 真没有 → 输出详细诊断 + throw
  const qaEnv = process.env['QA_ENV']?.trim().toLowerCase() ?? '(unset)';
  const rootEnv = resolve(root, '.env');
  const perEnv = qaEnv !== '(unset)' ? resolve(root, 'env', `.env.${qaEnv}`) : null;
  const apiKeyHint = process.env['QA_API_KEY']?.trim() || process.env['api_key']?.trim();

  throw new Error(
    `[qa-api] ${specName} 缺少 QA_API_KEY / QA_API_SECRET（QA_ENV=${qaEnv}）。\n` +
      `\n诊断:\n` +
      `  rootDir = ${root}\n` +
      `  .env (${existsSync(rootEnv) ? '✓存在' : '✗缺失'}): ${rootEnv}\n` +
      (perEnv
        ? `  env/.env.${qaEnv} (${existsSync(perEnv) ? '✓存在' : '✗缺失'}): ${perEnv}\n`
        : '  env/.env.<QA_ENV>: QA_ENV 未设置，跳过\n') +
      `  process.env.QA_API_KEY = ${apiKeyHint ? `${apiKeyHint.slice(0, 4)}***` : '(missing)'}\n` +
      `\n本 spec 是 signed API 回归，凭据是必需配置而非可选环境。\n` +
      `修复：在 env/.env.<QA_ENV> 写入 QA_API_KEY 和 QA_API_SECRET，或：\n` +
      `  pnpm test:api:testnet -- --grep ${specName}\n` +
      `  QA_ENV=testnet qa-kit test run --preset web-e2e -- --project=api --grep ${specName}`,
  );
}
