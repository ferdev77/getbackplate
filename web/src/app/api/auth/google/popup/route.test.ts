import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Inicio de sesion con Google desde el dominio propio del cliente.
 *
 * Este camino crea la sesion sin pasar por el dominio canonico, asi que es el
 * unico control entre un id_token y una sesion abierta. Lo que se fija aca es
 * que no alcance con traer un token: tiene que venir de un dominio habilitado,
 * con un nonce valido, y el ruteo posterior tiene que poder rechazarlo.
 */

const mocks = vi.hoisted(() => ({
  signInWithIdToken: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  resolvePostLoginRedirect: vi.fn(async () => "/app/dashboard"),
  resolveOrganizationIdFromReadyAuthDomain: vi.fn(async () => null as string | null),
  clearMfaVerifiedCookie: vi.fn(async () => undefined),
  logAuthEvent: vi.fn(async () => undefined),
}));

class PostLoginRoutingError extends Error {}

vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signInWithIdToken: mocks.signInWithIdToken, signOut: mocks.signOut },
  })),
}));
vi.mock("@/modules/auth/post-login-routing", () => ({
  resolvePostLoginRedirect: mocks.resolvePostLoginRedirect,
  PostLoginRoutingError,
}));
vi.mock("@/shared/lib/custom-domains", () => ({
  normalizeRequestHost: (host: string | null) => (host ? host.toLowerCase() : null),
  resolveOrganizationIdFromReadyAuthDomain: mocks.resolveOrganizationIdFromReadyAuthDomain,
}));
vi.mock("@/shared/lib/mfa-verification", () => ({ clearMfaVerifiedCookie: mocks.clearMfaVerifiedCookie }));
vi.mock("@/shared/lib/audit", () => ({ logAuthEvent: mocks.logAuthEvent }));
vi.mock("@/shared/lib/app-url", () => ({
  getRequestOrigin: (request: Request) => new URL(request.url).origin,
}));
vi.mock("@/shared/lib/tenant-selection-shared", () => ({
  normalizeOrganizationId: (value: string | null) => value || null,
}));

const { POST } = await import("./route");

const NONCE = "a".repeat(43);

function pedido(body: Record<string, unknown>, origin = "https://juans.com") {
  return new Request(`${origin}/api/auth/google/popup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.getbackplate.com";
  mocks.signInWithIdToken.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } }, error: null });
  mocks.resolvePostLoginRedirect.mockResolvedValue("/app/dashboard");
  mocks.resolveOrganizationIdFromReadyAuthDomain.mockResolvedValue("org-1");
});

describe("quien puede pedir una sesion", () => {
  it("acepta un dominio propio habilitado", async () => {
    const response = await POST(pedido({ credential: "token", nonce: NONCE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ redirectTo: "/app/dashboard" });
  });

  it("rechaza un host que no es dominio habilitado ni el canonico", async () => {
    // Sin esto, apuntar un dominio cualquiera a la app alcanzaria para abrir
    // sesiones desde ahi.
    mocks.resolveOrganizationIdFromReadyAuthDomain.mockResolvedValue(null);

    const response = await POST(pedido({ credential: "token", nonce: NONCE }, "https://cualquiera.com"));

    expect(response.status).toBe(403);
    expect(mocks.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("acepta el dominio canonico aunque no sea dominio de cliente", async () => {
    mocks.resolveOrganizationIdFromReadyAuthDomain.mockResolvedValue(null);

    const response = await POST(
      pedido({ credential: "token", nonce: NONCE }, "https://app.getbackplate.com"),
    );

    expect(response.status).toBe(200);
  });
});

describe("validacion de la credencial", () => {
  it("exige un nonce con la forma esperada", async () => {
    // El nonce es lo que impide reutilizar un id_token robado.
    const response = await POST(pedido({ credential: "token", nonce: "corto" }));

    expect(response.status).toBe(400);
    expect(mocks.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("no acepta pedidos sin credencial", async () => {
    const response = await POST(pedido({ nonce: NONCE }));

    expect(response.status).toBe(400);
    expect(mocks.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("le pasa a Supabase el nonce sin hashear", async () => {
    await POST(pedido({ credential: "token-google", nonce: NONCE }));

    expect(mocks.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "token-google",
      nonce: NONCE,
    });
  });

  it("si Google no valida, no hay sesion", async () => {
    mocks.signInWithIdToken.mockResolvedValue({ data: { user: null }, error: { message: "bad token" } });

    const response = await POST(pedido({ credential: "token", nonce: NONCE }));

    expect(response.status).toBe(401);
    expect(mocks.resolvePostLoginRedirect).not.toHaveBeenCalled();
  });
});

describe("despues de autenticar", () => {
  it("manda a pedir de nuevo el segundo factor", async () => {
    await POST(pedido({ credential: "token", nonce: NONCE }));

    expect(mocks.clearMfaVerifiedCookie).toHaveBeenCalled();
  });

  it("el dominio manda sobre la organizacion, no lo que diga el cuerpo", async () => {
    // El hint del body lo controla quien llama; el dominio no.
    await POST(pedido({ credential: "token", nonce: NONCE, org: "otra-organizacion" }));

    expect(mocks.resolvePostLoginRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ organizationIdHint: "org-1" }),
    );
  });

  it("si el ruteo rechaza al usuario, cierra la sesion recien creada", async () => {
    // Sin esto quedaria autenticado alguien a quien se le nego el acceso.
    mocks.resolvePostLoginRedirect.mockRejectedValue(new PostLoginRoutingError("Sin acceso"));

    const response = await POST(pedido({ credential: "token", nonce: NONCE }));

    expect(response.status).toBe(403);
    expect(mocks.signOut).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Sin acceso" });
  });
});
