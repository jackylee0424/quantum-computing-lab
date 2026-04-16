# AI Agent Instructions for Quantum Computing Lab

This file contains repo-local instructions for AI coding/testing agents.

## Project structure

- `hosting/` — Next.js app containing the ECC simulator and gate simulator
- `docs/testing/ecc-true-case-comparison.md` — canonical ECC browser parity workflow

## Environment

Run app commands from `hosting/`.

Common validation commands:

```bash
npm run typecheck
npm run build
```

## ECC E2E / browser parity instruction

When asked to verify ECC functionality in a browser, do not rely on the Next.js dev server as the final source of truth.

Reason:
- browser-tool sessions against `npm run dev` may show false negatives because `/_next/webpack-hmr` websocket handshakes can fail, making valid UI interactions appear broken

### Required parity workflow

For ECC browser tests, compare:
- deployed reference: `https://quantum.sciencevr.com`
- local production build: `http://127.0.0.1:3001`

Build and run local production:

```bash
cd hosting
npm run build
PORT=3001 npm run start
```

Then follow the exact workflow documented in:

- `docs/testing/ecc-true-case-comparison.md`
- `docs/testing/ecc-parity-checklist-template.md`

A helper script is available to build and run the local production server for parity checks:

```bash
./scripts/run-ecc-parity-prod.sh
```

A full automated browser harness is also available from `hosting/`:

```bash
npm run test:e2e
```

CI also runs this parity harness automatically through:

```bash
.github/workflows/ecc-browser-parity.yml
```

### Minimum required true-case checks

1. Generated public point flow
   - default subgroup: `5-bit k, n=21, y²=x³+7 mod 31`
   - enter `k = 11`
   - expect:
     - `Q = kG = (20, 28)`
     - `Recover k`
     - visualization label `Q = (20, 28) mod 31`

2. Manual Q flow
   - switch to `Manual Q (x,y)`
   - enter `Q.x = 20`, `Q.y = 28`
   - expect:
     - `Q = (20, 28)`
     - `Recover k`
     - visualization label `Q = (20, 28) mod 31`

### Evidence to capture

For each parity run, record:
- URL tested
- whether browser console emitted errors
- visible success text
- whether `Recover k` appeared
- whether the visualization label updated
- screenshot evidence when possible

## Interpretation rule

If local production matches deployed for the canonical true cases above, treat ECC functionality as parity-preserving for those flows.

If dev-mode browser behavior disagrees with production parity, trust production parity and debug dev-mode separately.
