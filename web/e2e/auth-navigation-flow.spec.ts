/**
 * E2E: Flujo de navegación — Company Admin
 *
 * Verifica que el company admin puede hacer login y navegar entre las
 * páginas principales sin recibir errores de servidor ni redirects inesperados.
 *
 * Usa las mismas credenciales hardcodeadas del resto de tests E2E.
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "643630b0-5e8a-47a3-8e4c-919e22f2d52d";
const PASSWORD = "TestPassword#123!";
const COMPANY_EMAIL = "e2e.admin.1776326162230@getbackplate.local";

async function loginAsCompanyAdmin(page: Page) {
  await page.goto(`/auth/login?org=${encodeURIComponent(ORG_ID)}`);
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.fill('input[name="email"]', COMPANY_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  const continueBtn = page.getByRole("button", { name: /continuar|ingresar|entrar/i }).first();
  if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await continueBtn.click();
  }

  await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
}

/** Navega a una ruta y verifica que NO hay un error 500 ni redirect de vuelta a login. */
async function assertPageLoads(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  const currentUrl = page.url();
  expect(
    currentUrl,
    `${path} redirigió inesperadamente a login`,
  ).not.toMatch(/\/auth\/login/);

  // Ninguna página debería mostrar un mensaje de "500" o "Internal Server Error"
  const bodyText = await page.locator("body").textContent();
  expect(
    bodyText ?? "",
    `${path} muestra texto de error de servidor`,
  ).not.toMatch(/internal server error/i);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Navegación Company Admin — todas las páginas cargan sin error", () => {
  test.setTimeout(120_000);

  test("login exitoso lleva al dashboard", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
  });

  test("dashboard carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/dashboard");
    await expect(page).toHaveURL(/\/app\/dashboard/, { timeout: 15_000 });
  });

  test("página de empleados carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/employees");
    await expect(page).toHaveURL(/\/app\/employees/, { timeout: 15_000 });
  });

  test("página de documentos carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/documents");
    await expect(page).toHaveURL(/\/app\/documents/, { timeout: 15_000 });
  });

  test("página de checklists carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/checklists");
    await expect(page).toHaveURL(/\/app\/checklists/, { timeout: 15_000 });
  });

  test("página de anuncios carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/announcements");
    await expect(page).toHaveURL(/\/app\/announcements/, { timeout: 15_000 });
  });

  test("página de reportes carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/reports");
    await expect(page).toHaveURL(/\/app\/reports/, { timeout: 15_000 });
  });

  test("página de usuarios carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/users");
    await expect(page).toHaveURL(/\/app\/users/, { timeout: 15_000 });
  });

  test("página de configuración carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/settings");
    await expect(page).toHaveURL(/\/app\/settings/, { timeout: 15_000 });
  });

  test("página de proveedores carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/vendors");
    await expect(page).toHaveURL(/\/app\/vendors/, { timeout: 15_000 });
  });

  test("página de facturación carga correctamente", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await assertPageLoads(page, "/app/billing");
    await expect(page).toHaveURL(/\/app\/billing/, { timeout: 15_000 });
  });
});

test.describe("Navegación Company Admin — rutas inválidas redirigen correctamente", () => {
  test("ruta inexistente /app/does-not-exist no devuelve 500", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await page.goto("/app/does-not-exist");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText ?? "").not.toMatch(/internal server error/i);
  });
});

test.describe("Acceso sin autenticación — redirige a login", () => {
  test("/app/dashboard sin sesión redirige a /auth/login", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("/app/employees sin sesión redirige a /auth/login", async ({ page }) => {
    await page.goto("/app/employees");
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
