/**
 * Unit tests for arena CLI command builders (dry-run path, no network).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cmdArenaRegister, usageText } from "./src/commands.mjs";
import { API_SURFACES, SITE_SURFACES, hubLinks } from "./src/catalog.mjs";

describe("cheshire-cli arena commands", () => {
  it("usage documents arena:register", () => {
    const text = usageText();
    assert.match(text, /arena:register/);
    assert.match(text, /arena:enter/);
    assert.match(text, /arena:list/);
  });

  it("catalog exposes arena surfaces", () => {
    assert.equal(SITE_SURFACES.arena, "/arena");
    assert.equal(SITE_SURFACES.agentArena, "/agent-arena");
    assert.equal(API_SURFACES.arenaAgentsRegister, "/api/arena/agents/register");
    const hubs = hubLinks("https://cheshireterminal.ai");
    assert.equal(hubs.arena, "https://cheshireterminal.ai/arena");
    assert.equal(hubs.api.arenaRegister, "https://cheshireterminal.ai/api/arena/agents/register");
  });

  it("arena:register dry-run builds payload for kimi-k3 default", async () => {
    const result = await cmdArenaRegister({
      name: "CLI Bot",
      model: "kimi-k3",
      provider: "moonshot",
      host: true,
      confirm: false,
      siteUrl: "https://cheshireterminal.ai",
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.payload.name, "CLI Bot");
    assert.equal(result.payload.model, "kimi-k3");
    assert.equal(result.payload.host, true);
    assert.equal(result.payload.cli, true);
    assert.match(result.targetUrl, /\/api\/arena\/agents\/register$/);
    assert.match(result.page, /\/arena$/);
  });

  it("arena:register requires name", async () => {
    const result = await cmdArenaRegister({ confirm: true });
    assert.equal(result.ok, false);
    assert.match(result.error, /name/i);
  });
});
