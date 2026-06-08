import { resolveApiBaseUrl as resolveApiBaseUrlFromEnv } from '../env/resolve-env.ts';
import { buildZoomexV3Headers } from './zoomex-sign.ts';

export { getQaEnv, getRunOnLabel, resolveBaseUrl } from '../env/resolve-env.ts';

export function resolveApiBaseUrl(): string {
  return resolveApiBaseUrlFromEnv();
}

export type ApiCredentials = {
  apiKey: string;
  apiSecret: string;
};

function readSecret(): string | undefined {
  return (
    process.env['QA_API_SECRET']?.trim() ||
    process.env['QA_API_SECRET_KEY']?.trim() ||
    process.env['secretKey']?.trim()
  );
}

export function getApiCredentials(): ApiCredentials {
  const apiKey = process.env['QA_API_KEY']?.trim() || process.env['api_key']?.trim();
  const apiSecret = readSecret();
  if (!apiKey || !apiSecret) {
    throw new Error(
      '[qa-api] 缺少 QA_API_KEY / QA_API_SECRET（或 QA_API_SECRET_KEY），请在 env/.env.<QA_ENV> 配置',
    );
  }
  return { apiKey, apiSecret };
}

/** Bearer 或 Zoomex api_key + secret */
export function hasApiAuth(): boolean {
  if (process.env['QA_API_TOKEN']?.trim()) return true;
  const apiKey = process.env['QA_API_KEY']?.trim() || process.env['api_key']?.trim();
  return Boolean(apiKey && readSecret());
}

/** 仅 Bearer；Zoomex 私有接口请用 signedGet / signedPost（签名与 path/body 绑定） */
export function buildApiAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const bearer = process.env['QA_API_TOKEN']?.trim();
  if (bearer) {
    headers.Authorization = bearer.startsWith('Bearer ')
      ? bearer
      : `Bearer ${bearer}`;
  }

  return headers;
}
