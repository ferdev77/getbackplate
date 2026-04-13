import { expect, test } from "@playwright/test";

const COMPANY_EMAIL = process.env.E2E_COMPANY_EMAIL || "";
const COMPANY_PASSWORD = process.env.E2E_COMPANY_PASSWORD || "";
const EMPLOYEE_ID = process.env.E2E_EMPLOYEE_ID || "";
const ORG_ID = process.env.E2E_ORG_ID || "";

async function loginAsCompany(page: import("@playwright/test").Page) {
  const loginPath = ORG_ID ? `/auth/login?org=${encodeURIComponent(ORG_ID)}` : "/auth/login";
  await page.goto(loginPath);
  await page.getByLabel("Email").fill(COMPANY_EMAIL);
  await page.getByLabel("Contrasena").fill(COMPANY_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  if (page.url().includes("/auth/select-organization")) {
    const continueButton = page.getByRole("button", { name: /continuar|ingresar|entrar/i }).first();
    if (await continueButton.count()) {
      await continueButton.click();
    }
  }

  await expect(page).toHaveURL(/\/app\//);
}

async function openEmployeeEditModal(page: import("@playwright/test").Page) {
  await page.goto("/app/employees");

  const anyEditLink = page.locator('a[href*="action=edit"][href*="employeeId="]');
  try {
    await expect.poll(async () => await anyEditLink.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  } catch {
    return false;
  }

  const totalEditLinks = await anyEditLink.count();
  if (totalEditLinks === 0) return false;

  const specificEditLink = EMPLOYEE_ID
    ? page.locator(`a[href*="action=edit"][href*="employeeId=${EMPLOYEE_ID}"]`).first()
    : null;

  const editLink = specificEditLink && await specificEditLink.count() > 0
    ? specificEditLink
    : anyEditLink.first();

  await editLink.click();
  await expect(page.getByRole("heading", { name: /Editar Usuario \/ Empleado/ })).toBeVisible();
  return true;
}

  test.describe("Documents custom slot flow", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!COMPANY_EMAIL || !COMPANY_PASSWORD, "Configura E2E_COMPANY_EMAIL y E2E_COMPANY_PASSWORD");
    await loginAsCompany(page);
  });

  test("company creates custom requested slot with professional loading UX", async ({ page }) => {
    const customTitle = `E2E Licencia ${Date.now()}`;

    const opened = await openEmployeeEditModal(page);
    test.skip(!opened, "No hay empleados visibles para abrir modal de edición.");
    await page.getByRole("button", { name: "Documentos" }).click();

    await page.getByRole("button", { name: "Agregar documento" }).click();
    await page.getByPlaceholder("Ej. Licencia Sanitaria").fill(customTitle);

    const addButton = page.getByRole("button", { name: /^Agregar$/ });
    await addButton.click();

    await expect(page.getByRole("button", { name: "Agregando..." })).toBeVisible();
    await expect(page.getByText("Creando documento solicitado...")).toBeVisible();
    await expect(page.getByText("Documento solicitado creado. El empleado ya puede subirlo.")).toBeVisible();

    const card = page.locator("div", { hasText: customTitle }).first();
    await expect(card).toContainText("Documento solicitado (pendiente de carga)");
    await expect(card.getByRole("link", { name: "Ver" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Descargar" })).toHaveCount(0);
  });

  test("review actions open premium comment dialog", async ({ page }) => {
    const opened = await openEmployeeEditModal(page);
    test.skip(!opened, "No hay empleados visibles para abrir modal de edición.");
    await page.getByRole("button", { name: "Documentos" }).click();

    const rejectButtons = page.getByRole("button", { name: "Rechazar" });
    test.skip((await rejectButtons.count()) === 0, "No hay documentos pendientes subidos por empleado para revisar en este tenant.");

    await rejectButtons.first().click();

    await expect(page.getByText(/Revisión de documento|Revision de documento/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rechazar documento" })).toBeVisible();
    await expect(page.getByLabel("Comentario (obligatorio)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rechazar" })).toBeDisabled();

    await page.getByLabel("Comentario (obligatorio)").fill("E2E: prueba de dialogo de rechazo");
    await expect(page.getByRole("button", { name: "Rechazar" })).toBeEnabled();

    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText(/Revisión de documento|Revision de documento/)).toHaveCount(0);
  });
});
