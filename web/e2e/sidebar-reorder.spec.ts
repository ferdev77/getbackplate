import { test, expect } from '@playwright/test';

// Use same credentials as verify-master-logins.spec.ts
const ORG_ID = '643630b0-5e8a-47a3-8e4c-919e22f2d52d';
const ADMIN_EMAIL = 'e2e.admin.1776326162230@getbackplate.local';
const PASSWORD = 'TestPassword#123!';

test.describe('Sidebar Branch Reordering', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Authentication
    const loginPath = `/auth/login?org=${encodeURIComponent(ORG_ID)}`;
    await page.goto(loginPath);
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    
    // Handle potential org selection or just wait for navigation
    await page.waitForTimeout(2000);
    const continueBtn = page.getByRole('button', { name: /continuar|ingresar|entrar/i }).first();
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
    }
    
    await expect(page).toHaveURL(/.*\/app\/dashboard/, { timeout: 30000 });
  });

  test('should reorder branches via long press and drag-and-drop', async ({ page }) => {
    // Wait for the sidebar to load branch items
    // Branch links have href starting with /app/dashboard/location?branch=
    const branchLinks = page.locator('a[href*="branch="]');
    await expect(branchLinks.first()).toBeVisible({ timeout: 10000 });
    
    const initialBranches = await branchLinks.allTextContents();
    console.log('Initial branch order:', initialBranches);
    
    if (initialBranches.length < 2) {
      console.log('Skipping test: Not enough branches to reorder.');
      return;
    }

    const firstBranch = branchLinks.first();
    const secondBranch = branchLinks.nth(1);
    
    // 2. Simulate Long Press (400ms based on code)
    const box = await firstBranch.boundingBox();
    if (!box) throw new Error('Could not find bounding box for first branch');
    
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    
    // Wait for long press activation
    await page.waitForTimeout(600); 
    
    // 3. Drag and Drop
    const targetBox = await secondBranch.boundingBox();
    if (!targetBox) throw new Error('Could not find bounding box for second branch');
    
    // Move to target position
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
    await page.mouse.up();
    
    // 4. Validation Inmediata (Toast)
    await expect(page.locator('text=Orden de ubicaciones actualizado')).toBeVisible({ timeout: 5000 });
    
    // 5. Validation of UI state
    const postDragBranches = await branchLinks.allTextContents();
    console.log('Order after drag:', postDragBranches);
    
    // Check if the first branch is no longer at index 0 (if possible)
    // or just check that it moved.
    expect(postDragBranches[0]).not.toBe(initialBranches[0]);
    
    // 6. Validation of Persistence (Refresh)
    await page.reload();
    await expect(branchLinks.first()).toBeVisible({ timeout: 10000 });
    const finalBranches = await branchLinks.allTextContents();
    console.log('Final branch order after refresh:', finalBranches);
    
    expect(finalBranches).toEqual(postDragBranches);
  });
});
