import type { Page } from '@playwright/test';

/**
 * 与 `tests/setup/auth.setup.ts`、出金 `WithdrawPage.goto` 共用：从环境变量取账号，
 * 在登录页填写并点击登录。凭据只应出现在本机 `.env` / CI Secret，勿写入仓库。
 *
 * - `QA_USER`：邮箱或用户名
 * - `QA_PASS`：密码
 */
export function getLoginCredentialsFromEnv(): { email: string; password: string } | null {
  const email = process.env['QA_USER']?.trim();
  const password = process.env['QA_PASS']?.trim();
  if (!email || !password) return null;
  return { email, password };
}

/** 在**当前已是登录页**的 `page` 上填写并提交；若无环境变量则 no-op。 */
export async function fillAndSubmitLoginFormIfConfigured(page: Page): Promise<void> {
  const creds = getLoginCredentialsFromEnv();
  if (!creds) return;

  await page.getByLabel(/username|email|邮箱|手机|账/i).fill(creds.email);
  await page.getByLabel(/password|密码/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in|login|登录/i }).click();
}
