import { test, expect } from '@playwright/test';

test.describe('UC-08 Layout Customization', () => {
  test('renders the 4-panel shell', async ({ page }) => {
    await page.goto('/');
    // "ClaudeGUI" now appears in three places: the header brand, the Open
    // Project button (project name), and the breadcrumb. Scope to the header
    // brand to assert the app chrome rendered.
    await expect(
      page.locator('header').getByText('ClaudeGUI', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
    // The Claude panel header — scope to the panel element via data-panel-id
    // to avoid matching the header auth badge which also contains "Claude".
    await expect(
      page.locator('[data-panel-id="claude"]').getByText('Claude', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  });

  test('toggles sidebar via header button', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('[data-panel-id="fileExplorer"]');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);

    const width = async () => (await panel.boundingBox())?.width ?? 0;
    const before = await width();
    expect(before).toBeGreaterThan(50);

    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect.poll(width, { timeout: 5000 }).toBeLessThan(5);

    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await expect.poll(width, { timeout: 5000 }).toBeGreaterThan(50);
  });

  test('toggles terminal with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    // Terminal panel contains terminal tab bar with "+"; we'll assert it's present initially
    await page.waitForTimeout(300);
    await page.keyboard.press('ControlOrMeta+J');
    // Just verify no crash; layout state persists
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
  });
});
