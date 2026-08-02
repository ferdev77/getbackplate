import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guardias de las notificaciones.
 *
 * Dos reglas que ya se rompieron solas mas de una vez. No alcanza con
 * arreglar el caso puntual: mientras la regla viva repartida en cada modulo,
 * el proximo que se escriba la vuelve a romper. Estos tests recorren el arbol
 * y obligan a declarar la decision.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..");

function recorrer(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__" || entrada.name === "node_modules") continue;
      encontrados.push(...recorrer(completo));
      continue;
    }
    if (!/\.tsx?$/.test(entrada.name) || entrada.name.includes(".test.")) continue;
    encontrados.push(completo);
  }
  return encontrados;
}

/** Sin comentarios: nombrar algo al explicarlo no es usarlo. */
function codigoDe(archivo: string) {
  return readFileSync(archivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");
}

function relativo(archivo: string) {
  return path.relative(RAIZ, archivo).split(path.sep).join("/");
}

describe("un mismo aviso no llega dos veces a la campanita", () => {
  /**
   * Tanto el push como el email dejan su propia fila channel:'in_app' (ver
   * send-to-org.ts y infrastructure/email/client.ts). Un flujo que manda los
   * dos al mismo destinatario le deja el aviso repetido, salvo que decida a
   * proposito cual de los dos no registra.
   *
   * Paso en los 9 flujos a la vez. La forma de decidirlo es
   * userIdParaEmailSinDuplicarCampanita o pasar notification.userId en null;
   * si un archivo resuelve el solapamiento de otra manera, va a la lista de
   * abajo con el motivo.
   */
  const FORMAS_DE_RESOLVERLO = [
    "userIdParaEmailSinDuplicarCampanita",
    "userId: null",
    // billing decide por evento: no todos sus avisos llevan push.
    "pushAcompanaEsteAviso",
  ];

  const RESUELTO_DE_OTRA_FORMA = new Map<string, string>([
    // Ejemplo de como se declara una excepcion:
    // ["modules/x/notifications.ts", "manda a audiencias disjuntas por diseño"],
  ]);

  const MANDA_PUSH = /\bsendPushToUsers\b|\bsendPushToOrg\b/;
  const MANDA_EMAIL = /\bsendTransactionalEmail\b|\bsendEmail\b/;

  it("todo flujo que manda push y email declara como evita el duplicado", () => {
    const sinDeclarar: string[] = [];

    for (const archivo of recorrer(RAIZ)) {
      const rel = relativo(archivo);

      // Los primitivos son justamente los que escriben las filas.
      if (rel.startsWith("infrastructure/push/") || rel.startsWith("infrastructure/email/")) continue;
      if (rel === "shared/lib/brevo.ts" || rel === "shared/lib/notification-recipients.ts") continue;

      const codigo = codigoDe(archivo);
      if (!MANDA_PUSH.test(codigo) || !MANDA_EMAIL.test(codigo)) continue;
      if (FORMAS_DE_RESOLVERLO.some((forma) => codigo.includes(forma))) continue;
      if (RESUELTO_DE_OTRA_FORMA.has(rel)) continue;

      sinDeclarar.push(rel);
    }

    expect(
      sinDeclarar,
      "Estos archivos mandan push y email del mismo evento, asi que la misma persona " +
        "puede quedar con el aviso repetido en la campanita. Usá " +
        "userIdParaEmailSinDuplicarCampanita (shared/lib/notification-recipients.ts) " +
        "para que el email no repita la fila de quien ya recibe el push, o sumalos a " +
        "RESUELTO_DE_OTRA_FORMA con el motivo:\n  " + sinDeclarar.join("\n  "),
    ).toEqual([]);
  });
});

describe("los avisos de un modulo respetan la locacion", () => {
  /**
   * employeesWhoCanOperate devuelve a todos los que pueden operar el modulo,
   * sin mirar donde trabajan. Notificar con esa lista le manda el aviso de un
   * local a gente de otro -- que muchas veces ni siquiera puede ver eso en la
   * app, asi que toca la notificacion y no encuentra nada.
   *
   * Ya paso tres veces: en el filtro por puesto de avisos y checklists, en
   * mantenimiento (8d6213ab) y en proveedores (976d75da). La version con
   * alcance es employeesWhoCanOperateWithScope.
   */
  const SIN_ALCANCE_JUSTIFICADO = new Map<string, string>([
    [
      "modules/maintenance/services/maintenance-events.service.ts",
      "notifyMaintenanceResponseByEmail: el pedido fue explicito, el email va a " +
        "cualquiera con el permiso y no solo a quien atiende esa sucursal",
    ],
  ]);

  it("quien resuelve destinatarios sin alcance lo tiene declarado", () => {
    const sinDeclarar: string[] = [];

    for (const archivo of recorrer(RAIZ)) {
      const rel = relativo(archivo);
      if (rel === "shared/lib/notification-recipients.ts") continue;

      const codigo = codigoDe(archivo);

      // La version con alcance contiene a la otra como prefijo: se descuenta
      // para no contar de mas.
      const conAlcance = (codigo.match(/employeesWhoCanOperateWithScope/g) ?? []).length;
      const total = (codigo.match(/employeesWhoCanOperate/g) ?? []).length;
      if (total - conAlcance === 0) continue;
      if (SIN_ALCANCE_JUSTIFICADO.has(rel)) continue;

      sinDeclarar.push(rel);
    }

    expect(
      sinDeclarar,
      "Estos archivos arman la lista de destinatarios sin mirar la locacion, asi que " +
        "el aviso de un local le llega a gente de otro. Usá " +
        "employeesWhoCanOperateWithScope y filtrá por la locacion de lo que estás " +
        "avisando, o sumalos a SIN_ALCANCE_JUSTIFICADO con el motivo:\n  " +
        sinDeclarar.join("\n  "),
    ).toEqual([]);
  });
});
