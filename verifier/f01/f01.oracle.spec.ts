// F01 trusted acceptance oracle (pre-registered; patcher has no access).
//
// The tap is a real screen-coordinate mouse click. Do not replace it with
// force-click, locator.click() actionability retries, or JS event dispatch:
// those would bypass the intercepting element and hide the real defect.
import { writeFile } from 'node:fs/promises';
import { test, expect, type Page, type TestInfo } from '@playwright/test';

export const F01_PRODUCT_PATH = '/product/demo';
export const OBSERVATION_ATTACHMENT = 'f01-observation';

export type F01Observation = {
  viewport: { width: number; height: number };
  tapPoint: { x: number; y: number };
  hitTestTarget: string | null;
  cartCountBefore: string | null;
  cartCountAfter: string | null;
};

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const file = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function tapAddToCart(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto(F01_PRODUCT_PATH);
  const button = page.getByTestId('add-to-cart');
  const cartCount = page.getByTestId('cart-count');
  await expect(button, 'Add to cart button is rendered').toBeVisible();
  await expect(cartCount, 'cart starts empty').toHaveText('0');

  const box = await button.boundingBox();
  expect(box, 'Add to cart button has a layout box').not.toBeNull();
  const x = Math.round(box!.x + box!.width / 2);
  const y = Math.round(box!.y + box!.height / 2);

  // Which element actually receives a pointer event at the tap point.
  const hitTestTarget = await page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py);
    if (!el) return null;
    return el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase();
  }, [x, y] as const);
  const cartCountBefore = await cartCount.textContent();

  await capture(page, testInfo, 'before-tap');
  await page.mouse.click(x, y);
  // Let any click handler run before sampling; the assertion below still retries.
  await page.waitForTimeout(250);
  await capture(page, testInfo, 'after-tap');

  const observation: F01Observation = {
    viewport: page.viewportSize()!,
    tapPoint: { x, y },
    hitTestTarget,
    cartCountBefore,
    cartCountAfter: await cartCount.textContent(),
  };
  const observationPath = testInfo.outputPath(`${OBSERVATION_ATTACHMENT}.json`);
  await writeFile(observationPath, JSON.stringify(observation, null, 2));
  await testInfo.attach(OBSERVATION_ATTACHMENT, { path: observationPath, contentType: 'application/json' });
  testInfo.annotations.push({
    type: 'hit-test',
    description: `tap at (${x}, ${y}) is received by [data-testid=${hitTestTarget}]`,
  });

  await expect(
    cartCount,
    `cart-count after a real tap on Add to cart (tap point received by: ${hitTestTarget})`,
  ).toHaveText('1');
}

test.describe('F01 mobile 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('F01-MOBILE: real pointer tap adds product to cart', async ({ page }, testInfo) => {
    await tapAddToCart(page, testInfo);
  });
});

test.describe('F01 desktop 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('F01-DESKTOP: real pointer click adds product to cart (regression control)', async ({ page }, testInfo) => {
    await tapAddToCart(page, testInfo);
  });
});
