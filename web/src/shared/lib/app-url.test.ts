import { describe, expect, it } from "vitest";

import { getRequestOrigin } from "./app-url";

describe("getRequestOrigin", () => {
  it("uses the public forwarded origin behind ngrok", () => {
    const request = new Request("https://localhost:3000/test", {
      headers: {
        host: "earmuff-sulphate-splatter.ngrok-free.dev",
        "x-forwarded-host": "earmuff-sulphate-splatter.ngrok-free.dev",
        "x-forwarded-proto": "https",
      },
    });

    expect(getRequestOrigin(request)).toBe("https://earmuff-sulphate-splatter.ngrok-free.dev");
  });

  it("rejects malformed forwarded hosts", () => {
    const request = new Request("http://localhost:3000/test", {
      headers: { "x-forwarded-host": "attacker.example/path" },
    });

    expect(getRequestOrigin(request)).toBe("http://localhost:3000");
  });
});
