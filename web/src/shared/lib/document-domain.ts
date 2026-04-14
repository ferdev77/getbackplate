const PAGE_SIZE = 1000;

type EmployeeDocumentsRangeResponse = {
  data: Array<{ document_id: string | null }> | null;
  error: { message?: string } | null;
};

type EmployeePathDocumentsRangeResponse = {
  data: Array<{ id: string; file_path: string | null }> | null;
  error: { message?: string } | null;
};

type EmployeeDocumentsLinkCheckResponse = {
  data: Array<{ id: string }> | null;
  error: { message?: string } | null;
};

type DocumentPathLookupResponse = {
  data: { id?: string; file_path?: string | null } | null;
  error: { message?: string } | null;
};

function isEmployeeStoragePath(filePath: string | null | undefined, organizationId: string) {
  const value = String(filePath ?? "").trim();
  return value.startsWith(`${organizationId}/employees/`);
}

export async function getEmployeeDocumentIdSet(supabase: unknown, organizationId: string) {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          range: (from: number, to: number) => Promise<unknown>;
        };
      };
    };
  };

  const ids = new Set<string>();

  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const response = await client
      .from("employee_documents")
      .select("document_id")
      .eq("organization_id", organizationId)
      .range(from, to);

    const { data, error } = (response ?? {
      data: null,
      error: { message: "No se pudo leer documentos de empleados" },
    }) as EmployeeDocumentsRangeResponse;

    if (error) {
      throw new Error(error.message || "No se pudo leer documentos de empleados");
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.document_id) ids.add(row.document_id);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const response = await (client
      .from("documents")
      .select("id, file_path")
      .eq("organization_id", organizationId) as unknown as {
      like: (column: string, pattern: string) => {
        range: (from: number, to: number) => Promise<unknown>;
      };
    })
      .like("file_path", `${organizationId}/employees/%`)
      .range(from, to);

    const { data, error } = (response ?? {
      data: null,
      error: { message: "No se pudo leer documentos de empleados por ruta" },
    }) as EmployeePathDocumentsRangeResponse;

    if (error) {
      throw new Error(error.message || "No se pudo leer documentos de empleados por ruta");
    }

    const rows = data ?? [];
    for (const row of rows) {
      if (row.id) ids.add(row.id);
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return ids;
}

export async function isEmployeeLinkedDocument(supabase: unknown, organizationId: string, documentId: string) {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            limit: (count: number) => Promise<unknown>;
          };
        };
      };
    };
  };

  const linkResponse = await client
    .from("employee_documents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .limit(1);

  const { data, error } = (linkResponse ?? {
    data: null,
    error: { message: "No se pudo validar dominio documental" },
  }) as EmployeeDocumentsLinkCheckResponse;

  if (error) {
    throw new Error(error.message || "No se pudo validar dominio documental");
  }

  if ((data?.length ?? 0) > 0) {
    return true;
  }

  const documentResponse = await (client
    .from("documents")
    .select("id, file_path")
    .eq("organization_id", organizationId) as unknown as {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<unknown>;
    };
  })
    .eq("id", documentId)
    .maybeSingle();

  const { data: documentRow, error: documentError } = (documentResponse ?? {
    data: null,
    error: null,
  }) as DocumentPathLookupResponse;

  if (documentError) {
    throw new Error(documentError.message || "No se pudo validar ruta documental");
  }

  return isEmployeeStoragePath(documentRow?.file_path ?? null, organizationId);
}
