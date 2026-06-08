---
id: data-race-001
failureClass: data-race
strategy: baseline-diff-patch-shape
---

## input

<failingTrace>
expect(locator).toHaveText — received "" at attempt 1/1.
Element appears 120ms after assertion.
</failingTrace>

<specBefore>
await page.getByRole('button', { name: '刷新' }).click();
await expect(page.getByTestId('balance')).toHaveText('1,234.56');
</specBefore>

## expected-patch

```diff
--- a/tests/e2e/demo.spec.ts
+++ b/tests/e2e/demo.spec.ts
@@
 await page.getByRole('button', { name: '刷新' }).click();
+await page.waitForResponse((r) => r.url().includes('/api/balance'));
 await expect(page.getByTestId('balance')).toHaveText('1,234.56');
```

## notes

Add deterministic await; never sleep.
