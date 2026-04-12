const DOCUSEAL_API_URL = (
  process.env.DOCUSEAL_API_URL || "https://api.docuseal.com"
).replace(/\/$/, "");
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || "";

/** Tiempo máximo de espera para cada llamada a DocuSeal API (ms) */
const DOCUSEAL_FETCH_TIMEOUT_MS = 15_000;

/** Tamaño máximo permitido de PDF para firma (bytes) */
export const DOCUSEAL_MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

function assertDocusealEnv() {
  if (!DOCUSEAL_API_KEY) {
    throw new Error("Falta DOCUSEAL_API_KEY");
  }
}

async function docusealFetch(path: string, init: RequestInit) {
  assertDocusealEnv();

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    DOCUSEAL_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${DOCUSEAL_API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "X-Auth-Token": DOCUSEAL_API_KEY,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
            ? payload.message
            : `DocuSeal error ${response.status}`;
      throw new Error(message);
    }

    return payload;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `DocuSeal API timeout después de ${DOCUSEAL_FETCH_TIMEOUT_MS / 1000}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function createPdfSubmission(input: {
  name: string;
  documentName: string;
  /** Base64-encoded PDF content OR a publicly-downloadable file URL */
  documentFile: string;
  submitterName: string;
  submitterEmail: string;
  externalId: string;
}) {
  const payload = (await docusealFetch("/submissions/pdf", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      send_email: false,
      documents: [
        {
          name: input.documentName,
          file: input.documentFile,
          fields: [
            {
              name: "Firma",
              type: "signature",
              role: "Empleado",
              required: true,
              // Coordenadas relativas 0-1 (según doc oficial DocuSeal)
              // x:0.55 y:0.78 = sector inferior derecho visible, bien dentro del margen
              areas: [{ page: 1, x: 0.55, y: 0.78, w: 0.38, h: 0.07 }],
            },
            {
              name: "Fecha de firma",
              type: "date",
              role: "Empleado",
              required: true,
              // Debajo de la firma
              areas: [{ page: 1, x: 0.55, y: 0.87, w: 0.25, h: 0.04 }],
            },
          ],
        },
      ],
      submitters: [
        {
          role: "Empleado",
          name: input.submitterName,
          email: input.submitterEmail,
          external_id: input.externalId,
          send_email: false,
        },
      ],
    }),
  })) as {
    id?: number;
    submitters?: Array<{
      slug?: string;
      embed_src?: string;
      status?: string;
    }>;
  };

  const submitter = payload.submitters?.[0];
  if (!payload.id || !submitter?.slug || !submitter?.embed_src) {
    throw new Error("DocuSeal no devolvio datos de firma embebida");
  }

  return {
    submissionId: payload.id,
    submitterSlug: submitter.slug,
    embedSrc: submitter.embed_src,
    submitterStatus: submitter.status || "sent",
  };
}

export async function getSubmission(submissionId: number) {
  return docusealFetch(`/submissions/${submissionId}`, {
    method: "GET",
  }) as Promise<{
    id: number;
    status: string;
    submitters?: Array<{
      slug?: string;
      status?: string;
      completed_at?: string | null;
      declined_at?: string | null;
      documents?: Array<{ url?: string; name?: string }>;
    }>;
    documents?: Array<{ url?: string; name?: string }>;
  }>;
}

export async function deleteSubmission(submissionId: number) {
  await docusealFetch(`/submissions/${submissionId}`, {
    method: "DELETE",
  });
}
