import { EXTENSION_HTTP_TIMEOUT_MS } from './constants';

/**
 * 插件侧发起的 fetch（侧栏 / background），带超时；与网页自身导航、XHR 无关。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = EXTENSION_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}
