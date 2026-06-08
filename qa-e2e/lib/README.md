# qa-e2e/lib — 共享代码

> 这个目录里放**被多个 spec 共享的代码**。Playwright 通过 `testIgnore: ['**/lib/**']` 排除本目录，不会被当成测试跑。

## 目录约定

| 子目录 | 放什么 |
|---|---|
| `pages/` | Page Objects（POM，每个页面 = 一个 class） |
| `fixtures/` | Playwright custom fixtures（注意：**不是** eval/fixtures/ 考题） |
| `helpers/` | 工具函数（日期格式、字符串、API client 封装） |
| `api/` | OpenAPI 驱动接口测试（generated client、鉴权、Schema 断言） |
| `data/` | test data factories（生成用例输入数据） |

没用到的子目录不用建。用到再建。

## 在 spec 里怎么 import

`tsconfig.json` 配了 path alias：

```ts
import { LoginPage } from '@qa-e2e/pages/login';
import { testWithAccount } from '@qa-e2e/fixtures/account';
```

即使 spec 嵌在 `tests/orders/limit/buy.spec.ts` 深处，import 路径也不用写 `../../../lib/...`。

## ⚠️ 命名冲突提醒

- `qa-e2e/lib/fixtures/` ← **Playwright fixtures**（代码侧共享 setup）
- `qa-e2e/eval/fixtures/` ← **eval 考题**（AI 回归测试输入）

两个 `fixtures/` 不同概念，别放错了。

## OpenAPI 接口测试

1. 将 OpenAPI 3.x 放入仓库根 `contracts/openapi/`（示例：`zoomex-asset.yaml`）。
2. 生成类型与 Client：`pnpm openapi:sync` → 输出到 `lib/api/generated/`。
3. 用例放在 `tests/api/*.api.spec.ts`，由 Playwright **`api` project** 执行（无浏览器）：

```bash
pnpm test:api
# 或
cd qa-e2e && playwright test --project=api
```

4. 多环境（Test3 / Testnet / Prd）见项目根 [`env/README.md`](../../env/README.md)：
   - 根 `.env` 设 `QA_ENV=testnet` 与账号
   - `env/.env.testnet` 等放各环境 URL（从 `env/*.example` 复制）
   - `QA_API_TOKEN` 可按环境写在对应 `env/.env.<name>` 中

**Live 探测**：若目标环境未部署契约中的 `/api/asset/v1/health`，相关用例会自动 `skip`（CI 可无后端仍绿）。部署后配置鉴权再跑完整套件。

**与 case.md**：`test()` annotation 的 `caseRef` 指向 `qa-design/cases/...#TC-NNN`；契约变更后先 `openapi:sync` 再改断言。
