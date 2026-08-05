/**
 * Minimal HTTP client for Cheshire Terminal site APIs.
 */
import { resolveSiteUrl, resolveApiKey } from "./config.mjs";

export class CheshireHttpError extends Error {
  constructor(message, { status, path, body } = {}) {
    super(message);
    this.name = "CheshireHttpError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.siteUrl]
 * @param {string} [opts.apiKey]
 * @param {number} [opts.timeoutMs]
 */
export function createClient(opts = {}) {
  const siteUrl = resolveSiteUrl(opts.siteUrl);
  const timeoutMs = opts.timeoutMs ?? 25_000;

  async function request(method, path, { body, headers, apiKey } = {}) {
    const url = path.startsWith("http")
      ? path
      : `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const key = apiKey ?? opts.apiKey ?? (await resolveApiKey());
    const hdrs = {
      Accept: "application/json",
      "User-Agent": "cheshire-terminal-cli/1.0",
      ...(key
        ? {
            Authorization: `Bearer ${key}`,
            "x-api-key": key,
          }
        : {}),
      ...headers,
    };
    if (body !== undefined) {
      hdrs["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: hdrs,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text.slice(0, 2000) };
        }
      }
      if (!res.ok) {
        const detail =
          (data && (data.error || data.detail || data.message)) ||
          res.statusText ||
          "request failed";
        throw new CheshireHttpError(String(detail), {
          status: res.status,
          path,
          body: data,
        });
      }
      return { status: res.status, data, headers: res.headers, url };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    siteUrl,
    get: (path, options) => request("GET", path, options),
    post: (path, body, options) => request("POST", path, { ...options, body }),
    request,
  };
}
