---
id: selector-drift-001
failureClass: selector-drift
strategy: baseline-diff-patch-shape
---

## input

<failingTrace>
Error: locator.click: Timeout 5000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '买入' })
  - element is not visible
</failingTrace>

<specBefore>
test('限价买入', async ({ page }) => {
  await page.goto('/trade');
  await page.getByRole('button', { name: '买入' }).click();
});
</specBefore>

## expected-patch

```diff
--- a/tests/e2e/demo.spec.ts
+++ b/tests/e2e/demo.spec.ts
@@
-  await page.getByRole('button', { name: '买入' }).click();
+  await page.getByTestId('order-buy-submit').click();
```

## notes

Locator drifts after copy change. P0 heuristic: new locator must target a stable
testId or data-* attribute; keep test intent intact.
