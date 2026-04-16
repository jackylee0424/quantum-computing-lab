# ECC Browser Parity Checklist Template

Use this template when comparing the ECC page between:
- deployed reference: `https://quantum.sciencevr.com`
- local production build: `http://127.0.0.1:3001`

Reference workflow:
- `docs/testing/ecc-true-case-comparison.md`
- `AGENTS.md`

## Session metadata

- Date:
- Tester / agent:
- Local commit SHA:
- Local server URL:
- Deployed URL:
- Notes:

## Environment setup

- [ ] Ran `cd hosting && npm run build`
- [ ] Started local production server on port 3001
- [ ] Confirmed local production page loads
- [ ] Confirmed deployed page loads
- [ ] Confirmed browser console is clear before interaction on both sites

## True case 1: generated public point flow

### Inputs
- Curve: `5-bit k, n=21, y²=x³+7 mod 31`
- Mode: `Generate Q = kG`
- `k = 11`

### Deployed result
- [ ] Validation helper shown:
  - `Valid k = 11. Click 'Generate public point (Q=kG)' to proceed.`
- [ ] Result shown:
  - `Q = kG = (20, 28)`
- [ ] `Recover k` appears
- [ ] Visualization label shows:
  - `Q = (20, 28) mod 31`
- [ ] No browser console errors
- Screenshot / evidence:

### Local production result
- [ ] Validation helper shown:
  - `Valid k = 11. Click 'Generate public point (Q=kG)' to proceed.`
- [ ] Result shown:
  - `Q = kG = (20, 28)`
- [ ] `Recover k` appears
- [ ] Visualization label shows:
  - `Q = (20, 28) mod 31`
- [ ] No browser console errors
- Screenshot / evidence:

### Parity verdict
- [ ] Identical
- [ ] Different
- Difference notes:

## True case 2: manual Q flow

### Inputs
- Curve: `5-bit k, n=21, y²=x³+7 mod 31`
- Mode: `Manual Q (x,y)`
- `Q.x = 20`
- `Q.y = 28`

### Deployed result
- [ ] Manual inputs shown
- [ ] Result shown:
  - `Q = (20, 28)`
- [ ] `Recover k` appears
- [ ] Visualization label shows:
  - `Q = (20, 28) mod 31`
- [ ] No subgroup warning appears
- [ ] No browser console errors
- Screenshot / evidence:

### Local production result
- [ ] Manual inputs shown
- [ ] Result shown:
  - `Q = (20, 28)`
- [ ] `Recover k` appears
- [ ] Visualization label shows:
  - `Q = (20, 28) mod 31`
- [ ] No subgroup warning appears
- [ ] No browser console errors
- Screenshot / evidence:

### Parity verdict
- [ ] Identical
- [ ] Different
- Difference notes:

## Optional negative parity sanity check

### Inputs
- Mode: `Manual Q (x,y)`
- `Q.x = 1`
- `Q.y = 1`

### Deployed result
- [ ] No valid `Q = (...)` success result shown
- [ ] `Recover k` does not appear
- [ ] No browser console errors
- Evidence:

### Local production result
- [ ] No valid `Q = (...)` success result shown
- [ ] `Recover k` does not appear
- [ ] No browser console errors
- Evidence:

### Parity verdict
- [ ] Identical
- [ ] Different
- Difference notes:

## Final summary

- Generated-Q parity:
- Manual-Q parity:
- Negative-case parity:
- Overall ECC parity result:
- Follow-up action required:
