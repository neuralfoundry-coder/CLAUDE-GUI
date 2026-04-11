import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SLIDE_CONTENT = `
<section>
  <h1 data-testid="slide-title">ClaudeGUI Slides</h1>
  <p>Initial slide</p>
</section>
<section>
  <h2>Second slide</h2>
</section>
`.trim();

const SLIDE_UPDATED = `
<section>
  <h1 data-testid="slide-title">Updated Title</h1>
  <p>Second version</p>
</section>
<section>
  <h2>Second slide</h2>
</section>
<section>
  <h2>New third slide</h2>
</section>
`.trim();

test.describe.configure({ mode: 'serial' });

test.describe('UC-04 Presentation Editing', () => {
  const slideFilename = 'tests-slides-e2e.reveal.html';
  let slideAbs: string;

  test.beforeAll(async () => {
    const root = process.env.PROJECT_ROOT || process.cwd();
    slideAbs = path.join(root, slideFilename);
    await fs.writeFile(slideAbs, SLIDE_CONTENT);
  });

  test.afterAll(async () => {
    try {
      await fs.unlink(slideAbs);
    } catch {
      /* ignore */
    }
  });

  test('reveal-host.html loads reveal.js', async ({ page }) => {
    await page.goto('/reveal-host.html');
    await page.waitForFunction(() => typeof (window as unknown as { Reveal?: unknown }).Reveal !== 'undefined');
    const hasReveal = await page.evaluate(
      () => typeof (window as unknown as { Reveal?: unknown }).Reveal !== 'undefined',
    );
    expect(hasReveal).toBe(true);
  });

  test('postMessage UPDATE_CONTENT patches slides', async ({ page }) => {
    await page.goto('/reveal-host.html');
    await page.waitForFunction(() => typeof (window as unknown as { Reveal?: unknown }).Reveal !== 'undefined');

    // Send UPDATE_CONTENT
    await page.evaluate((content: string) => {
      window.postMessage({ type: 'UPDATE_CONTENT', content }, '*');
    }, SLIDE_CONTENT);

    // Wait for patched slides
    const firstTitle = page.locator('[data-testid="slide-title"]');
    await expect(firstTitle).toHaveText('ClaudeGUI Slides');

    // Send updated content
    await page.evaluate((content: string) => {
      window.postMessage({ type: 'UPDATE_CONTENT', content }, '*');
    }, SLIDE_UPDATED);

    await expect(firstTitle).toHaveText('Updated Title');

    // Verify third slide was added
    const slideCount = await page.locator('.reveal .slides > section').count();
    expect(slideCount).toBe(3);
  });

  test('slide file is served via /api/files/read', async ({ request }) => {
    const res = await request.get(`/api/files/read?path=${encodeURIComponent(slideFilename)}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.content).toContain('ClaudeGUI Slides');
  });
});
