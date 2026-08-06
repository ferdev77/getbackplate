import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El tope de subida y el bucket que lo aplica.
 *
 * Dos reglas, cada una por un problema real:
 *
 * 1. El tope vive en dos lugares: la constante de la app y el fileSizeLimit del
 *    bucket, que storage aplica del lado del servidor. El helper solo corria
 *    createBucket cuando el bucket faltaba, asi que subir la constante dejaba a
 *    la app aceptando un archivo que storage despues rechazaba con "Payload too
 *    large". Ahora tambien reescribe el tope del bucket que ya existe, sin
 *    cambiarle la visibilidad.
 *
 * 2. Lo que se puede rechazar antes de tener los bytes se rechaza al pedir la
 *    URL firmada: tamano y extension. El formato real se huele despues, al
 *    registrar.
 */

const mocks = vi.hoisted(() => ({
  getBucket: vi.fn(),
  createBucket: vi.fn(),
  updateBucket: vi.fn(),
}));

function adminFalso() {
  return {
    storage: {
      getBucket: mocks.getBucket,
      createBucket: mocks.createBucket,
      updateBucket: mocks.updateBucket,
    },
  } as never;
}

/**
 * El helper recuerda si ya reviso el bucket, para no consultarlo en cada
 * subida. Cada caso necesita el modulo recien cargado.
 */
async function cargarModulo() {
  vi.resetModules();
  return import("@/shared/lib/direct-upload");
}

describe("ensureDocumentsBucket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBucket.mockResolvedValue({ data: null, error: null });
    mocks.updateBucket.mockResolvedValue({ data: null, error: null });
  });

  it("le reescribe el tope al bucket que ya existia con uno mas bajo", async () => {
    const { ensureDocumentsBucket, MAX_UPLOAD_SIZE_BYTES, DOCUMENTS_BUCKET } = await cargarModulo();
    mocks.getBucket.mockResolvedValue({
      data: { name: DOCUMENTS_BUCKET, public: false, file_size_limit: 10 * 1024 * 1024 },
    });

    await ensureDocumentsBucket(adminFalso());

    expect(mocks.createBucket).not.toHaveBeenCalled();
    expect(mocks.updateBucket).toHaveBeenCalledWith(DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_UPLOAD_SIZE_BYTES}`,
    });
  });

  it("no toca la visibilidad del bucket al corregir el tope", async () => {
    const { ensureDocumentsBucket } = await cargarModulo();
    mocks.getBucket.mockResolvedValue({
      data: { name: "tenant-documents", public: true, file_size_limit: 1024 },
    });

    await ensureDocumentsBucket(adminFalso());

    expect(mocks.updateBucket).toHaveBeenCalledWith(
      "tenant-documents",
      expect.objectContaining({ public: true }),
    );
  });

  it("no llama a updateBucket cuando el tope ya es el correcto", async () => {
    const { ensureDocumentsBucket, MAX_UPLOAD_SIZE_BYTES } = await cargarModulo();
    mocks.getBucket.mockResolvedValue({
      data: { name: "tenant-documents", public: false, file_size_limit: MAX_UPLOAD_SIZE_BYTES },
    });

    await ensureDocumentsBucket(adminFalso());

    expect(mocks.updateBucket).not.toHaveBeenCalled();
    expect(mocks.createBucket).not.toHaveBeenCalled();
  });

  it("crea el bucket privado y con el tope cuando no existe", async () => {
    const { ensureDocumentsBucket, MAX_UPLOAD_SIZE_BYTES, DOCUMENTS_BUCKET } = await cargarModulo();
    mocks.getBucket.mockResolvedValue({ data: null });

    await ensureDocumentsBucket(adminFalso());

    expect(mocks.createBucket).toHaveBeenCalledWith(DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_UPLOAD_SIZE_BYTES}`,
    });
    expect(mocks.updateBucket).not.toHaveBeenCalled();
  });
});

describe("assertUploadCandidate", () => {
  it("acepta un archivo justo en el tope", async () => {
    const { assertUploadCandidate, MAX_UPLOAD_SIZE_BYTES } = await cargarModulo();

    expect(assertUploadCandidate({ fileName: "contrato.pdf", fileSize: MAX_UPLOAD_SIZE_BYTES })).toEqual({
      ok: true,
    });
  });

  it("rechaza un archivo un byte por encima del tope", async () => {
    const { assertUploadCandidate, MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } = await cargarModulo();

    const resultado = assertUploadCandidate({
      fileName: "contrato.pdf",
      fileSize: MAX_UPLOAD_SIZE_BYTES + 1,
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain(MAX_UPLOAD_SIZE_LABEL);
  });

  it("rechaza un ejecutable aunque pese poco", async () => {
    const { assertUploadCandidate } = await cargarModulo();

    const resultado = assertUploadCandidate({ fileName: "factura.exe", fileSize: 10 });

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain("bloqueado");
  });

  it("rechaza un archivo vacio o con tamano invalido", async () => {
    const { assertUploadCandidate } = await cargarModulo();

    expect(assertUploadCandidate({ fileName: "a.pdf", fileSize: 0 }).ok).toBe(false);
    expect(assertUploadCandidate({ fileName: "a.pdf", fileSize: -1 }).ok).toBe(false);
    expect(assertUploadCandidate({ fileName: "a.pdf", fileSize: Number.NaN }).ok).toBe(false);
  });
});
