import { test, expect } from '@playwright/test';

test.describe('Command Palette', () => {
  test('opens and closes with Cmd+K', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+K');
    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
