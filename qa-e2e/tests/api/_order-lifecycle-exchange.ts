/**
 * order-lifecycle 串行套件共享：带打印/落盘的 signed 请求封装。
 */
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { expect } from '@zmx/qa-kit/runners/web';
import { signedGet, signedPost } from '@qa-e2e/api/signed-request';
import { API_BASE_URL } from './_api-env.ts';
import {
  readResponseJson,
  recordApiExchange,
  type ApiExchangeRecord,
} from './_api-exchange-log.ts';

export type RetEnvelope = { retCode?: number; retMsg?: string; result?: unknown };

export function queryEntriesToRecord(entries: Array<[string, string]>): Record<string, string> {
  return Object.fromEntries(entries);
}

export function attachExchange(testInfo: TestInfo, record: ApiExchangeRecord): void {
  testInfo.attach(`exchange-${record.step}.json`, {
    body: JSON.stringify(record, null, 2),
    contentType: 'application/json',
  });
}

export async function expectRetCodeOk(body: RetEnvelope, ctx: string): Promise<RetEnvelope> {
  expect(body.retCode, `${ctx} 期望 retCode === 0，retMsg=${body.retMsg}`).toBe(0);
  return body;
}

/** set-tpsl-mode 已为 Full 时 testnet 返回 10001 + same tp sl mode*，视为幂等成功 */
export function isIdempotentSetTpslMode(body: RetEnvelope): boolean {
  if (body.retCode === 0) return true;
  const msg = (body.retMsg ?? '').toLowerCase();
  return body.retCode === 10001 && msg.includes('same tp sl mode');
}

export async function expectRetCodeOkOrIdempotentSetTpslMode(
  body: RetEnvelope,
  ctx: string,
): Promise<RetEnvelope> {
  if (isIdempotentSetTpslMode(body)) return body;
  return expectRetCodeOk(body, ctx);
}

export async function exchangePost(
  testInfo: TestInfo,
  step: string,
  request: APIRequestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<{ res: APIResponse; body: RetEnvelope }> {
  const res = await signedPost(request, path, body);
  const json = (await readResponseJson(res)) as RetEnvelope;
  const record: ApiExchangeRecord = {
    step,
    at: new Date().toISOString(),
    method: 'POST',
    path,
    url: `${API_BASE_URL}${path}`,
    request: { body },
    response: { status: res.status(), body: json },
  };
  recordApiExchange(record);
  attachExchange(testInfo, record);
  await expect(res).toBeOK();
  return { res, body: json };
}

/** 轮询用：不发日志/附件，由调用方在条件满足后调用 publishExchange */
export async function signedGetJson(
  request: APIRequestContext,
  path: string,
  queryEntries: Array<[string, string]>,
): Promise<{ res: APIResponse; body: RetEnvelope }> {
  const res = await signedGet(request, path, { queryEntries });
  const json = (await readResponseJson(res)) as RetEnvelope;
  await expect(res).toBeOK();
  return { res, body: json };
}

export function buildGetExchangeRecord(
  step: string,
  path: string,
  queryEntries: Array<[string, string]>,
  res: APIResponse,
  body: RetEnvelope,
  extra?: Pick<ApiExchangeRecord, 'pollAttempts'>,
): ApiExchangeRecord {
  const query = queryEntriesToRecord(queryEntries);
  return {
    step,
    at: new Date().toISOString(),
    method: 'GET',
    path,
    url: `${API_BASE_URL}${path}?${new URLSearchParams(query).toString()}`,
    request: { query },
    response: { status: res.status(), body },
    ...extra,
  };
}

export function publishExchange(testInfo: TestInfo, record: ApiExchangeRecord): void {
  recordApiExchange(record);
  attachExchange(testInfo, record);
}

export async function exchangeGet(
  testInfo: TestInfo,
  step: string,
  request: APIRequestContext,
  path: string,
  queryEntries: Array<[string, string]>,
): Promise<{ res: APIResponse; body: RetEnvelope }> {
  const res = await signedGet(request, path, { queryEntries });
  const json = (await readResponseJson(res)) as RetEnvelope;
  const query = queryEntriesToRecord(queryEntries);
  const record: ApiExchangeRecord = {
    step,
    at: new Date().toISOString(),
    method: 'GET',
    path,
    url: `${API_BASE_URL}${path}?${new URLSearchParams(query).toString()}`,
    request: { query },
    response: { status: res.status(), body: json },
  };
  recordApiExchange(record);
  attachExchange(testInfo, record);
  await expect(res).toBeOK();
  return { res, body: json };
}
