import type { Page, Response } from '@playwright/test';

/**
 * 从任意 JSON 文本中宽松抽取「最小提币」与「手续费」数值（字段名大小写不敏感）。
 * 命中多组时取最后一次（列表场景下常为当前选中链）。
 */
export function parseWithdrawConfigFromJson(raw: string): { min?: number; fee?: number } {
  let min: number | undefined;
  let fee: number | undefined;

  const apply = (keys: string[], setter: (n: number) => void) => {
    for (const key of keys) {
      const re = new RegExp(`"${key}"\\s*:\\s*"?([0-9]+(?:\\.[0-9]+)?)"?`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        const n = Number.parseFloat(m[1] ?? '');
        if (Number.isFinite(n)) setter(n);
      }
    }
  };

  apply(
    [
      'minWithdraw',
      'minWithdrawAmount',
      'withdrawMin',
      'minAmount',
      'min_withdraw',
      'minwithdraw',
    ],
    (n) => {
      min = n;
    },
  );
  apply(
    [
      'withdrawFee',
      'withdraw_fee',
      'fee',
      'chainFee',
      'networkFee',
      'handlingFee',
      'withdrawfee',
    ],
    (n) => {
      fee = n;
    },
  );

  return { min, fee };
}

type WithdrawConfigListener = {
  dispose: () => void;
  snapshot: () => { min?: number; fee?: number };
};

/**
 * 监听页面 JSON 响应，累积 min/fee。
 * 不硬编码内部 API 路径，仅过滤 zoomex + application/json。
 */
export function attachWithdrawConfigCollector(page: Page): WithdrawConfigListener {
  let min: number | undefined;
  let fee: number | undefined;

  const onResponse = async (resp: Response) => {
    try {
      if (resp.status() !== 200) return;
      const url = resp.url();
      if (!/zoomex\.com/i.test(url)) return;
      const ct = (resp.headers()['content-type'] ?? '').toLowerCase();
      if (!ct.includes('json')) return;
      const text = await resp.text();
      if (text.length > 2_000_000) return;
      const parsed = parseWithdrawConfigFromJson(text);
      if (parsed.min != null) min = parsed.min;
      if (parsed.fee != null) fee = parsed.fee;
    } catch {
      /* 非 JSON 或截断 */
    }
  };

  page.on('response', onResponse);
  return {
    dispose: () => {
      page.off('response', onResponse);
    },
    snapshot: () => ({ min, fee }),
  };
}
