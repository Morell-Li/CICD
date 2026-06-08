# Handoff｜OpenAPI `required` 字段与运行时行为不一致

> 类别：`assertion-mismatch (spec-side)` / contract-drift
> 收件方：OpenAPI 契约维护（`contracts/openapi/V2-V5.openapi.json` 责任人）
> 发起方：QA · `qa-design/cases/openapi-v3/order.md`
> 发现日期：2026-05-15
> 触发任务：`QA_ENV=testnet pnpm exec playwright test --config=qa-e2e/playwright.config.ts --project=api --grep order-v3`

---

## 1. 背景

`qa-design/cases/openapi-v3/order.md` 由 `scripts/gen-cases-from-openapi.mts` 从
`contracts/openapi/V2-V5.openapi.json` 生成，每个接口的「**TC-NNN5 必填参数缺失验证**」
直接读取 OpenAPI 中 `parameters[].required: true` 与 `requestBody.schema.required[]`，
并在测试中按"逐项缺一项"方式发起请求，断言 `retCode !== 0`（或 HTTP 4xx）。

本次在 Testnet 全量回归 order 接口，发现多组 **contract-drift**：
OpenAPI / case.md 把字段标成 `required`，实际服务在缺失时仍返回 `retCode === 0`。

## 2. 失败明细

| TC | 接口 | 字段 | OpenAPI 当前声明 | 实际 testnet 行为 | 期望修正 |
|---|---|---|---|---|---|
| TC-3005 | `POST /cloud/trade/v3/order/create` | `triggerPrice` | `requestBody.required[]` 含 | 缺失 → `retCode === 0` | 移出 `required[]`（条件单时再校验） |
| TC-3005 | `POST /cloud/trade/v3/order/create` | `positionIdx` | case/契约标必填 | 缺失 → `retCode === 0`（有默认值 0） | `required: false` 或文档注明默认 |
| TC-3005 | `POST /cloud/trade/v3/order/create` | `timeInForce` | case/契约标必填 | 缺失 → `retCode === 0`（默认 GTC） | `required: false` 或文档注明默认 |
| TC-3035 | `GET  /cloud/trade/v3/order/realtime` | `openOnly` | `parameter.required: true` | 缺失 → `retCode === 0` | `required: false` |
| TC-3055 | `GET  /cloud/trade/v3/order/history` | `limit` | `parameter.required: true` | 缺失 → `retCode === 0` | `required: false` |
| TC-3055 | `GET  /cloud/trade/v3/order/history` | `execType` | `parameter.required: true` | 缺失 → `retCode === 0` | `required: false` |
| TC-3065 | `GET  /cloud/trade/v3/execution/list` | `symbol` | `parameter.required: true` | 缺失 → `retCode === 0` | `required: false` |

> 说明：`POST /order/create` 的 `triggerPrice` 仅在 `orderType=Conditional`（条件单）时
> 必填；该约束应表达为 OpenAPI `oneOf` / `discriminator`，而不是无条件 required。
> 如短期内无法建模，至少把它从顶层 `required[]` 中移除。

## 3. 复现

```bash
cd /Users/zm00130ml/AI
QA_ENV=testnet pnpm exec playwright test \
  --config=qa-e2e/playwright.config.ts \
  --project=api \
  --grep "order-v3" \
  --reporter=list
```

trace / error-context 见：

```
qa-results/e2e/test-artifacts/api-order-v3.api-order-v3*/trace.zip
qa-results/e2e/test-artifacts/api-order-v3.api-order-v3*/error-context.md
```

## 4. 期望修正（OpenAPI patch 草案）

> 仅描述需修改的位置，实际改动由契约维护方在 spec 源（Apifox / 后端 IDL）执行；
> 改动后导出到 `contracts/openapi/V2-V5.openapi.json` 即可。

```yaml
# /paths/~1cloud~1trade~1v3~1order~1realtime/get
parameters:
  - name: openOnly
    in: query
    required: false   # was: true

# /paths/~1cloud~1trade~1v3~1order~1history/get
parameters:
  - name: limit
    in: query
    required: false   # was: true
  - name: execType
    in: query
    required: false   # was: true

# /paths/~1cloud~1trade~1v3~1execution~1list/get
parameters:
  - name: symbol
    in: query
    required: false   # was: true

# /paths/~1cloud~1trade~1v3~1order~1create/post
requestBody:
  content:
    application/json:
      schema:
        # 推荐：拆 oneOf 表达条件单 vs 限价单
        # 兜底：从 required[] 中移除 triggerPrice
        required:
          - category
          - symbol
          - side
          - orderType
          - price
          - positionIdx
          - qty
          - reduceOnly
          - closeOnTrigger
          - triggerDirection
          # triggerPrice  ← 移除
```

## 5. 验证（修正后由 QA 执行）

1. 替换 `contracts/openapi/V2-V5.openapi.json`
2. 重新 codegen + 重生成 case.md：

   ```bash
   pnpm openapi:sync
   pnpm openapi:gen-cases
   ```

3. 重跑回归：

   ```bash
   QA_ENV=testnet pnpm exec playwright test \
     --config=qa-e2e/playwright.config.ts \
     --project=api --grep "order-v3" --reporter=list
   ```

4. 期望：上表 5 项 TC 自动从「必填缺失」test 列表中消失，本组 retCode 失败用例归零。

## 6. 临时缓解（在 spec 修正落地前）

QA 侧 `qa-e2e/tests/api/order-v3.api.spec.ts` 的 `ENDPOINTS[].required` 中
对上述 5 个字段标注 `// optional per actual backend, see HANDOFF-required-drift-2026-05-15.md`
并降级为 `test.fixme`，避免 CI 红到看不见新回归；spec 修正后移除标记。

> 不直接动 `contracts/openapi/V2-V5.openapi.json` —— 保留源契约证据，
> 修复以**契约源头**为准。

## 7. 状态轨道

| 时间 | 状态 | 说明 |
|---|---|---|
| 2026-05-15 | 已发现 | 测试 5 failed / 43 passed / 4 skipped |
| TBD | 已派发 | 等待研发 / OpenAPI 维护方接单 |
| TBD | 已修复 | spec 更新并合入 `contracts/openapi/V2-V5.openapi.json` |
| TBD | 已验证 | 重跑 `order-v3` 回归全绿 |

<!-- TBD:#OPENAPI-REQUIRED-DRIFT | 研发-OpenAPI维护方 | 已问待回 | 2026-05-15 | - -->
