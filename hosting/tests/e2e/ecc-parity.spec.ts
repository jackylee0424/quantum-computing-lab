import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Target = {
  baseUrl: string;
  name: string;
};

type PageIssueCollector = {
  consoleErrors: string[];
  pageErrors: string[];
};

const deployedBaseUrl = process.env.ECC_DEPLOYED_BASE_URL ?? "https://quantum.sciencevr.com";
const localBaseUrl = process.env.ECC_LOCAL_BASE_URL ?? "http://127.0.0.1:3001";

const targets: Target[] = [
  { name: "deployed", baseUrl: deployedBaseUrl },
  { name: "local-production", baseUrl: localBaseUrl },
];

function attachPageIssueCollector(page: Page): PageIssueCollector {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return { consoleErrors, pageErrors };
}

async function openEccPage(page: Page, baseUrl: string) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#orderSelect")).toHaveValue("21");
  await expect(page.locator("#qMode")).toHaveValue("k");
}

async function assertNoPageErrors(issues: PageIssueCollector, targetName: string) {
  expect.soft(issues.pageErrors, `${targetName}: unexpected page errors`).toEqual([]);
  expect.soft(issues.consoleErrors, `${targetName}: unexpected console errors`).toEqual([]);
}

async function recordScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${name}.png`),
  });
}

test.describe("ECC browser parity", () => {
  for (const target of targets) {
    test(`generated public-point true case matches expectations on ${target.name}`, async ({ page }, testInfo) => {
      const issues = attachPageIssueCollector(page);

      await openEccPage(page, target.baseUrl);
      await page.locator("#kInput").fill("11");
      await expect(page.locator("#pubInfo")).toContainText("Valid k = 11. Click 'Generate public point (Q=kG)' to proceed.");
      await page.locator("#pubBtn").click();

      await expect(page.locator("#pubInfo")).toContainText("Q = kG = (20, 28)");
      await expect(page.locator("#recoverBtn")).toBeVisible();
      await expect(page.locator("body")).toContainText("Q = (20, 28) mod 31");

      await recordScreenshot(page, testInfo, `${target.name}-generated-public-point`);
      await assertNoPageErrors(issues, target.name);
    });

    test(`manual Q true case matches expectations on ${target.name}`, async ({ page }, testInfo) => {
      const issues = attachPageIssueCollector(page);

      await openEccPage(page, target.baseUrl);
      await page.locator("#qMode").selectOption("manual");
      await expect(page.locator("#qXInput")).toBeVisible();
      await expect(page.locator("#qYInput")).toBeVisible();

      await page.locator("#qXInput").fill("20");
      await page.locator("#qYInput").fill("28");
      await page.locator("#setQBtn").click();

      await expect(page.locator("#pubInfo")).toContainText("Q = (20, 28)");
      await expect(page.locator("#recoverBtn")).toBeVisible();
      await expect(page.locator("body")).toContainText("Q = (20, 28) mod 31");
      await expect(page.locator("body")).not.toContainText("may not be in the subgroup");

      await recordScreenshot(page, testInfo, `${target.name}-manual-q`);
      await assertNoPageErrors(issues, target.name);
    });
  }
});
