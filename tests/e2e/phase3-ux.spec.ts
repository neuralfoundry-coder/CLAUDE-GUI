import { test, expect } from '@playwright/test';

/**
 * E2E coverage for Phase 3 UX additions (ADR-033):
 * - Layout presets dropdown in the header
 * - Ctrl/Cmd+1..5 panel jump
 * - (Recovery modal is not exercised here — its trigger depends on
 *    prior-session localStorage which is outside this spec's concern.)
 */
test.describe('Phase 3 UX additions', () => {
  test('Layout presets dropdown exposes the three built-ins', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Layout presets' }).click();
    await expect(page.getByRole('menuitem', { name: /Editor Focus/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Preview Split/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Terminal Focus/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Save current layout/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Applying a built-in preset closes the menu without a crash', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Layout presets' }).click();
    await page.getByRole('menuitem', { name: /Editor Focus/ }).click();
    // Header + panel shell should remain intact after preset application.
    await expect(page.getByRole('button', { name: 'Layout presets' })).toBeVisible();
  });

  test('Ctrl/Cmd+2 focuses the editor panel (panel jump)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+2');
    // The focused panel wrapper gets data-focused via the layout store; we
    // verify via data-panel-id="editor" being the active element's ancestor.
    const editorFocused = await page.evaluate(() => {
      const panel = document.querySelector('[data-panel-id="editor"]');
      if (!panel) return false;
      // Either the panel itself or a descendant should be active.
      return panel === document.activeElement || panel.contains(document.activeElement);
    });
    expect(editorFocused).toBe(true);
  });

  test('Ctrl/Cmd+1 focuses the file explorer panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+1');
    const explorerFocused = await page.evaluate(() => {
      const panel = document.querySelector('[data-panel-id="fileExplorer"]');
      if (!panel) return false;
      return panel === document.activeElement || panel.contains(document.activeElement);
    });
    expect(explorerFocused).toBe(true);
  });
});
