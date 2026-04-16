import { Redis } from "@upstash/redis";
import { resolveUpstashConfig } from "@/shared/lib/upstash-env";

let redisClient: Redis | null | undefined;

function getRedisClient() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const config = resolveUpstashConfig();
  if (!config) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url: config.url, token: config.token });
  return redisClient;
}

function toRuntimeKey(scope: string, key: string) {
  return `ai-runtime:${scope}:${key}`;
}

export async function applySharedRateLimit(params: {
  userId: string;
  windowMs: number;
  maxRequests: number;
}) {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const key = toRuntimeKey("ratelimit", params.userId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, params.windowMs);
  }

  return count <= params.maxRequests;
}

export async function getSharedRuntimeValue<T>(scope: string, key: string) {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  const data = await redis.get<T>(toRuntimeKey(scope, key));
  return data ?? null;
}

export async function setSharedRuntimeValue<T>(params: {
  scope: string;
  key: string;
  value: T;
  ttlSeconds: number;
}) {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  await redis.set(toRuntimeKey(params.scope, params.key), params.value, {
    ex: params.ttlSeconds,
  });
  return true;
}

export async function deleteSharedRuntimeValue(scope: string, key: string) {
  const redis = getRedisClient();
  if (!redis) {
    return false;
  }

  await redis.del(toRuntimeKey(scope, key));
  return true;
}
