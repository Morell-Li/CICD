/**
 * Apifox 前置脚本等价实现（与 APIFOX 环境变量 api_key / secretKey 对齐）。
 *
 * GET:  sign = HMAC_SHA256( timestamp + apiKey + recvWindow + queryString, secret )
 * POST: sign = HMAC_SHA256( timestamp + apiKey + recvWindow + bodyRaw, secret )
 *       （bodyRaw 为注入 api_key/timestamp/recv_window 之前的 JSON 字符串）
 *
 * 请求头：X-BAPI-API-KEY / X-BAPI-SIGN / X-BAPI-SIGN-TYPE=2 / X-BAPI-TIMESTAMP / X-BAPI-RECV-WINDOW
 */
import { createHmac } from 'node:crypto';

export function apifoxHmacSign(
  orderedParams: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(orderedParams).digest('hex');
}

export function buildApifoxGetSignPayload(options: {
  timestamp: string;
  apiKey: string;
  recvWindow: string;
  /** 不含 `?` 的 queryString，与 Apifox `getQueryString()` 一致 */
  queryString: string;
}): string {
  return options.timestamp + options.apiKey + options.recvWindow + options.queryString;
}

export function buildApifoxPostSignPayload(options: {
  timestamp: string;
  apiKey: string;
  recvWindow: string;
  /** 原始 JSON body 字符串（签名前、未写入 api_key 等字段） */
  bodyRaw: string;
}): string {
  return options.timestamp + options.apiKey + options.recvWindow + options.bodyRaw;
}

export function buildApifoxAuthHeaders(options: {
  apiKey: string;
  apiSecret: string;
  method: 'GET' | 'POST';
  queryString?: string;
  bodyRaw?: string;
  timestamp?: string;
  recvWindow?: string;
}): Record<string, string> {
  const timestamp = options.timestamp ?? String(Date.now());
  const recvWindow =
    options.recvWindow ?? process.env['QA_API_RECV_WINDOW']?.trim() ?? '1000';

  const orderedParams =
    options.method === 'GET'
      ? buildApifoxGetSignPayload({
          timestamp,
          apiKey: options.apiKey,
          recvWindow,
          queryString: options.queryString ?? '',
        })
      : buildApifoxPostSignPayload({
          timestamp,
          apiKey: options.apiKey,
          recvWindow,
          bodyRaw: options.bodyRaw ?? '',
        });

  const sign = apifoxHmacSign(orderedParams, options.apiSecret);

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-BAPI-API-KEY': options.apiKey,
    'X-BAPI-SIGN': sign,
    'X-BAPI-SIGN-TYPE': '2',
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-RECV-WINDOW': recvWindow,
  };
}

/** 按插入顺序拼接 query（避免与 Apifox URL 参数顺序不一致导致验签失败） */
export function buildQueryString(entries: Array<[string, string]>): string {
  return entries
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
