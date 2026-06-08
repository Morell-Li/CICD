import { createHmac } from 'node:crypto';

import {
  apifoxHmacSign,
  buildApifoxAuthHeaders,
  buildApifoxGetSignPayload,
  buildApifoxPostSignPayload,
} from './apifox-sign.ts';

/** @deprecated 请使用 apifox-sign / signedGet；保留兼容旧引用 */
export function signZoomexV3(options: {
  apiKey: string;
  apiSecret: string;
  timestamp: string;
  recvWindow: string;
  /** GET：queryString（不含 `?`）；POST/PUT：JSON body 字符串 */
  payload: string;
}): string {
  const paramStr =
    options.timestamp + options.apiKey + options.recvWindow + options.payload;
  return createHmac('sha256', options.apiSecret).update(paramStr).digest('hex');
}

export function buildZoomexV3Headers(options: {
  apiKey: string;
  apiSecret: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  payload?: string;
  timestamp?: string;
  recvWindow?: string;
}): Record<string, string> {
  const method = options.method === 'GET' ? 'GET' : 'POST';
  return buildApifoxAuthHeaders({
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    method,
    queryString: method === 'GET' ? (options.payload ?? '') : undefined,
    bodyRaw: method === 'POST' ? (options.payload ?? '') : undefined,
    timestamp: options.timestamp,
    recvWindow: options.recvWindow,
  });
}

export {
  apifoxHmacSign,
  buildApifoxAuthHeaders,
  buildApifoxGetSignPayload,
  buildApifoxPostSignPayload,
};

export function toQueryString(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return '';
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}
