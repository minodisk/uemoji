import { sleep } from "./sleep";

export type FetchSlackOptions = {
  maxAttempts?: number;
  totalDeadlineMs?: number;
  now?: () => number;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 8000;
const DEFAULT_JITTER_MS = 500;
const FALLBACK_RATE_LIMIT_MS = 1000;

export class SlackRetryError extends Error {
  constructor(
    message: string,
    readonly lastResponse?: Response,
    readonly lastError?: unknown,
  ) {
    super(message);
  }
}

export const parseRetryAfter = (
  value: string | null,
  now: number = Date.now(),
): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
};

const expoBackoff = (attempt: number): number => {
  const base = Math.min(
    DEFAULT_BASE_DELAY_MS * Math.pow(2, attempt),
    DEFAULT_MAX_BACKOFF_MS,
  );
  return base + Math.random() * DEFAULT_JITTER_MS;
};

const isRatelimitedBody = async (
  res: Response,
): Promise<{ ratelimited: boolean; cloned: Response }> => {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return { ratelimited: false, cloned: res };
  }
  const cloned = res.clone();
  try {
    const body = (await cloned.json()) as { ok?: boolean; error?: string };
    if (body && body.ok === false && body.error === "ratelimited") {
      return { ratelimited: true, cloned: res };
    }
  } catch {
    // fall through
  }
  return { ratelimited: false, cloned: res };
};

export const fetchSlackWithRetry = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: FetchSlackOptions = {},
): Promise<Response> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const deadline = options.totalDeadlineMs;
  const now = options.now ?? (() => Date.now());
  const start = now();

  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline === undefined ? Infinity : deadline - (now() - start);
    if (remaining <= 0) {
      throw new SlackRetryError("deadline exceeded", lastResponse, lastError);
    }

    let res: Response;
    try {
      res = await fetch(input, init);
    } catch (e) {
      lastError = e;
      console.log(
        `slack-retry: fetch error attempt=${attempt + 1}/${maxAttempts}`,
        e,
      );
      if (attempt + 1 >= maxAttempts) {
        throw new SlackRetryError("fetch failed", undefined, e);
      }
      const wait = expoBackoff(attempt);
      if (wait >= remaining) {
        throw new SlackRetryError("deadline exceeded", undefined, e);
      }
      await sleep(wait);
      continue;
    }

    lastResponse = res;

    if (res.status === 429) {
      const headerWait = parseRetryAfter(res.headers.get("retry-after"), now());
      const wait = headerWait ?? FALLBACK_RATE_LIMIT_MS;
      console.log(
        `slack-retry: 429 attempt=${attempt + 1}/${maxAttempts} retry-after=${wait}ms`,
      );
      if (attempt + 1 >= maxAttempts) {
        return res;
      }
      if (wait >= remaining) {
        throw new SlackRetryError("deadline exceeded", res);
      }
      await sleep(wait);
      continue;
    }

    if (res.status >= 500 && res.status < 600) {
      console.log(
        `slack-retry: ${res.status} attempt=${attempt + 1}/${maxAttempts}`,
      );
      if (attempt + 1 >= maxAttempts) {
        return res;
      }
      const wait = expoBackoff(attempt);
      if (wait >= remaining) {
        throw new SlackRetryError("deadline exceeded", res);
      }
      await sleep(wait);
      continue;
    }

    if (res.status >= 400 && res.status < 500) {
      return res;
    }

    // 200 OK: may still be a soft rate limit
    const { ratelimited } = await isRatelimitedBody(res);
    if (ratelimited) {
      const headerWait = parseRetryAfter(res.headers.get("retry-after"), now());
      const wait = headerWait ?? FALLBACK_RATE_LIMIT_MS;
      console.log(
        `slack-retry: body ratelimited attempt=${attempt + 1}/${maxAttempts} retry-after=${wait}ms`,
      );
      if (attempt + 1 >= maxAttempts) {
        return res;
      }
      if (wait >= remaining) {
        throw new SlackRetryError("deadline exceeded", res);
      }
      await sleep(wait);
      continue;
    }

    return res;
  }

  throw new SlackRetryError(
    "max attempts exceeded",
    lastResponse,
    lastError,
  );
};
