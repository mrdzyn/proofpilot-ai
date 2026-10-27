import type { FetchLike } from '../packages/inference/src/index.ts';

export const SENTINEL_KEY = 'pp-test-sentinel-key-4f1d9a77c2';

export type RecordedCall = { url: string; init: RequestInit };

/** Mock fetch that replays queued responses (or throws queued errors) and records calls. */
export function mockFetch(queue: Array<Response | Error | (() => Promise<Response>)>) {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: no queued response');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { fetch, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const metaEnv = (extra: Record<string, string> = {}) => ({ MODEL_API_KEY: SENTINEL_KEY, ...extra });
