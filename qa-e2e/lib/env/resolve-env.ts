/** 目标运行环境（与 `env/.env.<name>` 文件名一致）。 */
export type QaTargetEnv = 'test3' | 'testnet' | 'prd';

/** Web 站点（E2E 页面） */
const DEFAULT_BASE_URL: Record<QaTargetEnv, string> = {
  test3: 'https://test3.zoomex.com',
  testnet: 'https://testnet.zoomex.com',
  prd: 'https://www.zoomex.com',
};

/** Zoomex OpenAPI V3 REST 根地址（与 Web 域名不同） */
const DEFAULT_API_BASE_URL: Record<QaTargetEnv, string> = {
  test3: 'http://ls-trade-openapi-ls-test-1.test.efficiency.ww5sawfyut0k.bitsvc.io',
  testnet: 'https://openapi-testnet.zoomex.com',
  prd: 'https://openapi.zoomex.com',
};

export function getQaEnv(): QaTargetEnv {
  const raw = (process.env['QA_ENV'] ?? 'testnet').trim().toLowerCase();
  if (raw === 'test3' || raw === 'testnet' || raw === 'prd') return raw;
  throw new Error(
    `[qa-env] Invalid QA_ENV="${process.env['QA_ENV']}"; use test3 | testnet | prd`,
  );
}

/** annotation `runOn` 与报告展示用。 */
export function getRunOnLabel(): string {
  return getQaEnv();
}

function legacyStagingUrl(): string | undefined {
  return process.env['QA_BASE_URL_STAGING']?.trim() || undefined;
}

/** Web E2E / 页面 baseURL。 */
export function resolveBaseUrl(): string {
  const direct = process.env['QA_BASE_URL']?.trim();
  if (direct) return direct;

  const env = getQaEnv();
  const perEnv = process.env[`QA_BASE_URL_${env.toUpperCase()}`]?.trim();
  if (perEnv) return perEnv;

  if (env === 'testnet') {
    const legacy = legacyStagingUrl();
    if (legacy) return legacy;
  }

  return DEFAULT_BASE_URL[env];
}

function legacyApiUrl(): string | undefined {
  return process.env['QA_API_BASE_URL_STAGING']?.trim() || undefined;
}

/** OpenAPI / Playwright api project 的 REST 根地址。 */
export function resolveApiBaseUrl(): string {
  const direct = process.env['QA_API_BASE_URL']?.trim();
  if (direct) return direct;

  const env = getQaEnv();
  const perEnv = process.env[`QA_API_BASE_URL_${env.toUpperCase()}`]?.trim();
  if (perEnv) return perEnv;

  if (env === 'testnet') {
    const legacy = legacyApiUrl();
    if (legacy) return legacy;
  }

  return DEFAULT_API_BASE_URL[env];
}

/** k6 压测目标（可与 Web 不同，一般在 env 文件里单独配置）。 */
export function resolveK6TargetUrl(): string {
  const direct = process.env['QA_K6_TARGET_URL']?.trim();
  if (direct) return direct;

  const env = getQaEnv();
  const perEnv = process.env[`QA_K6_TARGET_URL_${env.toUpperCase()}`]?.trim();
  if (perEnv) return perEnv;

  return resolveApiBaseUrl();
}
