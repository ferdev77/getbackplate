import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { combinarLocaciones, locacionesDe } from "../location-sources";

/**
 * La regla de "que locaciones alcanza una persona" y su guardia.
 *
 * El dato vive por triplicado -- employees, memberships y
 * organization_user_profiles -- y cada lugar que lo combinaba a mano lo hacia un
 * poco distinto. De ahi salieron los desfases: alguien veia un checklist y no
 * podia abrirlo, o no aparecia al filtrar por una locacion que si tenia.
 */

const TODAS = ["loc-a", "loc-b", "loc-c"];

describe("combinarLocaciones", () => {
  it("suma las locaciones de todas las fuentes, sin repetir", () => {
    const { locationIds } = combinarLocaciones({
      fuentes: [
        { branch_id: "loc-a", location_scope_ids: ["loc-b"] },
        { branch_id: "loc-b", location_scope_ids: ["loc-c"] },
      ],
      todasLasLocaciones: TODAS,
    });

    expect(locationIds.sort()).toEqual(["loc-a", "loc-b", "loc-c"]);
  });

  it("si cualquier fuente dice todas, son todas", () => {
    // El caso real: sin sucursal propia pero con el permiso de todas.
    const { locationIds, alcanzaTodas } = combinarLocaciones({
      fuentes: [{ branch_id: null }, { all_locations: true }],
      todasLasLocaciones: TODAS,
    });

    expect(alcanzaTodas).toBe(true);
    expect(locationIds.sort()).toEqual(TODAS);
  });

  it("una sola locación se resuelve igual", () => {
    expect(locacionesDe([{ branch_id: "loc-a" }], TODAS)).toEqual(["loc-a"]);
  });

  it("suma la locación del contexto cuando la hay", () => {
    const { locationIds } = combinarLocaciones({
      fuentes: [{ branch_id: "loc-a" }],
      todasLasLocaciones: TODAS,
      locacionDelContexto: "loc-b",
    });

    expect(locationIds.sort()).toEqual(["loc-a", "loc-b"]);
  });

  it("ignora fuentes vacías y valores nulos", () => {
    expect(
      locacionesDe([null, undefined, { branch_id: null, location_scope_ids: null }], TODAS),
    ).toEqual([]);
  });

  it("sin ninguna locación devuelve una lista vacía, no todas", () => {
    // Confundir "sin locaciones" con "todas" seria dar acceso de mas.
    const { locationIds, alcanzaTodas } = combinarLocaciones({
      fuentes: [{ all_locations: false }],
      todasLasLocaciones: TODAS,
    });

    expect(alcanzaTodas).toBe(false);
    expect(locationIds).toEqual([]);
  });
});

/**
 * Guardia contra el problema que motivo todo esto: que alguien vuelva a
 * resolver el alcance por su cuenta en otro archivo.
 *
 * Solo los de abajo pueden leer estos campos. Se dividen en dos grupos:
 * los que *deciden* acceso -- que ya pasan por combinarLocaciones -- y las
 * pantallas que *editan* esos campos, donde no se decide nada.
 *
 * Si aparece un archivo nuevo, este test corta. Sumarlo a la lista es una
 * decision consciente, no un descuido.
 */
describe("nadie mas resuelve locaciones por su cuenta", () => {
  // __tests__ -> lib -> employees -> modules -> src
  const RAIZ = path.join(__dirname, "..", "..", "..", "..");

  const PERMITIDOS = new Set([
    // La regla y sus dos entradas.
    "modules/employees/lib/location-sources.ts",
    "modules/employees/lib/api-scope.ts",
    "modules/employees/lib/location-scope.ts",
    // Resolucion a granel, ya usa la regla.
    "shared/lib/audience-resolver.ts",
    "shared/lib/scope-users-catalog.ts",
    // Alta, edicion y listado de personas: muestran y guardan los campos.
    "app/(company)/app/employees/page.tsx",
    "app/(employee)/portal/layout.tsx",
    "app/api/company/employees/_handlers/get.ts",
    "app/api/company/employees/_handlers/post.ts",
    "app/api/company/users/route.ts",
    "app/api/employee/employees/route.ts",
    "modules/employees/services.ts",
    "modules/employees/services/company-employees-route-support.ts",
    "modules/employees/services/employee-edit-detail.ts",
    "modules/employees/ui/new-employee-modal.tsx",
    // Pregunta si una locacion esta en uso antes de borrarla. No resuelve el
    // alcance de nadie: cuenta gente que la tiene, propia o asignada.
    "modules/settings/services/org-structure.service.ts",
    // Traen las filas y se las pasan al resolvedor.
    "app/(employee)/portal/announcements/page.tsx",
    "app/(employee)/portal/checklist/page.tsx",
    "app/(employee)/portal/checklist/reports/page.tsx",
    "app/(employee)/portal/documents/page.tsx",
    "app/(employee)/portal/home/page.tsx",
    "app/(employee)/portal/vendors/page.tsx",
    "app/api/employee/checklists/reports/route.ts",
    "app/api/employee/checklists/review/route.ts",
    "shared/lib/employee-documents-root-folder.ts",
  ]);

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

  it("solo los archivos autorizados leen all_locations o location_scope_ids", () => {
    const intrusos: string[] = [];

    for (const archivo of recorrer(RAIZ)) {
      const relativo = path.relative(RAIZ, archivo).split(path.sep).join("/");
      if (PERMITIDOS.has(relativo)) continue;
      if (relativo.startsWith("shared/types/")) continue;

      // Sin comentarios: nombrar el campo al explicar algo no es usarlo.
      const contenido = readFileSync(archivo, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");

      if (contenido.includes("all_locations") || contenido.includes("location_scope_ids")) {
        intrusos.push(relativo);
      }
    }

    expect(
      intrusos,
      "Estos archivos resuelven locaciones por su cuenta. Usá combinarLocaciones " +
        "(modules/employees/lib/location-sources.ts) o, si solo estás mostrando el campo, " +
        "sumalos a PERMITIDOS con ese motivo:\n  " + intrusos.join("\n  "),
    ).toEqual([]);
  });
});

/**
 * Guardia de escritura.
 *
 * Los campos de alcance se guardan en tres tablas. No divergen porque se
 * escriben juntas con los mismos valores, y para que siga siendo asi todos los
 * que escriben arman el payload con camposDeAlcance.
 *
 * Se afirma en positivo -- "estos archivos lo usan" -- en vez de rastrear
 * payloads a mano: distinguir un payload de una declaracion de tipo mirando el
 * texto da falsos positivos, y una guardia que molesta se termina ignorando.
 */
describe("los que escriben el alcance usan camposDeAlcance", () => {
  // __tests__ -> lib -> employees -> modules -> src
  const RAIZ = path.join(__dirname, "..", "..", "..", "..");

  const ESCRITORES = [
    "app/api/company/employees/_handlers/post.ts",
    "app/api/company/users/route.ts",
    "app/api/employee/employees/route.ts",
    "modules/employees/services/company-employees-route-support.ts",
  ];

  for (const ruta of ESCRITORES) {
    it(`${ruta} arma el payload con el helper`, () => {
      const contenido = readFileSync(path.join(RAIZ, ruta), "utf8");
      expect(
        contenido.includes("camposDeAlcance("),
        `${ruta} dejo de usar camposDeAlcance: si volvio a armar el payload a mano, ` +
          "los tres lugares donde se guarda el alcance pueden quedar diciendo cosas distintas",
      ).toBe(true);
    });
  }
});
