import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  fillAndSubmitLoginFormIfConfigured,
  getLoginCredentialsFromEnv,
} from '../helpers/login-form';

/**
 * Auth setup — runs once per worker, persists storageState to
 * `<project>/.qa-kit/auth/user-<idx>.json`. Playwright config's
 * `storageState` must point to the same path.
 *
 * The path is relative to this file's location (tests/setup/), going up two
 * levels to project root then into `.qa-kit/auth/`.
 */
setup('authenticate', async ({ page }) => {
  const idx = process.env['TEST_PARALLEL_INDEX'] ?? '0';
  const storagePath = resolve(__dirname, `../../../.qa-kit/auth/user-${idx}.json`);
  await mkdir(dirname(storagePath), { recursive: true });

  await page.goto('/login');
  if (!getLoginCredentialsFromEnv()) {
    throw new Error(
      '[qa-e2e/auth.setup] 请配置 QA_USER 与 QA_PASS 后再运行 setup（勿将真实口令提交到 git）。',
    );
  }
  await fillAndSubmitLoginFormIfConfigured(page);

  await expect(page).not.toHaveURL(/\/login\b/i, { timeout: 60_000 });

  await page.context().storageState({ path: storagePath });
});
