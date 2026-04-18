import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (axe-core)', () => {
  test('home page has no serious a11y violations', async ({ page }) => {
    await page.goto('/');
    // Wait for the app shell to settle
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules([
        // Monaco editor and xterm.js inject their own DOM that often fails
        // color-contrast checks on the canvas-backed renderer.
        'color-contrast',
        // react-arborist wraps its virtualized tree in a plain scrollable div
        // that has no ARIA name of its own. Promoting it with a role creates
        // `aria-required-children` violations because the nested role="tree"
        // must be a direct parent of role="treeitem" — not allowed through a
        // labeled generic. Known library limitation; tracked for a future
        // custom tree renderer. ADR-035 notes the backlog.
        'scrollable-region-focusable',
      ])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length > 0) {
      console.log('A11y violations:', JSON.stringify(serious, null, 2));
    }
    expect(serious).toEqual([]);
  });

  test('command palette is accessible', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast', 'scrollable-region-focusable'])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
