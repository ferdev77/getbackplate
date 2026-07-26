import { createRequire, syncBuiltinESMExports } from "node:module";

const NETWORK_ERROR =
  "Unit tests cannot make network requests. Stub the network client in this test.";

function blockNetwork(): never {
  throw new Error(NETWORK_ERROR);
}

function blockFetch(): Promise<never> {
  return Promise.reject(new Error(NETWORK_ERROR));
}

const require = createRequire(import.meta.url);
const http = require("node:http") as typeof import("node:http");
const https = require("node:https") as typeof import("node:https");
const net = require("node:net") as typeof import("node:net");
const tls = require("node:tls") as typeof import("node:tls");
const http2 = require("node:http2") as typeof import("node:http2");
const dgram = require("node:dgram") as typeof import("node:dgram");

// Assign directly instead of spying so vi.restoreAllMocks() cannot remove the guard.
Object.defineProperties(http, {
  request: { configurable: true, writable: true, value: blockNetwork },
  get: { configurable: true, writable: true, value: blockNetwork },
});
Object.defineProperties(https, {
  request: { configurable: true, writable: true, value: blockNetwork },
  get: { configurable: true, writable: true, value: blockNetwork },
});
Object.defineProperties(net, {
  connect: { configurable: true, writable: true, value: blockNetwork },
  createConnection: { configurable: true, writable: true, value: blockNetwork },
});
Object.defineProperty(tls, "connect", { configurable: true, writable: true, value: blockNetwork });
Object.defineProperty(http2, "connect", { configurable: true, writable: true, value: blockNetwork });
Object.defineProperty(dgram, "createSocket", { configurable: true, writable: true, value: blockNetwork });
syncBuiltinESMExports();

globalThis.fetch = blockFetch;

export { NETWORK_ERROR };
