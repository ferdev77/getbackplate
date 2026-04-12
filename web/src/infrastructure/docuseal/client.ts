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
  documentFileBase64: string;
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
          file: input.documentFileBase64,
          fields: [
            {
              name: "Firma",
              type: "signature",
              role: "Empleado",
              required: true,
              areas: [{ page: 1, x: 0.58, y: 0.88, w: 0.34, h: 0.045 }],
            },
            {
              name: "Fecha de firma",
              type: "date",
              role: "Empleado",
              required: true,
              areas: [{ page: 1, x: 0.58, y: 0.935, w: 0.2, h: 0.03 }],
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
