---
id: assertion-mismatch-001
failureClass: assertion-mismatch
strategy: baseline-diff-patch-shape
---

## input

<failingTrace>
Error: expect(received).toHaveText(expected)
Expected: "已提交"
Received: "提交成功"
</failingTrace>

<specBefore>
await expect(page.getByRole('status')).toHaveText('已提交');
</specBefore>

## expected-patch

```diff
--- a/tests/e2e/demo.spec.ts
+++ b/tests/e2e/demo.spec.ts
@@
-await expect(page.getByRole('status')).toHaveText('已提交');
+await expect(page.getByRole('status')).toHaveText('提交成功');
```

## notes

Expected copy updated by product; adjust matcher only, do not weaken the assertion.
