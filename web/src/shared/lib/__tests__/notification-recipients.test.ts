import { describe, expect, it } from "vitest";

import { userIdParaEmailSinDuplicarCampanita } from "../notification-recipients";

describe("userIdParaEmailSinDuplicarCampanita", () => {
  it("devuelve null si el destinatario ya esta en el grupo de push (evita duplicar la campanita)", () => {
    expect(userIdParaEmailSinDuplicarCampanita("user-1", new Set(["user-1", "user-2"]))).toBeNull();
  });

  it("devuelve el mismo userId si no esta en el grupo de push (le arma su propia fila)", () => {
    expect(userIdParaEmailSinDuplicarCampanita("user-3", new Set(["user-1", "user-2"]))).toBe("user-3");
  });

  it("acepta un iterable ademas de un Set", () => {
    expect(userIdParaEmailSinDuplicarCampanita("user-1", ["user-1"])).toBeNull();
  });

  it("sin userId candidato, lo deja pasar tal cual (null o undefined)", () => {
    expect(userIdParaEmailSinDuplicarCampanita(null, new Set())).toBeNull();
    expect(userIdParaEmailSinDuplicarCampanita(undefined, new Set())).toBeUndefined();
  });
});
