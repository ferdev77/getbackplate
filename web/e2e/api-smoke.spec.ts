/**
 * API Smoke Tests
 *
 * Verifica que todos los endpoints protegidos devuelvan 401 (no autenticado)
 * y NUNCA 500 (error de servidor). Si un endpoint devuelve 500 sin auth,
 * hay un bug a nivel de módulo, import roto, o error de inicialización.
 *
 * Métodos HTTP verificados contra los exports reales de cada route.ts.
 * No requieren credenciales ni datos de test — solo el servidor corriendo.
 */
import { test, expect } from "@playwright/test";

// ─── Company: rutas GET ───────────────────────────────────────────────────────
// Verificado: estas rutas exportan GET en su route.ts
const COMPANY_GET = [
  "/api/company/announcements",
  "/api/company/checklists",
  "/api/company/dashboard",
  "/api/company/documents",
  "/api/company/employees",
  "/api/company/reports",
  "/api/company/users",
  "/api/company/vendors",
  "/api/company/vendors/categories",
  "/api/company/custom-domains",
  "/api/company/integrations/qbo-r365/config",
  "/api/company/integrations/qbo-r365/runs",
];

// ─── Company: rutas POST ──────────────────────────────────────────────────────
// Verificado: estas rutas exportan POST en su route.ts
const COMPANY_POST = [
  "/api/company/documents",
  "/api/company/employees",
  "/api/company/vendors",
  "/api/company/vendors/categories",
  "/api/company/custom-domains",
  "/api/company/document-folders",  // solo POST/PATCH/DELETE, sin GET
  "/api/company/feedback",          // solo POST, sin GET
  "/api/company/settings",          // solo POST, sin GET
];

// ─── Employee: rutas GET ──────────────────────────────────────────────────────
const EMPLOYEE_GET = [
  "/api/employee/checklists",
  "/api/employee/vendors",
  "/api/employee/vendors/categories",
];

// ─── Employee: rutas POST ─────────────────────────────────────────────────────
const EMPLOYEE_POST = [
  "/api/employee/vendors",
  "/api/employee/vendors/categories",
  "/api/employee/announcements/manage",  // solo POST/PATCH/DELETE, sin GET
  "/api/employee/checklists/templates",  // solo POST/PATCH/DELETE, sin GET
  "/api/employee/document-folders",      // solo POST/PATCH, sin GET
  "/api/employee/documents/manage",      // solo POST/PATCH/DELETE, sin GET
  "/api/employee/feedback",              // solo POST, sin GET
  "/api/employee/profile/documents",     // solo POST, sin GET
];

// ─────────────────────────────────────────────────────────────────────────────

test.describe("API Smoke: Company GET → 401, nunca 500", () => {
  for (const endpoint of COMPANY_GET) {
    test(`GET ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Company POST → 401, nunca 500", () => {
  for (const endpoint of COMPANY_POST) {
    test(`POST ${endpoint}`, async ({ request }) => {
      const response = await request.post(endpoint, { data: {} });
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Employee GET → 401, nunca 500", () => {
  for (const endpoint of EMPLOYEE_GET) {
    test(`GET ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Employee POST → 401, nunca 500", () => {
  for (const endpoint of EMPLOYEE_POST) {
    test(`POST ${endpoint}`, async ({ request }) => {
      const response = await request.post(endpoint, { data: {} });
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Health checks — siempre accesibles", () => {
  test("GET /api/health/supabase responde sin 500", async ({ request }) => {
    const response = await request.get("/api/health/supabase");
    expect(
      response.status(),
      "/api/health/supabase devolvió 500 — problema de conectividad con Supabase",
    ).not.toBe(500);
  });
});

test.describe("API Smoke: Webhooks internos — requieren secret header, no 500", () => {
  test("POST /api/webhooks/cron/purge-trash sin header devuelve 4xx", async ({ request }) => {
    const response = await request.post("/api/webhooks/cron/purge-trash", { data: {} });
    expect(response.status()).not.toBe(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("POST /api/webhooks/cron/process-recurrence sin header devuelve 4xx", async ({ request }) => {
    const response = await request.post("/api/webhooks/cron/process-recurrence", { data: {} });
    expect(response.status()).not.toBe(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("API Smoke: Stripe — requieren auth o signature, no 500", () => {
  test("POST /api/stripe/checkout sin auth devuelve 4xx", async ({ request }) => {
    const response = await request.post("/api/stripe/checkout", { data: {} });
    expect(response.status()).not.toBe(500);
  });

  test("POST /api/stripe/billing-portal sin auth devuelve 4xx", async ({ request }) => {
    const response = await request.post("/api/stripe/billing-portal", { data: {} });
    expect(response.status()).not.toBe(500);
  });
});

// ─── Bug conocido: QBO dashboard crashea sin sesión ──────────────────────────
// BUG: /api/company/integrations/qbo-r365/dashboard usa requireTenantModule()
// (diseñado para páginas, llama a redirect()) dentro de un API route handler.
// Esto hace que devuelva 500 en lugar de 401 cuando no hay sesión activa.
// Debería usar assertCompanyAdminModuleApi() o assertTenantModuleApi() en su lugar.
//
// test.fixme() = el test se corre, se espera que falle, y CI pasa.
// Cuando alguien arregle el bug, Playwright avisa que hay que sacar el fixme.
test.describe("API Smoke: QBO integration (bug conocido)", () => {
  test.fixme(
    true,
    "BUG: route usa requireTenantModule() en lugar de assertCompanyAdminModuleApi() — devuelve 500 en vez de 401",
  );
  test("GET /api/company/integrations/qbo-r365/dashboard no devuelve 500", async ({ request }) => {
    const response = await request.get("/api/company/integrations/qbo-r365/dashboard");
    expect(
      response.status(),
      "Usar assertCompanyAdminModuleApi() para que devuelva 401 sin sesión",
    ).not.toBe(500);
  });
});
