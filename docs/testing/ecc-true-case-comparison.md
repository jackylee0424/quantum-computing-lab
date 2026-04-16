# ECC True-Case Comparison Workflow

Use this workflow when you need to verify that the local ECC UI still matches the known-good deployed behavior at https://quantum.sciencevr.com.

This is a browser-based parity check for happy-path / true-case behavior.

## Why this workflow exists

During QA, the local Next.js dev server (`npm run dev`) can produce browser-tool false negatives because the browser session may fail the `/_next/webpack-hmr` websocket handshake. In that state, UI interactions can appear to do nothing even when the app code is correct.

For true-case ECC validation, compare against:
- deployed reference: `https://quantum.sciencevr.com`
- local production build: `npm run build` + `npm run start`

Do not treat `npm run dev` browser behavior as authoritative for parity checks.

## Reference environment

Run from `hosting/`.

Build the app:

```bash
npm run build
```

Start a local production server on a non-default port so it does not conflict with dev:

```bash
PORT=3001 npm run start
```

Or use the helper script from the repo root:

```bash
./scripts/run-ecc-parity-prod.sh
```

For the automated browser harness, run from `hosting/`:

```bash
npm run test:e2e
```

Targets used in comparison:
- deployed: `https://quantum.sciencevr.com`
- local production: `http://127.0.0.1:3001`

## Comparison rules

For a true-case parity check, compare the same user flow on both sites and verify:
1. same controls are visible
2. same success text appears
3. same follow-up action buttons appear
4. same visualization label / point marker appears
5. no browser console errors are emitted during the tested flow

## True case 1: generated public point flow

This is the canonical generated-Q parity check.

### Steps

1. Open the ECC page on the deployed site.
2. Open the ECC page on the local production build.
3. Leave the default subgroup selected:
   - `5-bit k, n=21, y²=x³+7 mod 31`
4. In `Generate Q = kG` mode, enter:
   - `k = 11`
5. Click:
   - `Generate public point (Q=kG)`

### Expected result on both deployed and local production

- validation helper appears before submit:
  - `Valid k = 11. Click 'Generate public point (Q=kG)' to proceed.`
- generated public point result appears after submit:
  - `Q = kG = (20, 28)`
- recovery control appears:
  - `Recover k`
- visualization updates and includes:
  - `Q = (20, 28) mod 31`
- the public point marker is visible in the ECC visualization
- `Classical computing` can still show `No runs yet.` until recovery is run; that is expected

## True case 2: manual Q flow

This is the canonical manual-Q parity check.

### Steps

1. Open the ECC page on the deployed site.
2. Open the ECC page on the local production build.
3. Leave the default subgroup selected:
   - `5-bit k, n=21, y²=x³+7 mod 31`
4. Switch mode from:
   - `Generate Q = kG`
   to:
   - `Manual Q (x,y)`
5. Enter:
   - `Q.x = 20`
   - `Q.y = 28`
6. Click:
   - `Use manual Q`

### Expected result on both deployed and local production

- manual mode is visible with `Q.x` and `Q.y` inputs
- manual point result appears:
  - `Q = (20, 28)`
- recovery control appears:
  - `Recover k`
- visualization updates and includes:
  - `Q = (20, 28) mod 31`
- no subgroup warning is shown for this case
- `Classical computing` can still show `No runs yet.` until recovery is run; that is expected

## Optional same-behavior negative check

This is not a true-case success path, but it is useful as a parity sanity check.

### Steps

1. Switch to `Manual Q (x,y)`.
2. Enter:
   - `Q.x = 1`
   - `Q.y = 1`
3. Click `Use manual Q`.

### Expected result on both deployed and local production

- no valid `Q = (...)` success result is shown
- `Recover k` does not appear
- the page remains in manual-entry mode

Note: at the time this workflow was documented, both deployed and local production behaved the same way here, but did not surface a prominent visible explicit error message in the browser pass.

## Browser checks to record

For each tested flow, capture:
- URL tested
- browser console output after interaction
- visible result text
- whether `Recover k` appears
- whether the visualization label updates
- screenshot evidence

## Recommended evidence checklist

For generated-Q (`k=11`):
- screenshot showing `Q = kG = (20, 28)`
- screenshot or DOM evidence showing `Recover k`
- screenshot or DOM evidence showing `Q = (20, 28) mod 31`

For manual-Q (`20,28`):
- screenshot showing `Q = (20, 28)`
- screenshot or DOM evidence showing `Recover k`
- screenshot or DOM evidence showing `Q = (20, 28) mod 31`

## Interpretation

If deployed and local production match for both canonical true cases above, the ECC page can be treated as parity-preserving for its main public-point flows.

If they diverge, debug the local production build first. Only use the dev server as a debugging convenience, not as the final source of truth for browser parity.
