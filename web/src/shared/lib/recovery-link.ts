const TOKEN_HASH_PATTERN = /^[a-f0-9]{32,128}$/i;

export function normalizeRecoveryTokenHash(value: string | null | undefined): string | null {
  const tokenHash = String(value ?? "").trim();
  if (!tokenHash) {
    return null;
  }

  if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
    return null;
  }

  return tokenHash;
}

export function buildRecoveryBridgeUrl(params: {
  appUrl: string;
  tokenHash: string;
  organizationIdHint?: string | null;
}) {
  const tokenHash = normalizeRecoveryTokenHash(params.tokenHash);
  if (!tokenHash) {
    throw new Error("Invalid recovery token hash");
  }

  const target = new URL("/auth/recovery-link", params.appUrl);
  target.searchParams.set("t", tokenHash);
  if (params.organizationIdHint) {
    target.searchParams.set("org", params.organizationIdHint);
  }
  return target.toString();
}

export function buildRecoveryCallbackUrl(params: {
  appUrl: string;
  tokenHash: string;
  organizationIdHint?: string | null;
}) {
  const tokenHash = normalizeRecoveryTokenHash(params.tokenHash);
  if (!tokenHash) {
    return null;
  }

  const callback = new URL("/auth/callback", params.appUrl);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", "recovery");
  callback.searchParams.set("next", "/auth/change-password?reason=recovery");
  if (params.organizationIdHint) {
    callback.searchParams.set("org", params.organizationIdHint);
  }

  return callback.toString();
}
