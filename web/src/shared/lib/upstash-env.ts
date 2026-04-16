type UpstashConfig = {
  url: string;
  token: string;
};

export function resolveUpstashConfig(): UpstashConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    "";

  if (!url || !token) {
    return null;
  }

  return { url, token };
}
