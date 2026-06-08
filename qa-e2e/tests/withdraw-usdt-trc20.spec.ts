import { test, expect } from '@playwright/test';
import { WithdrawPage } from './po/withdraw.po';
import { attachWithdrawConfigCollector } from './po/withdraw-config';

/** 人工登录等待（见 `WithdrawPage.waitForManualLoginIfNeeded`）+ 用例步骤，总时长需大于全局 30s */
const WITHDRAW_SUITE_TIMEOUT_MS =
  Number(process.env['QA_MANUAL_LOGIN_TIMEOUT_MS'] ?? '300000') + 180_000;

test.describe('出金 USDT / 链切换（可人工登录）', () => {
  test.describe.configure({ timeout: WITHDRAW_SUITE_TIMEOUT_MS });

/**
 * TC-007：页面展示的最小提币金额（含手续费）= 后台下发的 minWithdraw + withdrawFee（从 JSON 响应中解析）。
 * 正向流：USDT + TRC20 + 金额 22 → 点击 Withdraw → 进入二次确认/验证码页。
 *
 * 登录：`goto` 先打开登录页（`QA_LOGIN_ENTRY_PATH`），headed 下人工完成后再进出入金页；有 storageState 时打开 /login 通常会立刻重定向，无需再点。
 * 不接 Geetest、不落明文凭据。
 */
test(
  'TC-007 出金 USDT + TRC20：最小提币展示=接口 min+fee，金额 22 进入二次确认页',
  {
    tag: ['@feature-deposit-withdraw-optimize-3', '@smoke'],
    annotation: [
      { type: 'jira', description: 'null' },
      { type: 'productVersion', description: '3.0' },
      { type: 'runOn', description: 'testnet' },
      { type: 'dataCleaner', description: 'inherit' },
      { type: 'tags', description: '@feature-deposit-withdraw-optimize-3,@smoke' },
      { type: 'caseRef', description: 'qa-design/cases/deposit-withdraw-optimize-3.md#TC-007' },
    ],
  },
  async ({ page, baseURL }) => {
    const collector = attachWithdrawConfigCollector(page);
    try {
      const withdraw = new WithdrawPage(page);

      await withdraw.goto(baseURL ?? 'https://testnet.zoomex.com');
      await withdraw.selectCoin('USDT');
      await withdraw.selectChain('TRC20');

      await expect
        .poll(
          () => {
            const s = collector.snapshot();
            return s.min != null && s.fee != null;
          },
          { timeout: 25_000 },
        )
        .toBe(true);

      const { min, fee } = collector.snapshot();
      expect(min, '应从某条 JSON 响应解析到 minWithdraw').toBeDefined();
      expect(fee, '应从某条 JSON 响应解析到 withdrawFee/fee').toBeDefined();

      const displayed = await withdraw.parseDisplayedMinWithdrawTotal();
      expect(displayed, '应从出金主区域文案或 placeholder 解析到展示用最小提币总额').not.toBeNull();
      expect(displayed!).toBeCloseTo(min! + fee!, 4);

      await withdraw.fillAmount('22');
      await withdraw.submit();

      await expect(
        page.getByRole('heading', { name: /confirm|verify|二次确认|验证码/i }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      collector.dispose();
    }
  },
);

/**
 * 链切换持久化（对应录制里 TRC20 / ERC20 反复切换）：最终回到 TRC20 后 combobox 仍展示 TRC20。
 * 与 TC-005/TC-006（地址簿）独立；此处仅覆盖「选链状态不丢」。
 */
test(
  '链切换 TRC20 → ERC20 → TRC20 后仍展示 TRC20',
  {
    tag: ['@feature-deposit-withdraw-optimize-3'],
    annotation: [
      { type: 'jira', description: 'null' },
      { type: 'productVersion', description: '3.0' },
      { type: 'runOn', description: 'testnet' },
      { type: 'dataCleaner', description: 'inherit' },
      { type: 'tags', description: '@feature-deposit-withdraw-optimize-3' },
      {
        type: 'caseRef',
        description: 'qa-design/cases/deposit-withdraw-optimize-3.md#chain-switch-persistence',
      },
    ],
  },
  async ({ page, baseURL }) => {
    const withdraw = new WithdrawPage(page);
    await withdraw.goto(baseURL ?? 'https://testnet.zoomex.com');
    await withdraw.selectCoin('USDT');
    await withdraw.selectChain('TRC20');
    await withdraw.expectSelectedChainVisible('TRC20');
    await withdraw.selectChain('ERC20');
    await withdraw.expectSelectedChainVisible('ERC20');
    await withdraw.selectChain('TRC20');
    await withdraw.expectSelectedChainVisible('TRC20');
  },
);
});
