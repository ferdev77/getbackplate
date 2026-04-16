import { test, expect, type Page } from "@playwright/test";

// --- Configuración Maestra Hardcodeada (Bypass .env issues) ---
const ORG_ID = '643630b0-5e8a-47a3-8e4c-919e22f2d52d';
const PASSWORD = 'TestPassword#123!';

const COMPANY_EMAIL = 'e2e.admin.1776326162230@getbackplate.local';

const EMP1 = { 
    name: 'E2E Emp1', 
    email: 'e2e.emp1.1776326162230@getbackplate.local' 
};
const EMP2 = { 
    name: 'E2E Emp2', 
    email: 'e2e.emp2.1776326162230@getbackplate.local' 
};

// Se marcan como configurados explícitamente
const credentialsConfigured = true;

/** Login helper - handles org selection and portal redirect */
async function loginUser(page: Page, email: string, pass: string, isCompany: boolean = false) {
  const loginPath = `/auth/login?org=${encodeURIComponent(ORG_ID)}`;
  await page.goto(loginPath);

  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');

  // Esperar un momento para la respuesta
  await page.waitForTimeout(3000);

  // Handle org selection step if present
  const continueBtn = page.getByRole("button", { name: /continuar|ingresar|entrar/i }).first();
  if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await continueBtn.click();
  }

  // Verification and Modal Dismissal
  if (isCompany) {
    await expect(page).toHaveURL(/\/app\//, { timeout: 30_000 });
  } else {
    await expect(page).toHaveURL(/\/(app|portal)\//, { timeout: 30_000 });
    
    // Portal Specific: Handle welcome modal if it appears
    const finishBtn = page.getByTestId("welcome-modal-finish-btn");
    if (await finishBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await finishBtn.click();
        await page.waitForTimeout(1000); // Wait for transition
    }
  }
}

async function verifyWithRetry(page: Page, textOrLocator: string | any, timeout: number = 20_000) {
  const locator = typeof textOrLocator === 'string' ? page.getByText(textOrLocator).first() : textOrLocator;
  
  // Initial wait to allow backend processing
  await page.waitForTimeout(3000);

  try {
    await expect(locator).toBeVisible({ timeout });
  } catch (e) {
    console.log(`Element not found, taking checkpoint and reloading...`);
    await page.reload();
    await page.waitForTimeout(4000); // Wait for list to load after reload
    await expect(locator).toBeVisible({ timeout });
  }
}

test.describe("Privacidad y Scope de Comunicaciones: Avisos, Checklists y Documentos", () => {

  // ─────────────────────────────────────────────────────────────────────────────
  test("1. Avisos (Announcements) - Aislamiento entre Empleados", async ({ browser }) => {
    const contextCompany = await browser.newContext();
    const contextEmp1 = await browser.newContext();
    const contextEmp2 = await browser.newContext();

    const pageCompany = await contextCompany.newPage();
    const pE1 = await contextEmp1.newPage();
    const pE2 = await contextEmp2.newPage();

    await test.step("Logins simultáneos", async () => {
      await Promise.all([
        loginUser(pageCompany, COMPANY_EMAIL, PASSWORD, true),
        loginUser(pE1, EMP1.email, PASSWORD, false),
        loginUser(pE2, EMP2.email, PASSWORD, false),
      ]);
    });

    test.setTimeout(90000);
    const uniqueAvisoTitle = `[E2E-MASTER] Aviso Privado - ${Date.now()}`;

    await test.step("Empresa crea un aviso dirigido EXCLUSIVAMENTE al Empleado 1", async () => {
      await pageCompany.goto("/app/announcements");
      await pageCompany.getByRole("button", { name: /Nuevo Aviso/i }).click();

      await pageCompany.getByTestId("announcement-title-input").fill(uniqueAvisoTitle);
      await pageCompany.getByTestId("announcement-body-textarea").fill("Este es un aviso que solo EMPLEADO 1 debería ver.");

      // Scope: search for EMP1 by name
      const userSearchInput = pageCompany.getByPlaceholder("Buscar usuario...");
      if (await userSearchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userSearchInput.fill(EMP1.name);
        await pageCompany.waitForTimeout(1500); // Wait for filter
      }

      const userCheckbox = pageCompany.locator("label", { hasText: new RegExp(EMP1.name, "i") }).getByRole("checkbox").first();
      await expect(userCheckbox).toBeVisible({ timeout: 5_000 });
      await userCheckbox.check();

      // Submit and wait for modal to close
      await pageCompany.getByTestId("announcement-submit-btn").click();
      await expect(pageCompany.getByTestId("announcement-submit-btn")).not.toBeVisible({ timeout: 15_000 });
      
      await verifyWithRetry(pageCompany, uniqueAvisoTitle);
    });

    await test.step("Emp 1 DEBE ver el aviso", async () => {
      await pE1.goto("/portal/announcements");
      await verifyWithRetry(pE1, uniqueAvisoTitle);
    });

    await test.step("Emp 2 NO DEBE ver el aviso", async () => {
      await pE2.goto("/portal/announcements");
      await pE2.waitForTimeout(4000);
      await expect(pE2.getByText(uniqueAvisoTitle)).toHaveCount(0);
    });

    await test.step("[CLEANUP] Eliminar el aviso", async () => {
      await pageCompany.goto("/app/announcements");
      const card = pageCompany.locator("article").filter({ hasText: uniqueAvisoTitle }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.getByTestId("delete-announcement-btn").click();
      
      const confirmBtn = pageCompany.getByTestId("delete-announcement-btn-confirm");
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();
      await expect(pageCompany.getByText(uniqueAvisoTitle)).toHaveCount(0, { timeout: 15_000 });
    });

    await contextCompany.close();
    await contextEmp1.close();
    await contextEmp2.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  test("2. Checklists - Aislamiento entre Empleados", async ({ browser }) => {
    const contextCompany = await browser.newContext();
    const contextEmp1 = await browser.newContext();
    const contextEmp2 = await browser.newContext();

    const pageCompany = await contextCompany.newPage();
    const pE1 = await contextEmp1.newPage();
    const pE2 = await contextEmp2.newPage();

    await test.step("Logins", async () => {
      await Promise.all([
        loginUser(pageCompany, COMPANY_EMAIL, PASSWORD, true),
        loginUser(pE1, EMP1.email, PASSWORD, false),
        loginUser(pE2, EMP2.email, PASSWORD, false),
      ]);
    });

    test.setTimeout(90000);
    const uniqueChecklistTitle = `[E2E-MASTER] Tarea Privada - ${Date.now()}`;

    await test.step("Empresa crea checklist para Empleado 1", async () => {
      await pageCompany.goto("/app/checklists");
      await pageCompany.getByTestId("create-checklist-btn").click();

      await pageCompany.getByTestId("checklist-title-input").fill(uniqueChecklistTitle);

      const userSearchInput = pageCompany.getByPlaceholder("Buscar usuario...");
      await expect(userSearchInput).toBeVisible({ timeout: 5_000 });
      await userSearchInput.fill(EMP1.name);
      await pageCompany.waitForTimeout(1000);

      const userCheckbox = pageCompany.locator("label", { hasText: new RegExp(EMP1.name, "i") }).getByRole("checkbox").first();
      await expect(userCheckbox).toBeVisible({ timeout: 5_000 });
      await userCheckbox.check();

      await pageCompany.getByRole("button", { name: /Guardar|Crear/i }).last().click();
      await verifyWithRetry(pageCompany, uniqueChecklistTitle);
    });

    await test.step("Emp 1 DEBE ver la tarea", async () => {
      await pE1.goto("/portal/checklist");
      await verifyWithRetry(pE1, uniqueChecklistTitle);
    });

    await test.step("Emp 2 NO DEBE ver la tarea", async () => {
      await pE2.goto("/portal/checklist");
      await pE2.waitForTimeout(4000);
      await expect(pE2.getByText(uniqueChecklistTitle)).toHaveCount(0);
    });

    await test.step("[CLEANUP] Eliminar checklist", async () => {
      await pageCompany.goto("/app/checklists");
      const row = pageCompany.locator("div").filter({ hasText: uniqueChecklistTitle }).last();
      const deleteLink = row.getByTestId("delete-checklist-btn");
      if (await deleteLink.count() > 0) {
        await deleteLink.click();
        const confirmBtn = pageCompany.getByTestId("confirm-delete-checklist-btn");
        await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
        await confirmBtn.click();
        await expect(pageCompany.getByText(uniqueChecklistTitle)).toHaveCount(0, { timeout: 15_000 });
      }
    });

    await contextCompany.close();
    await contextEmp1.close();
    await contextEmp2.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  test("3. Documentos - Solicitud y Aislamiento", async ({ browser }) => {
    const contextCompany = await browser.newContext();
    const contextEmp1 = await browser.newContext();
    const contextEmp2 = await browser.newContext();

    const pageCompany = await contextCompany.newPage();
    const pE1 = await contextEmp1.newPage();
    const pE2 = await contextEmp2.newPage();

    await test.step("Logins", async () => {
      await Promise.all([
        loginUser(pageCompany, COMPANY_EMAIL, PASSWORD, true),
        loginUser(pE1, EMP1.email, PASSWORD, false),
        loginUser(pE2, EMP2.email, PASSWORD, false),
      ]);
    });

    test.setTimeout(90000);
    const uniqueDocTitle = `[E2E-MASTER] Doc Privado - ${Date.now()}`;

    await test.step("Empresa solicita un documento a Empleado 1", async () => {
      await pageCompany.goto("/app/employees");

      const searchBox = pageCompany.getByPlaceholder(/Buscar/i).first();
      await searchBox.fill(EMP1.name);

      const editBtn = pageCompany.getByTestId("edit-employee-btn").first();
      await expect(editBtn).toBeVisible({ timeout: 15_000 });
      await editBtn.click();

      const docsTab = pageCompany.getByTestId("employee-tab-documents");
      await expect(docsTab).toBeVisible({ timeout: 10_000 });
      await docsTab.click();

      const addDocBtn = pageCompany.getByTestId("add-document-btn");
      await expect(addDocBtn).toBeVisible({ timeout: 5_000 });
      await addDocBtn.click();

      const docTitleInput = pageCompany.getByTestId("add-document-title-input");
      await expect(docTitleInput).toBeVisible({ timeout: 5_000 });
      await docTitleInput.fill(uniqueDocTitle);

      const confirmBtn = pageCompany.getByTestId("confirm-add-document-btn");
      await confirmBtn.click();

      await expect(pageCompany.getByText(/Documento solicitado creado/i)).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Emp 1 DEBE ver la solicitud en Documentos", async () => {
      await pE1.goto("/portal/documents");
      await verifyWithRetry(pE1, uniqueDocTitle, 25_000);
    });

    await test.step("Emp 2 NO DEBE ver la solicitud", async () => {
      await pE2.goto("/portal/documents");
      await pE2.waitForTimeout(4000);
      await expect(pE2.getByText(uniqueDocTitle)).toHaveCount(0);
    });

    await test.step("[CLEANUP] Eliminar documento solicitado", async () => {
      await pageCompany.goto("/app/employees");
      const searchBox = pageCompany.getByPlaceholder(/Buscar/i).first();
      await searchBox.fill(EMP1.name);

      const editBtn = pageCompany.getByTestId("edit-employee-btn").first();
      await expect(editBtn).toBeVisible({ timeout: 15_000 });
      await editBtn.click();

      const docsTab = pageCompany.getByTestId("employee-tab-documents");
      await expect(docsTab).toBeVisible({ timeout: 10_000 });
      await docsTab.click();

      const docRow = pageCompany.locator("div").filter({ hasText: uniqueDocTitle }).last();
      const trashBtn = docRow.locator("button").filter({ hasText: /🗑|Eliminar/i }).first();
      if (await trashBtn.count() > 0) {
        await trashBtn.click();
        const dlgBtn = pageCompany.getByRole("dialog").getByRole("button", { name: /Eliminar/i }).last();
        if (await dlgBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await dlgBtn.click();
        }
      }
    });

    await contextCompany.close();
    await contextEmp1.close();
    await contextEmp2.close();
  });
});
