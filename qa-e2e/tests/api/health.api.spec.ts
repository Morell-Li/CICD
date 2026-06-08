import { test, expect } from '@zmx/qa-kit/runners/web';
import { publicGet } from '@qa-e2e/api/signed-request';
import { readJsonBody } from '@qa-e2e/api';
import { apiCaseAnnotations, isOpenApiLive, OPENAPI_TIME_PATH } from './_api-env.ts';

test.describe('Zoomex OpenAPI V3 冒烟', () => {
  test(
    '公共接口：GET /cloud/trade/v3/market/time 返回 retCode=0',
    {
      tag: ['@api', '@smoke', '@feature-deposit-withdraw-optimize-3'],
      annotation: apiCaseAnnotations(
        'https://zoomexglobal.github.io/docs/v3/market/time',
      ),
    },
    async ({ request }) => {
      test.skip(!(await isOpenApiLive(request)), `OpenAPI 不可达：${OPENAPI_TIME_PATH}`);

      const res = await publicGet(request, OPENAPI_TIME_PATH);
      await expect(res).toBeOK();

      const body = (await readJsonBody(res)) as {
        retCode?: number;
        retMsg?: string;
        result?: { timeSecond?: string; timeNano?: string };
      };
      expect(body.retCode).toBe(0);
      expect(body.result?.timeSecond).toBeTruthy();
    },
  );
});
