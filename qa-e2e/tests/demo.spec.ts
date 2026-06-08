import { test, expect } from '@playwright/test';

/**
 * qa-kit demo spec — 自包含，零外部依赖。
 *
 * 不 navigate 任何 URL，不依赖 baseURL / 登录态 / 网络。
 * 用 data URL 喂静态 HTML 进浏览器，验证 Playwright / Chrome / 运行时三件事都活着。
 *
 * 业务接入后：
 *   1. 删掉此文件
 *   2. 用 `/qa:draft-e2e qa-e2e/specs/<feature>.md` 让 AI 起草真实 spec.ts
 */
test('Demo: playwright + chrome alive', {
  tag: ['@demo', '@p0'],
  annotation: [
    { type: 'productVersion', description: '1.0.x' },
    { type: 'runOn', description: 'staging' },
    { type: 'dataCleaner', description: 'inherit' },
    { type: 'schemaVersion', description: '1.0' },
  ],
}, async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>qa-kit demo</title></head>
      <body>
        <h1>qa-kit demo</h1>
        <button>hello</button>
      </body>
    </html>
  `);
  await expect(page).toHaveTitle('qa-kit demo');
  await expect(page.getByRole('heading', { name: 'qa-kit demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'hello' })).toBeVisible();
});
