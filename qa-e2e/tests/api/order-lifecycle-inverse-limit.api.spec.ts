/**
 * OpenAPI V3 反向合约（inverse）限价单全链路：下单 → 改单 → 查单 → 撤单 → 查持仓
 *
 * 用例文档：qa-design/cases/openapi-v3/order-lifecycle.md（TC-3150）
 */
import { test, expect } from '@zmx/qa-kit/runners/web';
import { signedPost } from '@qa-e2e/api';
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
import { exchangeGet, exchangePost, expectRetCodeOk } from './_order-lifecycle-exchange.ts';
import { ensureInverseSymbolFlat } from './_order-inverse-cleanup.ts';
import {
  PATH_ORDER_AMEND,
  PATH_ORDER_CANCEL,
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_ORDER_REALTIME,
  PATH_POSITION_LIST,
  INVERSE_CATEGORY,
  INVERSE_SYMBOL,
  INVERSE_QTY,
  INVERSE_SETTLE_COIN,
  INVERSE_LIMIT_AMEND_PRICE,
  buildInverseLimitOrderBody,
  pickOrderId,
  type CreateOrderResult,
} from './_order-trade.ts';

const SPEC_NAME = 'order-lifecycle-inverse-limit';

test.use({ baseURL: API_BASE_URL });

function flowAnno(step: string): Parameters<typeof test>[1] {
  return {
    tag: [
      '@api',
      '@feature-openapi-v3-order-lifecycle',
      '@category-inverse',
      '@order-type-limit',
      '@live-write',
    ],
    annotation: [
      ...apiCaseAnnotations(`TC-3150 | 反向限价单串行 - ${step}`),
      { type: 'dataCleaner', description: 'enabled' },
    ],
  };
}

test.describe.serial('order-lifecycle-inverse-limit｜反向合约限价单：下单 → 改单 → 查单 → 撤单 → 查持仓', () => {
  test.beforeAll(async ({ request }) => {
    requireSignedApiAuth(SPEC_NAME);
    initApiExchangeLog(SPEC_NAME);
    await ensureInverseSymbolFlat(request);
  });

  test.afterAll(async ({ request }) => {
    if (await isOpenApiLive(request)) {
      await ensureInverseSymbolFlat(request);
      const res = await signedPost(request, PATH_ORDER_CANCEL_ALL, {
        category: INVERSE_CATEGORY,
        symbol: INVERSE_SYMBOL,
      });
      const json = await readResponseJson(res);
      recordApiExchange({
        step: 'afterAll-cancel-all',
        at: new Date().toISOString(),
        method: 'POST',
        path: PATH_ORDER_CANCEL_ALL,
        url: `${API_BASE_URL}${PATH_ORDER_CANCEL_ALL}`,
        request: {
          body: { category: INVERSE_CATEGORY, symbol: INVERSE_SYMBOL },
        },
        response: { status: res.status(), body: json },
      });
    }
    finalizeApiExchangeLog();
  });

  let orderId: string | undefined;
  let orderLinkId: string | undefined;

  test('步骤 1/5：下单 create', flowAnno('下单'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const createBody = buildInverseLimitOrderBody();
    const { body } = await exchangePost(testInfo, '1-create', request, PATH_ORDER_CREATE, createBody);
    await expectRetCodeOk(body, PATH_ORDER_CREATE);
    const result = body.result as CreateOrderResult;
    expect(result.orderId, 'create 应返回 orderId').toBeTruthy();
    orderId = result.orderId;
    orderLinkId = result.orderLinkId;
  });

  test('步骤 2/5：改单 amend', flowAnno('改单'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 下单未成功');

    const amendBody = {
      category: INVERSE_CATEGORY,
      symbol: INVERSE_SYMBOL,
      price: INVERSE_LIMIT_AMEND_PRICE,
      qty: INVERSE_QTY,
      takeProfit: '0',
      stopLoss: '0',
      orderId,
    };
    const { body } = await exchangePost(testInfo, '2-amend', request, PATH_ORDER_AMEND, amendBody);
    await expectRetCodeOk(body, PATH_ORDER_AMEND);
    const result = body.result as CreateOrderResult;
    expect(pickOrderId(result as Record<string, unknown>) ?? result.orderId).toBe(orderId);
  });

  test('步骤 3/5：查单 order/realtime', flowAnno('查单'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 下单未成功');

    const queryEntries: Array<[string, string]> = [
      ['category', INVERSE_CATEGORY],
      ['settleCoin', INVERSE_SETTLE_COIN],
      ['openOnly', '0'],
      ['symbol', INVERSE_SYMBOL],
    ];
    const { body } = await exchangeGet(
      testInfo,
      '3-realtime',
      request,
      PATH_ORDER_REALTIME,
      queryEntries,
    );
    await expectRetCodeOk(body, PATH_ORDER_REALTIME);
    const list = (body.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
    const hit = list.find((row) => pickOrderId(row) === orderId);
    expect(hit, `实时委托列表应包含 orderId=${orderId}`).toBeTruthy();
    const status = hit?.['OrderStatus'] ?? hit?.['orderStatus'];
    expect(String(status), '改单后订单应为挂单态').toMatch(/New|PartiallyFilled/i);
    if (orderLinkId) {
      const link = hit?.['OrderLinkId'] ?? hit?.['orderLinkId'];
      expect(String(link)).toBe(orderLinkId);
    }
  });

  test('步骤 4/5：撤单 cancel', flowAnno('撤单'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
    test.skip(!orderId, '步骤 1 下单未成功');

    const cancelBody = {
      category: INVERSE_CATEGORY,
      symbol: INVERSE_SYMBOL,
      orderId,
    };
    const { body: cancelBodyRes } = await exchangePost(
      testInfo,
      '4-cancel',
      request,
      PATH_ORDER_CANCEL,
      cancelBody,
    );
    await expectRetCodeOk(cancelBodyRes, PATH_ORDER_CANCEL);

    const queryEntries: Array<[string, string]> = [
      ['category', INVERSE_CATEGORY],
      ['settleCoin', INVERSE_SETTLE_COIN],
      ['openOnly', '0'],
      ['symbol', INVERSE_SYMBOL],
    ];
    const { body: checkBody } = await exchangeGet(
      testInfo,
      '4-cancel-verify-realtime',
      request,
      PATH_ORDER_REALTIME,
      queryEntries,
    );
    await expectRetCodeOk(checkBody, PATH_ORDER_REALTIME);
    const stillOpen = ((checkBody.result as { list?: Array<Record<string, unknown>> })?.list ?? []).some(
      (row) => pickOrderId(row) === orderId,
    );
    expect(stillOpen, '撤单后不应再出现在 openOnly=0 实时委托列表').toBe(false);
  });

  test('步骤 5/5：查询持仓 position/list', flowAnno('查持仓'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const queryEntries: Array<[string, string]> = [
      ['category', INVERSE_CATEGORY],
      ['settleCoin', INVERSE_SETTLE_COIN],
      ['symbol', INVERSE_SYMBOL],
    ];
    const { body } = await exchangeGet(
      testInfo,
      '5-position-list',
      request,
      PATH_POSITION_LIST,
      queryEntries,
    );
    await expectRetCodeOk(body, PATH_POSITION_LIST);
    expect(Array.isArray((body.result as { list?: unknown[] })?.list)).toBe(true);
  });
});
