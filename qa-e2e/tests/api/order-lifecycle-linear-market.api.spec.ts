/**
 * OpenAPI V3 合约（linear）市价单全链路：市价开仓 → 查历史 → 查成交 → 查持仓 → 市价平仓
 *
 * 用例文档：qa-design/cases/openapi-v3/order-lifecycle.md（TC-3110）
 * 合约限价：order-lifecycle-linear-limit.api.spec.ts（TC-3100）
 */
import { test, expect } from '@zmx/qa-kit/runners/web';
import { signedGet, signedPost } from '@qa-e2e/api';
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
} from './_order-lifecycle-exchange.ts';
import {
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_ORDER_HISTORY,
  PATH_EXECUTION_LIST,
  PATH_POSITION_LIST,
  ORDER_CATEGORY,
  ORDER_SYMBOL,
  ORDER_SETTLE_COIN,
  MARKET_OPEN_SIDE,
  buildCloseMarketOrderBody,
  buildCreateMarketOrderBody,
  findPositionRow,
  pickOrderId,
  pickOrderStatus,
  pickPositionSize,
  type CreateOrderResult,
} from './_order-trade.ts';

const SPEC_NAME = 'order-lifecycle-linear-market';

test.use({ baseURL: API_BASE_URL });

function flowAnno(step: string): Parameters<typeof test>[1] {
  return {
    tag: [
      '@api',
      '@feature-openapi-v3-order-lifecycle',
      '@category-linear',
      '@order-type-market',
      '@live-write',
    ],
    annotation: [
      ...apiCaseAnnotations(`TC-3110 | 市价单串行 - ${step}`),
      { type: 'dataCleaner', description: 'enabled' },
    ],
  };
}

const HISTORY_QUERY: Array<[string, string]> = [
  ['category', ORDER_CATEGORY],
  ['symbol', ORDER_SYMBOL],
  ['orderType', 'Market'],
  ['side', MARKET_OPEN_SIDE],
  ['limit', '20'],
  ['execType', 'Trade'],
];

const POSITION_QUERY: Array<[string, string]> = [
  ['category', ORDER_CATEGORY],
  ['settleCoin', ORDER_SETTLE_COIN],
  ['symbol', ORDER_SYMBOL],
];

const EXECUTION_QUERY: Array<[string, string]> = [
  ['category', ORDER_CATEGORY],
  ['symbol', ORDER_SYMBOL],
];

test.describe.serial('order-lifecycle-linear-market｜合约市价单：开仓 → 历史 → 成交 → 持仓 → 平仓', () => {
  test.beforeAll(() => {
    requireSignedApiAuth(SPEC_NAME);
    initApiExchangeLog(SPEC_NAME);
  });

  test.afterAll(async ({ request }) => {
    if (await isOpenApiLive(request)) {
      const cancelRes = await signedPost(request, PATH_ORDER_CANCEL_ALL, {
        category: ORDER_CATEGORY,
        symbol: ORDER_SYMBOL,
      });
      recordApiExchange({
        step: 'afterAll-cancel-all',
        at: new Date().toISOString(),
        method: 'POST',
        path: PATH_ORDER_CANCEL_ALL,
        url: `${API_BASE_URL}${PATH_ORDER_CANCEL_ALL}`,
        request: { body: { category: ORDER_CATEGORY, symbol: ORDER_SYMBOL } },
        response: { status: cancelRes.status(), body: await readResponseJson(cancelRes) },
      });

      const posRes = await signedGet(request, PATH_POSITION_LIST, {
        queryEntries: POSITION_QUERY,
      });
      const posJson = (await readResponseJson(posRes)) as {
        retCode?: number;
        result?: { list?: Array<Record<string, unknown>> };
      };
      const row = findPositionRow(posJson.result?.list ?? [], ORDER_SYMBOL);
      if (row && pickPositionSize(row) > 0) {
        const closeBody = buildCloseMarketOrderBody();
        const closeRes = await signedPost(request, PATH_ORDER_CREATE, closeBody);
        recordApiExchange({
          step: 'afterAll-close-position',
          at: new Date().toISOString(),
          method: 'POST',
          path: PATH_ORDER_CREATE,
          url: `${API_BASE_URL}${PATH_ORDER_CREATE}`,
          request: { body: closeBody },
          response: { status: closeRes.status(), body: await readResponseJson(closeRes) },
        });
      }
    }
    finalizeApiExchangeLog();
  });

  let orderId: string | undefined;

  test('步骤 1/5：市价开仓 create', flowAnno('市价开仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const createBody = buildCreateMarketOrderBody();
    const { body } = await exchangePost(testInfo, '1-market-create', request, PATH_ORDER_CREATE, createBody);
    await expectRetCodeOk(body, PATH_ORDER_CREATE);
    const result = body.result as CreateOrderResult;
    expect(result.orderId, '市价开仓应返回 orderId').toBeTruthy();
    orderId = result.orderId;
  });

  test('步骤 2/5：查历史 order/history', flowAnno('查历史'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价开仓未成功');

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

    expect(successRecord, '历史订单轮询应至少成功一次').toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 3/5：查成交 execution/list', flowAnno('查成交'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价开仓未成功');

    const { body } = await exchangeGet(
      testInfo,
      '3-execution',
      request,
      PATH_EXECUTION_LIST,
      EXECUTION_QUERY,
    );
    await expectRetCodeOk(body, PATH_EXECUTION_LIST);
    const list = (body.result as { list?: unknown[] })?.list ?? [];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length, '市价成交后 execution 列表应非空').toBeGreaterThan(0);
  });

  test('步骤 4/5：查持仓 position/list', flowAnno('查持仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价开仓未成功');

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
          if (body.retCode !== 0) return 0;
          const list = (body.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRow(list, ORDER_SYMBOL);
          const size = row ? pickPositionSize(row) : 0;
          if (size > 0) {
            successRecord = buildGetExchangeRecord(
              '4-position',
              PATH_POSITION_LIST,
              POSITION_QUERY,
              res,
              body,
              { pollAttempts },
            );
          }
          return size;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThan(0);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 5/5：市价平仓 create reduceOnly', flowAnno('市价平仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价开仓未成功');

    const closeBody = buildCloseMarketOrderBody();
    const { body } = await exchangePost(
      testInfo,
      '5-market-close',
      request,
      PATH_ORDER_CREATE,
      closeBody,
    );
    await expectRetCodeOk(body, PATH_ORDER_CREATE);

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body: posBody } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
          if (posBody.retCode !== 0) return -1;
          const list = (posBody.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRow(list, ORDER_SYMBOL);
          const size = row ? pickPositionSize(row) : 0;
          if (size === 0) {
            successRecord = buildGetExchangeRecord(
              '5-position-after-close',
              PATH_POSITION_LIST,
              POSITION_QUERY,
              res,
              posBody,
              { pollAttempts },
            );
          }
          return size;
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .toBe(0);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });
});
