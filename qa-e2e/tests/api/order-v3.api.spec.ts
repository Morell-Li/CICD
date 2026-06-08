/**
 * 来源契约：qa-design/cases/openapi-v3/order.md（idRange.contract = [3000, 3069]）
 *
 * - 读接口（realtime / history / execution）：表驱动 + happy / 必填缺失 / 鉴权异常
 * - 写接口契约探测：必填缺失 / 鉴权异常（不真下单）
 * - 全链路串行：见 order-lifecycle-linear-*.api.spec.ts / order-lifecycle-spot-*.api.spec.ts
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '@zmx/qa-kit/runners/web';
import { readJsonBody } from '@qa-e2e/api';
import { signedGet, signedPost } from '@qa-e2e/api/signed-request';
import { buildApifoxAuthHeaders, buildQueryString } from '@qa-e2e/api/apifox-sign';
import { getApiCredentials } from '@qa-e2e/api/auth.fixture';
import {
  API_BASE_URL,
  apiCaseAnnotations,
  isOpenApiLive,
  requireSignedApiAuth,
} from './_api-env.ts';
import {
  PATH_ORDER_CREATE as PATH_CREATE,
  PATH_ORDER_AMEND as PATH_AMEND,
  PATH_ORDER_CANCEL as PATH_CANCEL,
  PATH_ORDER_CANCEL_ALL as PATH_CANCEL_ALL,
  ORDER_CATEGORY,
  ORDER_SYMBOL,
  ORDER_QTY,
  buildCreateOrderBody,
} from './_order-trade.ts';

const SPEC_NAME = 'order-v3';

test.use({ baseURL: API_BASE_URL });

/** 写接口 happy path 由 order-lifecycle 串行套件覆盖 */
const WRITE_PATHS = new Set([PATH_CREATE, PATH_AMEND, PATH_CANCEL, PATH_CANCEL_ALL]);

type RetEnvelope = { retCode?: number; retMsg?: string; result?: unknown };

function caseAnno(tc: string, summary: string): Parameters<typeof test>[1] {
  return {
    tag: ['@api', '@feature-openapi-v3-order'],
    annotation: apiCaseAnnotations(`${tc} | ${summary}`),
  };
}

async function expectRetCodeOk(res: APIResponse, ctx: string): Promise<RetEnvelope> {
  await expect(res).toBeOK();
  const body = (await readJsonBody(res)) as RetEnvelope;
  expect(body.retCode, `${ctx} 期望 retCode === 0，retMsg=${body.retMsg}`).toBe(0);
  return body;
}

async function expectRetCodeFail(res: APIResponse): Promise<RetEnvelope> {
  const body = (await readJsonBody(res)) as RetEnvelope;
  expect(body.retCode, `期望 retCode !== 0，实际 ${body.retCode} (${body.retMsg ?? ''})`).not.toBe(0);
  return body;
}

async function expectAuthFail(res: APIResponse): Promise<void> {
  if (!res.ok()) {
    expect([400, 401, 403]).toContain(res.status());
    return;
  }
  await expectRetCodeFail(res);
}

async function callWithBadSignature(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  path: string,
  payload: { queryString?: string; body?: unknown },
): Promise<APIResponse> {
  const creds = getApiCredentials();
  const headers = buildApifoxAuthHeaders({
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    method,
    queryString: payload.queryString,
    bodyRaw: payload.body === undefined ? '' : JSON.stringify(payload.body),
  });
  headers['X-BAPI-SIGN'] = headers['X-BAPI-SIGN']!.split('').reverse().join('');
  if (method === 'GET') {
    const url = payload.queryString ? `${path}?${payload.queryString}` : path;
    return request.get(url, { headers });
  }
  return request.post(path, { headers, data: payload.body });
}

async function callWithoutAuth(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  path: string,
  payload: { queryString?: string; body?: unknown },
): Promise<APIResponse> {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (method === 'GET') {
    const url = payload.queryString ? `${path}?${payload.queryString}` : path;
    return request.get(url, { headers });
  }
  return request.post(path, { headers, data: payload.body });
}

type EndpointSpec = {
  tcBase: number;
  summary: string;
  path: string;
  method: 'GET' | 'POST';
  happy: { params?: Array<[string, string]>; body?: Record<string, unknown> };
  required: string[];
  driftOptional?: string[];
};

const READ_ENDPOINTS: EndpointSpec[] = [
  {
    tcBase: 3030,
    summary: '查询实时委托单',
    method: 'GET',
    path: '/cloud/trade/v3/order/realtime',
    required: ['settleCoin', 'openOnly', 'category'],
    driftOptional: ['openOnly'],
    happy: {
      params: [
        ['category', ORDER_CATEGORY],
        ['settleCoin', 'USDT'],
        ['openOnly', '0'],
      ],
    },
  },
  {
    tcBase: 3050,
    summary: '查询历史订单（2 年）',
    method: 'GET',
    path: '/cloud/trade/v3/order/history',
    required: ['category', 'limit', 'execType'],
    driftOptional: ['limit', 'execType'],
    happy: {
      params: [
        ['category', ORDER_CATEGORY],
        ['limit', '10'],
        ['execType', 'Trade'],
      ],
    },
  },
  {
    tcBase: 3060,
    summary: '查询成交记录',
    method: 'GET',
    path: '/cloud/trade/v3/execution/list',
    required: ['category', 'symbol'],
    driftOptional: ['symbol'],
    happy: {
      params: [
        ['category', ORDER_CATEGORY],
        ['symbol', ORDER_SYMBOL],
      ],
    },
  },
];

const WRITE_ENDPOINTS: EndpointSpec[] = [
  {
    tcBase: 3000,
    summary: '创建限价委托单',
    method: 'POST',
    path: PATH_CREATE,
    required: [
      'category',
      'symbol',
      'side',
      'orderType',
      'price',
      'positionIdx',
      'qty',
      'timeInForce',
    ],
    /** testnet 缺字段仍 retCode=0；业务入参里会带，但 OpenAPI/契约层不应标 unconditional required */
    driftOptional: ['positionIdx', 'timeInForce'],
    happy: { body: {} },
  },
  {
    tcBase: 3010,
    summary: '修改订单',
    method: 'POST',
    path: PATH_AMEND,
    required: ['category', 'symbol', 'price', 'qty', 'takeProfit', 'stopLoss', 'orderId'],
    happy: { body: {} },
  },
  {
    tcBase: 3020,
    summary: '撤销委托单',
    method: 'POST',
    path: PATH_CANCEL,
    required: ['category', 'symbol', 'orderId'],
    happy: { body: {} },
  },
  {
    tcBase: 3040,
    summary: '撤销所有订单',
    method: 'POST',
    path: PATH_CANCEL_ALL,
    required: ['category', 'symbol'],
    happy: { body: { category: ORDER_CATEGORY, symbol: ORDER_SYMBOL } },
  },
];

function tcId(base: number, offset: number): string {
  return `TC-${String(base + offset).padStart(4, '0')}`;
}

/** 写接口「缺必填」探测用最小 body（不依赖行情，仅验证 retCode !== 0） */
function writeProbeBody(path: string): Record<string, unknown> {
  switch (path) {
    case PATH_CREATE:
      return buildCreateOrderBody();
    case PATH_AMEND:
      return {
        category: ORDER_CATEGORY,
        symbol: ORDER_SYMBOL,
        price: '1',
        qty: ORDER_QTY,
        takeProfit: '0',
        stopLoss: '0',
        orderId: '00000000-0000-0000-0000-000000000000',
      };
    case PATH_CANCEL:
      return {
        category: ORDER_CATEGORY,
        symbol: ORDER_SYMBOL,
        orderId: '00000000-0000-0000-0000-000000000000',
      };
    case PATH_CANCEL_ALL:
      return { category: ORDER_CATEGORY, symbol: ORDER_SYMBOL };
    default:
      return { category: ORDER_CATEGORY, symbol: ORDER_SYMBOL };
  }
}

// ── 读接口 + 写接口契约探测（不真下单；串行全链路见 order-lifecycle-*.api.spec.ts）──
const CONTRACT_ENDPOINTS = [...WRITE_ENDPOINTS, ...READ_ENDPOINTS];

for (const ep of CONTRACT_ENDPOINTS) {
  test.describe(`order-v3｜${ep.method} ${ep.path}（${ep.summary}）`, () => {
    test.beforeAll(() => {
      requireSignedApiAuth(SPEC_NAME);
    });

    test.beforeEach(async ({ request }) => {
      test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    });

    if (ep.method === 'GET') {
      test(
        `${tcId(ep.tcBase, 4)} happy path：合法请求 → retCode === 0`,
        caseAnno(tcId(ep.tcBase, 4), `${ep.summary} - happy path`),
        async ({ request }) => {
          const res = await signedGet(request, ep.path, { queryEntries: ep.happy.params });
          await expectRetCodeOk(res, ep.path);
        },
      );
    } else if (!WRITE_PATHS.has(ep.path)) {
      test(
        `${tcId(ep.tcBase, 4)} happy path：合法请求 → retCode === 0`,
        caseAnno(tcId(ep.tcBase, 4), `${ep.summary} - happy path`),
        async ({ request }) => {
          const res = await signedPost(request, ep.path, ep.happy.body);
          await expectRetCodeOk(res, ep.path);
        },
      );
    } else {
      test(
        `${tcId(ep.tcBase, 4)} happy path：见 order-lifecycle 串行套件`,
        caseAnno(tcId(ep.tcBase, 4), `${ep.summary} - happy path（lifecycle）`),
        async () => {
          test.skip(true, '写接口 happy path 见 order-lifecycle-linear-* / order-lifecycle-spot-*.api.spec.ts');
        },
      );
    }

    for (const field of ep.required) {
      const isDrift = ep.driftOptional?.includes(field) ?? false;
      const titlePrefix = isDrift ? '[FIXME contract-drift] ' : '';
      test(
        `${tcId(ep.tcBase, 5)} ${titlePrefix}必填缺失：缺 \`${field}\` → retCode !== 0`,
        caseAnno(tcId(ep.tcBase, 5), `${ep.summary} - 缺 ${field}${isDrift ? ' (drift)' : ''}`),
        async ({ request }) => {
          test.fixme(
            isDrift,
            `OpenAPI 标 required 但 testnet 实际可缺；见 contracts/openapi/HANDOFF-required-drift-2026-05-15.md`,
          );
          let res: APIResponse;
          if (ep.method === 'GET') {
            const filtered = (ep.happy.params ?? []).filter(([k]) => k !== field);
            res = await signedGet(request, ep.path, { queryEntries: filtered });
          } else {
            const body = writeProbeBody(ep.path);
            delete body[field];
            res = await signedPost(request, ep.path, body);
          }
          if (!res.ok()) {
            expect([400, 422]).toContain(res.status());
            return;
          }
          await expectRetCodeFail(res);
        },
      );
    }

    test(
      `${tcId(ep.tcBase, 8)} 鉴权异常：不携带 X-BAPI-* → 鉴权失败`,
      caseAnno(tcId(ep.tcBase, 8), `${ep.summary} - 缺签名头`),
      async ({ request }) => {
        const queryString = ep.happy.params ? buildQueryString(ep.happy.params) : '';
        const body =
          ep.method === 'POST' && WRITE_PATHS.has(ep.path) ? writeProbeBody(ep.path) : ep.happy.body;
        const res = await callWithoutAuth(request, ep.method, ep.path, {
          queryString,
          body,
        });
        await expectAuthFail(res);
      },
    );

    test(
      `${tcId(ep.tcBase, 8)} 鉴权异常：篡改 X-BAPI-SIGN → 签名失败`,
      caseAnno(tcId(ep.tcBase, 8), `${ep.summary} - 篡改 sign`),
      async ({ request }) => {
        const queryString = ep.happy.params ? buildQueryString(ep.happy.params) : '';
        const body =
          ep.method === 'POST' && WRITE_PATHS.has(ep.path) ? writeProbeBody(ep.path) : ep.happy.body;
        const res = await callWithBadSignature(request, ep.method, ep.path, {
          queryString,
          body,
        });
        await expectAuthFail(res);
      },
    );
  });
}
