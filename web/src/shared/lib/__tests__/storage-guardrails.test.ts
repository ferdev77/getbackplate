import { describe, expect, it } from "vitest";

import { isAllowedDocumentMime, isAllowedDocumentSize, isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { MAX_UPLOAD_SIZE_BYTES } from "@/shared/lib/upload-limits";

/**
 * Las dos preguntas que se le hacen a una ruta de storage antes de tocarla:
 * si el archivo entra por tamano y tipo, y si la ruta pertenece a la empresa
 * que esta pidiendo.
 *
 * La de la ruta es la que importa de verdad. Desde que la subida es directa, el
 * navegador manda una ruta y el servidor la usa tal cual para leer o registrar
 * el archivo; sin esta comprobacion, una ruta armada a mano podria leer el
 * bucket de otra empresa, que es compartido.
 */

const ORG = "00000000-0000-4000-8000-000000000001";
const OTRA_ORG = "00000000-0000-4000-8000-000000000002";

describe("isAllowedDocumentSize", () => {
  it("acepta un archivo justo en el tope y rechaza el que se pasa por un byte", () => {
    expect(isAllowedDocumentSize(MAX_UPLOAD_SIZE_BYTES)).toBe(true);
    expect(isAllowedDocumentSize(MAX_UPLOAD_SIZE_BYTES + 1)).toBe(false);
  });

  it("rechaza vacio, negativo y basura", () => {
    expect(isAllowedDocumentSize(0)).toBe(false);
    expect(isAllowedDocumentSize(-1)).toBe(false);
    expect(isAllowedDocumentSize(null)).toBe(false);
    expect(isAllowedDocumentSize(undefined)).toBe(false);
    expect(isAllowedDocumentSize(Number.NaN)).toBe(false);
  });
});

describe("isAllowedDocumentMime", () => {
  it("acepta los tipos del catalogo sin importar como vengan escritos", () => {
    expect(isAllowedDocumentMime("application/pdf")).toBe(true);
    expect(isAllowedDocumentMime("IMAGE/PNG")).toBe(true);
  });

  it("rechaza lo que no esta en el catalogo", () => {
    expect(isAllowedDocumentMime("application/x-msdownload")).toBe(false);
    expect(isAllowedDocumentMime("")).toBe(false);
    expect(isAllowedDocumentMime(null)).toBe(false);
  });
});

describe("isSafeTenantStoragePath", () => {
  it("acepta una ruta que arranca con la carpeta de la empresa", () => {
    expect(isSafeTenantStoragePath(`${ORG}/1738000000-contrato.pdf`, ORG)).toBe(true);
    expect(isSafeTenantStoragePath(`${ORG}/employees/emp-1/company/id/1738-foto.png`, ORG)).toBe(true);
    expect(isSafeTenantStoragePath(`${ORG}/staging/employees/1738-doc.pdf`, ORG)).toBe(true);
  });

  it("rechaza la carpeta de otra empresa", () => {
    expect(isSafeTenantStoragePath(`${OTRA_ORG}/1738-contrato.pdf`, ORG)).toBe(false);
  });

  it("rechaza subir de carpeta con .. aunque arranque bien", () => {
    expect(isSafeTenantStoragePath(`${ORG}/../${OTRA_ORG}/contrato.pdf`, ORG)).toBe(false);
    expect(isSafeTenantStoragePath(`${ORG}/employees/../../${OTRA_ORG}/x.pdf`, ORG)).toBe(false);
  });

  it("rechaza rutas absolutas, carpetas y vacio", () => {
    expect(isSafeTenantStoragePath(`/${ORG}/contrato.pdf`, ORG)).toBe(false);
    expect(isSafeTenantStoragePath(`${ORG}/employees/`, ORG)).toBe(false);
    expect(isSafeTenantStoragePath("", ORG)).toBe(false);
    expect(isSafeTenantStoragePath("   ", ORG)).toBe(false);
  });

  it("no se deja enganar por una organizacion que empieza igual", () => {
    // Sin la barra, "org-1" haria pasar a "org-10".
    expect(isSafeTenantStoragePath(`${ORG}-bis/contrato.pdf`, ORG)).toBe(false);
  });

  it("normaliza las barras invertidas antes de decidir", () => {
    expect(isSafeTenantStoragePath(`${ORG}\\employees\\emp-1\\foto.png`, ORG)).toBe(true);
    expect(isSafeTenantStoragePath(`${ORG}\\..\\${OTRA_ORG}\\foto.png`, ORG)).toBe(false);
  });

  it("solo acepta el prefijo de semillas cuando se lo pide explicitamente", () => {
    expect(isSafeTenantStoragePath("seed/demo.pdf", ORG)).toBe(false);
    expect(isSafeTenantStoragePath("seed/demo.pdf", ORG, { allowLegacySeedPrefix: true })).toBe(true);
  });
});
