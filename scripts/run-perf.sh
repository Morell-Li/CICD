#!/usr/bin/env bash
# qa-kit run-perf.sh — emitted by `qa-kit init --preset k6-perf`.
#
# IMPORTANT: do not switch to `set -e`. k6 exits 99 on threshold violations,
# which is the run we most want to analyze; `-e` would skip stage 5.
set -uo pipefail

K6_SCRIPT="${K6_SCRIPT:-qa-perf/scenarios/demo.k6.ts}"
RESULTS_DIR="qa-results/perf"
mkdir -p "${RESULTS_DIR}"

TS="$(date +%Y%m%d-%H%M%S)"

# Stage 1-4: run k6. handleSummary in the scenario writes summary.json;
# --summary-export is kept as a debug-only redundancy.
K6_EXIT=0
k6 run "${K6_SCRIPT}" \
  --summary-export="${RESULTS_DIR}/summary-k6cli.json" \
  --out "web-dashboard=report=${RESULTS_DIR}/dashboard-${TS}.html" \
  || K6_EXIT=$?

echo "k6 exit=${K6_EXIT}"

# Stage 5: baseline + analyze regardless of k6 threshold violations.
# Analyzer reads handleSummary's summary.json (the source of truth).
ANALYZE_EXIT=0
qa-kit perf analyze --summary "${RESULTS_DIR}/summary.json" || ANALYZE_EXIT=$?

# Final exit is driven by the analyzer's verdict, not k6's threshold gate.
exit "${ANALYZE_EXIT}"
