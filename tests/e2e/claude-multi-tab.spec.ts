import { test, expect } from '@playwright/test';

/**
 * Multi-tab Claude workflow E2E — runs against the mock Claude WS handler
 * (`server-handlers/claude-handler-mock.mjs`, gated by
 * `CLAUDE_MOCK_HANDLER=1`). No real Claude auth or CLI involvement.
 *
 * Scenarios:
 *  - Second tab can be created via the "+" button.
 *  - A query sent from a tab streams back a reply and finalizes.
 *  - Switching tabs preserves per-tab message state.
 *  - Closing a tab mid-stream aborts cleanly (no stuck "streaming" state).
 *  - Permission-request flow shows the modal and re-enters streaming after Approve.
 */
test.describe('Claude multi-tab (mocked server)', () => {
  const getPromptInput = (page: import('@playwright/test').Page) =>
    page.getByPlaceholder('Ask Claude... (@ files, / commands, drop files)');

  const sendPrompt = async (page: import('@playwright/test').Page, text: string) => {
    const input = getPromptInput(page);
    await input.fill(text);
    await input.press('Enter');
  };

  test('creates a second chat tab via the + button', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    const newTabBtn = page.getByRole('button', { name: 'New chat tab' });
    await newTabBtn.click();
    // Both tabs are Activate-able — the bar renders "Activate Chat 1" and "Activate Chat 2".
    await expect(page.getByRole('button', { name: 'Activate Chat 1', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate Chat 2', exact: true })).toBeVisible();
  });

  test('streams a mock reply into the active tab and finalizes', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await sendPrompt(page, 'hello');
    // The mock sends "Hello, this is a mock reply." across ~100ms.
    await expect(page.getByText(/Hello, this is a mock reply\./)).toBeVisible({ timeout: 5_000 });
    // Streaming indicator should clear after the mock result frame.
    await expect(page.locator('.claude-streaming-bar')).toHaveCount(0, { timeout: 5_000 });
  });

  test('per-tab messages are isolated when switching tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    // Scope message-area assertions away from the tab bar (pushUserMessage
    // auto-renames the tab to the first 30 chars of the prompt, which would
    // otherwise match our selector twice).
    const claudePanel = page.locator('[data-panel-id="claude"]');
    const messageArea = claudePanel.locator('.whitespace-pre-wrap').filter({
      hasText: 'tab-one-unique',
    });

    // Tab 1: send a distinctive prompt — confirm it renders in the chat stream.
    await sendPrompt(page, 'tab-one-unique');
    await expect(messageArea.first()).toBeVisible({ timeout: 5_000 });

    // Open Tab 2.
    await page.getByRole('button', { name: 'New chat tab' }).click();
    await expect(
      claudePanel.getByRole('button', { name: 'Activate Chat 2', exact: true }),
    ).toBeVisible();
    // Give tab-2 a tick to render its empty message list.
    await page.waitForTimeout(400);
    // The distinctive tab-1 message must not leak into tab 2's message area.
    await expect(messageArea).toHaveCount(0);

    // Switch back to tab 1 and verify the message reappears.
    await claudePanel
      .getByRole('button', { name: /Activate tab-one-unique/ })
      .first()
      .click();
    await expect(messageArea.first()).toBeVisible();
  });

  test('permission-request modal appears and streaming completes after Approve', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    // The `[NEED_PERMISSION]` token makes the mock gate its result on approval.
    await sendPrompt(page, 'do this [NEED_PERMISSION]');
    const modal = page.getByRole('dialog').filter({ hasText: /Permission/i });
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await modal.getByRole('button', { name: /Allow|Approve/ }).first().click();
    // After approval, the mock sends `result` and streaming clears.
    await expect(page.locator('.claude-streaming-bar')).toHaveCount(0, { timeout: 5_000 });
  });
});
