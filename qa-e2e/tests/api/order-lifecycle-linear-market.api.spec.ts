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
  MARKET_ORDER_QTY,
  buildCloseMarketOrderBody,
  normalizeLinearOrderQty,
  pickCumExecQty,
  buildCreateMarketOrderBody,
  findPositionRowByIdx,
  pickOrderId,
  pickOrderStatus,
  pickPositionIdx,
  pickPositionSide,
  pickPositionSize,
  positionIdxForOrderSide,
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

const CLOSE_HISTORY_QUERY: Array<[string, string]> = [
  ['category', ORDER_CATEGORY],
  ['symbol', ORDER_SYMBOL],
  ['limit', '20'],
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
      const rows = (posJson.result?.list ?? []).filter(
        (row) => String(row['symbol'] ?? row['Symbol'] ?? '') === ORDER_SYMBOL && pickPositionSize(row) > 0,
      );
      for (const row of rows) {
        const openSide = pickPositionSide(row);
        const closeSide = openSide === 'Sell' ? 'Buy' : 'Sell';
        const closeBody = buildCloseMarketOrderBody({
          side: closeSide,
          qty: String(pickPositionSize(row)),
          positionIdx: pickPositionIdx(row) || positionIdxForOrderSide(openSide || MARKET_OPEN_SIDE),
        });
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

  const OPEN_POSITION_IDX = positionIdxForOrderSide(MARKET_OPEN_SIDE);
  let orderId: string | undefined;
  let baselinePositionSize = 0;
  let openFilledQty = MARKET_ORDER_QTY;

  test('步骤 1/5：市价开仓 create', flowAnno('市价开仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const { body: posBefore } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
    await expectRetCodeOk(posBefore, PATH_POSITION_LIST);
    const beforeList = (posBefore.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
    const beforeRow = findPositionRowByIdx(beforeList, ORDER_SYMBOL, OPEN_POSITION_IDX);
    baselinePositionSize = beforeRow ? pickPositionSize(beforeRow) : 0;

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
            openFilledQty = pickCumExecQty(hit) || MARKET_ORDER_QTY;
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
          const row = findPositionRowByIdx(list, ORDER_SYMBOL, OPEN_POSITION_IDX);
          const size = row ? pickPositionSize(row) : 0;
          if (size > baselinePositionSize) {
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
      .toBeGreaterThan(baselinePositionSize);

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 5/5：市价平仓 create reduceOnly', flowAnno('市价平仓'), async ({ request }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 市价开仓未成功');

    const { body: posSnap } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
    await expectRetCodeOk(posSnap, PATH_POSITION_LIST);
    const posList = (posSnap.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
    const openRow = findPositionRowByIdx(posList, ORDER_SYMBOL, OPEN_POSITION_IDX);
    const closeQty = normalizeLinearOrderQty(openFilledQty);
    test.skip(Number(closeQty) <= 0, '步骤 2 未获得可平成交量');

    await signedPost(request, PATH_ORDER_CANCEL_ALL, {
      category: ORDER_CATEGORY,
      symbol: ORDER_SYMBOL,
    });

    const openSide = pickPositionSide(openRow!);
    const closeSide = openSide === 'Sell' ? 'Buy' : 'Sell';
    const closeBody = buildCloseMarketOrderBody({
      side: closeSide,
      qty: closeQty,
      positionIdx: OPEN_POSITION_IDX,
    });
    const { body } = await exchangePost(
      testInfo,
      '5-market-close',
      request,
      PATH_ORDER_CREATE,
      closeBody,
    );
    await expectRetCodeOk(body, PATH_ORDER_CREATE);
    const closeOrderId = (body.result as CreateOrderResult).orderId;
    expect(closeOrderId, '市价平仓应返回 orderId').toBeTruthy();

    let pollAttempts = 0;
    let closeOutcome: 'filled' | 'no_liquidity' | 'failed' | undefined;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body: histBody } = await signedGetJson(
            request,
            PATH_ORDER_HISTORY,
            CLOSE_HISTORY_QUERY,
          );
          if (histBody.retCode !== 0) return 'pending';
          const list = (histBody.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const hit = list.find((row) => pickOrderId(row) === closeOrderId);
          if (!hit) return 'pending';
          const status = pickOrderStatus(hit) ?? '';
          const reject = String(hit['rejectReason'] ?? hit['RejectReason'] ?? '');
          if (/Filled/i.test(status)) {
            closeOutcome = 'filled';
            successRecord = buildGetExchangeRecord(
              '5-close-history',
              PATH_ORDER_HISTORY,
              CLOSE_HISTORY_QUERY,
              res,
              histBody,
              { pollAttempts },
            );
            return 'filled';
          }
          if (/Cancelled/i.test(status) && reject.includes('NoImmediateQtyToFill')) {
            closeOutcome = 'no_liquidity';
            successRecord = buildGetExchangeRecord(
              '5-close-history',
              PATH_ORDER_HISTORY,
              CLOSE_HISTORY_QUERY,
              res,
              histBody,
              { pollAttempts },
            );
            return 'no_liquidity';
          }
          if (/Cancelled|Rejected/i.test(status)) {
            closeOutcome = 'failed';
            return 'failed';
          }
          return 'pending';
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] },
      )
      .not.toBe('pending');

    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);

    if (closeOutcome === 'no_liquidity') {
      test.skip(true, 'testnet 平仓侧无即时深度（EC_NoImmediateQtyToFill），跳过仓位归零断言');
    }
    expect(closeOutcome, '平仓订单应成交').toBe('filled');

    let posPollAttempts = 0;
    await expect
      .poll(
        async () => {
          posPollAttempts += 1;
          const { body: posBody } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
          if (posBody.retCode !== 0) return -1;
          const list = (posBody.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRowByIdx(list, ORDER_SYMBOL, OPEN_POSITION_IDX);
          const size = row ? pickPositionSize(row) : 0;
          return size - baselinePositionSize;
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBe(0);
  });
});
