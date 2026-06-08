---
id: real-bug-001
failureClass: real-bug
strategy: baseline-diff-patch-shape
---

## input

<failingTrace>
expect(page.getByTestId('total')).toHaveText('100.00')
Received: '90.00' — backend rounding off by 10% on every run.
</failingTrace>

<specBefore>
await expect(page.getByTestId('total')).toHaveText('100.00');
</specBefore>

## expected-patch

```diff
# no patch — real product bug. Emit handoff card to engineer. Do not modify spec.
```

## notes

Healer MUST escalate (keyword: "escalate"). Grade on handoff card correctness in P1.
