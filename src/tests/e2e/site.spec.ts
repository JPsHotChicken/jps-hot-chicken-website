import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", heading: /JP'?s\s+Hot Chicken/i },
  { path: "/menu", heading: /the menu/i },
  { path: "/about", heading: /clarksville home/i },
  { path: "/contact", heading: /contact/i },
];

test.describe("page loads", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} loads with its key content and a single h1`, async ({ page }) => {
      await page.goto(path);
      const h1 = page.locator("h1");
      await expect(h1).toHaveCount(1);
      await expect(h1).toContainText(heading);
    });
  }
});

test("primary navigation moves between pages", async ({ page }) => {
  await page.goto("/");

  // Open the mobile menu first if the hamburger is visible (mobile projects).
  const hamburger = page.getByRole("button", { name: /open menu/i });
  if (await hamburger.isVisible()) {
    await hamburger.click();
  }
  await page.getByRole("link", { name: "Menu", exact: true }).first().click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.locator("h1")).toContainText(/the menu/i);
});

test("ordering CTA is visible and links to the third-party URL in a new tab", async ({
  page,
}) => {
  await page.goto("/");
  const orderLink = page.getByRole("link", { name: /order online/i }).first();
  await expect(orderLink).toBeVisible();
  await expect(orderLink).toHaveAttribute("target", "_blank");
  await expect(orderLink).toHaveAttribute("rel", /noopener/);
  const href = await orderLink.getAttribute("href");
  expect(href).toMatch(/^https?:\/\//);
});

test.describe("no horizontal overflow on any page", () => {
  for (const { path } of PAGES) {
    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        // Allow a 1px rounding tolerance.
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
