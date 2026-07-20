export function shouldApplyQboAppDisconnect(connectedAt: string | null, disconnectedAt: string | null) {
  if (!disconnectedAt) return false;
  const disconnectedTime = new Date(disconnectedAt).getTime();
  if (Number.isNaN(disconnectedTime)) return false;
  if (!connectedAt) return true;

  const connectedTime = new Date(connectedAt).getTime();
  return !Number.isNaN(connectedTime) && connectedTime <= disconnectedTime;
}
