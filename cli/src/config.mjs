/**
 * Cheshire Terminal CLI — config & credential resolution.
 * Defaults to https://cheshireterminal.ai; override with CHESHIRE_SITE_URL.
 */
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

export const DEFAULT_SITE_URL = "https://cheshireterminal.ai";
export const CLI_NAME = "cheshire-cli";
export const CLI_BRAND = "Cheshire Terminal";
/** npm package name when published */
export const CLI_PACKAGE_NAME = "cheshire-terminal-cli";
export const CLI_HUB_URL = "https://cheshireterminal.ai/cli";
export const CLI_GATEWAY_URL = "https://cheshireterminal.ai/gateway";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Package root (npm package install or local clone). */
export const CLI_ROOT = join(__dirname, "..");

/**
 * Resolve the Cheshire site origin (no trailing slash).
 * Priority: explicit option → CHESHIRE_SITE_URL → CHESHIRE_API_URL → default.
 */
export function resolveSiteUrl(override) {
  const raw =
    (typeof override === "string" && override.trim()) ||
    process.env.CHESHIRE_SITE_URL?.trim() ||
    process.env.CHESHIRE_API_URL?.trim() ||
    DEFAULT_SITE_URL;
  return String(raw).replace(/\/+$/, "") || DEFAULT_SITE_URL;
}

/** API base: `${site}/api` */
export function resolveApiBase(override) {
  const site = resolveSiteUrl(override);
  return `${site}/api`;
}

export function credentialsPath() {
  const fromEnv = process.env.CHESHIRE_CREDENTIALS_PATH?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".config", "cheshire-terminal", "credentials.json");
}

export async function loadCredentials() {
  const path = credentialsPath();
  try {
    await access(path, fsConstants.R_OK);
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export async function saveCredentials(partial) {
  const path = credentialsPath();
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const existing = await loadCredentials();
  const next = {
    ...existing,
    ...partial,
    updatedAt: new Date().toISOString(),
    siteUrl: partial.siteUrl || existing.siteUrl || resolveSiteUrl(),
  };
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

/**
 * Resolve API key for authenticated calls.
 * Priority: explicit → CHESHIRE_API_KEY → credentials file.
 */
export async function resolveApiKey(explicit) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (process.env.CHESHIRE_API_KEY?.trim()) return process.env.CHESHIRE_API_KEY.trim();
  const creds = await loadCredentials();
  if (typeof creds.apiKey === "string" && creds.apiKey.trim()) return creds.apiKey.trim();
  return null;
}

export function registrationJsonPath(name = "cheshire-registration.json") {
  return join(CLI_ROOT, name);
}

export async function loadRegistrationJson(filePath) {
  const path = filePath || registrationJsonPath();
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}
