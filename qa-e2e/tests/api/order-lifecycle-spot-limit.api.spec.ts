/**
 * OpenAPI V3 现货限价单全链路：下单 → 改单 → 查单 → 撤单 → 查现货余额
 *
 * 用例文档：qa-design/cases/openapi-v3/order-lifecycle.md（TC-3120）
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
import { exchangeGet, exchangePost, expectRetCodeOk } from './_order-lifecycle-exchange.ts';
import {
  PATH_ORDER_AMEND,
  PATH_ORDER_CANCEL,
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_ORDER_REALTIME,
  PATH_WALLET_BALANCE,
  SPOT_CATEGORY,
  SPOT_WALLET_QUERY_VARIANTS,
  SPOT_LIMIT_AMEND_PRICE,
  SPOT_QTY,
  SPOT_SYMBOL,
  buildSpotLimitOrderBody,
  pickOrderId,
  type CreateOrderResult,
} from './_order-trade.ts';

const SPEC_NAME = 'order-lifecycle-spot-limit';

test.use({ baseURL: API_BASE_URL });

function flowAnno(step: string): Parameters<typeof test>[1] {
  return {
    tag: [
      '@api',
      '@feature-openapi-v3-order-lifecycle',
      '@category-spot',
      '@order-type-limit',
      '@live-write',
    ],
    annotation: [
      ...apiCaseAnnotations(`TC-3120 | 现货限价单串行 - ${step}`),
      { type: 'dataCleaner', description: 'enabled' },
    ],
  };
}

const REALTIME_QUERY: Array<[string, string]> = [
  ['category', SPOT_CATEGORY],
  ['openOnly', '0'],
  ['symbol', SPOT_SYMBOL],
];

test.describe.serial('order-lifecycle-spot-limit｜现货限价单：下单 → 改单 → 查单 → 撤单 → 查余额', () => {
  test.beforeAll(() => {
    requireSignedApiAuth(SPEC_NAME);
    initApiExchangeLog(SPEC_NAME);
  });

  test.afterAll(async ({ request }) => {
    if (await isOpenApiLive(request)) {
      const res = await signedPost(request, PATH_ORDER_CANCEL_ALL, {
        category: SPOT_CATEGORY,
        symbol: SPOT_SYMBOL,
      });
      const json = await readResponseJson(res);
      recordApiExchange({
        step: 'afterAll-cancel-all',
        at: new Date().toISOString(),
        method: 'POST',
        path: PATH_ORDER_CANCEL_ALL,
        url: `${API_BASE_URL}${PATH_ORDER_CANCEL_ALL}`,
        request: { body: { category: SPOT_CATEGORY, symbol: SPOT_SYMBOL } },
        response: { status: res.status(), body: json },
      });
    }
    finalizeApiExchangeLog();
  });

  let orderId: string | undefined;
  let orderLinkId: string | undefined;

  test('步骤 1/5：下单 create', flowAnno('下单'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const createBody = buildSpotLimitOrderBody();
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
      category: SPOT_CATEGORY,
      symbol: SPOT_SYMBOL,
      price: SPOT_LIMIT_AMEND_PRICE,
      qty: SPOT_QTY,
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

    const { body } = await exchangeGet(testInfo, '3-realtime', request, PATH_ORDER_REALTIME, REALTIME_QUERY);
    await expectRetCodeOk(body, PATH_ORDER_REALTIME);
    const list = (body.result as { list?: Array<Record<string, unknown>> })?.list ?? [];
    expect(Array.isArray(list)).toBe(true);

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

    const { body: cancelBodyRes } = await exchangePost(
      testInfo,
      '4-cancel',
      request,
      PATH_ORDER_CANCEL,
      { category: SPOT_CATEGORY, symbol: SPOT_SYMBOL, orderId },
    );
    await expectRetCodeOk(cancelBodyRes, PATH_ORDER_CANCEL);

    const { body: checkBody } = await exchangeGet(
      testInfo,
      '4-cancel-verify-realtime',
      request,
      PATH_ORDER_REALTIME,
      REALTIME_QUERY,
    );
    await expectRetCodeOk(checkBody, PATH_ORDER_REALTIME);
    const stillOpen = ((checkBody.result as { list?: Array<Record<string, unknown>> })?.list ?? []).some(
      (row) => pickOrderId(row) === orderId,
    );
    expect(stillOpen, '撤单后不应再出现在 openOnly=0 实时委托列表').toBe(false);
  });

  test('步骤 5/5：查询钱包余额 wallet-balance', flowAnno('查余额'), async ({ request }, testInfo) => {
    test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');

    const query = SPOT_WALLET_QUERY_VARIANTS[0]!;
    const { body } = await exchangeGet(
      testInfo,
      '5-wallet-balance',
      request,
      PATH_WALLET_BALANCE,
      query,
    );
    await expectRetCodeOk(body, PATH_WALLET_BALANCE);
    expect(body.result).toBeTruthy();
  });
});
