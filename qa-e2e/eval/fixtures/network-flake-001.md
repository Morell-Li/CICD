---
id: network-flake-001
failureClass: network-flake
strategy: baseline-diff-patch-shape
---

## input

<failingTrace>
ECONNRESET on GET /api/orders — retries exhausted after 3 attempts.
Subsequent re-run passes without code change.
</failingTrace>

<specBefore>
test('查看订单列表', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByRole('row')).toHaveCount(10);
});
</specBefore>

## expected-patch

```diff
# no patch — recommend rerun-same-spec; do not modify spec.
```

## notes

Transient. Healer MUST refuse to patch and suggest rerun-by-class; verify the
prompt contains "rerun" and "do not modify".
