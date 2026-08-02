import { describe, expect, it } from "vitest";

import { canReadAnnouncementInTenant } from "../access";
import { parseAnnouncementScope } from "../scope";

/**
 * Quien puede leer un aviso.
 *
 * Es la decision de acceso del modulo y no tenia ningun test. El alcance vive
 * solo en target_scope (la tabla announcement_audiences se elimino porque su
 * fila comodin daba acceso a cualquiera). Las reglas: un company_admin ve todo;
 * un empleado tiene que caer dentro del alcance por alguna de sus locaciones.
 */

const EMPLEADO = {
  roleCode: "employee",
  userId: "u1",
  branchId: "loc-a" as string | null,
  departmentId: "dep-1" as string | null,
  positionIds: ["pos-1"],
};

describe("company_admin", () => {
  it("ve cualquier aviso, por acotado que sea", () => {
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        roleCode: "company_admin",
        targetScope: { locations: ["otra"], users: ["otro"] },
      }),
    ).toBe(true);
  });
});

describe("empleado", () => {
  it("un aviso sin alcance le llega a todos", () => {
    expect(canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: {} })).toBe(true);
  });

  it("lo ve si su locación está en el alcance", () => {
    expect(
      canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: { locations: ["loc-a"] } }),
    ).toBe(true);
  });

  it("no lo ve si el alcance es de otra locación", () => {
    expect(
      canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: { locations: ["loc-z"] } }),
    ).toBe(false);
  });

  it("lo ve si tiene esa locación entre varias", () => {
    // El caso real: alguien asignado a seis locaciones tiene que entrar por
    // cualquiera de ellas, no solo por la sucursal que figura como propia.
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        branchId: "loc-a",
        branchIds: ["loc-a", "loc-b", "loc-c"],
        targetScope: { locations: ["loc-c"] },
      }),
    ).toBe(true);
  });

  it("no lo ve si ninguna de sus locaciones está", () => {
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        branchIds: ["loc-a", "loc-b"],
        targetScope: { locations: ["loc-z"] },
      }),
    ).toBe(false);
  });

  it("lo ve si lo nombraron a él, aunque no cumpla los filtros", () => {
    // Las personas suman: se agregan al alcance, no lo restringen.
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        targetScope: { locations: ["loc-z"], users: ["u1"] },
      }),
    ).toBe(true);
  });

  it("no lo ve si nombraron a otra persona", () => {
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        targetScope: { users: ["otro"] },
      }),
    ).toBe(false);
  });

  it("tiene que cumplir todas las dimensiones marcadas", () => {
    // Locación Y departamento: cumplir una sola no alcanza.
    const scope = { locations: ["loc-a"], department_ids: ["dep-9"] };
    expect(canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: scope })).toBe(false);
  });

  it("entra cuando cumple locación y departamento", () => {
    const scope = { locations: ["loc-a"], department_ids: ["dep-1"] };
    expect(canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: scope })).toBe(true);
  });

  it("el filtro por puesto se resuelve por id", () => {
    expect(
      canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: { position_ids: ["pos-1"] } }),
    ).toBe(true);
    expect(
      canReadAnnouncementInTenant({ ...EMPLEADO, targetScope: { position_ids: ["pos-9"] } }),
    ).toBe(false);
  });

  it("sin locación propia sigue decidiendo por las otras dimensiones", () => {
    expect(
      canReadAnnouncementInTenant({
        ...EMPLEADO,
        branchId: null,
        branchIds: [],
        targetScope: { department_ids: ["dep-1"] },
      }),
    ).toBe(true);
  });
});

describe("parseAnnouncementScope", () => {
  it("lee las cuatro dimensiones", () => {
    expect(
      parseAnnouncementScope({
        locations: ["loc-a"],
        department_ids: ["dep-1"],
        position_ids: ["pos-1"],
        users: ["u1"],
      }),
    ).toEqual({
      locations: ["loc-a"],
      department_ids: ["dep-1"],
      position_ids: ["pos-1"],
      users: ["u1"],
    });
  });

  it("un alcance ausente o roto no rompe: queda vacío", () => {
    // Vacio significa toda la organizacion, que es lo mismo que ya pasaba.
    const vacio = { locations: [], department_ids: [], position_ids: [], users: [] };
    expect(parseAnnouncementScope(null)).toEqual(vacio);
    expect(parseAnnouncementScope("texto suelto")).toEqual(vacio);
    expect(parseAnnouncementScope({ locations: "no es lista" })).toEqual(vacio);
  });

  it("descarta vacíos y espacios", () => {
    expect(parseAnnouncementScope({ locations: ["  loc-a  ", "", "   ", 5] }).locations).toEqual(["loc-a"]);
  });
});
