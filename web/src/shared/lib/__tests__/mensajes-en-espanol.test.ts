import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Los mensajes al usuario se escriben en español.
 *
 * Es la convencion del proyecto: el codigo va en español y el ingles sale de un
 * diccionario por modulo (ver settings.i18n.ts o qbo-r365.i18n.ts), elegido por
 * resolveUserLocale. Los planes de integracion ven ingles; los de plataforma,
 * español.
 *
 * Estos modulos habian quedado al reves: con el texto en ingles escrito a mano,
 * asi que un cliente de plataforma veia "Document uploaded successfully." y no
 * habia forma de traducirlo sin reescribirlo. Este test evita que vuelva a
 * entrar.
 *
 * Si algun dia hace falta ingles en estos modulos, no se escribe a mano: se
 * agrega su diccionario, como los tres que ya existen.
 */

// __tests__ -> lib -> shared -> src
const RAIZ = path.join(__dirname, "..", "..", "..");

const MODULOS = [
  "modules/checklists",
  "modules/announcements",
  "modules/documents",
  "modules/reports",
  "shared/ui/announcement-create-modal.tsx",
];

/** Palabras que delatan un mensaje en ingles. */
const DELATORES = [
  "successfully",
  "unable to",
  "cannot be",
  "is required",
  "not found",
  "invalid ",
  "please ",
  "could not",
  "failed to",
];

/** Textos de `toast.success(...)`, `toast.error(...)` y `message: "..."`. */
const MENSAJE = /(?:toast\.(?:success|error)\s*\(|setReviewError\s*\(|message:\s*)"([^"]{6,})"/g;

function archivosDe(objetivo: string): string[] {
  const completo = path.join(RAIZ, objetivo);
  if (statSync(completo).isFile()) return [completo];

  const encontrados: string[] = [];
  for (const entrada of readdirSync(completo, { withFileTypes: true })) {
    const hijo = path.join(completo, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "__tests__") continue;
      encontrados.push(...archivosDe(path.relative(RAIZ, hijo)));
      continue;
    }
    if (!/\.tsx?$/.test(entrada.name) || entrada.name.includes(".test.")) continue;
    encontrados.push(hijo);
  }
  return encontrados;
}

function mensajesEnIngles(archivo: string) {
  const contenido = readFileSync(archivo, "utf8");
  const sospechosos: string[] = [];

  for (const coincidencia of contenido.matchAll(MENSAJE)) {
    const texto = coincidencia[1];
    const enMinusculas = texto.toLowerCase();
    if (DELATORES.some((delator) => enMinusculas.includes(delator))) {
      sospechosos.push(texto);
    }
  }

  return sospechosos;
}

describe("los mensajes al usuario van en español", () => {
  for (const objetivo of MODULOS) {
    it(`${objetivo} no tiene mensajes en inglés escritos a mano`, () => {
      const hallazgos: string[] = [];

      for (const archivo of archivosDe(objetivo)) {
        for (const texto of mensajesEnIngles(archivo)) {
          hallazgos.push(`${path.relative(RAIZ, archivo)}: "${texto}"`);
        }
      }

      expect(
        hallazgos,
        `Estos mensajes están en inglés. Escribilos en español; si hace falta inglés, ` +
          `agregá el diccionario del módulo en vez de escribirlo a mano:\n  ${hallazgos.join("\n  ")}`,
      ).toEqual([]);
    });
  }
});
