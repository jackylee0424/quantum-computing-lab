import { expect, test } from "@playwright/test";

test.describe("/gatesim Mermaid diagram panel", () => {
  test("keeps the 3D circuit visible and opens the Mermaid diagram in a floating panel", async ({ page }) => {
    await page.goto("http://127.0.0.1:3001/gatesim", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Diagram" })).toBeVisible();
    await expect(page.getByLabel("Gold CPHASE Mermaid floating panel")).toBeHidden();

    await page.getByRole("button", { name: "Diagram" }).click();

    const panel = page.getByLabel("Gold CPHASE Mermaid floating panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Gold /gatesim CPHASE prototype");
    await expect(panel).toContainText("flowchart LR");
    await expect(panel).toContainText("Cleve 1998");

    await expect(page.getByRole("button", { name: "Fit" })).toBeVisible();
  });
});
