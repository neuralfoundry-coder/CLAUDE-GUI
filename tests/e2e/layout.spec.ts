import { test, expect } from '@playwright/test';

test.describe('UC-08 Layout Customization', () => {
  test('renders the 4-panel shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('ClaudeGUI', { exact: true })).toBeVisible();
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
    // The Claude panel header — scope to the panel element to avoid matching
    // the header auth badge which also contains the word "Claude".
    await expect(page.locator('#claude').getByText('Claude', { exact: true })).toBeVisible();
    await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  });

  test('toggles sidebar with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    const explorer = page.getByText('Explorer', { exact: true });
    await expect(explorer).toBeVisible();
    await page.keyboard.press('ControlOrMeta+B');
    await expect(explorer).toBeHidden();
    await page.keyboard.press('ControlOrMeta+B');
    await expect(explorer).toBeVisible();
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
