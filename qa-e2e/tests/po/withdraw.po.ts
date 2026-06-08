import { expect, type Page } from '@playwright/test';
import { fillAndSubmitLoginFormIfConfigured } from '../helpers/login-form';

/**
 * WithdrawPage — Zoomex 出金页 Page Object
 *
 * 覆盖：进入出金页 → 选择币种 → 选择网络/链 → 输入提币金额 → 提交（点 Withdraw）。
 * 选择器策略遵循 qa-runner-web：getByRole / getByLabel 优先；下拉选项受组件限制
 * 时退化到稳定文本（链名 / 币名英文常量），不使用 `.css-xxx` / `nth-child`。
 *
 * 注意：录制版本中存在大量动态 id（`#rc_select_0` / `#rc_select_4`），由 antd Select
 * 自增产出；本 PO 改用「点击对应 placeholder/aria」+「在结果中按可见名定位」。
 * 若实际 DOM 结构与本文件不符，请用 Playwright Inspector / browser_snapshot 调整。
 */
function isLikelyLoginUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/login\b/i.test(u.pathname);
  } catch {
    return /\/login/i.test(url);
  }
}

export class WithdrawPage {
  constructor(private readonly page: Page) {}

  /**
   * 若当前 URL 为登录页，阻塞直到人工在浏览器里完成登录（URL 不再匹配 `/login`）。
   * 已有有效会话时若打开 `/login` 被立刻重定向走，本方法会直接返回。
   * - 超时：`QA_MANUAL_LOGIN_TIMEOUT_MS`（默认 300000ms）
   * - CI：默认不等待（直接抛错）；需 `QA_ALLOW_MANUAL_LOGIN_IN_CI=1` 才等待
   * - 建议在 headed 下跑：`QA_E2E_HEADED=1 pnpm test`
   */
  async waitForManualLoginIfNeeded(): Promise<void> {
    if (!isLikelyLoginUrl(this.page.url())) return;

    if (process.env['CI'] === 'true' && process.env['QA_ALLOW_MANUAL_LOGIN_IN_CI'] !== '1') {
      throw new Error(
        '[qa-e2e] 当前为登录页，但 CI 环境默认不等待人工登录。请注入有效 storageState，或设置 QA_ALLOW_MANUAL_LOGIN_IN_CI=1（仅当你确实在可交互 CI 里操作浏览器）。',
      );
    }

    const timeout = Number(process.env['QA_MANUAL_LOGIN_TIMEOUT_MS'] ?? '300000');
    // eslint-disable-next-line no-console -- 给操作者明确提示
    console.log(`[qa-e2e] 检测到登录页，请在浏览器中完成登录（最长等待 ${timeout}ms）…`);

    await expect(this.page).not.toHaveURL(/\/login\b/i, { timeout });

    // 登录成功常被重定向到 return_to（含 Zendesk 等），再拉回出入金页
    // eslint-disable-next-line no-console
    console.log('[qa-e2e] 已离开登录页');
  }

  /**
   * 进入链上出入金/提币主流程页。
   *
   * **流程**：先打开登录页（`QA_LOGIN_ENTRY_PATH`，默认 `/login`）→
   * 若配置了 `QA_USER` / `QA_PASS` 则自动填写并点击登录；仍有验证码/2FA 时由 `waitForManualLoginIfNeeded` 等待人工完成 →
   * 再跳转出入金路径（`QA_WITHDRAW_ENTRY_PATH`，默认 `/user/assets/deposit`）。
   *
   * 不再点击侧栏「Withdraw」链接：易误点 Zendesk/外链。与 PRD 示例一致用直链出入金页。
   */
  async goto(baseURL: string): Promise<void> {
    const origin = baseURL.replace(/\/$/, '');
    const loginPath = process.env['QA_LOGIN_ENTRY_PATH'] ?? '/login';
    const loginUrl = `${origin}${loginPath.startsWith('/') ? '' : '/'}${loginPath}`;
    const depositPath = process.env['QA_WITHDRAW_ENTRY_PATH'] ?? '/user/assets/deposit';
    const depositUrl = `${origin}${depositPath.startsWith('/') ? '' : '/'}${depositPath}`;

    // eslint-disable-next-line no-console -- 给操作者明确步骤
    console.log(
      '[qa-e2e] ① 打开登录页（已配置 QA_USER/QA_PASS 时将自动填写并提交；否则请手动登录）…',
    );
    await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    if (isLikelyLoginUrl(this.page.url())) {
      await fillAndSubmitLoginFormIfConfigured(this.page);
    }
    await this.waitForManualLoginIfNeeded();

    // eslint-disable-next-line no-console
    console.log('[qa-e2e] ② 进入出入金/提币页并执行后续步骤');
    await this.page.goto(depositUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForManualLoginIfNeeded();

    await expect(this.page).not.toHaveURL(/\/login\b/i, { timeout: 30_000 });
    await expect(this.page).not.toHaveURL(/zendesk\.com/i, { timeout: 5_000 });
  }

  async selectCoin(symbol: string): Promise<void> {
    const coinTrigger = this.page.getByRole('combobox').first();
    await coinTrigger.click();
    await coinTrigger.fill(symbol);
    await this.page.getByRole('option', { name: new RegExp(`^${symbol}\\b`, 'i') }).click();
  }

  async selectChain(chain: 'TRC20' | 'ERC20' | 'BSC' | string): Promise<void> {
    const chainCombo = this.page.getByRole('combobox').nth(1);
    await chainCombo.click();
    await this.page.getByRole('option', { name: new RegExp(`^${chain}$`, 'i') }).click();
  }

  async fillAmount(amount: string): Promise<void> {
    const amountInput = this.page.getByRole('textbox', { name: /Minimum withdrawal amount/i });
    await amountInput.click();
    await amountInput.fill(amount);
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /^Withdraw$/i }).click();
  }

  /** 最小提币金额展示（含手续费），TC-007 主断言锚点。 */
  async getMinWithdrawHint(): Promise<string> {
    const hint = this.page.getByRole('textbox', { name: /Minimum withdrawal amount/i });
    return (await hint.getAttribute('placeholder')) ?? '';
  }

  /**
   * 从出金表单区域可见文本中解析「展示用最小提币总额」（含手续费）。
   * 优先匹配形如 `>= 10.5` / `Min 10.5` / `最小 10.5` 的数字；若无则退回 placeholder 内首个数字。
   */
  async parseDisplayedMinWithdrawTotal(): Promise<number | null> {
    const region = this.page.getByRole('main');
    const blob = `${await region.innerText().catch(() => '')}\n${await this.getMinWithdrawHint()}`;
    const patterns = [
      />=\s*([0-9]+(?:\.[0-9]+)?)/i,
      /min(?:imum)?\s*withdraw(?:al)?\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/i,
      /最小(?:提币)?(?:金额)?\s*[：:]\s*([0-9]+(?:\.[0-9]+)?)/,
      /([0-9]+(?:\.[0-9]+)?)\s*USDT/i,
    ];
    for (const re of patterns) {
      const m = blob.match(re);
      if (m?.[1]) {
        const n = Number.parseFloat(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  }

  async expectSelectedChainVisible(chain: string): Promise<void> {
    await expect(this.page.getByRole('combobox').nth(1)).toContainText(chain, { timeout: 10_000 });
  }
}
