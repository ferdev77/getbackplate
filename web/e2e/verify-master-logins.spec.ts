import { test, expect } from '@playwright/test';

// Hardcoded for verification since .env.local isn't loading reliably in Playwright/Windows context
const ORG_ID = '643630b0-5e8a-47a3-8e4c-919e22f2d52d';
const PASSWORD = 'TestPassword#123!';

const accounts = [
  { name: 'Admin', email: 'e2e.admin.1776326162230@getbackplate.local', isCompany: true },
  { name: 'Emp1', email: 'e2e.emp1.1776326162230@getbackplate.local', isCompany: false },
];

test.describe('Master E2E Login Verification', () => {
    test.afterEach(async ({ page }, testInfo) => {
        if (testInfo.status !== testInfo.expectedStatus) {
            const screenshotPath = `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Screenshot saved to ${screenshotPath}`);
        }
    });

  for (const account of accounts) {
    test(`Login verification for ${account.name}`, async ({ page }) => {
      console.log(`Testing login for ${account.name} (${account.email})...`);
      
      const loginPath = `/auth/login?org=${encodeURIComponent(ORG_ID)}`;
      await page.goto(loginPath);
      
      await page.waitForSelector('input[name="email"]', { timeout: 15000 });
      
      await page.fill('input[name="email"]', account.email);
      await page.fill('input[name="password"]', PASSWORD);
      
      await page.click('button[type="submit"]');
      
      // Wait for navigation or error
      await page.waitForTimeout(3000); 

      const errorMsg = page.locator('text=/Email o contraseña incorrectos|Credenciales inválidas|Invalid login credentials/i').first();
      if (await errorMsg.isVisible()) {
          const text = await errorMsg.textContent();
          console.error(`LOGIN ERROR DETECTED ON UI: ${text}`);
          throw new Error(`Login failed for ${account.name} with UI error: ${text}`);
      }

      // Handle org selection step if present
      const continueBtn = page.getByRole('button', { name: /continuar|ingresar|entrar/i }).first();
      if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("Clicking 'Continuar' button...");
        await continueBtn.click();
      }

      // Verification
      const targetURL = account.isCompany ? /.*\/app\/.*/ : /.*\/(app|portal)\/.*/;
      await expect(page).toHaveURL(targetURL, { timeout: 30000 });
      
      console.log(`Login successful for ${account.name}!`);
    });
  }
});
