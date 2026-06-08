/**
 * OpenAPI V3 现货市价单全链路：市价买入 → 查历史 → 查成交 → 查余额 → 市价卖出
 *
 * 用例文档：qa-design/cases/openapi-v3/order-lifecycle.md（TC-3130）
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect } from '@zmx/qa-kit/runners/web';
import { signedGet, signedPost } from '@qa-e2e/api/signed-request';
import {
  API_BASE_URL,
  apiCaseAnnotations,
  isOpenApiLive,
  requireSignedApiAuth,
} from './_api-env.ts';
import {
  finalizeApiExchangeLog,
  initApiExchangeLog,
  readResponseJson,
  recordApiExchange,
} from './_api-exchange-log.ts';
import {
  buildGetExchangeRecord,
  exchangeGet,
  exchangePost,
  expectRetCodeOk,
  publishExchange,
  signedGetJson,
  type RetEnvelope,
} from './_order-lifecycle-exchange.ts';
import {
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_ORDER_HISTORY,
  PATH_EXECUTION_LIST,
  PATH_WALLET_BALANCE,
  SPOT_BASE_COIN,
  SPOT_WALLET_QUERY_VARIANTS,
  SPOT_CATEGORY,
  SPOT_MARKET_OPEN_SIDE,
  SPOT_SYMBOL,
  buildSpotMarketBuyBody,
  buildSpotMarketSellBody,
  pickOrderId,
  pickOrderStatus,
  pickSpotCoinBalance,
  type CreateOrderResult,
} from './_order-trade.ts';

const SPEC_NAME = 'order-lifecycle-spot-market';

test.use({ baseURL: API_BASE_URL });

function flowAnno(step: string): Parameters<typeof test>[1] {
  return {
    tag: [
      '@api',
      '@feature-openapi-v3-order-lifecycle',
      '@category-spot',
      '@order-type-market',
      '@live-write',
    ],
    annotation: [
      ...apiCaseAnnotations(`TC-3130 | 现货市价单串行 - ${step}`),
      { type: 'dataCleaner', description: 'enabled' },
    ],
  };
}

const HISTORY_QUERY: Array<[string, string]> = [
  ['category', SPOT_CATEGORY],
  ['symbol', SPOT_SYMBOL],
  ['orderType', 'Market'],
  ['side', SPOT_MARKET_OPEN_SIDE],
  ['limit', '20'],
  ['execType', 'Trade'],
];

const EXECUTION_QUERY: Array<[string, string]> = [
  ['category', SPOT_CATEGORY],
  ['symbol', SPOT_SYMBOL],
];

/** 轮询 wallet-balance（UNIFIED / SPOT），解析 base 币余额 */
async function walletBalanceForCoin(
  request: APIRequestContext,
  coin: string,
): Promise<{
  balance: number;
  res: APIResponse;
  body: RetEnvelope;
  query: Array<[string, string]>;
}> {
  let lastQuery = SPOT_WALLET_QUERY_VARIANTS[0]!;
  let lastRes!: APIResponse;
  let lastBody: RetEnvelope = {};

  for (const query of SPOT_WALLET_QUERY_VARIANTS) {
    const { res, body } = await signedGetJson(request, PATH_WALLET_BALANCE, query);
    lastQuery = query;
    lastRes = res;
    lastBody = body;
    if (body.retCode === 0) {
      const bal = pickSpotCoinBalance(body.result, coin);
      if (bal > 0) {
        return { balance: bal, res, body, query };
      }
    }
  }
  return {
    balance: 0,
    res: lastRes,
    body: lastBody,
    query: lastQuery,
  };
}

test.describe.serial('order-lifecycle-spot-market｜现货市价单：买入 → 历史 → 成交 → 余额 → 卖出', () => {
  test.beforeAll(() => {
    requireSignedApiAuth(SPEC_NAME);
    initApiExchangeLog(SPEC_NAME);
  });

  test.afterAll(async ({ request }) => {
    if (await isOpenApiLive(request)) {
      const cancelRes = await signedPost(request, PATH_ORDER_CANCEL_ALL, {
        category: SPOT_CATEGORY,
        symbol: SPOT_SYMBOL,
      });
      recordApiExchange({
        step: 'afterAll-cancel-all',
        at: new Date().toISOString(),
        method: 'POST',
        path: PATH_ORDER_CANCEL_ALL,
        url: `${API_BASE_URL}${PATH_ORDER_CANCEL_ALL}`,
        request: { body: { category: SPOT_CATEGORY, symbol: SPOT_SYMBOL } },
        response: { status: cancelRes.status(), body: await readResponseJson(cancelRes) },
      });

      const hit = await walletBalanceForCoin(request, SPOT_BASE_COIN);
      if (hit.balance > 0) {
        const sellBody = buildSpotMarketSellBody();
        const sellRes = await signedPost(request, PATH_ORDER_CREATE, sellBody);
        recordApiExchange({
          step: 'afterAll-spot-sell',
          at: new Date().toISOString(),
          method: 'POST',
          path: PATH_ORDER_CREATE,
          url: `${API_BASE_URL}${PATH_ORDER_CREATE}`,
          request: { body: sellBody },
          response: { status: sellRes.status(), body: await readResponseJson(sellRes) },
        });
      }
    }
    finalizeApiExchangeLog();
  });

  let orderId: string | undefined;
  /** 步骤 4 读到的可卖 base 币数量（扣费后可能略小于下单 qty） */
  let spotSellQty: string | undefined;

  test('步骤 1/5：市价买入 create', flowAnno('市价买入'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const createBody = buildSpotMarketBuyBody();
    const { body } = await exchangePost(testInfo, '1-market-buy', request, PATH_ORDER_CREATE, createBody);
    await expectRetCodeOk(body, PATH_ORDER_CREATE);
    const result = body.result as CreateOrderResult;
    expect(result.orderId, '市价买入应返回 orderId').toBeTruthy();
    orderId = result.orderId;
  });

  test('步骤 2/5：查历史 order/history', flowAnno('查历史'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价买入未成功');

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body } = await signedGetJson(request, PATH_ORDER_HISTORY, HISTORY_QUERY);
          if (body.retCode !== 0) return false;
          const list = (body.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const hit = list.find((row) => pickOrderId(row) === orderId);
          if (!hit) return false;
          const status = pickOrderStatus(hit);
          const ok = status != null && /Filled|PartiallyFilled/i.test(status);
          if (ok) {
            successRecord = buildGetExchangeRecord(
              '2-history',
              PATH_ORDER_HISTORY,
              HISTORY_QUERY,
              res,
              body,
              { pollAttempts },
            );
          }
          return ok;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 3/5：查成交 execution/list', flowAnno('查成交'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价买入未成功');

    const { body } = await exchangeGet(
      testInfo,
      '3-execution',
      request,
      PATH_EXECUTION_LIST,
      EXECUTION_QUERY,
    );
    await expectRetCodeOk(body, PATH_EXECUTION_LIST);
    const list = (body.result as { list?: unknown[] })?.list ?? [];
    expect(list.length, '市价成交后 execution 列表应非空').toBeGreaterThan(0);
  });

  test('步骤 4/5：查钱包余额 wallet-balance', flowAnno('查余额'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价买入未成功');

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const hit = await walletBalanceForCoin(request, SPOT_BASE_COIN);
          if (hit.balance > 0) {
            // 按 4 位小数向下取整，避免余额精度导致卖出报 Insufficient balance
            const floored = Math.floor(hit.balance * 10_000) / 10_000;
            spotSellQty = floored > 0 ? String(floored) : undefined;
            successRecord = buildGetExchangeRecord(
              '4-wallet-balance',
              PATH_WALLET_BALANCE,
              hit.query,
              hit.res,
              hit.body,
              { pollAttempts },
            );
          }
          return hit.balance;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 5/5：市价卖出 create', flowAnno('市价卖出'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价买入未成功');
    test.skip(!spotSellQty, '步骤 4 未读到可卖余额');

    const sellBody = buildSpotMarketSellBody({ qty: spotSellQty });
    const { body } = await exchangePost(
      testInfo,
      '5-market-sell',
      request,
      PATH_ORDER_CREATE,
      sellBody,
    );
    await expectRetCodeOk(body, PATH_ORDER_CREATE);

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const hit = await walletBalanceForCoin(request, SPOT_BASE_COIN);
          const cleared = hit.body.retCode === 0 && hit.balance < 0.001;
          if (cleared) {
            successRecord = buildGetExchangeRecord(
              '5-wallet-after-sell',
              PATH_WALLET_BALANCE,
              hit.query,
              hit.res,
              hit.body,
              { pollAttempts },
            );
          }
          return cleared;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });
});
