import { test, expect } from '@playwright/test';

test.describe('UC-08 Layout Customization', () => {
  test('renders the 4-panel shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('ClaudeGUI')).toBeVisible();
    await expect(page.getByText('Explorer')).toBeVisible();
    await expect(page.getByText('Claude')).toBeVisible();
    await expect(page.getByText('Preview')).toBeVisible();
  });

  test('toggles sidebar with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    const explorer = page.getByText('Explorer');
    await expect(explorer).toBeVisible();
    await page.keyboard.press('Meta+B');
    await expect(explorer).toBeHidden();
    await page.keyboard.press('Meta+B');
    await expect(explorer).toBeVisible();
  });

  test('persists layout across reload', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+J');
    await page.waitForTimeout(200);
    await page.reload();
    // Terminal should stay collapsed
    await expect(page.locator('.xterm')).toHaveCount(0);
  });
});
