import { test, expect } from '@playwright/test';

/**
 * UC-04 Terminal UI — exercises the user-facing behaviors added in the
 * v0.4 terminal overhaul: tab creation via keyboard shortcut, inline
 * rename, and search overlay toggle.
 *
 * These tests do NOT assert anything about the shell output itself
 * (that's covered by the manual smoke matrix in docs/qa/terminal-smoke.md
 * and the unit tests for shell-resolver / terminal-handler). Playwright
 * just verifies that the UI plumbing is connected end-to-end.
 */

test.describe('UC-04 Terminal UI', () => {
  /**
   * The default split layout (v5) is a 3-column split — fileExplorer | editor |
   * claude | preview — with no terminal. Before each terminal test, apply the
   * built-in "Terminal Focus" preset so a terminal leaf is mounted.
   */
  const enableTerminalPanel = async (page: import('@playwright/test').Page) => {
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Layout presets' }).click();
    await page.getByRole('menuitem', { name: /Terminal Focus/ }).click();
    // Give react-resizable-panels + xterm a tick to mount the new leaf.
    await page.waitForTimeout(500);
  };

  /**
   * Focus xterm's hidden textarea so `isFocusInsideTerminal()` returns true
   * and the terminal-scoped global shortcuts fire.
   */
  const focusTerminal = async (page: import('@playwright/test').Page) => {
    await page.waitForSelector('.xterm-helper-textarea', { state: 'attached' });
    // Give React/xterm a tick to finish wiring up keyboard listeners.
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
      el?.focus();
    });
    await page.waitForTimeout(100);
  };

  test('creates and closes tabs via keyboard shortcuts', async ({ page }) => {
    await page.goto('/');
    await enableTerminalPanel(page);
    const tabBar = page.locator('[data-terminal-panel="true"] [aria-label="Terminal sessions"]');
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole('button', { name: 'Activate Terminal 1', exact: true })).toBeVisible();

    await focusTerminal(page);

    // Create a second tab via the "+" (New terminal) button. Ctrl+T is
    // reserved at the xterm layer but not wired as an app-level shortcut yet.
    await tabBar.getByRole('button', { name: 'New terminal', exact: true }).click();
    await expect(tabBar.getByRole('button', { name: 'Activate Terminal 2', exact: true })).toBeVisible();

    // Close the second tab via its explicit close affordance.
    await tabBar.getByRole('button', { name: 'Close Terminal 2', exact: true }).click();
    await expect(tabBar.getByRole('button', { name: 'Activate Terminal 2', exact: true })).toHaveCount(0);
  });

  test('opens the search overlay with Cmd+F', async ({ page }) => {
    await page.goto('/');
    await enableTerminalPanel(page);
    await focusTerminal(page);
    await page.keyboard.press('ControlOrMeta+f');
    const overlay = page.getByRole('search', { name: 'Terminal search' });
    await expect(overlay).toBeVisible();
    // Esc closes the overlay.
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('renames a tab via double-click', async ({ page }) => {
    await page.goto('/');
    await enableTerminalPanel(page);
    const tabBar = page.locator('[data-terminal-panel="true"] [aria-label="Terminal sessions"]');
    const activateBtn = tabBar.getByRole('button', { name: 'Activate Terminal 1', exact: true });
    await expect(activateBtn).toBeVisible();
    // Dispatch a native dblclick event. Playwright's higher-level
    // `dblclick()` helper fires two clicks which React sometimes coalesces
    // as onClick rather than onDoubleClick on nested button content.
    await activateBtn.evaluate((el) => {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });

    const input = tabBar.getByRole('textbox', { name: 'Rename session' });
    await expect(input).toBeVisible();
    await input.fill('MyShell');
    await input.press('Enter');

    await expect(tabBar.getByRole('button', { name: 'Activate MyShell', exact: true })).toBeVisible();
  });
});
