/**
 * OpenAPI V3 交易类接口共享常量与请求体（order / position 串行流程复用）。
 */
export const PATH_ORDER_CREATE = '/cloud/trade/v3/order/create';
export const PATH_ORDER_AMEND = '/cloud/trade/v3/order/amend';
export const PATH_ORDER_CANCEL = '/cloud/trade/v3/order/cancel';
export const PATH_ORDER_CANCEL_ALL = '/cloud/trade/v3/order/cancel-all';
export const PATH_ORDER_REALTIME = '/cloud/trade/v3/order/realtime';
export const PATH_ORDER_HISTORY = '/cloud/trade/v3/order/history';
export const PATH_EXECUTION_LIST = '/cloud/trade/v3/execution/list';
export const PATH_POSITION_LIST = '/cloud/trade/v3/position/list';
export const PATH_POSITION_SET_TPSL_MODE = '/cloud/trade/v3/position/set-tpsl-mode';
export const PATH_POSITION_TRADING_STOP = '/cloud/trade/v3/position/trading-stop';
export const PATH_QUERY_ASSET_INFO = '/cloud/trade/v3/asset/transfer/query-asset-info';
export const PATH_WALLET_BALANCE = '/cloud/trade/v3/account/wallet-balance';

export const LINEAR_CATEGORY = 'linear';
/** @deprecated 使用 LINEAR_CATEGORY；保留别名兼容既有 spec */
export const ORDER_CATEGORY = LINEAR_CATEGORY;

export const INVERSE_CATEGORY = 'inverse';
/** Testnet 默认 ETHUSD：结算币 ETH 需已开启 collateral（统一账户） */
export const INVERSE_SYMBOL = process.env['QA_API_INVERSE_SYMBOL']?.trim() || 'ETHUSD';
export const INVERSE_SETTLE_COIN =
  process.env['QA_API_INVERSE_SETTLE_COIN']?.trim() ||
  inverseSettleCoinFromSymbol(INVERSE_SYMBOL);
/** 反向合约 qty 为张数；ETHUSD 单张名义约 1 USD，默认 10 张满足最小 5 USD */
export const INVERSE_QTY = process.env['QA_API_INVERSE_QTY']?.trim() || '10';
export const INVERSE_LIMIT_SIDE = process.env['QA_API_INVERSE_LIMIT_SIDE']?.trim() || 'Sell';
/** 反向合约限价：远离市价挂单（卖单高价） */
export const INVERSE_LIMIT_PRICE = process.env['QA_API_INVERSE_LIMIT_PRICE']?.trim() || '50000';
export const INVERSE_LIMIT_AMEND_PRICE =
  process.env['QA_API_INVERSE_LIMIT_AMEND_PRICE']?.trim() || '49999';
/** Testnet ETHUSD 市价 Buy 开仓易触发 30208（max buying price），默认 Sell 开 / Buy 平 */
export const INVERSE_MARKET_OPEN_SIDE =
  process.env['QA_API_INVERSE_MARKET_OPEN_SIDE']?.trim() || 'Sell';
export const INVERSE_MARKET_CLOSE_SIDE =
  process.env['QA_API_INVERSE_MARKET_CLOSE_SIDE']?.trim() || 'Buy';

export const ORDER_SYMBOL = process.env['QA_API_ORDER_SYMBOL']?.trim() || 'ETHUSDT';
export const ORDER_QTY = process.env['QA_API_ORDER_QTY']?.trim() || '0.01';

export const SPOT_CATEGORY = 'spot';
export const SPOT_SYMBOL = process.env['QA_API_SPOT_SYMBOL']?.trim() || ORDER_SYMBOL;
export const SPOT_QTY = process.env['QA_API_SPOT_QTY']?.trim() || ORDER_QTY;
/** 默认 Buy + 低价：仅需 USDT，避免卖单缺 base 币 */
export const SPOT_LIMIT_SIDE = process.env['QA_API_SPOT_LIMIT_SIDE']?.trim() || 'Buy';
/** 远离市价挂单：现货限价卖用高价、买用低价 */
/** 买单：高于交易所最低价、远低于市价，保证挂单不成交 */
export const SPOT_LIMIT_PRICE =
  process.env['QA_API_SPOT_LIMIT_PRICE']?.trim() ||
  (SPOT_LIMIT_SIDE === 'Buy' ? '0.02' : '100');
export const SPOT_LIMIT_AMEND_PRICE =
  process.env['QA_API_SPOT_LIMIT_AMEND_PRICE']?.trim() ||
  (SPOT_LIMIT_SIDE === 'Buy' ? '0.03' : '99');
export const SPOT_MARKET_OPEN_SIDE = process.env['QA_API_SPOT_MARKET_OPEN_SIDE']?.trim() || 'Buy';
export const SPOT_MARKET_CLOSE_SIDE = process.env['QA_API_SPOT_MARKET_CLOSE_SIDE']?.trim() || 'Sell';
export const SPOT_BASE_COIN =
  process.env['QA_API_SPOT_BASE_COIN']?.trim() || spotBaseCoinFromSymbol(SPOT_SYMBOL);
export const ORDER_PRICE = process.env['QA_API_ORDER_PRICE']?.trim() || '5000';
export const ORDER_SIDE = process.env['QA_API_ORDER_SIDE']?.trim() || 'Sell';
export const ORDER_TIME_IN_FORCE = process.env['QA_API_ORDER_TIME_IN_FORCE']?.trim() || 'GTC';
export const ORDER_SETTLE_COIN = process.env['QA_API_ORDER_SETTLE_COIN']?.trim() || 'USDT';
export const ORDER_POSITION_MODE =
  process.env['QA_API_POSITION_MODE']?.trim().toLowerCase() || 'oneway';
export const INVERSE_POSITION_MODE =
  process.env['QA_API_INVERSE_POSITION_MODE']?.trim().toLowerCase() || 'oneway';

/** 市价单数量：Testnet 最小名义价值约 5 USDT；ETHUSDT 默认 0.01 */
export const MARKET_ORDER_QTY = process.env['QA_API_MARKET_ORDER_QTY']?.trim() || ORDER_QTY;
export const MARKET_OPEN_SIDE = process.env['QA_API_MARKET_OPEN_SIDE']?.trim() || 'Buy';
export const MARKET_CLOSE_SIDE = process.env['QA_API_MARKET_CLOSE_SIDE']?.trim() || 'Sell';

export const TP_SL_MODE = process.env['QA_API_TP_SL_MODE']?.trim() || 'Full';
export const TP_TRIGGER_BY = process.env['QA_API_TP_TRIGGER_BY']?.trim() || 'MarkPrice';
export const SL_TRIGGER_BY = process.env['QA_API_SL_TRIGGER_BY']?.trim() || 'MarkPrice';
/** 相对标记价偏移比例（多仓：TP=mark*(1+tp)，SL=mark*(1-sl)） */
export const TP_OFFSET_RATIO = Number(process.env['QA_API_TP_OFFSET_RATIO'] ?? '0.15');
export const SL_OFFSET_RATIO = Number(process.env['QA_API_SL_OFFSET_RATIO'] ?? '0.15');

export type CreateOrderResult = { orderId?: string; orderLinkId?: string };

/** Testnet 业务入参：linear 市价开仓（无 price / timeInForce） */
export function spotBaseCoinFromSymbol(symbol: string): string {
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  if (symbol.endsWith('USDC')) return symbol.slice(0, -4);
  return symbol;
}

export function positionIdxForOrderSide(side: string): number {
  if (ORDER_POSITION_MODE === 'hedge') {
    return side === 'Buy' ? 1 : 2;
  }
  return 0;
}

export function inversePositionIdxForOrderSide(side: string): number {
  if (INVERSE_POSITION_MODE === 'hedge') {
    return side === 'Buy' ? 1 : 2;
  }
  return 0;
}

/** 反向合约 settleCoin：XRPUSD → XRP，BTCUSD → BTC */
export function inverseSettleCoinFromSymbol(symbol: string): string {
  if (symbol.endsWith('USDT')) return symbol.slice(0, -4);
  if (symbol.endsWith('USDC')) return symbol.slice(0, -4);
  if (symbol.endsWith('USD')) return symbol.slice(0, -3);
  return symbol;
}

/** 反向合约限价卖单（挂单不成交） */
export function buildInverseLimitOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const side = String(overrides?.['side'] ?? INVERSE_LIMIT_SIDE);
  return {
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
    side,
    orderType: 'Limit',
    price: INVERSE_LIMIT_PRICE,
    positionIdx: inversePositionIdxForOrderSide(side),
    qty: INVERSE_QTY,
    timeInForce: ORDER_TIME_IN_FORCE,
    orderLinkId: `qa-inverse-limit-v3-${Date.now()}`,
    ...overrides,
  };
}

/** 反向合约市价开仓 */
export function buildInverseCreateMarketOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const side = String(overrides?.['side'] ?? INVERSE_MARKET_OPEN_SIDE);
  return {
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
    side,
    orderType: 'Market',
    positionIdx: inversePositionIdxForOrderSide(side),
    qty: INVERSE_QTY,
    reduceOnly: false,
    closeOnTrigger: false,
    orderLinkId: `qa-inverse-market-v3-${Date.now()}`,
    ...overrides,
  };
}

/** 反向合约市价平仓 */
export function buildInverseCloseMarketOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return buildInverseCreateMarketOrderBody({
    side: INVERSE_MARKET_CLOSE_SIDE,
    positionIdx: inversePositionIdxForOrderSide(INVERSE_MARKET_OPEN_SIDE),
    reduceOnly: true,
    orderLinkId: `qa-inverse-market-close-v3-${Date.now()}`,
    ...overrides,
  });
}

export function buildCreateMarketOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const side = String(overrides?.['side'] ?? MARKET_OPEN_SIDE);
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    side,
    orderType: 'Market',
    positionIdx: positionIdxForOrderSide(side),
    qty: MARKET_ORDER_QTY,
    reduceOnly: false,
    closeOnTrigger: false,
    orderLinkId: `qa-market-v3-${Date.now()}`,
    ...overrides,
  };
}

/** 市价平仓：与开仓反向 + reduceOnly */
export function buildCloseMarketOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return buildCreateMarketOrderBody({
    side: MARKET_CLOSE_SIDE,
    positionIdx: positionIdxForOrderSide(MARKET_OPEN_SIDE),
    reduceOnly: true,
    orderLinkId: `qa-market-close-v3-${Date.now()}`,
    ...overrides,
  });
}

const CLOSE_LIMIT_SLIP = Number(process.env['QA_API_CLOSE_LIMIT_SLIP'] ?? '0.05');

function formatCloseLimitPrice(price: number): string {
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.1) return price.toFixed(4);
  return price.toFixed(6);
}

/**
 * testnet 薄深度时 IOC 市价 reduceOnly 易 EC_NoImmediateQtyToFill；
 * 用标记价 ± slip 的限价 IOC 兜底，卖平多折价、买平空溢价。
 */
export function buildAggressiveCloseLimitBody(params: {
  side: string;
  qty: string;
  positionIdx: number;
  markPrice: number;
}): Record<string, unknown> {
  const slip = Number.isFinite(CLOSE_LIMIT_SLIP) && CLOSE_LIMIT_SLIP > 0 ? CLOSE_LIMIT_SLIP : 0.05;
  const raw =
    params.side === 'Sell'
      ? params.markPrice * (1 - slip)
      : params.markPrice * (1 + slip);
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    side: params.side,
    orderType: 'Limit',
    price: formatCloseLimitPrice(raw),
    positionIdx: params.positionIdx,
    qty: params.qty,
    reduceOnly: true,
    closeOnTrigger: false,
    timeInForce: 'IOC',
    orderLinkId: `qa-limit-close-v3-${Date.now()}`,
  };
}

/** Testnet 业务入参：XRPUSDT 限价卖单 GTC */
/** 现货限价单（无 positionIdx / reduceOnly） */
export function buildSpotLimitOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    category: SPOT_CATEGORY,
    symbol: SPOT_SYMBOL,
    side: SPOT_LIMIT_SIDE,
    orderType: 'Limit',
    price: SPOT_LIMIT_PRICE,
    qty: SPOT_QTY,
    timeInForce: ORDER_TIME_IN_FORCE,
    orderLinkId: `qa-spot-limit-v3-${Date.now()}`,
    ...overrides,
  };
}

/** 现货市价买入 */
export function buildSpotMarketBuyBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    category: SPOT_CATEGORY,
    symbol: SPOT_SYMBOL,
    side: SPOT_MARKET_OPEN_SIDE,
    orderType: 'Market',
    qty: MARKET_ORDER_QTY,
    orderLinkId: `qa-spot-market-v3-${Date.now()}`,
    ...overrides,
  };
}

/** 现货市价卖出（回笼，无 reduceOnly） */
export function buildSpotMarketSellBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    category: SPOT_CATEGORY,
    symbol: SPOT_SYMBOL,
    side: SPOT_MARKET_CLOSE_SIDE,
    orderType: 'Market',
    qty: MARKET_ORDER_QTY,
    orderLinkId: `qa-spot-market-sell-v3-${Date.now()}`,
    ...overrides,
  };
}

export function buildCreateOrderBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  const side = String(overrides?.['side'] ?? ORDER_SIDE);
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    side,
    orderType: 'Limit',
    price: ORDER_PRICE,
    positionIdx: positionIdxForOrderSide(side),
    qty: ORDER_QTY,
    timeInForce: ORDER_TIME_IN_FORCE,
    orderLinkId: `qa-order-v3-${Date.now()}`,
    ...overrides,
  };
}

/** realtime / history 返回字段多为 PascalCase（如 OrderId） */
export function pickOrderId(row: Record<string, unknown>): string | undefined {
  const id = row['OrderId'] ?? row['orderId'];
  return typeof id === 'string' ? id : undefined;
}

export function pickOrderStatus(row: Record<string, unknown>): string | undefined {
  const s = row['OrderStatus'] ?? row['orderStatus'];
  return s != null ? String(s) : undefined;
}

export function pickPositionSize(row: Record<string, unknown>): number {
  const raw = row['size'] ?? row['Size'];
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** 线性合约下单数量：避免 JS 浮点误差，兼容 XRP（整数/0.1）与 ETH（0.001） */
export function normalizeLinearOrderQty(qty: number | string): string {
  const n = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (!Number.isFinite(n) || n <= 0) return '0';
  for (const decimals of [3, 2, 1, 0]) {
    const factor = 10 ** decimals;
    const rounded = Math.round(n * factor) / factor;
    if (decimals === 0 || Math.abs(rounded - n) < 1e-8) {
      if (decimals === 0) return String(rounded);
      return rounded.toFixed(decimals).replace(/\.?0+$/, '');
    }
  }
  return String(n);
}

export function pickCumExecQty(row: Record<string, unknown>): string {
  const raw = row['cumExecQty'] ?? row['CumExecQty'];
  if (raw == null || raw === '') return '0';
  return normalizeLinearOrderQty(String(raw));
}

export function pickPositionIdx(row: Record<string, unknown>): number {
  const raw = row['positionIdx'] ?? row['PositionIdx'];
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function findPositionRow(
  list: Array<Record<string, unknown>>,
  symbol: string,
): Record<string, unknown> | undefined {
  return list.find((row) => String(row['symbol'] ?? row['Symbol'] ?? '') === symbol);
}

/** hedge 模式下同一 symbol 有多条仓位，须按 positionIdx 精确匹配 */
export function findPositionRowByIdx(
  list: Array<Record<string, unknown>>,
  symbol: string,
  positionIdx: number,
): Record<string, unknown> | undefined {
  return list.find((row) => {
    if (String(row['symbol'] ?? row['Symbol'] ?? '') !== symbol) return false;
    return pickPositionIdx(row) === positionIdx;
  });
}

export function pickMarkPrice(row: Record<string, unknown>): number {
  const raw = row['markPrice'] ?? row['MarkPrice'];
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function pickPositionSide(row: Record<string, unknown>): string {
  const side = row['side'] ?? row['Side'];
  return side != null ? String(side) : '';
}

export function pickTpSlFromPosition(row: Record<string, unknown>): {
  takeProfit: string;
  stopLoss: string;
} {
  const takeProfit = String(row['takeProfit'] ?? row['TakeProfit'] ?? '').trim();
  const stopLoss = String(row['stopLoss'] ?? row['StopLoss'] ?? '').trim();
  return { takeProfit, stopLoss };
}

export function buildSetTpslModeBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    tpSlMode: TP_SL_MODE,
    ...overrides,
  };
}

export function buildInverseSetTpslModeBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return buildSetTpslModeBody({
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
    ...overrides,
  });
}

function formatTpSlPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/** 按标记价为持仓设置止盈止损（默认多仓：TP 上、SL 下） */
export function buildTradingStopBody(
  markPrice: number,
  positionSide: string,
  overrides?: Partial<Record<string, unknown>>,
  openSideDefault: string = MARKET_OPEN_SIDE,
): Record<string, unknown> {
  const isLong =
    positionSide === 'Buy' || positionSide === '' || openSideDefault === 'Buy';
  const tp = isLong
    ? markPrice * (1 + TP_OFFSET_RATIO)
    : markPrice * (1 - TP_OFFSET_RATIO);
  const sl = isLong
    ? markPrice * (1 - SL_OFFSET_RATIO)
    : markPrice * (1 + SL_OFFSET_RATIO);
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    takeProfit: formatTpSlPrice(tp),
    stopLoss: formatTpSlPrice(sl),
    tpTriggerBy: TP_TRIGGER_BY,
    slTriggerBy: SL_TRIGGER_BY,
    positionIdx: positionIdxForOrderSide(positionSide || openSideDefault),
    ...overrides,
  };
}

export function buildInverseTradingStopBody(
  markPrice: number,
  positionSide: string,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return buildTradingStopBody(markPrice, positionSide, {
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
    positionIdx: inversePositionIdxForOrderSide(positionSide || INVERSE_MARKET_OPEN_SIDE),
    ...overrides,
  }, INVERSE_MARKET_OPEN_SIDE);
}

/** 清除持仓止盈止损 */
export function buildClearTradingStopBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    category: LINEAR_CATEGORY,
    symbol: ORDER_SYMBOL,
    takeProfit: '0',
    stopLoss: '0',
    tpTriggerBy: TP_TRIGGER_BY,
    slTriggerBy: SL_TRIGGER_BY,
    positionIdx: positionIdxForOrderSide(MARKET_OPEN_SIDE),
    ...overrides,
  };
}

export function buildInverseClearTradingStopBody(
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  return buildClearTradingStopBody({
    category: INVERSE_CATEGORY,
    symbol: INVERSE_SYMBOL,
    positionIdx: inversePositionIdxForOrderSide(INVERSE_MARKET_OPEN_SIDE),
    ...overrides,
  });
}

function extractCoinRowBalance(row: Record<string, unknown>): number {
  for (const key of [
    'walletBalance',
    'free',
    'availableBalance',
    'availableToWithdraw',
    'transferBalance',
    'equity',
  ]) {
    const raw = row[key];
    const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** wallet-balance：仅匹配目标 coin（支持 result.list[].coin[]），不误读其他币种 */
export function pickSpotCoinBalance(result: unknown, coin: string): number {
  if (result == null) return 0;
  const target = coin.toUpperCase();

  if (Array.isArray(result)) {
    for (const item of result) {
      const n = pickSpotCoinBalance(item, coin);
      if (n > 0) return n;
    }
    return 0;
  }

  if (typeof result !== 'object') return 0;
  const row = result as Record<string, unknown>;
  const rowCoin = String(row['coin'] ?? row['Coin'] ?? '').toUpperCase();
  if (rowCoin === target) {
    return extractCoinRowBalance(row);
  }

  const nestedCoinList = row['coin'] ?? row['Coin'];
  if (Array.isArray(nestedCoinList)) {
    for (const c of nestedCoinList as Array<Record<string, unknown>>) {
      const n = pickSpotCoinBalance(c, coin);
      if (n > 0) return n;
    }
  }

  const list = row['list'];
  if (Array.isArray(list)) {
    for (const item of list) {
      const n = pickSpotCoinBalance(item, coin);
      if (n > 0) return n;
    }
  }

  return 0;
}

/** 现货余额查询：优先 UNIFIED，兼容 SPOT 账户类型 */
export const SPOT_WALLET_QUERY_VARIANTS: Array<Array<[string, string]>> = [
  [['accountType', 'UNIFIED']],
  [['accountType', 'SPOT']],
];
