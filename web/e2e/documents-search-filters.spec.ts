import { expect, test } from "@playwright/test";

const COMPANY_EMAIL = process.env.E2E_COMPANY_EMAIL || "";
const COMPANY_PASSWORD = process.env.E2E_COMPANY_PASSWORD || "";
const ORG_ID = process.env.E2E_ORG_ID || "";

async function login(page: import("@playwright/test").Page, email: string, password: string, orgHint?: string) {
  const loginPath = orgHint ? `/auth/login?org=${encodeURIComponent(orgHint)}` : "/auth/login";
  await page.goto(loginPath);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  if (page.url().includes("/auth/select-organization")) {
    const continueButton = page.getByRole("button", { name: /continuar|ingresar|entrar/i }).first();
    if (await continueButton.count()) {
      await continueButton.click();
    }
  }
}

test("documents search filters rows while typing", async ({ page }) => {
  test.skip(!COMPANY_EMAIL || !COMPANY_PASSWORD, "Configura E2E_COMPANY_EMAIL y E2E_COMPANY_PASSWORD");

  await login(page, COMPANY_EMAIL, COMPANY_PASSWORD, ORG_ID || undefined);
  if (page.url().includes("/auth/login")) {
    test.skip(true, "No se pudo autenticar con las credenciales E2E configuradas.");
  }
  await page.goto("/app/documents");

  const treeRoot = page.getByTestId("documents-tree-root");
  const columnsRoot = page.getByTestId("documents-columns-root");
  if ((await treeRoot.count()) === 0 && (await columnsRoot.count()) > 0) {
    await page.getByTestId("documents-view-tree").click();
  }
  await expect(treeRoot).toBeVisible();

  const folderRows = page.locator('[data-testid^="documents-folder-row-"]');
  const docRows = page.locator('[data-testid^="documents-doc-row-"]');
  await expect(folderRows.first()).toBeVisible();

  const searchInput = page.getByTestId("documents-search-input");
  await expect(searchInput).toBeVisible();

  await searchInput.fill(`zzzz-no-match-${Date.now()}`);
  await expect(folderRows).toHaveCount(0);
  await expect(docRows).toHaveCount(0);

  await searchInput.fill("");
  await expect(folderRows.first()).toBeVisible();

  const firstFolderText = (await folderRows.first().innerText()).trim();
  const probe = firstFolderText.split(/\s+/).find((token) => token.length >= 4) ?? firstFolderText;
  await searchInput.fill(probe.slice(0, 12));

  await expect(folderRows.first()).toBeVisible();
});
