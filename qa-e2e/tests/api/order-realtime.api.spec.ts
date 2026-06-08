import { test, expect } from '@zmx/qa-kit/runners/web';
import { hasApiAuth, readJsonBody } from '@qa-e2e/api';
import { signedGet } from '@qa-e2e/api/signed-request';
import { apiCaseAnnotations, isOpenApiLive } from './_api-env.ts';

/** Apifox: V2-V5 → 查询实时委托单 */
const ORDER_REALTIME_PATH = '/cloud/trade/v3/order/realtime';

type OrderRealtimeResponse = {
  retCode?: number;
  retMsg?: string;
  result?: {
    list?: unknown[];
    nextPageCursor?: string;
    category?: string;
  };
};

test.describe('V2-V5 OpenAPI · order/realtime（Testnet 调试）', () => {
  test(
    'GET /cloud/trade/v3/order/realtime：Apifox 鉴权 + 必填 query',
    {
      tag: ['@api', '@smoke', '@feature-deposit-withdraw-optimize-3'],
      annotation: apiCaseAnnotations(
        'contracts/openapi/V2-V5.openapi.json#/paths/~1cloud~1trade~1v3~1order~1realtime/get',
      ),
    },
    async ({ request }) => {
      test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
      test.skip(!hasApiAuth(), '需要 env/.env.testnet 中 QA_API_KEY + QA_API_SECRET');

      const res = await signedGet(request, ORDER_REALTIME_PATH, {
        queryEntries: [
          ['category', 'linear'],
          ['settleCoin', 'USDT'],
          ['openOnly', '0'],
        ],
      });

      await expect(res).toBeOK();
      const body = (await readJsonBody(res)) as OrderRealtimeResponse;
      expect(body.retCode).toBe(0);
      expect(body.retMsg).toBe('OK');
      expect(body.result?.category).toBe('linear');
      expect(Array.isArray(body.result?.list)).toBe(true);
    },
  );
});
