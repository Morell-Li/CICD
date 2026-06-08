# Demo: Playwright + Chrome Alive

> 业务向 QA 在这里用自然语言写测试场景描述。spec.md 是业务文档，工具不解析其 frontmatter。

## 场景：自包含的健康检查

1. 向浏览器注入一段静态 HTML（`page.setContent`）
2. 期望 title 等于 "qa-kit demo"
3. 期望页面有一个 `h1` "qa-kit demo"
4. 期望页面有一个按钮 "hello"

## 备注

这是 `qa-kit init` 自带的 demo，**不依赖任何外部服务 / baseURL / 登录态**，一跑即过。
验证 Playwright / 系统 Chrome / qa-kit runner 三件事都活着。

删除前请先跑通：

- `pnpm test`

删除后开始真实业务用例：

- `/qa:draft-e2e qa-e2e/specs/<feature>.md` 让 AI 起草新 spec.ts
