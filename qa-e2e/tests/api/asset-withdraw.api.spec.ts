import { test, expect } from '@zmx/qa-kit/runners/web';
import { hasApiAuth, readJsonBody } from '@qa-e2e/api';
import { signedGet } from '@qa-e2e/api/signed-request';
import { apiCaseAnnotations, isOpenApiLive } from './_api-env.ts';

/** 私有接口：钱包余额（需签名） */
const WALLET_BALANCE_PATH = '/cloud/trade/v3/account/wallet-balance';

type ZoomexResponse = {
  retCode?: number;
  retMsg?: string;
  result?: unknown;
};

test.describe('Zoomex OpenAPI · 鉴权与账户', () => {
  test(
    'TC-007 相关：签名请求可访问 wallet-balance（retCode 可观测）',
    {
      tag: ['@api', '@feature-deposit-withdraw-optimize-3'],
      annotation: apiCaseAnnotations('qa-design/cases/deposit-withdraw-optimize-3.md#TC-007'),
    },
    async ({ request }) => {
      test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
      test.skip(!hasApiAuth(), '需要 env/.env.<QA_ENV> 中配置 QA_API_KEY + QA_API_SECRET');

      const res = await signedGet(request, WALLET_BALANCE_PATH, {
        params: { accountType: 'UNIFIED' },
      });

      expect(res.status()).toBeLessThan(500);
      const body = (await readJsonBody(res)) as ZoomexResponse;
      expect(body.retCode).toBeDefined();
      expect(typeof body.retMsg).toBe('string');
    },
  );

  test(
    'TC-301 登录态：api_key 签名头齐全时请求不应返回 401',
    {
      tag: ['@api', '@feature-deposit-withdraw-optimize-3'],
      annotation: apiCaseAnnotations('qa-design/cases/deposit-withdraw-optimize-3.md#TC-301'),
    },
    async ({ request }) => {
      test.skip(!(await isOpenApiLive(request)), 'OpenAPI 网关不可达');
      test.skip(!hasApiAuth(), '需要 QA_API_KEY + QA_API_SECRET');

      const res = await signedGet(request, WALLET_BALANCE_PATH, {
        params: { accountType: 'UNIFIED' },
      });

      expect(res.status()).not.toBe(401);
    },
  );
});
