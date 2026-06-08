/**
 * 反向合约 ETHUSD 串行套件共享：开跑前/收尾时尽量平仓，减轻多 spec 并行时的仓位叠加。
 */
import type { APIRequestContext } from '@playwright/test';
import { signedGet, signedPost } from '@qa-e2e/api/signed-request';
import { readResponseJson } from './_api-exchange-log.ts';
import { isOpenApiLive } from './_api-env.ts';
import {
  PATH_ORDER_CANCEL_ALL,
  PATH_ORDER_CREATE,
  PATH_POSITION_LIST,
  INVERSE_CATEGORY,
  INVERSE_SETTLE_COIN,
  INVERSE_SYMBOL,
  buildInverseCloseMarketOrderBody,
  findPositionRow,
  pickPositionSide,
  pickPositionSize,
} from './_order-trade.ts';

const POSITION_QUERY: Array<[string, string]> = [
  ['category', INVERSE_CATEGORY],
  ['settleCoin', INVERSE_SETTLE_COIN],
  ['symbol', INVERSE_SYMBOL],
];

type RetEnvelope = { retCode?: number; result?: { list?: Array<Record<string, unknown>> } };

/** cancel-all + 最多 5 轮按实际 size 市价 reduceOnly 平仓 */
export async function ensureInverseSymbolFlat(request: APIRequestContext): Promise<void> {
  if (!(await isOpenApiLive(request))) return;

  await signedPost(request, PATH_ORDER_CANCEL_ALL, {
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await signedGet(request, PATH_POSITION_LIST, { queryEntries: POSITION_QUERY });
    const body = (await readResponseJson(res)) as RetEnvelope;
    if (body.retCode !== 0) return;

    const row = findPositionRow(body.result?.list ?? [], INVERSE_SYMBOL);
    const size = row ? pickPositionSize(row) : 0;
    if (size <= 0) return;

    const side = pickPositionSide(row!);
    const closeSide = side === 'Sell' ? 'Buy' : 'Sell';
    await signedPost(
      request,
      PATH_ORDER_CREATE,
      buildInverseCloseMarketOrderBody({ side: closeSide, qty: String(size) }),
    );
    await new Promise((r) => setTimeout(r, 800));
  }
}
