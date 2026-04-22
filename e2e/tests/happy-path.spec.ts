import { expect, test } from "@playwright/test";

test("landing without token shows 404 page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ce faire-part n'existe pas ou plus.")).toBeVisible();
});

test("with valid token, hero scene renders with babyName", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  expect(token, "E2E_TOKEN must be set").toBeTruthy();
  await page.goto(`/?k=${token}`);
  await expect(page.locator('[data-t="babyName"]').first()).toHaveText("Léonard");
  await expect(page.url()).not.toContain("k=");
});

test("navigation between scenes works via right arrow", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  await page.goto(`/?k=${token}`);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".scene-stats")).toHaveClass(/is-active/);
});

test("reserving a gift updates the UI", async ({ page }) => {
  const token = process.env.E2E_TOKEN!;
  await page.goto(`/?k=${token}`);
  // Navigate to the gifts scene (08 after renumbering)
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await page.locator(".gift").first().click();
  await page.locator('dialog input[name=name]').fill("Sophie");
  await page.locator("dialog button[value=confirm]").click();
  await expect(page.locator(".gift.taken").first()).toBeVisible();
});
