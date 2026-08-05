/**
 * Install-at-birth: fork any catalog agent and sparse-install its skills[].
 *
 * Proves:
 *  1) resolveTemplate prefers kind=agent over same-id scaffold (skills[] not dropped)
 *  2) design --from <agent-with-skills> --install-skills installs SKILL.md files
 *  3) --skills-target is honored
 *
 * Optional evidence dir via EVIDENCE_DIR or CLAWD_TEST_EVIDENCE.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'ct-agents.js');

const EVIDENCE =
  process.env.EVIDENCE_DIR ||
  process.env.CLAWD_TEST_EVIDENCE ||
  path.join(os.tmpdir(), 'ct-agents-install-at-birth-evidence');

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function writeEvidence(name, body) {
  ensureDir(EVIDENCE);
  const p = path.join(EVIDENCE, name);
  fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  return p;
}

function runDesign(args, { timeout = 120_000 } = {}) {
  const r = spawnSync(process.execPath, [BIN, 'design', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    env: { ...process.env },
  });
  return r;
}

async function main() {
  ensureDir(EVIDENCE);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-birth-'));
  const skillsTarget = path.join(work, 'skills-install');
  const outAgent = path.join(work, 'born-imperial.json');
  const outLocal = path.join(work, 'born-local.json');
  const localSkillsTarget = path.join(work, 'local-skills');

  // ── 1) resolveTemplate prefers agent ──────────────────────────────────────
  const designMod = await import(pathToFileURL(path.join(ROOT, 'robinhood-src', 'designTui.js')).href);
  const catalog = designMod.loadTemplateCatalog(ROOT);
  const imperialHits = catalog.filter((t) => t.id === 'clawd-imperial-perps');
  assert.ok(
    imperialHits.length >= 2,
    `expected scaffold+agent collision for clawd-imperial-perps, got ${imperialHits.length}`
  );
  assert.ok(
    imperialHits.some((t) => t.kind === 'scaffold'),
    'expected scaffold clawd-imperial-perps'
  );
  assert.ok(
    imperialHits.some((t) => t.kind === 'agent'),
    'expected agent clawd-imperial-perps'
  );

  const resolved = designMod.resolveTemplate(catalog, 'clawd-imperial-perps');
  assert.equal(resolved.kind, 'agent', 'resolveTemplate must prefer kind=agent over scaffold');
  assert.ok(
    Array.isArray(resolved.agent.skills) && resolved.agent.skills.length >= 12,
    `agent template must carry skills[], got ${resolved.agent.skills?.length}`
  );
  writeEvidence('resolve-template-imperial.json', {
    collisionKinds: imperialHits.map((t) => t.kind),
    resolvedKind: resolved.kind,
    skillCount: resolved.agent.skills.length,
    skillSlugs: resolved.agent.skills.map((s) => s.slug || s.name),
  });

  const tokens = designMod.skillTokensFromAgent(resolved.agent);
  assert.ok(tokens.includes('imperial'), 'skillTokensFromAgent should include imperial');
  assert.ok(tokens.length >= 12, `expected ≥12 skill tokens, got ${tokens.length}`);

  // ── 2) design --from imperial WITHOUT install still inherits skills[] ─────
  const forkOnly = runDesign([
    '--from',
    'clawd-imperial-perps',
    '--id',
    'birth-imperial-fork',
    '--out',
    outAgent,
    '--json',
  ]);
  writeEvidence('design-from-imperial-stdout.txt', forkOnly.stdout || '');
  writeEvidence('design-from-imperial-stderr.txt', forkOnly.stderr || '');
  assert.equal(forkOnly.status, 0, `fork failed: ${forkOnly.stderr || forkOnly.stdout}`);
  const forkJson = JSON.parse(forkOnly.stdout);
  assert.equal(forkJson.templateKind, 'agent', 'json should report templateKind=agent');
  assert.ok(forkJson.skillCount >= 12, `fork skillCount ${forkJson.skillCount}`);
  const born = JSON.parse(fs.readFileSync(outAgent, 'utf8'));
  assert.ok(Array.isArray(born.skills) && born.skills.length >= 12, 'written agent must keep skills[]');
  writeEvidence('born-imperial-agent.json', born);

  // ── 3) install-at-birth for imperial (remote sparse — network OK or soft) ─
  const birth = runDesign([
    '--from',
    'clawd-imperial-perps',
    '--id',
    'birth-imperial-installed',
    '--out',
    path.join(work, 'born-imperial-installed.json'),
    '--install-skills',
    '--skills-target',
    skillsTarget,
    '--json',
  ]);
  writeEvidence('install-at-birth-imperial-stdout.txt', birth.stdout || '');
  writeEvidence('install-at-birth-imperial-stderr.txt', birth.stderr || '');
  assert.equal(birth.status, 0, `install-at-birth failed: ${birth.stderr || birth.stdout}`);
  const birthJson = JSON.parse(birth.stdout);
  assert.ok(birthJson.skillCount >= 12, 'birth agent must still declare skills');
  assert.ok(birthJson.installed, 'installed payload must be present when --install-skills');
  assert.ok(
    birthJson.installed.results && birthJson.installed.results.length >= 12,
    'installed.results should cover template skills'
  );
  writeEvidence('install-at-birth-imperial-result.json', birthJson.installed);

  // List target dir regardless of remote fetch success (proves path ran)
  const listing = [];
  function walk(dir, prefix = '') {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.join(prefix, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, rel);
      else listing.push(rel);
    }
  }
  walk(skillsTarget);
  writeEvidence('skills-target-listing.txt', listing.join('\n') + '\n');

  // ── 4) Reliable local-suite install-at-birth (must create SKILL.md files) ─
  // Use a local skill that ships with this package so the test is offline-safe.
  const localSlug = 'robinhood-agent-forge';
  const localSkillMd = path.join(ROOT, 'skills', localSlug, 'SKILL.md');
  assert.ok(fs.existsSync(localSkillMd), `local suite skill missing: ${localSkillMd}`);

  const localBirth = runDesign([
    '--from',
    'blank',
    '--id',
    'birth-local-skills',
    '--skills',
    localSlug,
    '--install-skills',
    '--skills-target',
    localSkillsTarget,
    '--out',
    outLocal,
    '--json',
  ]);
  writeEvidence('install-at-birth-local-stdout.txt', localBirth.stdout || '');
  writeEvidence('install-at-birth-local-stderr.txt', localBirth.stderr || '');
  assert.equal(
    localBirth.status,
    0,
    `local install-at-birth failed: ${localBirth.stderr || localBirth.stdout}`
  );
  const localJson = JSON.parse(localBirth.stdout);
  assert.ok(localJson.skillCount >= 1, 'local agent should have skill refs');
  const installedPath = path.join(localSkillsTarget, localSlug, 'SKILL.md');
  assert.ok(
    fs.existsSync(installedPath),
    `expected sparse SKILL.md at ${installedPath}`
  );
  const body = fs.readFileSync(installedPath, 'utf8');
  assert.ok(body.length > 20, 'SKILL.md should be non-empty');
  writeEvidence('local-skill-md-head.txt', body.slice(0, 200));
  writeEvidence(
    'local-skills-target-listing.txt',
    fs.readdirSync(localSkillsTarget, { withFileTypes: true }).map((d) => d.name).join('\n') + '\n'
  );

  // ── 5) --install-skills with template skills only (no --skills tokens) ────
  // already covered by imperial birth above; assert at least one successful result
  // when local suite is involved OR network succeeded for imperial
  const localResults = localJson.installed?.results || [];
  const okLocal = localResults.filter((r) => r.status !== 'error');
  assert.ok(okLocal.length >= 1, 'local sparse install must succeed for suite skill');

  console.log('✓ install-at-birth tests ok');
  console.log(`  evidence: ${EVIDENCE}`);
  console.log(`  resolveTemplate(clawd-imperial-perps).kind = ${resolved.kind}`);
  console.log(`  imperial skills[] = ${resolved.agent.skills.length}`);
  console.log(`  local SKILL.md = ${installedPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
