#!/usr/bin/env node
/**
 * Convert an OpenAPI 3.x spec into qa-kit case.md files (one per group).
 *
 * - Each operation produces one `##### 接口描述：METHOD /path` block with all
 *   10 contract sub-nodes (TC-NNNN), per qa-case-md HTML tag contract.
 * - Fields that cannot be derived from the spec (业务错误码 / 异常展示文案) are
 *   marked TBD instead of fabricated.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPEC_PATH = join(ROOT, 'contracts', 'openapi', 'V2-V5.openapi.json');
const OUT_DIR = join(ROOT, 'qa-design', 'cases', 'openapi-v3');

type Method = 'get' | 'post' | 'put' | 'delete' | 'patch';
type Param = {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: Record<string, unknown>;
  example?: unknown;
};
type Operation = {
  summary?: string;
  description?: string;
  parameters?: Param[];
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown>; example?: unknown }>;
  };
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
  security?: unknown[];
};
type Spec = {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths: Record<string, Partial<Record<Method, Operation>>>;
};

const SIGN_HEADER_NAMES = new Set([
  'X-BAPI-SIGN-TYPE',
  'X-BAPI-SIGN',
  'X-BAPI-API-KEY',
  'X-BAPI-TIMESTAMP',
  'X-BAPI-RECV-WINDOW',
  'Content-Type',
]);

/**
 * 是否为「主站」接口（Zoomex 主站 V5 / 合约公共 V5）。
 * 当前 OpenAPI 测试范围仅覆盖 OpenAPI 网关（V3 + private），主站接口排除。
 */
function isMainStation(path: string): boolean {
  if (path.startsWith('/v5/')) return true;
  if (path.startsWith('/x-api/')) return true;
  return false;
}

/**
 * 按 Zoomex 官方文档（https://zoomexglobal.github.io/docs-tes/zh-TW/v3/）的
 * 顶级目录划分接口归属。文档左侧导航的一级目录为：
 *   account / asset / broker / market / order / position / pre-upgrade /
 *   rate-limit / websocket
 * 同一业务接口在 V3 / private 不同前缀下都归到同一文档目录，
 * 与文档导航保持一一对应。主站（/v5、/x-api）已在 isMainStation 中排除。
 */
function groupOf(path: string): string {
  // pre-upgrade 必须在更通用的 cloud/trade/v3 规则之前
  if (path.startsWith('/cloud/trade/v3/pre-upgrade')) return 'pre-upgrade';
  // apilimit 在文档中归在 rate-limit 章节下
  if (path.startsWith('/cloud/trade/v3/apilimit')) return 'rate-limit';

  // market - 行情
  if (path.startsWith('/cloud/trade/v3/market')) return 'market';

  // order - 委托单 + 成交记录（execution）
  if (path.startsWith('/cloud/trade/v3/order')) return 'order';
  if (path.startsWith('/cloud/trade/v3/execution')) return 'order';

  // position - 持仓 + 保证金模式切换（v3/account/set-margin-mode 在文档归 position/cross-isolate）
  if (path.startsWith('/cloud/trade/v3/position')) return 'position';
  if (path === '/cloud/trade/v3/account/set-margin-mode') return 'position';

  // account - 账户 / 出入金 / 钱包 / 资产划转（合并 docs 中 /v3/account/* 与 /v3/asset/*）
  if (path.startsWith('/cloud/trade/v3/account')) return 'account';
  if (path.startsWith('/cloud/trade/v3/asset')) return 'account';
  if (path.startsWith('/private/v1/asset')) return 'account';

  // broker - 代理商返佣（docs /v3/broker/*）
  if (path.startsWith('/private/v1/broker')) return 'broker';

  return 'misc';
}

const GROUP_TITLE: Record<string, string> = {
  account: '账户 · 钱包 / 出入金 / 资产 / 子母账户划转',
  broker: '代理商 · 返佣 / 下级用户',
  market: '行情 · K 线 / 深度 / 行情面',
  order: '委托单 · 下单 / 改单 / 撤单 / 成交',
  position: '持仓 · 杠杆 / 模式 / 保证金 / TP-SL',
  'pre-upgrade': '升级前数据 · 历史委托 / 成交 / 已实现盈亏',
  'rate-limit': '频控 · API 调用上限',
  misc: '其他（未在 Zoomex 文档目录中归类）',
};

function isSignedOperation(op: Operation, path: string): boolean {
  if (path.startsWith('/private/')) return true;
  return (op.parameters ?? []).some((p) => p.in === 'header' && p.name === 'X-BAPI-API-KEY');
}

function bizParameters(op: Operation): Param[] {
  return (op.parameters ?? []).filter(
    (p) => !(p.in === 'header' && SIGN_HEADER_NAMES.has(p.name)),
  );
}

function jsonSchemaSummary(schema?: Record<string, unknown>): string {
  if (!schema) return '?';
  const t = (schema.type as string) ?? '';
  const fmt = schema.format ? `(${schema.format})` : '';
  const enums = Array.isArray(schema.enum) ? ` enum=${JSON.stringify(schema.enum)}` : '';
  return `${t || '?'}${fmt}${enums}`;
}

function pickRequestBodySchema(
  op: Operation,
): { schema?: Record<string, unknown>; example?: unknown } | undefined {
  const json = op.requestBody?.content?.['application/json'];
  return json;
}

function bodyRequiredList(op: Operation): string[] {
  const schema = pickRequestBodySchema(op)?.schema as
    | { required?: string[]; properties?: Record<string, Record<string, unknown>> }
    | undefined;
  return schema?.required ?? [];
}

function bodyProperties(op: Operation): Record<string, Record<string, unknown>> {
  const schema = pickRequestBodySchema(op)?.schema as
    | { properties?: Record<string, Record<string, unknown>> }
    | undefined;
  return schema?.properties ?? {};
}

function escMd(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/**
 * 已知 OpenAPI 源 spec 中 summary 与 path 错位 / 业务语义不准的接口，
 * 在生成 case.md 时按 `METHOD path` 维度覆盖为业务正确文案（简体中文）。
 * 不直接改 contracts/openapi/V2-V5.openapi.json，保留源契约证据；
 * 若后续 spec 修正，从此表中删除对应条目即可。
 */
const SUMMARY_OVERRIDE: Record<string, string> = {
  'GET /cloud/trade/v3/account/wallet-balance': '查询钱包余额',
  'GET /private/v1/asset/deposit/query-record': '查询充值记录',
};

/**
 * 清掉 OpenAPI summary 里残留的「白名单 / 非白名单」字样（含两侧的常见分隔符），
 * 这些是接口源系统的灰度标识，不属于业务语义，case.md 不应保留。
 * 优先匹配 SUMMARY_OVERRIDE 中的人工修正项。
 */
function cleanSummary(s: string | undefined, key?: string): string {
  if (key && SUMMARY_OVERRIDE[key]) return SUMMARY_OVERRIDE[key]!;
  if (!s) return '';
  return s
    .replace(/[\s\-（(\[【「、,，/]*非?白名单[\s)）\]】」、,，/]*/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTRACT_NAMES = [
  '请求方式',
  '登录态',
  '请求体',
  '预期状态码',
  '预期响应',
  '必填参数缺失验证',
  '错误码验证',
  '边界条件验证',
  '未登录状态验证',
  '异常展示验证',
] as const;

function renderInterfaceBlock(args: {
  method: string;
  path: string;
  summary: string;
  op: Operation;
  startId: number;
  idWidth: number;
}): string {
  const { method, path, summary, op, startId, idWidth } = args;
  const id = (n: number) => `TC-${String(n).padStart(idWidth, '0')}`;
  const signed = isSignedOperation(op, path);
  const params = bizParameters(op);
  const requiredParams = params.filter((p) => p.required);
  const reqBody = pickRequestBodySchema(op);
  const reqRequired = bodyRequiredList(op);
  const reqProps = bodyProperties(op);
  const responseCodes = Object.keys(op.responses ?? {});
  const successCode = responseCodes.find((c) => /^2\d\d$/.test(c)) ?? '（未声明）';

  const lines: string[] = [];
  lines.push(`##### 接口描述：${method} ${path}（${escMd(summary || '')}）`);

  // 1. 请求方式
  lines.push(`###### ${CONTRACT_NAMES[0]} <!-- id:${id(startId)} | 分类:契约 -->`);
  const ct = (op.parameters ?? []).find((p) => p.name === 'Content-Type')?.example ?? 'application/json';
  lines.push(`- ${method}，Content-Type: ${ct}`);

  // 2. 登录态
  lines.push(`###### ${CONTRACT_NAMES[1]} <!-- id:${id(startId + 1)} | 分类:契约 -->`);
  if (signed) {
    lines.push(
      '- 私有接口；必须携带 Zoomex V3 签名头：`X-BAPI-API-KEY` / `X-BAPI-SIGN`（HMAC-SHA256）/ `X-BAPI-SIGN-TYPE: 2` / `X-BAPI-TIMESTAMP` / `X-BAPI-RECV-WINDOW`',
    );
  } else {
    lines.push('- 公共接口；无需签名');
  }

  // 3. 请求体
  lines.push(`###### ${CONTRACT_NAMES[2]} <!-- id:${id(startId + 2)} | 分类:契约 -->`);
  if (params.length === 0 && !reqBody) {
    lines.push('- 无业务参数');
  } else {
    for (const p of params) {
      const r = p.required ? '必填' : '选填';
      const eg = p.example !== undefined ? ` / 示例：\`${String(p.example)}\`` : '';
      lines.push(`- \`${p.name}\` [${p.in}] ${r}：${jsonSchemaSummary(p.schema)}${eg}`);
    }
    if (reqBody) {
      const props = Object.entries(reqProps);
      if (props.length > 0) {
        lines.push('- requestBody (application/json) 字段：');
        for (const [k, schema] of props) {
          const r = reqRequired.includes(k) ? '必填' : '选填';
          lines.push(`  - \`${k}\` ${r}：${jsonSchemaSummary(schema)}`);
        }
      }
      if (reqBody.example) {
        lines.push('- 示例：`' + JSON.stringify(reqBody.example) + '`');
      }
    }
  }

  // 4. 预期状态码
  lines.push(`###### ${CONTRACT_NAMES[3]} <!-- id:${id(startId + 3)} | 分类:契约 -->`);
  lines.push(`- 成功 ${successCode}；业务失败由响应体 \`retCode\` 区分；4xx 路由/鉴权失败；5xx 系统错误`);

  // 5. 预期响应
  lines.push(`###### ${CONTRACT_NAMES[4]} <!-- id:${id(startId + 4)} | 分类:契约 -->`);
  lines.push(
    '- 通用结构：`{ retCode: number, retMsg: string, result: object, retExtInfo: object, time: number }`；`retCode === 0` 视为成功',
  );
  lines.push('- `result` 业务字段以接口文档为准（contracts/openapi/V2-V5.openapi.json 仅声明了空 schema 时按官方文档补充）');

  // 6. 必填参数缺失验证
  lines.push(`###### ${CONTRACT_NAMES[5]} <!-- id:${id(startId + 5)} | 分类:契约,异常路径 -->`);
  const missingTargets = [
    ...requiredParams.map((p) => `\`${p.name}\` [${p.in}]`),
    ...reqRequired.map((k) => `\`${k}\` [body]`),
  ];
  if (missingTargets.length === 0) {
    lines.push('- spec 未声明必填参数；若官方文档存在必填字段需补充验证（待研发确认）');
  } else {
    lines.push(`- 分别缺失下列字段，每次请求验证一项：${missingTargets.join('、')}`);
    lines.push('- 预期：`retCode !== 0`，`retMsg` 提示参数缺失（具体错误码以接口文档为准，待研发确认）');
  }

  // 7. 错误码验证
  lines.push(`###### ${CONTRACT_NAMES[6]} <!-- id:${id(startId + 6)} | 分类:契约,异常路径 -->`);
  lines.push('- spec 未列出业务错误码枚举；至少覆盖：参数错误 / 鉴权失败 / 资源不存在 / 状态非法 / 频控（待研发确认完整清单）');

  // 8. 边界条件验证
  lines.push(`###### ${CONTRACT_NAMES[7]} <!-- id:${id(startId + 7)} | 分类:契约,边界值 -->`);
  const boundaries: string[] = [];
  for (const p of params) {
    const s = p.schema as { enum?: unknown[]; minimum?: number; maximum?: number; maxLength?: number; format?: string } | undefined;
    if (s?.enum) boundaries.push(`\`${p.name}\` 枚举内/外值：${JSON.stringify(s.enum)}`);
    if (s?.minimum !== undefined || s?.maximum !== undefined)
      boundaries.push(`\`${p.name}\` 数值范围 [${s.minimum ?? '-∞'}, ${s.maximum ?? '+∞'}]`);
    if (s?.maxLength !== undefined) boundaries.push(`\`${p.name}\` 长度上界 ${s.maxLength}`);
  }
  if (boundaries.length === 0) {
    lines.push('- spec 未声明数值/长度/枚举边界；按官方文档与业务规则补充（如金额精度、symbol 长度、qty 最小值，待研发确认）');
  } else {
    boundaries.forEach((b) => lines.push(`- ${b}`));
  }

  // 9. 未登录状态验证
  lines.push(`###### ${CONTRACT_NAMES[8]} <!-- id:${id(startId + 8)} | 分类:契约,异常路径 -->`);
  if (signed) {
    lines.push('- 不携带任意 `X-BAPI-*` 签名头 → 预期鉴权失败（具体 `retCode` / HTTP 状态以接口文档为准，待研发确认）');
    lines.push('- 携带过期 `X-BAPI-TIMESTAMP`（超出 `recv_window`） → 预期签名校验失败');
    lines.push('- 篡改 `X-BAPI-SIGN` 任一字符 → 预期签名校验失败');
  } else {
    lines.push('- 公共接口无登录态校验，本项不适用（保留以满足十项契约结构）');
  }

  // 10. 异常展示验证
  lines.push(`###### ${CONTRACT_NAMES[9]} <!-- id:${id(startId + 9)} | 分类:契约,异常路径 -->`);
  lines.push('- 接口失败时，调用方（前端 / 业务系统）的提示文案、重试策略、降级行为待 PRD 补充');
  lines.push('<!-- TBD:#EXC | PM | 未问 | - | - -->');

  lines.push('');
  return lines.join('\n');
}

function renderFile(group: string, ops: Array<{ method: string; path: string; op: Operation }>): string {
  const idWidth = 4;
  const idStart = 3000;
  const title = `OpenAPI 网关 V3｜${GROUP_TITLE[group] ?? group}`;
  const featureSlug = `openapi-v3-${group}`;
  const idEnd = idStart + ops.length * 10 - 1;

  const fm = [
    '---',
    "schemaVersion: '2.0'",
    "productVersion: 'V3-1.0.0'",
    "project: 'zoomex-openapi'",
    `module: '${group}'`,
    `feature: '${featureSlug}'`,
    'jira: null',
    `idWidth: ${idWidth}`,
    'idRange:',
    `  contract: [${idStart}, ${idEnd}]`,
    '---',
    '',
  ].join('\n');

  // 上半：需求分析
  const upper: string[] = [];
  upper.push(`# ${title}`);
  upper.push('');
  upper.push(`## ${group}`);
  upper.push('');
  upper.push('### 纯后端');
  upper.push('');
  upper.push('#### 接口信息');
  upper.push('- 来源：`contracts/openapi/V2-V5.openapi.json`（OpenAPI 3.1，`info.title=V2-V5`，`version=1.0.0`；本组仅保留 OpenAPI 网关 V3，已剔除主站 `/v5/*` 与 `/x-api/*`）');
  upper.push('- 服务器：');
  upper.push('  - test3：`http://ls-trade-openapi-ls-test-1.test.efficiency.ww5sawfyut0k.bitsvc.io`');
  upper.push('  - testnet：`https://openapi-testnet.zoomex.com`');
  upper.push('  - prd：`https://openapi.zoomex.com`');
  upper.push('- 鉴权约定（私有接口，路径 `/private/*` 或 spec 中声明 `X-BAPI-API-KEY` 头）：');
  upper.push('  - 头：`X-BAPI-API-KEY` / `X-BAPI-SIGN`（HMAC-SHA256，hex）/ `X-BAPI-SIGN-TYPE: 2` / `X-BAPI-TIMESTAMP`（毫秒）/ `X-BAPI-RECV-WINDOW`（默认 5000）');
  upper.push('  - 签名 plain text：`timestamp + apiKey + recvWindow + (queryString | jsonBodyString)`');
  upper.push('- 接口清单（本组 ' + ops.length + ' 个）：');
  ops.forEach((o) =>
    upper.push(`  - ${o.method} ${o.path}（${cleanSummary(o.op.summary, `${o.method} ${o.path}`)}）`),
  );
  upper.push('');
  upper.push('## ⚠️ 文档中不清楚或缺失的内容');
  upper.push('- spec 仅给出 200 响应壳，未列出业务 `retCode` 错误码枚举；逐接口需补充（联调前由研发确认）');
  upper.push('- spec 未声明字段的 `enum` / `minimum` / `maxLength` 等边界；按官方文档与业务规则补充');
  upper.push('- 异常展示文案（前端 Toast / 后台告警 / 重试策略）未在 spec 中描述，需 PRD 与设计稿补充');
  upper.push('- 私有接口的频控阈值（按 apikey / 按接口）未在 spec 中给出，待研发确认');
  upper.push('<!-- TBD:#OPENAPI-RETCODES | 研发 | 未问 | - | - -->');
  upper.push('');

  // 下半：测试用例
  const lower: string[] = [];
  lower.push('---');
  lower.push('');
  lower.push(`# ${title} 测试用例`);
  lower.push('');
  lower.push(`## ${group}`);
  lower.push('');
  lower.push('### C端');
  lower.push('');
  lower.push('#### 前端功能交互测试');
  lower.push('');
  lower.push('##### （本组为纯接口契约，无 C 端前端交互）');
  lower.push('- 前置条件：本组接口面向系统集成方（OpenAPI 调用方），不直接面向终端用户');
  lower.push('- 步骤：不适用');
  lower.push('- 预期结果：不适用');
  lower.push('');
  lower.push('#### 后端业务逻辑测试');
  lower.push('');

  ops.forEach((o, idx) => {
    lower.push(
      renderInterfaceBlock({
        method: o.method,
        path: o.path,
        summary: cleanSummary(o.op.summary, `${o.method} ${o.path}`),
        op: o.op,
        startId: idStart + idx * 10,
        idWidth,
      }),
    );
  });

  lower.push('### B端');
  lower.push('');
  lower.push('#### 前端功能交互测试');
  lower.push('');
  lower.push('##### （本组为纯接口契约，无 B 端前端交互）');
  lower.push('- 前置条件：不适用');
  lower.push('- 步骤：不适用');
  lower.push('- 预期结果：不适用');
  lower.push('');
  lower.push('#### 后端业务逻辑测试');
  lower.push('');
  lower.push('##### （本组无 B 端独立后端业务用例；接口契约见 C 端 → 后端业务逻辑测试）');
  lower.push('- 前置条件：不适用');
  lower.push('- 触发方式：不适用');
  lower.push('- 预期结果：不适用');
  lower.push('');

  return fm + upper.join('\n') + '\n' + lower.join('\n');
}

async function main(): Promise<void> {
  const raw = await readFile(SPEC_PATH, 'utf8');
  const spec = JSON.parse(raw) as Spec;
  const groups: Record<string, Array<{ method: string; path: string; op: Operation }>> = {};
  let skippedMain = 0;
  for (const [path, item] of Object.entries(spec.paths)) {
    if (isMainStation(path)) {
      for (const m of ['get', 'post', 'put', 'delete', 'patch'] as Method[]) {
        if (item?.[m]) skippedMain += 1;
      }
      continue;
    }
    for (const m of ['get', 'post', 'put', 'delete', 'patch'] as Method[]) {
      const op = item?.[m];
      if (!op) continue;
      const g = groupOf(path);
      (groups[g] ||= []).push({ method: m.toUpperCase(), path, op });
    }
  }
  console.log(`[gen] skipped ${skippedMain} mainstation operation(s) (paths under /v5/ or /x-api/)`);
  await mkdir(OUT_DIR, { recursive: true });

  let totalTc = 0;
  for (const [g, ops] of Object.entries(groups)) {
    const md = renderFile(g, ops);
    const out = join(OUT_DIR, `${g}.md`);
    await writeFile(out, md, 'utf8');
    const tcCount = ops.length * 10;
    totalTc += tcCount;
    console.log(`[gen] ${g}.md: ${ops.length} ops, ${tcCount} TC → ${out}`);
  }
  console.log(`[gen] done. groups=${Object.keys(groups).length}, total TC=${totalTc}`);
}

main().catch((err) => {
  console.error('[gen] failed:', err);
  process.exit(2);
});
