import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSlackWithRetry, parseRetryAfter, SlackRetryError } from "./fetch-retry";

const makeResponse = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("parseRetryAfter", () => {
  it("parses integer seconds", () => {
    expect(parseRetryAfter("2")).toBe(2000);
  });

  it("parses HTTP-date", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const future = "Thu, 01 Jan 2026 00:00:05 GMT";
    expect(parseRetryAfter(future, now)).toBe(5000);
  });

  it("returns null for missing", () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("returns null for invalid", () => {
    expect(parseRetryAfter("not-a-number")).toBeNull();
  });
});

describe("fetchSlackWithRetry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const run = async <T>(p: Promise<T>): Promise<T> => {
    await vi.runAllTimersAsync();
    return p;
  };

  it("retries on 429 with Retry-After then returns 200", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate limit", {
          status: 429,
          headers: { "retry-after": "2" },
        }),
      )
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const promise = fetchSlackWithRetry("https://slack.test/api/foo", {});
    const res = await run(promise);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after maxAttempts consecutive 429", async () => {
    fetchMock.mockResolvedValue(
      new Response("rate limit", {
        status: 429,
        headers: { "retry-after": "1" },
      }),
    );

    const promise = fetchSlackWithRetry(
      "https://slack.test/api/foo",
      {},
      { maxAttempts: 3 },
    );
    const res = await run(promise);
    expect(res.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries on 503 with exponential backoff", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("server err", { status: 503 }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const promise = fetchSlackWithRetry("https://slack.test/api/foo", {});
    const res = await run(promise);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns 4xx (non-429) without retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));

    const promise = fetchSlackWithRetry("https://slack.test/api/foo", {});
    const res = await run(promise);
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on body { ok: false, error: 'ratelimited' }", async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(200, { ok: false, error: "ratelimited" }))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const promise = fetchSlackWithRetry("https://slack.test/api/foo", {});
    const res = await run(promise);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on fetch reject with exponential backoff", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const promise = fetchSlackWithRetry("https://slack.test/api/foo", {});
    const res = await run(promise);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws SlackRetryError when totalDeadlineMs would be exceeded", async () => {
    fetchMock.mockResolvedValue(
      new Response("rate limit", {
        status: 429,
        headers: { "retry-after": "10" },
      }),
    );

    const promise = fetchSlackWithRetry(
      "https://slack.test/api/foo",
      {},
      { totalDeadlineMs: 1000 },
    );
    const expectation = expect(promise).rejects.toBeInstanceOf(SlackRetryError);
    await vi.runAllTimersAsync();
    await expectation;
  });
});
