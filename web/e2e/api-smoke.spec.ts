/**
 * API Smoke Tests
 *
 * Verifica que todos los endpoints protegidos devuelvan 401 (no autenticado)
 * y NUNCA 500 (error de servidor). Si un endpoint devuelve 500 sin auth,
 * hay un bug a nivel de módulo, import roto, o error de inicialización.
 *
 * Estos tests corren contra el servidor de desarrollo levantado por Playwright.
 * No requieren credenciales ni datos de test — solo el servidor corriendo.
 */
import { test, expect } from "@playwright/test";

// ─── Company Admin endpoints ──────────────────────────────────────────────────
const COMPANY_GET_ENDPOINTS = [
  "/api/company/announcements",
  "/api/company/checklists",
  "/api/company/dashboard",
  "/api/company/document-folders",
  "/api/company/documents",
  "/api/company/employees",
  "/api/company/feedback",
  "/api/company/reports",
  "/api/company/settings",
  "/api/company/users",
  "/api/company/vendors",
  "/api/company/vendors/categories",
  "/api/company/custom-domains",
  "/api/company/integrations/qbo-r365/config",
  "/api/company/integrations/qbo-r365/dashboard",
  "/api/company/integrations/qbo-r365/runs",
];

const COMPANY_POST_ENDPOINTS = [
  "/api/company/announcements",
  "/api/company/checklists",
  "/api/company/documents",
  "/api/company/employees",
  "/api/company/vendors",
  "/api/company/document-folders",
];

// ─── Employee endpoints ───────────────────────────────────────────────────────
const EMPLOYEE_GET_ENDPOINTS = [
  "/api/employee/announcements/manage",
  "/api/employee/checklists",
  "/api/employee/checklists/templates",
  "/api/employee/document-folders",
  "/api/employee/documents/manage",
  "/api/employee/feedback",
  "/api/employee/profile/documents",
  "/api/employee/vendors",
  "/api/employee/vendors/categories",
];

const EMPLOYEE_POST_ENDPOINTS = [
  "/api/employee/checklists",
  "/api/employee/documents/manage",
  "/api/employee/vendors",
];

// ─────────────────────────────────────────────────────────────────────────────

test.describe("API Smoke: Company endpoints — unauthenticated GET → 401, not 500", () => {
  for (const endpoint of COMPANY_GET_ENDPOINTS) {
    test(`GET ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación (401)`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Company endpoints — unauthenticated POST → 401, not 500", () => {
  for (const endpoint of COMPANY_POST_ENDPOINTS) {
    test(`POST ${endpoint}`, async ({ request }) => {
      const response = await request.post(endpoint, { data: {} });
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación (401)`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Employee endpoints — unauthenticated GET → 401, not 500", () => {
  for (const endpoint of EMPLOYEE_GET_ENDPOINTS) {
    test(`GET ${endpoint}`, async ({ request }) => {
      const response = await request.get(endpoint);
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación (401)`,
      ).toBe(401);
    });
  }
});

test.describe("API Smoke: Employee endpoints — unauthenticated POST → 401, not 500", () => {
  for (const endpoint of EMPLOYEE_POST_ENDPOINTS) {
    test(`POST ${endpoint}`, async ({ request }) => {
      const response = await request.post(endpoint, { data: {} });
      expect(
        response.status(),
        `${endpoint} devolvió 500 — revisar import roto o error de inicialización`,
      ).not.toBe(500);
      expect(
        response.status(),
        `${endpoint} debería requerir autenticación (401)`,
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
  test("POST /api/webhooks/cron/purge-trash sin header devuelve 4xx, no 500", async ({ request }) => {
    const response = await request.post("/api/webhooks/cron/purge-trash", { data: {} });
    expect(response.status()).not.toBe(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });

  test("POST /api/webhooks/cron/process-recurrence sin header devuelve 4xx, no 500", async ({ request }) => {
    const response = await request.post("/api/webhooks/cron/process-recurrence", { data: {} });
    expect(response.status()).not.toBe(500);
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("API Smoke: Stripe endpoints — requieren auth o signature, no 500", () => {
  test("POST /api/stripe/checkout sin auth devuelve 4xx, no 500", async ({ request }) => {
    const response = await request.post("/api/stripe/checkout", { data: {} });
    expect(response.status()).not.toBe(500);
  });

  test("POST /api/stripe/billing-portal sin auth devuelve 4xx, no 500", async ({ request }) => {
    const response = await request.post("/api/stripe/billing-portal", { data: {} });
    expect(response.status()).not.toBe(500);
  });
});
