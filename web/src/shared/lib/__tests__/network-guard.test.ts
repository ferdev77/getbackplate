import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";
import * as http2 from "node:http2";
import * as dgram from "node:dgram";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR } from "../../../../test/network-guard";

describe("Vitest network guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks fetch and the Node network entry points", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow(NETWORK_ERROR);
    expect(() => http.request("http://example.com")).toThrow(NETWORK_ERROR);
    expect(() => http.get("http://example.com")).toThrow(NETWORK_ERROR);
    expect(() => https.request("https://example.com")).toThrow(NETWORK_ERROR);
    expect(() => https.get("https://example.com")).toThrow(NETWORK_ERROR);
    expect(() => net.connect(443, "example.com")).toThrow(NETWORK_ERROR);
    expect(() => net.createConnection(443, "example.com")).toThrow(NETWORK_ERROR);
    expect(() => tls.connect(443, "example.com")).toThrow(NETWORK_ERROR);
    expect(() => http2.connect("https://example.com")).toThrow(NETWORK_ERROR);
    expect(() => dgram.createSocket("udp4")).toThrow(NETWORK_ERROR);
  });

  it("allows in-memory Requests and explicit mocks", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "test-body",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response("mocked"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request.text()).resolves.toBe("test-body");
    await expect(fetch(request).then((response) => response.text())).resolves.toBe("mocked");
    expect(fetchMock).toHaveBeenCalledWith(request);
  });
});
