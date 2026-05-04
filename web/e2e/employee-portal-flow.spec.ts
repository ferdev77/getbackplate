/**
 * E2E: Flujo del Portal de Empleado
 *
 * Verifica que el empleado puede hacer login y navegar entre las páginas
 * del portal sin recibir errores ni redirects inesperados.
 * También verifica el aislamiento básico: el empleado NO puede acceder
 * a rutas del panel de company admin.
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "643630b0-5e8a-47a3-8e4c-919e22f2d52d";
const PASSWORD = "TestPassword#123!";
const EMP1_EMAIL = "e2e.emp1.1776326162230@getbackplate.local";

async function loginAsEmployee(page: Page, email: string = EMP1_EMAIL) {
  await page.goto(`/auth/login?org=${encodeURIComponent(ORG_ID)}`);
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  const continueBtn = page.getByRole("button", { name: /continuar|ingresar|entrar/i }).first();
  if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await continueBtn.click();
  }

  await expect(page).toHaveURL(/\/(app|portal)\//, { timeout: 30_000 });

  // Cerrar modal de bienvenida si aparece
  const finishBtn = page.getByTestId("welcome-modal-finish-btn");
  if (await finishBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await finishBtn.click();
    await page.waitForTimeout(800);
  }
}

/** Navega a una ruta y verifica que NO hay un error 500 ni redirect a login. */
async function assertPortalPageLoads(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  const currentUrl = page.url();
  expect(
    currentUrl,
    `${path} redirigió inesperadamente a login`,
  ).not.toMatch(/\/auth\/login/);

  const bodyText = await page.locator("body").textContent();
  expect(
    bodyText ?? "",
    `${path} muestra texto de error de servidor`,
  ).not.toMatch(/internal server error/i);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Portal Empleado — todas las páginas cargan sin error", () => {
  test.setTimeout(120_000);

  test("login de empleado es exitoso", async ({ page }) => {
    await loginAsEmployee(page);
    await expect(page).toHaveURL(/\/(app|portal)\//, { timeout: 30_000 });
  });

  test("portal home carga correctamente", async ({ page }) => {
    await loginAsEmployee(page);
    await assertPortalPageLoads(page, "/portal/home");
    await expect(page).toHaveURL(/\/portal\/home/, { timeout: 15_000 });
  });

  test("portal documentos carga correctamente", async ({ page }) => {
    await loginAsEmployee(page);
    await assertPortalPageLoads(page, "/portal/documents");
    await expect(page).toHaveURL(/\/portal\/documents/, { timeout: 15_000 });
  });

  test("portal checklist carga correctamente", async ({ page }) => {
    await loginAsEmployee(page);
    await assertPortalPageLoads(page, "/portal/checklist");
    await expect(page).toHaveURL(/\/portal\/checklist/, { timeout: 15_000 });
  });

  test("portal anuncios carga correctamente", async ({ page }) => {
    await loginAsEmployee(page);
    await assertPortalPageLoads(page, "/portal/announcements");
    await expect(page).toHaveURL(/\/portal\/announcements/, { timeout: 15_000 });
  });

  test("portal proveedores carga correctamente", async ({ page }) => {
    await loginAsEmployee(page);
    await assertPortalPageLoads(page, "/portal/vendors");
    await expect(page).toHaveURL(/\/portal\/vendors/, { timeout: 15_000 });
  });
});

test.describe("Portal Empleado — aislamiento de acceso", () => {
  test.setTimeout(60_000);

  test("empleado no puede acceder a /app/employees (ruta de company admin)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/app/employees");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Debe redirigir a portal o a login, nunca cargar la página de company
    const url = page.url();
    const isOnEmployeesPage = url.includes("/app/employees");
    expect(
      isOnEmployeesPage,
      "El empleado accedió a /app/employees siendo solo company_admin",
    ).toBe(false);
  });

  test("empleado no puede acceder a /app/dashboard (ruta de company admin)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const url = page.url();
    expect(
      url,
      "El empleado accedió al dashboard de company admin",
    ).not.toMatch(/\/app\/dashboard/);
  });

  test("empleado no puede acceder a /superadmin (ruta de superadmin)", async ({ page }) => {
    await loginAsEmployee(page);
    await page.goto("/superadmin/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const url = page.url();
    expect(url).not.toMatch(/\/superadmin\/dashboard/);
  });
});

test.describe("Portal Empleado — acceso sin autenticación redirige a login", () => {
  test("/portal/home sin sesión redirige a /auth/login", async ({ page }) => {
    await page.goto("/portal/home");
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("/portal/documents sin sesión redirige a /auth/login", async ({ page }) => {
    await page.goto("/portal/documents");
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
