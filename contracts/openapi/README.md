# OpenAPI 契约

将服务的 OpenAPI 3.x 文件放在此目录（`*.yaml` / `*.yml` / `*.json`）。

| 文件 | 说明 |
|------|------|
| `V2-V5.openapi.json` | APIFOX 导入的主契约（V2–V5） |
| `zoomex-asset.yaml` | QA 示例 / 出入金占位契约 |
| `HANDOFF-required-drift-2026-05-15.md` | **未结**：5 个字段 spec `required` 与 testnet 实际行为不一致；修复后请按 §5 重跑回归 |

鉴权与 APIFOX 前置脚本一致：`timestamp + apiKey + recvWindow + queryString|bodyRaw` → HMAC-SHA256 → `X-BAPI-*` 头。实现见 `qa-e2e/lib/api/apifox-sign.ts`。

更新契约后执行：

```bash
pnpm openapi:sync
```

生成物输出到 `qa-e2e/lib/api/generated/`。

## 调试示例（Testnet）

```bash
QA_ENV=testnet pnpm exec playwright test tests/api/order-realtime.api.spec.ts --project=api
```
