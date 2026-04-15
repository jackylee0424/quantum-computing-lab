# Quantum Computing Lab

Interactive demos for learning elliptic-curve cryptography and quantum computing through visual simulation. The current app focuses on finite-field elliptic curves, discrete-log attacks, and a gate-level quantum visualization.

<img width="1130" height="830" alt="ECC simulator" src="https://github.com/user-attachments/assets/2d34f9ad-bd7c-49a9-ba30-fd4e271a8a67" />

<img width="1299" height="779" alt="CPhase circuit" src="https://github.com/user-attachments/assets/78dc5844-b15c-4e21-89cb-dbdccf31c6ff" />



## Repository Layout

- `hosting/`: Next.js static site with the ECC simulator and gate simulator.
- `docs/`: supporting documents and workshop material.

## Features

- Visualize points on the curve `y^2 = x^3 + 7 (mod p)`.
- Explore scalar multiplication and public-key generation on small curves.
- Compare classical discrete-log recovery strategies on toy examples.
- Inspect a 3D visualization of measurement outcomes for the quantum demo.

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
