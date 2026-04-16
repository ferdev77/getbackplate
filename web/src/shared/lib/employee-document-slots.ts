export type EmployeeDocumentSlotKey = "photo" | "id" | "ssn" | "rec1" | "rec2" | "other";

type EmployeeDocumentSlotDefinition = {
  slot: EmployeeDocumentSlotKey;
  label: string;
  icon: string;
  titlePrefixes: string[];
};

export const EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS: EmployeeDocumentSlotDefinition[] = [
  {
    slot: "photo",
    label: "Foto del Empleado",
    icon: "📷",
    titlePrefixes: ["Foto del Empleado - "],
  },
  {
    slot: "id",
    label: "ID / Identificacion",
    icon: "🪪",
    titlePrefixes: ["ID / Identificacion - "],
  },
  {
    slot: "ssn",
    label: "SSN / EAD",
    icon: "📋",
    titlePrefixes: ["SSN / EAD - ", "Numero de Seguro Social - "],
  },
  {
    slot: "rec1",
    label: "Food Handler Certificate",
    icon: "📄",
    titlePrefixes: ["Food Handler Certificate - ", "Carta de Recomendacion 1 - "],
  },
  {
    slot: "rec2",
    label: "Alcohol Server Certificate",
    icon: "📄",
    titlePrefixes: ["Alcohol Server Certificate - ", "Carta de Recomendacion 2 - "],
  },
  {
    slot: "other",
    label: "Food Protection Manager",
    icon: "📄",
    titlePrefixes: ["Food Protection Manager - ", "Otro Documento - "],
  },
];

const SLOT_BY_PREFIX = EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.flatMap((item) =>
  item.titlePrefixes.map((prefix) => ({ prefix, slot: item.slot })),
);

export function resolveEmployeeDocumentSlotFromTitle(title: string | null | undefined): EmployeeDocumentSlotKey | null {
  const normalizedTitle = String(title ?? "").trim();
  if (!normalizedTitle) return null;
  return SLOT_BY_PREFIX.find((item) => normalizedTitle.startsWith(item.prefix))?.slot ?? null;
}

export function getEmployeeDocumentSlotLabel(slot: EmployeeDocumentSlotKey) {
  return EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.find((item) => item.slot === slot)?.label ?? slot;
}
