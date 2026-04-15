# Talk Proposal Submission

Thank you for submitting a talk for Bitcoin 2026!

Please fill out the sections below as completely as possible.

---

## Title of Talk

From Private Keys to Quantum Threats: A Hands-On Tour of Bitcoin's Elliptic Curve Cryptography

---

## Speaker Name

Jackie Lee

---

## Talk Description

### What is this talk about?

This is an interactive tutorial that walks attendees through the cryptographic foundations of Bitcoin — from private/public key pairs and the SECP256k1 elliptic curve, to the quantum computing threat posed by Shor's algorithm for solving the Elliptic Curve Discrete Logarithm Problem (ECDLP).

Using a purpose-built open-source web simulator, we will demonstrate each concept live:

1. **Public/Private Keys on Elliptic Curve** — What is public key? How it can be broken?
2. **Classical Attacks on ECDLP** — Side-by-side comparison of brute force, Baby-step Giant-step, and Pollard's rho algorithms for recovering a private key from a public key, showing why classical attacks don't scale.
3. **Quantum Computing Fundamentals** — A visual, non-intimidating introduction to qubits, superposition, phase estimation, and quantum parallelism using an interactive 2-qubit Bloch sphere simulator with gate-level controls.
4. **Shor's Algorithm & the ECDLP** — How Shor's algorithm exploits quantum phase estimation to solve the discrete logarithm problem exponentially faster, the qubit and gate resources required, and what this means for Bitcoin's security at real-world key sizes.
5. **Live Quantum Measurement Demo** — Streaming simulated Shor's algorithm measurement outcomes onto a 3D visualization of curve points, showing how quantum "votes" converge on the correct private key.

### What will attendees learn?

- How Bitcoin derives public keys from private keys using elliptic curve scalar multiplication on SECP256k1-like curves.
- Why the Elliptic Curve Discrete Logarithm Problem is computationally hard for classical computers, with intuition for the complexity of brute force (O(n)), BSGS (O(sqrt(n))), Pollard's rho, and Pollard's Kangaroo.
- What qubits, superposition, and quantum gates actually do — demystified through an interactive Bloch sphere visualization.
- How Shor's algorithm reduces the ECDLP to polynomial time, the concrete resource estimates (logical qubits, Toffoli gates, circuit depth) for attacking real curves, and how far current quantum hardware is from posing a practical threat.
- A grounded perspective on the quantum timeline: what needs to happen before Bitcoin's cryptography is at risk, and what the community can do to prepare.

### Why is this talk valuable?

Quantum computing and its implications for Bitcoin are widely discussed but rarely understood at a technical level. Most explanations are either too abstract ("Shor's algorithm breaks ECC") or too academic (pages of number theory with no intuition). This tutorial bridges the gap with a live, visual, interactive approach — attendees can see scalar multiplication happen point-by-point, watch classical attacks slow down as curve order grows, and observe Shor's algorithm converge on a private key in a 3D measurement visualization. Every concept is grounded in a working demo, not slides. Attendees leave with both the conceptual understanding and a free open-source tool they can continue exploring on their own.

---

## Technical Level

- [ ] Beginner
- [x] Intermediate
- [ ] Advanced

---

## Duration

- [ ] 30 minutes
- [ ] 45 minutes
- [x] 60 minutes

---

## Speaker Bio

Jackie Lee

---

## Relevant Links

- GitHub: <!-- TODO: Add repo URL -->
- Live Demo: <!-- TODO: Add deployed URL if available -->

---

## Preferred Day/Time (Optional)

<!-- TODO: Fill in if you have scheduling constraints -->
