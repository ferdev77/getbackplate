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

  const columnsButton = page.getByTestId("documents-view-columns");
  await expect(columnsButton).toBeVisible();
  await columnsButton.click();

  await expect(page.getByText("Carpetas").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Carpetas").first()).toBeVisible();
});

test("employee portal documents supports columns mode", async ({ page }) => {
  test.skip(!EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD, "Configura E2E_EMPLOYEE_EMAIL y E2E_EMPLOYEE_PASSWORD");

  await login(page, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, ORG_ID || undefined);
  await page.goto("/portal/documents");

  const columnsButton = page.getByTestId("portal-documents-view-columns");
  await expect(columnsButton).toBeVisible();
  await columnsButton.click();

  await expect(page.getByText("Carpetas").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Carpetas").first()).toBeVisible();
});
