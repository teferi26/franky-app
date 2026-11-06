import 'server-only';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';

// Reserve before each paid call. Atomic across instances; failed calls also consume
// a reservation. No fail-open memory budget on a distributed production service.
export const RESERVE_AI_CALL = `
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
local global = tonumber(redis.call('GET', KEYS[1]) or '0')
local user = tonumber(redis.call('GET', KEYS[2]) or '0')
if global >= tonumber(ARGV[1]) or user >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], 90000)
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], 90000)
return 1`;
const positiveLimit = (raw: string | undefined, fallback: number, max: number) => {
  const value = raw === undefined ? fallback : Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= max ? value : 0;
};
function budgetRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(1200) }) : null;
}
const CIRCUIT = 'franky:ai:deepseek:paused';
export async function reserveAiCall(userId: string): Promise<boolean> {
  if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_ENABLED === 'false') return false;
  try {
    const redis = budgetRedis();
    if (!redis) return false;
    const day = new Date().toISOString().slice(0, 10);
    const user = createHash('sha256').update(userId).digest('hex');
    return await redis.eval(RESERVE_AI_CALL,
      [`franky:ai:daily:${day}`, `franky:ai:user:${day}:${user}`, CIRCUIT],
      [positiveLimit(process.env.DEEPSEEK_DAILY_CALL_LIMIT, 1000, 10000), positiveLimit(process.env.DEEPSEEK_USER_DAILY_CALL_LIMIT, 30, 100)]) === 1;
  } catch { return false; }
}
export async function pauseAiProvider(status?: number) {
  // Balance/auth failures back off for five minutes; overload/timeouts for one.
  try { await budgetRedis()?.set(CIRCUIT, 1, { ex: status === 402 || status === 401 ? 300 : 60 }); } catch { /* still fail closed on the next reservation */ }
}
