/**
 * OpenAPI V3 反向合约（inverse）止盈止损全链路：设模式 → 市价开仓 → 设 TP/SL → 校验 → 清除
 *
 * 用例文档：qa-design/cases/openapi-v3/order-lifecycle.md（TC-3170）
 */
import { test, expect } from '@zmx/qa-kit/runners/web';
import { signedPost } from '@qa-e2e/api/signed-request';
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
  exchangePost,
  expectRetCodeOk,
  expectRetCodeOkOrIdempotentSetTpslMode,
  publishExchange,
  signedGetJson,
} from './_order-lifecycle-exchange.ts';
import { ensureInverseSymbolFlat } from './_order-inverse-cleanup.ts';
import {
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_POSITION_LIST,
  PATH_POSITION_SET_TPSL_MODE,
  PATH_POSITION_TRADING_STOP,
  INVERSE_CATEGORY,
  INVERSE_SYMBOL,
  INVERSE_SETTLE_COIN,
  buildInverseClearTradingStopBody,
  buildInverseCreateMarketOrderBody,
  buildInverseSetTpslModeBody,
  buildInverseTradingStopBody,
  findPositionRow,
  pickMarkPrice,
  pickPositionSide,
  pickPositionSize,
  pickTpSlFromPosition,
  type CreateOrderResult,
} from './_order-trade.ts';

const SPEC_NAME = 'order-lifecycle-inverse-tpsl';

test.use({ baseURL: API_BASE_URL });

function flowAnno(step: string): Parameters<typeof test>[1] {
  return {
    tag: [
      '@api',
      '@feature-openapi-v3-order-lifecycle',
      '@category-inverse',
      '@order-type-tpsl',
      '@live-write',
    ],
    annotation: [
      ...apiCaseAnnotations(`TC-3170 | 反向止盈止损串行 - ${step}`),
      { type: 'dataCleaner', description: 'enabled' },
    ],
  };
}

const POSITION_QUERY: Array<[string, string]> = [
  ['category', INVERSE_CATEGORY],
  ['settleCoin', INVERSE_SETTLE_COIN],
  ['symbol', INVERSE_SYMBOL],
];

test.describe.serial('order-lifecycle-inverse-tpsl｜反向合约止盈止损：设模式 → 开仓 → 设 TP/SL → 校验 → 清除', () => {
  test.beforeAll(async ({ request }) => {
    requireSignedApiAuth(SPEC_NAME);
    initApiExchangeLog(SPEC_NAME);
    await ensureInverseSymbolFlat(request);
  });

  test.afterAll(async ({ request }) => {
    if (await isOpenApiLive(request)) {
      await signedPost(request, PATH_POSITION_TRADING_STOP, buildInverseClearTradingStopBody());
      await ensureInverseSymbolFlat(request);
      const cancelRes = await signedPost(request, PATH_ORDER_CANCEL_ALL, {
        category: INVERSE_CATEGORY,
        symbol: INVERSE_SYMBOL,
      });
      recordApiExchange({
        step: 'afterAll-cleanup',
        at: new Date().toISOString(),
        method: 'POST',
        path: PATH_ORDER_CANCEL_ALL,
        url: `${API_BASE_URL}${PATH_ORDER_CANCEL_ALL}`,
        request: { body: { category: INVERSE_CATEGORY, symbol: INVERSE_SYMBOL } },
        response: { status: cancelRes.status(), body: await readResponseJson(cancelRes) },
      });
    }
    finalizeApiExchangeLog();
  });

  let positionRow: Record<string, unknown> | undefined;
  let markPrice = 0;

  test('步骤 1/5：设置止盈止损模式 set-tpsl-mode', flowAnno('设模式'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const { body } = await exchangePost(
      testInfo,
      '1-set-tpsl-mode',
      request,
      PATH_POSITION_SET_TPSL_MODE,
      buildInverseSetTpslModeBody(),
    );
    await expectRetCodeOkOrIdempotentSetTpslMode(body, PATH_POSITION_SET_TPSL_MODE);
  });

  test('步骤 2/5：市价开仓 create', flowAnno('市价开仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const { body } = await exchangePost(
      testInfo,
      '2-market-open',
      request,
      PATH_ORDER_CREATE,
      buildInverseCreateMarketOrderBody(),
    );
    await expectRetCodeOk(body, PATH_ORDER_CREATE);
    const result = body.result as CreateOrderResult;
    expect(result.orderId).toBeTruthy();

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body: posBody } = await signedGetJson(
            request,
            PATH_POSITION_LIST,
            POSITION_QUERY,
          );
          if (posBody.retCode !== 0) return 0;
          const list = (posBody.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRow(list, INVERSE_SYMBOL);
          if (!row) return 0;
          const size = pickPositionSize(row);
          if (size > 0) {
            positionRow = row;
            markPrice = pickMarkPrice(row);
            successRecord = buildGetExchangeRecord(
              '2-position-after-open',
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
      .toBeGreaterThan(0);

    expect(markPrice, '持仓应带有效 markPrice').toBeGreaterThan(0);
    expect(successRecord).toBeTruthy();
    publishExchange(testInfo, successRecord!);
  });

  test('步骤 3/5：设置止盈止损 trading-stop', flowAnno('设止盈止损'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!positionRow || markPrice <= 0, '步骤 2 未获得持仓');

    const side = pickPositionSide(positionRow!);
    const stopBody = buildInverseTradingStopBody(markPrice, side);
    const { body } = await exchangePost(
      testInfo,
      '3-trading-stop',
      request,
      PATH_POSITION_TRADING_STOP,
      stopBody,
    );
    await expectRetCodeOk(body, PATH_POSITION_TRADING_STOP);
  });

  test('步骤 4/5：查持仓校验 TP/SL', flowAnno('校验止盈止损'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!positionRow, '步骤 2 未获得持仓');

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body } = await signedGetJson(request, PATH_POSITION_LIST, POSITION_QUERY);
          if (body.retCode !== 0) return false;
          const list = (body.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRow(list, INVERSE_SYMBOL);
          if (!row) return false;
          const { takeProfit, stopLoss } = pickTpSlFromPosition(row);
          const ok =
            takeProfit !== '' &&
            takeProfit !== '0' &&
            stopLoss !== '' &&
            stopLoss !== '0';
          if (ok) {
            const tp = parseFloat(takeProfit);
            const sl = parseFloat(stopLoss);
            const isLong =
              pickPositionSide(row) === 'Buy' ||
              pickPositionSide(row) === '' ||
              parseFloat(String(row['size'] ?? '0')) > 0;
            if (isLong && !(tp > markPrice && sl < markPrice)) return false;
            if (!isLong && !(tp < markPrice && sl > markPrice)) return false;
            successRecord = buildGetExchangeRecord(
              '4-position-tpsl',
              PATH_POSITION_LIST,
              POSITION_QUERY,
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

  test('步骤 5/5：清除止盈止损 trading-stop', flowAnno('清除止盈止损'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const { body } = await exchangePost(
      testInfo,
      '5-clear-tpsl',
      request,
      PATH_POSITION_TRADING_STOP,
      buildInverseClearTradingStopBody(),
    );
    await expectRetCodeOk(body, PATH_POSITION_TRADING_STOP);

    let pollAttempts = 0;
    let successRecord: ReturnType<typeof buildGetExchangeRecord> | undefined;

    await expect
      .poll(
        async () => {
          pollAttempts += 1;
          const { res, body: posBody } = await signedGetJson(
            request,
            PATH_POSITION_LIST,
            POSITION_QUERY,
          );
          if (posBody.retCode !== 0) return false;
          const list = (posBody.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
          const row = findPositionRow(list, INVERSE_SYMBOL);
          if (!row) return true;
          const { takeProfit, stopLoss } = pickTpSlFromPosition(row);
          const cleared =
            (!takeProfit || takeProfit === '0') && (!stopLoss || stopLoss === '0');
          if (cleared) {
            successRecord = buildGetExchangeRecord(
              '5-position-after-clear',
              PATH_POSITION_LIST,
              POSITION_QUERY,
              res,
              posBody,
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
