#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOSTING_DIR="$ROOT_DIR/hosting"
PORT="${PORT:-3001}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but not installed." >&2
  exit 1
fi

if [ ! -d "$HOSTING_DIR" ]; then
  echo "Error: hosting directory not found at $HOSTING_DIR" >&2
  exit 1
fi

cd "$HOSTING_DIR"

echo "[ecc-parity] Building production app..."
npm run build

echo "[ecc-parity] Starting production server on http://127.0.0.1:$PORT"
echo "[ecc-parity] Reference deployed target: https://quantum.sciencevr.com"
echo "[ecc-parity] Use docs/testing/ecc-true-case-comparison.md for the parity workflow."

exec env PORT="$PORT" npm run start
