import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Como se leen los documentos del expediente que manda el formulario de alta.
 *
 * Existe por dos problemas reales:
 *
 * 1. El alta del portal no leia estos campos: parseaba el multipart, descartaba
 *    los archivos y respondia "empleado creado" con el expediente vacio.
 *
 * 2. Los adicionales se casan por posicion con custom_document_title. Si una
 *    fila viene sin archivo y el arreglo se corre un lugar, el documento queda
 *    guardado con el titulo de otro.
 *
 * Ademas, desde que la subida es directa el navegador manda una ruta y no los
 * bytes: una ruta de otra empresa no puede terminar leyendose.
 */

const mocks = vi.hoisted(() => ({
  readUploadedFile: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/shared/lib/direct-upload", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/direct-upload")>();
  return { ...original, readUploadedFile: mocks.readUploadedFile };
});

vi.mock("@/shared/lib/file-security", () => ({ analyzeUploadedFile: mocks.analyze }));

const ORG = "00000000-0000-4000-8000-000000000001";
const OTRA_ORG = "00000000-0000-4000-8000-000000000002";

function archivo(nombre: string) {
  return new File(["contenido"], nombre, { type: "application/pdf" });
}

async function leer(formData: FormData) {
  const { readEmployeeDocumentUploads } = await import("../employee-documents-upload.service");
  return readEmployeeDocumentUploads({ formData, organizationId: ORG });
}

describe("readEmployeeDocumentUploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyze.mockImplementation(async (file: File) => ({
      safeName: file.name,
      originalName: file.name,
      normalizedMime: "application/pdf",
      checksumSha256: "abc",
    }));
  });

  it("toma los slots fijos que vienen dentro del formulario", async () => {
    const formData = new FormData();
    formData.set("document_file_id", archivo("ine.pdf"));
    formData.set("document_file_ssn", archivo("ssn.pdf"));

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.uploads.map((u) => u.slotKey)).toEqual(["id", "ssn"]);
    expect(resultado.uploads[0].slotLabel).toBe("ID / Identificacion");
    expect(resultado.stagingPaths).toEqual([]);
  });

  it("ignora los slots que no traen archivo", async () => {
    const formData = new FormData();
    formData.set("document_file_id", new File([], "vacio.pdf"));

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.uploads).toEqual([]);
  });

  it("baja los bytes cuando el slot llega como ruta de la carpeta de paso", async () => {
    const ruta = `${ORG}/staging/employees/1738-ine.pdf`;
    mocks.readUploadedFile.mockResolvedValue({ ok: true, file: archivo("ine.pdf") });

    const formData = new FormData();
    formData.set("document_file_id__path", ruta);
    formData.set("document_file_id__name", "ine.pdf");

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(mocks.readUploadedFile).toHaveBeenCalledWith(expect.anything(), ruta, "ine.pdf");
    expect(resultado.uploads).toHaveLength(1);
    // Quien llama necesita la ruta para borrarla despues de copiar el archivo.
    expect(resultado.stagingPaths).toEqual([ruta]);
  });

  it("no lee una ruta que apunta a otra empresa", async () => {
    const formData = new FormData();
    formData.set("document_file_id__path", `${OTRA_ORG}/staging/employees/1738-ine.pdf`);

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(false);
    expect(mocks.readUploadedFile).not.toHaveBeenCalled();
    expect(resultado.ok === false && resultado.message).toContain("ruta de archivo invalida");
  });

  it("no lee una ruta que se sale de la carpeta de la empresa con ..", async () => {
    const formData = new FormData();
    formData.set("custom_document_path", `${ORG}/../${OTRA_ORG}/robado.pdf`);
    formData.set("custom_document_title", "Adicional");

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(false);
    expect(mocks.readUploadedFile).not.toHaveBeenCalled();
  });

  it("le da a cada adicional su titulo aunque una fila venga vacia", async () => {
    mocks.readUploadedFile.mockResolvedValue({ ok: true, file: archivo("carta.pdf") });

    const formData = new FormData();
    formData.append("custom_document_title", "Carta de renuncia");
    formData.append("custom_document_title", "Constancia fiscal");
    // La primera fila quedo sin archivo: la subida directa igual manda su lugar.
    formData.append("custom_document_path", "");
    formData.append("custom_document_path", `${ORG}/staging/employees/1738-constancia.pdf`);
    formData.append("custom_document_name", "");
    formData.append("custom_document_name", "constancia.pdf");

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.uploads).toHaveLength(1);
    expect(resultado.uploads[0].slotLabel).toBe("Constancia fiscal");
    expect(resultado.uploads[0].slotKey).toBe("custom_2");
  });

  it("corta y devuelve las rutas ya bajadas cuando un archivo no pasa el analisis", async () => {
    const ruta = `${ORG}/staging/employees/1738-ine.pdf`;
    mocks.readUploadedFile.mockResolvedValue({ ok: true, file: archivo("ine.pdf") });
    mocks.analyze.mockRejectedValue(new Error("Tipo de archivo no permitido"));

    const formData = new FormData();
    formData.set("document_file_id__path", ruta);

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain("Tipo de archivo no permitido");
    // Se informan igual para que el handler las borre y no queden colgadas.
    expect(resultado.stagingPaths).toEqual([ruta]);
  });

  it("propaga el error cuando la ruta de paso no tiene bytes", async () => {
    mocks.readUploadedFile.mockResolvedValue({ ok: false, message: "El archivo subido llego vacio" });

    const formData = new FormData();
    formData.set("document_file_photo__path", `${ORG}/staging/employees/1738-foto.png`);

    const resultado = await leer(formData);

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain("llego vacio");
  });
});
