import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Paridad entre el panel de admin y el portal de empleado.
 *
 * Cada modulo tiene dos caminos de escritura, uno por portal. Cuando uno de los
 * dos tiene su propia copia de la logica, los arreglos se aplican de un lado y
 * el otro queda atras sin que nada avise. Paso de verdad, y con consecuencias:
 *
 * - Los checklists creados por un empleado decian "Diaria" y no se repartian
 *   nunca, porque esa ruta no creaba el scheduled_job.
 * - Los avisos creados por un empleado no notificaban a nadie, porque esa ruta
 *   no encolaba las entregas. En produccion todos los avisos eran de empleados.
 * - Eliminar un checklist desde el portal seguia archivando en vez de borrar,
 *   despues de haberlo corregido en el panel.
 *
 * Este test mira el codigo fuente, no el comportamiento: comprueba que los dos
 * caminos sigan pasando por las mismas piezas compartidas. Es tosco, pero es lo
 * que hace ruido cuando alguien vuelve a escribir la logica aparte.
 *
 * Lo que NO se compara son las reglas propias del rol -- que locaciones puede
 * alcanzar, a quien puede agregar, que puede editar -- que existen solo del lado
 * del empleado y deben seguir existiendo. Eso se verifica al final.
 */

const RAIZ = path.join(__dirname, "..", "..", "..");

function fuente(relativo: string) {
  return readFileSync(path.join(RAIZ, relativo), "utf8");
}

function alguno(archivos: string[], marca: string) {
  return archivos.some((archivo) => fuente(archivo).includes(marca));
}

type Modulo = {
  nombre: string;
  admin: string[];
  empleado: string[];
  compartido: Array<{ marca: string; porque: string }>;
};

const MODULOS: Modulo[] = [
  {
    nombre: "checklists",
    admin: [
      "modules/checklists/actions.ts",
      "modules/checklists/services/checklist-template.service.ts",
    ],
    empleado: [
      "app/api/employee/checklists/templates/route.ts",
      "modules/checklists/services/checklist-template.service.ts",
    ],
    compartido: [
      { marca: "upsertChecklistTemplate", porque: "guarda por el mismo camino" },
      { marca: "deleteChecklistTemplate", porque: "borra por el mismo camino" },
      { marca: "syncChecklistScheduledJob", porque: "arma el reparto programado" },
      { marca: "sendChecklistAudiencePush", porque: "notifica a la audiencia" },
      { marca: "assertScopeIntent", porque: "valida la intencion del alcance" },
      { marca: "validateTenantScopeReferences", porque: "valida que los ids sean del tenant" },
      { marca: "logAuditEvent", porque: "deja rastro" },
      { marca: "revalidatePath", porque: "refresca las pantallas" },
    ],
  },
  {
    nombre: "avisos",
    admin: [
      "modules/announcements/actions.ts",
      "modules/announcements/services/announcement-upsert.service.ts",
    ],
    empleado: [
      "app/api/employee/announcements/manage/route.ts",
      "modules/announcements/services/announcement-upsert.service.ts",
    ],
    compartido: [
      { marca: "upsertAnnouncement", porque: "guarda por el mismo camino" },
      { marca: "announcement_deliveries", porque: "encola las entregas" },
      { marca: "scheduled_jobs", porque: "arma el reparto periodico" },
      { marca: "assertScopeIntent", porque: "valida la intencion del alcance" },
      { marca: "validateTenantScopeReferences", porque: "valida que los ids sean del tenant" },
      { marca: "logAuditEvent", porque: "deja rastro" },
      { marca: "revalidatePath", porque: "refresca las pantallas" },
    ],
  },
  {
    nombre: "documentos",
    admin: ["app/api/company/documents/route.ts"],
    empleado: ["app/api/employee/documents/manage/route.ts"],
    compartido: [
      { marca: "assertScopeIntent", porque: "valida la intencion del alcance" },
      { marca: "validateTenantScopeReferences", porque: "valida que los ids sean del tenant" },
      { marca: "sendDocumentAudiencePush", porque: "notifica a la audiencia" },
      { marca: "logAuditEvent", porque: "deja rastro" },
      { marca: "revalidateDocumentsCaches", porque: "refresca las pantallas" },
    ],
  },
  {
    nombre: "carpetas",
    admin: ["app/api/company/document-folders/route.ts"],
    empleado: ["app/api/employee/document-folders/route.ts"],
    compartido: [
      { marca: "assertScopeIntent", porque: "valida la intencion del alcance" },
      { marca: "validateTenantScopeReferences", porque: "valida que los ids sean del tenant" },
      { marca: "sendFolderAudiencePush", porque: "notifica a la audiencia" },
      { marca: "logAuditEvent", porque: "deja rastro" },
      { marca: "revalidateDocumentsCaches", porque: "refresca las pantallas" },
    ],
  },
];

describe("paridad entre el panel de admin y el portal de empleado", () => {
  for (const modulo of MODULOS) {
    describe(modulo.nombre, () => {
      for (const { marca, porque } of modulo.compartido) {
        it(`los dos portales ${porque}`, () => {
          expect(
            alguno(modulo.admin, marca),
            `el panel de admin dejo de usar ${marca}`,
          ).toBe(true);
          expect(
            alguno(modulo.empleado, marca),
            `el portal de empleado dejo de usar ${marca}: se desalineo del panel de admin`,
          ).toBe(true);
        });
      }
    });
  }
});

describe("reglas propias del rol empleado", () => {
  const RUTAS_EMPLEADO = [
    "app/api/employee/checklists/templates/route.ts",
    "app/api/employee/announcements/manage/route.ts",
    "app/api/employee/documents/manage/route.ts",
    "app/api/employee/document-folders/route.ts",
  ];

  it("acotan el alcance a las locaciones habilitadas del empleado", () => {
    for (const ruta of RUTAS_EMPLEADO) {
      expect(fuente(ruta), `${ruta} dejo de acotar por locacion`).toContain("enforceLocationPolicy");
    }
  });

  it("solo dejan agregar personas de sus locaciones", () => {
    for (const ruta of RUTAS_EMPLEADO) {
      expect(fuente(ruta), `${ruta} dejo de limitar a quien puede agregar`).toContain(
        "validateEmployeeUserScopeWithinLocations",
      );
    }
  });

  it("no rellenan las locaciones cuando el alcance es solo personas", () => {
    // Si se rellenaran, elegir "solo estas personas" alcanzaria a toda la
    // locacion del empleado, porque los usuarios suman en vez de restar.
    for (const ruta of RUTAS_EMPLEADO) {
      expect(fuente(ruta), `${ruta} volvio a rellenar locaciones siempre`).toContain(
        'fallbackToAllowedWhenEmpty: scopeMode !== "people"',
      );
    }
  });

  it("el panel de admin no aplica las reglas del empleado", () => {
    // Un company admin alcanza toda la organizacion: si apareciera la politica
    // de locaciones aca, estaria acotando de mas.
    const admin = fuente("modules/announcements/actions.ts") + fuente("modules/checklists/actions.ts");
    expect(admin).not.toContain("enforceLocationPolicy");
    expect(admin).not.toContain("validateEmployeeUserScopeWithinLocations");
  });
});
