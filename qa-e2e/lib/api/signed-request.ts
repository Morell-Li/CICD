import type { APIRequestContext, APIResponse } from '@playwright/test';

import {
  buildApifoxAuthHeaders,
  buildQueryString,
} from './apifox-sign.ts';
import { getApiCredentials } from './auth.fixture.ts';

export type SignedGetOptions = {
  /** 简单键值对（插入顺序即 query 顺序） */
  params?: Record<string, string>;
  /** 显式顺序，优先级高于 params */
  queryEntries?: Array<[string, string]>;
};

export async function signedGet(
  request: APIRequestContext,
  path: string,
  options?: SignedGetOptions,
): Promise<APIResponse> {
  const creds = getApiCredentials();
  const queryString = options?.queryEntries
    ? buildQueryString(options.queryEntries)
    : options?.params
      ? buildQueryString(Object.entries(options.params))
      : '';

  const headers = buildApifoxAuthHeaders({
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    method: 'GET',
    queryString,
  });

  const url = queryString ? `${path}?${queryString}` : path;
  return request.get(url, { headers });
}

export async function signedPost(
  request: APIRequestContext,
  path: string,
  body?: unknown,
): Promise<APIResponse> {
  const creds = getApiCredentials();
  const bodyRaw = body === undefined ? '' : JSON.stringify(body);

  const headers = buildApifoxAuthHeaders({
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    method: 'POST',
    bodyRaw,
  });

  return request.post(path, { headers, data: body });
}

/** 公共行情接口，无需签名 */
export async function publicGet(
  request: APIRequestContext,
  path: string,
  options?: { params?: Record<string, string> },
): Promise<APIResponse> {
  return request.get(path, { params: options?.params });
}
