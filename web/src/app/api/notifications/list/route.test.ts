import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

type Call = { method: string; args: unknown[] };

function buildQuery(finalResult: unknown) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return chain;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return chain;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return chain;
    },
    lt: (...args: unknown[]) => {
      calls.push({ method: "lt", args });
      return chain;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return Promise.resolve(finalResult);
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(finalResult).then(resolve, reject),
  };
  return { chain, calls };
}

let itemsQuery: ReturnType<typeof buildQuery>;
let countQuery: ReturnType<typeof buildQuery>;
let fromCallCount = 0;

const serverClient = {
  auth: { getUser: getUserMock },
  from: vi.fn(() => {
    // La primera llamada a from() en la ruta es la lista, la segunda el conteo.
    fromCallCount += 1;
    return fromCallCount === 1 ? itemsQuery.chain : countQuery.chain;
  }),
};

vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => serverClient),
}));

function request(url: string) {
  return new Request(url);
}

describe("GET /api/notifications/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallCount = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    itemsQuery = buildQuery({ data: [{ id: "n1", channel: "in_app" }], error: null });
    countQuery = buildQuery({ count: 0, error: null });
  });

  it("rechaza sin usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { GET } = await import("./route");

    const response = await GET(request("https://app.example.com/api/notifications/list") as never);

    expect(response.status).toBe(401);
  });

  it("filtra la lista y el conteo de no leidas por channel=in_app -- push y email quedan afuera", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("https://app.example.com/api/notifications/list?limit=10") as never);
    expect(response.status).toBe(200);

    const itemsChannelFilters = itemsQuery.calls.filter((c) => c.method === "eq" && c.args[0] === "channel");
    const countChannelFilters = countQuery.calls.filter((c) => c.method === "eq" && c.args[0] === "channel");

    expect(itemsChannelFilters).toEqual([{ method: "eq", args: ["channel", "in_app"] }]);
    expect(countChannelFilters).toEqual([{ method: "eq", args: ["channel", "in_app"] }]);
  });
});
