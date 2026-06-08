/**
 * API 请求/响应交换记录：控制台打印 + 落盘 qa-results/e2e/api-exchange/
 * 不记录签名密钥；仅记录 path / query / body / status / 响应 JSON。
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { APIResponse } from '@playwright/test';

export type ApiExchangeRecord = {
  step: string;
  at: string;
  method: 'GET' | 'POST';
  path: string;
  url: string;
  request: {
    query?: Record<string, string>;
    body?: unknown;
  };
  response: {
    status: number;
    body: unknown;
  };
  /** 轮询步骤实际发出的 HTTP 次数；落盘/附件仅保留最后一次成功交换 */
  pollAttempts?: number;
};

let logFilePath: string | undefined;
let logEntries: ApiExchangeRecord[] = [];

/** 与 playwright 产物一致：仓库根 `qa-results/e2e/`（从 qa-e2e 目录运行时上溯一级） */
function resolveApiExchangeDir(): string {
  const cwd = process.cwd();
  const e2eRoot = /(?:^|\/)qa-e2e\/?$/.test(cwd)
    ? join(cwd, '..', 'qa-results', 'e2e')
    : join(cwd, 'qa-results', 'e2e');
  return join(e2eRoot, 'api-exchange');
}

export function initApiExchangeLog(suiteName: string): string {
  const qaEnv = process.env['QA_ENV']?.trim() ?? 'unknown';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolveApiExchangeDir();
  mkdirSync(dir, { recursive: true });
  logFilePath = join(dir, `${suiteName}-${qaEnv}-${stamp}.json`);
  logEntries = [];
  writeFileSync(
    logFilePath,
    JSON.stringify(
      {
        suite: suiteName,
        qaEnv,
        baseURL: process.env['QA_API_BASE_URL'] ?? process.env['QA_BASE_URL'] ?? '',
        startedAt: new Date().toISOString(),
        exchanges: [],
      },
      null,
      2,
    ),
    'utf8',
  );
  return logFilePath;
}

function persistLogFile(): void {
  if (!logFilePath) return;
  writeFileSync(
    logFilePath,
    JSON.stringify(
      {
        suite: logFilePath.split('/').pop()?.replace('.json', '') ?? 'api-exchange',
        qaEnv: process.env['QA_ENV']?.trim() ?? 'unknown',
        baseURL: process.env['QA_API_BASE_URL'] ?? '',
        finishedAt: new Date().toISOString(),
        exchanges: logEntries,
      },
      null,
      2,
    ),
    'utf8',
  );
}

/** 控制台打印 + 内存累积；套件结束由 finalizeApiExchangeLog 写盘 */
export function recordApiExchange(record: ApiExchangeRecord): void {
  logEntries.push(record);
  const divider = '─'.repeat(72);
  const pollNote =
    record.pollAttempts != null && record.pollAttempts > 1
      ? `（轮询共 ${record.pollAttempts} 次请求，本条为末次成功响应）`
      : '';
  const block = [
    divider,
    `[qa-api-exchange] ${record.step}${pollNote}`,
    `${record.method} ${record.url}`,
    `HTTP ${record.response.status} | retCode=${(record.response.body as { retCode?: number })?.retCode ?? '?'}`,
    '--- 请求 ---',
    JSON.stringify(record.request, null, 2),
    '--- 响应 ---',
    JSON.stringify(record.response.body, null, 2),
    divider,
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log(block);

  if (logFilePath) {
    const jsonlPath = logFilePath.replace(/\.json$/, '.jsonl');
    appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`, 'utf8');
  }
}

export function finalizeApiExchangeLog(): string | undefined {
  persistLogFile();
  if (logFilePath) {
    // eslint-disable-next-line no-console
    console.log(`\n[qa-api-exchange] 完整交换记录已保存: ${logFilePath}`);
    // eslint-disable-next-line no-console
    console.log(`[qa-api-exchange] 逐条 JSONL: ${logFilePath.replace(/\.json$/, '.jsonl')}\n`);
  }
  return logFilePath;
}

export function getApiExchangeLogPath(): string | undefined {
  return logFilePath;
}

export async function readResponseJson(res: APIResponse): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { _raw: text };
  }
}
