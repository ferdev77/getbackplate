import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => {
  const webpush = {
    setVapidDetails,
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  };
  return { default: webpush, ...webpush };
});

const subscription = { id: "sub-1", endpoint: "https://push.example/abc", p256dh: "key", auth: "auth" };
const payload = { title: "Hola", body: "Mundo" };

describe("sendPushNotification", () => {
  beforeEach(() => {
    sendNotification.mockReset();
  });

  it("devuelve success cuando el envio funciona", async () => {
    sendNotification.mockResolvedValueOnce(undefined);
    const { sendPushNotification } = await import("../web-push");

    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: true });
  });

  it("una suscripcion vencida (410) se detecta como expired, sin lanzar", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }));
    const { sendPushNotification } = await import("../web-push");

    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: false, expired: true });
  });

  it("una suscripcion no encontrada (404) se trata igual que vencida", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Not found"), { statusCode: 404 }));
    const { sendPushNotification } = await import("../web-push");

    const result = await sendPushNotification(subscription, payload);

    expect(result).toEqual({ success: false, expired: true });
  });

  it("cualquier otro error (ej: 500 del proveedor) se relanza para que el caller lo cuente y lo loguee", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { statusCode: 500 }));
    const { sendPushNotification } = await import("../web-push");

    await expect(sendPushNotification(subscription, payload)).rejects.toThrow("Provider unavailable");
  });

  it("un error sin statusCode (ej: fallo de red) tambien se relanza", async () => {
    sendNotification.mockRejectedValueOnce(new Error("Network error"));
    const { sendPushNotification } = await import("../web-push");

    await expect(sendPushNotification(subscription, payload)).rejects.toThrow("Network error");
  });
});
