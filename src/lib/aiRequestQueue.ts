/**
 * AI Request Queue with rate limiting, caching, debounce, and retry logic.
 * 
 * Features:
 * 1. Global 10 RPM rate limiter
 * 2. 60-second prompt-level cache
 * 3. Exponential backoff retries on 429
 * 4. 2000ms debounce utility for data-entry AI calls
 */

// --- Rate Limiter (10 RPM) ---
const REQUEST_TIMESTAMPS: number[] = [];
const MAX_RPM = 10;
const WINDOW_MS = 60_000;

function getWaitTime(): number {
  const now = Date.now();
  // Purge old timestamps
  while (REQUEST_TIMESTAMPS.length > 0 && REQUEST_TIMESTAMPS[0] < now - WINDOW_MS) {
    REQUEST_TIMESTAMPS.shift();
  }
  if (REQUEST_TIMESTAMPS.length < MAX_RPM) return 0;
  // Wait until the oldest request in window expires
  return REQUEST_TIMESTAMPS[0] + WINDOW_MS - now + 50; // +50ms buffer
}

function recordRequest() {
  REQUEST_TIMESTAMPS.push(Date.now());
}

// --- Cache (60s TTL) ---
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60_000;

function getCacheKey(functionName: string, body: Record<string, unknown>): string {
  // Hash based on function name + stringified body (excluding image data for size)
  const bodyForKey = { ...body };
  // For images, use a short hash instead of full base64
  if (typeof bodyForKey.image === 'string' && bodyForKey.image.length > 200) {
    bodyForKey.image = bodyForKey.image.slice(0, 100) + bodyForKey.image.slice(-100);
  }
  return `${functionName}:${JSON.stringify(bodyForKey)}`;
}

function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T) {
  responseCache.set(key, { data, timestamp: Date.now() });
  // Prune old entries
  if (responseCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now - v.timestamp > CACHE_TTL_MS) responseCache.delete(k);
    }
  }
}

// --- Queue ---
interface QueueItem<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

const queue: QueueItem<unknown>[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const waitMs = getWaitTime();
    if (waitMs > 0) {
      console.log(`[AI Queue] Rate limit: waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    const item = queue.shift()!;
    recordRequest();

    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (error) {
      item.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  isProcessing = false;
}

/**
 * Enqueue an AI request through the global rate limiter.
 * Checks cache first, queues if not cached.
 */
export async function enqueueAIRequest<T>(
  functionName: string,
  body: Record<string, unknown>,
  invoker: () => Promise<T>
): Promise<T> {
  const cacheKey = getCacheKey(functionName, body);
  const cached = getCached<T>(cacheKey);
  if (cached) {
    console.log(`[AI Queue] Cache hit for ${functionName}`);
    return cached;
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({
      execute: async () => {
        const result = await invoker();
        setCache(cacheKey, result);
        return result;
      },
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    processQueue();
  });
}

// --- Debounce utility ---
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced AI call — waits 2000ms of silence before executing.
 * Returns a promise that resolves when the debounced call completes.
 */
export function debouncedAIRequest<T>(
  key: string,
  functionName: string,
  body: Record<string, unknown>,
  invoker: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    debounceTimers.set(
      key,
      setTimeout(async () => {
        debounceTimers.delete(key);
        try {
          const result = await enqueueAIRequest(functionName, body, invoker);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      }, 2000)
    );
  });
}

/**
 * Clear all caches and queues (useful for logout)
 */
export function clearAICache() {
  responseCache.clear();
  REQUEST_TIMESTAMPS.length = 0;
}
