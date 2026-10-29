import assert from "node:assert/strict";
import test from "node:test";
import {
  isEphemeralOnly,
  redactSecrets,
  sanitizeLogPayload,
  zeroRetentionProviderPreferences,
} from "./privacy.js";
import { loadConfig } from "./config.js";

test("default config is ephemeral + zero retention", () => {
  const prevP = process.env.HEADLESS_SESSION_PERSIST;
  const prevZ = process.env.HEADLESS_ZERO_RETENTION;
  delete process.env.HEADLESS_SESSION_PERSIST;
  delete process.env.HEADLESS_ZERO_RETENTION;
  try {
    const cfg = loadConfig();
    assert.equal(cfg.sessionPersistence, false);
    assert.equal(isEphemeralOnly(cfg.sessionPersistence), true);
    assert.equal(cfg.zeroRetention, true);
    const pref = zeroRetentionProviderPreferences(cfg.zeroRetention);
    assert.equal(pref?.data_collection, "deny");
  } finally {
    if (prevP === undefined) delete process.env.HEADLESS_SESSION_PERSIST;
    else process.env.HEADLESS_SESSION_PERSIST = prevP;
    if (prevZ === undefined) delete process.env.HEADLESS_ZERO_RETENTION;
    else process.env.HEADLESS_ZERO_RETENTION = prevZ;
  }
});

test("redactSecrets strips API key shapes", () => {
  const s = redactSecrets("key sk-or-v1-abc123DEF and Bearer tok_xyz ct_sk_abc_def");
  assert.ok(!s.includes("sk-or-v1-abc123DEF"));
  assert.ok(!s.includes("tok_xyz"));
  assert.ok(s.includes("[REDACTED]"));
});

test("sanitizeLogPayload drops prompt and messages", () => {
  const safe = sanitizeLogPayload({
    event: "test",
    prompt: "secret user text",
    messages: [{ role: "user", content: "nope" }],
    model: "x",
    step: 1,
  });
  assert.equal(safe.event, "test");
  assert.equal(safe.model, "x");
  assert.equal(safe.step, 1);
  assert.equal((safe as any).prompt, undefined);
  assert.equal((safe as any).messages, undefined);
});
