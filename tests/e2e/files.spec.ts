import { test, expect } from '@playwright/test';

test.describe('UC-01 Project Browse', () => {
  test('file explorer loads project entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Explorer', { exact: true })).toBeVisible();
    // Wait for the file tree REST call to populate
    await expect(page.locator('text=package.json').first()).toBeVisible({ timeout: 10000 });
  });

  test('health endpoint responds', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  test('files list endpoint responds', async ({ request }) => {
    const res = await request.get('/api/files?path=');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.entries)).toBe(true);
  });

  test('sandbox blocks path traversal', async ({ request }) => {
    const res = await request.get('/api/files/read?path=../../../etc/passwd');
    expect(res.status()).toBe(403);
  });

  test('git status endpoint responds', async ({ request }) => {
    const res = await request.get('/api/git/status');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.isRepo).toBe('boolean');
  });
});

test.describe('FR-202/206/211 native file-explorer interactions', () => {
  test('copy API duplicates an existing file with " (n)" suffix', async ({ request }) => {
    // Sanity-check: source must exist in the project root.
    const list = await request.get('/api/files?path=');
    const body = await list.json();
    const hasPackageJson = body.data.entries.some(
      (e: { name: string }) => e.name === 'package.json',
    );
    expect(hasPackageJson).toBe(true);

    // Duplicate package.json — should land at "package (1).json", and the
    // server must clean up after itself when we DELETE it.
    const copy = await request.post('/api/files/copy', {
      data: { srcPath: 'package.json', destPath: 'package.json' },
    });
    expect(copy.ok()).toBe(true);
    const copyBody = await copy.json();
    expect(copyBody.success).toBe(true);
    expect(copyBody.data.writtenPath).toBe('package (1).json');

    const cleanup = await request.delete(
      `/api/files?path=${encodeURIComponent('package (1).json')}`,
    );
    expect(cleanup.ok()).toBe(true);
  });

  test('copy API rejects copying a directory into its own descendant', async ({ request }) => {
    // `src/` exists in this repo and contains nested folders.
    const res = await request.post('/api/files/copy', {
      data: { srcPath: 'src', destPath: 'src/components/src' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('right-click context menu stays open on mouse movement and dismisses on Escape', async ({
    page,
  }) => {
    await page.goto('/');
    // Wait for the tree to populate.
    const target = page.locator('text=package.json').first();
    await expect(target).toBeVisible({ timeout: 10000 });

    // Right-click a file node to open the hoisted context menu.
    await target.click({ button: 'right' });

    // The hoisted menu renders a Radix DropdownMenu with role=menu.
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Copy', { exact: true })).toBeVisible();

    // Move the mouse around — the menu must NOT dismiss (regression for the
    // per-node ContextMenu bug where virtualization re-renders closed it).
    await page.mouse.move(10, 10);
    await page.mouse.move(400, 400);
    await expect(menu).toBeVisible();

    // Escape should close it.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });
});
