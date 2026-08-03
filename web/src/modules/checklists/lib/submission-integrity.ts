export type ExactChecklistItemSetResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "duplicate" | "mismatch" };

export function validateExactChecklistItemSet(
  submittedItemIds: string[],
  expectedItemIds: string[],
): ExactChecklistItemSetResult {
  if (submittedItemIds.length === 0 || expectedItemIds.length === 0) {
    return { ok: false, reason: "empty" };
  }

  const submitted = new Set(submittedItemIds);
  if (submitted.size !== submittedItemIds.length) {
    return { ok: false, reason: "duplicate" };
  }

  const expected = new Set(expectedItemIds);
  if (
    expected.size !== expectedItemIds.length ||
    submitted.size !== expected.size ||
    expectedItemIds.some((id) => !submitted.has(id))
  ) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}

export function resolveChecklistSubmissionBranch(input: {
  templateBranchId: string | null;
  tenantBranchId: string | null;
  employeeBranchId: string | null;
}) {
  return input.templateBranchId ?? input.tenantBranchId ?? input.employeeBranchId ?? null;
}
