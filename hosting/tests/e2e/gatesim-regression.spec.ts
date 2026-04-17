import { expect, test } from "@playwright/test";

type GateSimSnapshot = {
  q1CircuitVisible: boolean;
  gateEnabled: { h1: boolean; cphase: boolean; phase: boolean; h2: boolean };
  visibleSphereCount: number;
  shotCounts: { q0: [number, number]; q1: [number, number] };
  photonCount: number;
  outputText: string;
  q0MeasurementText: string;
  q1MeasurementText: string;
};

test.describe("/gatesim regression harness", () => {
  test("keeps core interactions and calculations intact", async ({ page }) => {
    await page.goto("http://127.0.0.1:3001/gatesim", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Show |ψ⟩" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show spheres" })).toBeVisible();

    const initial = await page.evaluate(() => {
      const api = (window as any).__gatesimTestApi__;
      return api.snapshot() as GateSimSnapshot;
    });

    expect(initial.q1CircuitVisible).toBe(false);
    expect(initial.visibleSphereCount).toBe(0);
    expect(initial.gateEnabled).toEqual({ h1: false, cphase: false, phase: false, h2: false });
    expect(initial.outputText).toContain("P(q0=0)=1.000");

    await page.getByRole("button", { name: "Show |ψ⟩" }).click();
    await expect(page.getByRole("button", { name: "Hide |ψ⟩" })).toBeVisible();

    await page.getByRole("button", { name: "Show spheres" }).click();
    await expect(page.getByRole("button", { name: "Hide spheres" })).toBeVisible();

    const afterUiToggles = await page.evaluate(() => {
      const api = (window as any).__gatesimTestApi__;
      return api.snapshot() as GateSimSnapshot;
    });

    expect(afterUiToggles.q1CircuitVisible).toBe(true);
    expect(afterUiToggles.visibleSphereCount).toBeGreaterThan(0);

    const afterPhaseKickback = await page.evaluate(() => {
      const api = (window as any).__gatesimTestApi__;
      api.setQ1PresetMode("one");
      api.setGateEnabled("h1", true);
      api.setGateEnabled("cphase", true);
      api.setGateEnabled("h2", true);
      api.setLambdaDeg(180);
      return api.snapshot() as GateSimSnapshot;
    });

    expect(afterPhaseKickback.gateEnabled.h1).toBe(true);
    expect(afterPhaseKickback.gateEnabled.cphase).toBe(true);
    expect(afterPhaseKickback.gateEnabled.h2).toBe(true);
    expect(afterPhaseKickback.outputText).toContain("P(q0=0)=0.000");
    expect(afterPhaseKickback.outputText).toContain("P(q0=1)=1.000");

    const afterPhotons = await page.evaluate(() => {
      const api = (window as any).__gatesimTestApi__;
      api.clearMeasurementShots();
      api.spawnMeasurementPhoton(0);
      api.spawnMeasurementPhoton(0);
      api.spawnMeasurementPhoton(1);
      api.spawnMeasurementPhoton(1);
      return api.snapshot() as GateSimSnapshot;
    });

    expect(afterPhotons.photonCount).toBe(4);
    expect(afterPhotons.shotCounts.q0[0] + afterPhotons.shotCounts.q0[1]).toBe(2);
    expect(afterPhotons.shotCounts.q1[0] + afterPhotons.shotCounts.q1[1]).toBe(2);
    expect(afterPhotons.q0MeasurementText).toContain("total:");
    expect(afterPhotons.q1MeasurementText).toContain("total:");

    await page.getByRole("button", { name: "Hide spheres" }).click();
    await expect(page.getByRole("button", { name: "Show spheres" })).toBeVisible();

    const afterReset = await page.evaluate(() => {
      const api = (window as any).__gatesimTestApi__;
      return api.snapshot() as GateSimSnapshot;
    });

    expect(afterReset.visibleSphereCount).toBe(0);
    expect(afterReset.shotCounts.q0[0] + afterReset.shotCounts.q0[1]).toBe(0);
    expect(afterReset.shotCounts.q1[0] + afterReset.shotCounts.q1[1]).toBe(0);
  });
});
