import { defineConfig } from "@playwright/test";

const localPort = process.env.ECC_LOCAL_PORT ?? "3001";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${localPort} ../scripts/run-ecc-parity-prod.sh`,
    url: `http://127.0.0.1:${localPort}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
