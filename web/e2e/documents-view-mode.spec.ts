import { expect, test } from "@playwright/test";

const COMPANY_EMAIL = process.env.E2E_COMPANY_EMAIL || "";
const COMPANY_PASSWORD = process.env.E2E_COMPANY_PASSWORD || "";
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL || "";
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD || "";
const ORG_ID = process.env.E2E_ORG_ID || "";

async function login(page: import("@playwright/test").Page, email: string, password: string, orgHint?: string) {
  const loginPath = orgHint ? `/auth/login?org=${encodeURIComponent(orgHint)}` : "/auth/login";
  await page.goto(loginPath);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("company documents view mode persists between reloads", async ({ page }) => {
  test.skip(!COMPANY_EMAIL || !COMPANY_PASSWORD, "Configura E2E_COMPANY_EMAIL y E2E_COMPANY_PASSWORD");

  await login(page, COMPANY_EMAIL, COMPANY_PASSWORD, ORG_ID || undefined);
  await page.goto("/app/documents");

  const treeRoot = page.getByTestId("documents-tree-root");
  const columnsRoot = page.getByTestId("documents-columns-root");
  await expect(treeRoot).toBeVisible();
  await expect(columnsRoot).toHaveCount(0);

  const treeButton = page.getByTestId("documents-view-tree");
  const columnsButton = page.getByTestId("documents-view-columns");
  await expect(treeButton).toHaveAttribute("aria-pressed", "true");
  await expect(columnsButton).toHaveAttribute("aria-pressed", "false");
  await expect(columnsButton).toBeVisible();
  await columnsButton.click();

  await expect(columnsRoot).toBeVisible();
  await expect(treeRoot).toHaveCount(0);
  await expect(treeButton).toHaveAttribute("aria-pressed", "false");
  await expect(columnsButton).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByTestId("documents-columns-root")).toBeVisible();
  await expect(page.getByTestId("documents-tree-root")).toHaveCount(0);
  await expect(page.getByTestId("documents-view-tree")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("documents-view-columns")).toHaveAttribute("aria-pressed", "true");
});

test("employee portal documents supports columns mode", async ({ page }) => {
  test.skip(!EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD, "Configura E2E_EMPLOYEE_EMAIL y E2E_EMPLOYEE_PASSWORD");

  await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, ORG_ID || undefined);
  await page.goto("/portal/documents");

  const treeRoot = page.getByTestId("portal-documents-tree-root");
  const columnsRoot = page.getByTestId("portal-documents-columns-root");
  await expect(treeRoot).toBeVisible();
  await expect(columnsRoot).toHaveCount(0);

  const treeButton = page.getByTestId("portal-documents-view-tree");
  const columnsButton = page.getByTestId("portal-documents-view-columns");
  await expect(treeButton).toHaveAttribute("aria-pressed", "true");
  await expect(columnsButton).toHaveAttribute("aria-pressed", "false");
  await expect(columnsButton).toBeVisible();
  await columnsButton.click();

  await expect(columnsRoot).toBeVisible();
  await expect(treeRoot).toHaveCount(0);
  await expect(treeButton).toHaveAttribute("aria-pressed", "false");
  await expect(columnsButton).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByTestId("portal-documents-columns-root")).toBeVisible();
  await expect(page.getByTestId("portal-documents-tree-root")).toHaveCount(0);
  await expect(page.getByTestId("portal-documents-view-tree")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("portal-documents-view-columns")).toHaveAttribute("aria-pressed", "true");
});
