# Quantum Computing Lab

Interactive demos for learning elliptic-curve cryptography and quantum computing through visual simulation. The current app focuses on finite-field elliptic curves, discrete-log attacks, and a gate-level quantum visualization.

## Repository Layout

- `hosting/`: Next.js static site with the ECC simulator and gate simulator.
- `docs/`: supporting documents and workshop material.

## Features

- Visualize points on the curve `y^2 = x^3 + 7 (mod p)`.
- Explore scalar multiplication and public-key generation on small curves.
- Compare classical discrete-log recovery strategies on toy examples.
- Inspect a 3D visualization of measurement outcomes for the quantum demo.

## Quantum Algorithms Reference

| Algorithm / Paper | Year | Problem Solved | Key Innovation | Math / Group Structure |
| --- | --- | --- | --- | --- |
| Deutsch (6 lectures) | 1985 | Is `f(0) = f(1)`? | First quantum parallelism | `Z2` |
| Deutsch-Jozsa | 1992 | Constant vs. balanced | Exponential speedup | `Z2^n` |
| Bernstein-Vazirani | 1993 | Find bitstring `s` | Single-shot string extraction | `Z2^n` (linear) |
| Simon's | 1994 | Find XOR period `s` | Hidden subgroup approach | `Z2^n` (group) |
| Shor's (Discrete Log) | 1994 | `g^x ≡ a (mod p)` | QFT for 2D periods | `Z_(p-1) × Z_(p-1)` |
| Shor's (Factoring) | 1994 | Factors of `N` | Order-finding to factoring | `Z_r ⊂ Z_N` |
| Grover's | 1996 | Unstructured search | Amplitude amplification | Quadratic (`sqrt(N)`) |
| Cleve et al. (Revisited) | 1998 | Unified framework | Deterministic phase kickback | The circuit model |
| Shor's (ECDLP) | Later | Find `k` in `P = kQ` | 2D QFT over elliptic curves | Elliptic curve group |

## Requirements

- Node.js `>=20.9.0`
- npm `>=10`

The app uses Next.js 16 and will not build on older Node releases.

## Local Development

```bash
cd hosting
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

From `hosting/`:

```bash
npm run typecheck
npm run build
```

## Project Status

This repository is intended for educational and research-oriented demos, not production cryptography. The elliptic-curve code uses intentionally small finite fields so the math is visible and interactive.

## Contributing

Issues and pull requests are welcome. For substantial changes, open an issue first so the scope and teaching goals stay aligned with the project.

## License

Released under the MIT License. See [LICENSE](LICENSE).
