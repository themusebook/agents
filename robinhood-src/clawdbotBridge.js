/**
 * Optional bridge from cheshire-terminal-agents → published clawdbot-go
 * (Zero Clawd runtime). No hard dependency — documents + optionally invokes
 * `npx clawdbot-go …` so operators can install the runtime from the agents CLI.
 *
 * Package: https://www.npmjs.com/package/clawdbot-go
 * Hosted:  https://cheshireterminal.ai/zeroclawd
 */
import { spawnSync } from "node:child_process";

export const CLAWDBOT_GO_NPM = "clawdbot-go";
export const CLAWDBOT_GO_NPM_URL = "https://www.npmjs.com/package/clawdbot-go";
export const CLAWDBOT_GO_REGISTRY_LATEST =
  "https://registry.npmjs.org/clawdbot-go/latest";
export const ZERO_CLAWD_HOSTED_URL = "https://cheshireterminal.ai/zeroclawd";
export const ZERO_CLAWD_DEFAULT_AGENT_BASE = "http://127.0.0.1:18800";

/** @typedef {"oneshot" | "skills" | "npm-global" | "npm-local"} ClawdbotInstallMode */

/**
 * Install / connect hints for the published Zero Clawd package.
 * Deliberately separate from this package's nested packages/* oneshot.
 */
export function clawdbotGoInstallHints() {
  return {
    npmPackage: CLAWDBOT_GO_NPM,
    npmUrl: CLAWDBOT_GO_NPM_URL,
    registryLatest: CLAWDBOT_GO_REGISTRY_LATEST,
    installLocal: "npm i clawdbot-go",
    installGlobal: "npm i -g clawdbot-go",
    installGlobalWithScripts:
      "npm install -g --allow-scripts=clawdbot-go clawdbot-go",
    oneshot: "npx clawdbot-go install",
    skills: "npx clawdbot-go skills-install --force",
    skillsList: "npx clawdbot-go skills",
    hosted: ZERO_CLAWD_HOSTED_URL,
    hostedAliases: ["/zeroclawd", "/clawdbot-go", "/clawdbot"],
    defaultAgentBase: ZERO_CLAWD_DEFAULT_AGENT_BASE,
    cors: "export CLAWDBOT_CORS_ORIGINS=https://cheshireterminal.ai",
    note:
      "cheshire-terminal-agents is catalog/forge + nested TS packages. " +
      "clawdbot-go is the Zero Clawd runtime (skills prepackage + optional full stack). " +
      "Install both when you need identity forge and a local agent console.",
    bridgeCommands: {
      info: "npx cheshire-terminal-agents clawdbot-info",
      install: "npx cheshire-terminal-agents clawdbot-install",
      skillsOnly: "npx cheshire-terminal-agents clawdbot-install --skills-only",
    },
  };
}

/**
 * External related packages (not vendored under packages/).
 * Used by packages-list / packages-inspect for discoverability.
 */
export const EXTERNAL_PACKAGE_CATALOG = Object.freeze([
  Object.freeze({
    id: "clawdbot-go",
    name: "clawdbot-go",
    kind: "external-npm",
    npm: CLAWDBOT_GO_NPM,
    npmUrl: CLAWDBOT_GO_NPM_URL,
    hosted: ZERO_CLAWD_HOSTED_URL,
    description:
      "Zero Clawd oneshot runtime — RH skill pack (23), CLI bins, web console :18800",
    install: "npm i -g clawdbot-go",
    oneshot: "npx clawdbot-go install",
    skills: "npx clawdbot-go skills-install --force",
  }),
]);

export function listExternalPackageIds() {
  return EXTERNAL_PACKAGE_CATALOG.map((e) => e.id);
}

export function getExternalPackage(id) {
  const entry = EXTERNAL_PACKAGE_CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown external package id: ${id}`);
  return entry;
}

/**
 * Build an ordered install plan (no side effects).
 * @param {{ mode?: ClawdbotInstallMode, force?: boolean, withScripts?: boolean }} [opts]
 */
export function planClawdbotInstall(opts = {}) {
  const mode = opts.mode || "oneshot";
  const force = Boolean(opts.force);
  const withScripts = opts.withScripts !== false;
  const hints = clawdbotGoInstallHints();
  /** @type {{ step: string, command: string, argv: string[] }[]} */
  const steps = [];

  if (mode === "npm-local") {
    steps.push({
      step: "npm-local",
      command: hints.installLocal,
      argv: ["npm", "i", CLAWDBOT_GO_NPM],
    });
  } else if (mode === "npm-global") {
    steps.push({
      step: "npm-global",
      command: withScripts ? hints.installGlobalWithScripts : hints.installGlobal,
      argv: withScripts
        ? ["npm", "install", "-g", `--allow-scripts=${CLAWDBOT_GO_NPM}`, CLAWDBOT_GO_NPM]
        : ["npm", "i", "-g", CLAWDBOT_GO_NPM],
    });
  } else if (mode === "skills") {
    steps.push({
      step: "skills-install",
      command: force ? "npx clawdbot-go skills-install --force" : "npx clawdbot-go skills-install",
      argv: force
        ? ["npx", "--yes", CLAWDBOT_GO_NPM, "skills-install", "--force"]
        : ["npx", "--yes", CLAWDBOT_GO_NPM, "skills-install"],
    });
  } else {
    // oneshot full stack
    steps.push({
      step: "oneshot",
      command: force ? "npx clawdbot-go install --force" : "npx clawdbot-go install",
      argv: force
        ? ["npx", "--yes", CLAWDBOT_GO_NPM, "install", "--force"]
        : ["npx", "--yes", CLAWDBOT_GO_NPM, "install"],
    });
  }

  return {
    package: CLAWDBOT_GO_NPM,
    npmUrl: CLAWDBOT_GO_NPM_URL,
    hosted: ZERO_CLAWD_HOSTED_URL,
    mode,
    force,
    steps,
    after: {
      skillsDir: 'export CLAWDBOT_SKILLS_DIR="$HOME/.clawdbot/skills"',
      cors: hints.cors,
      connect: `Open ${ZERO_CLAWD_HOSTED_URL} → Connect ${ZERO_CLAWD_DEFAULT_AGENT_BASE}`,
    },
    hints,
  };
}

/**
 * Execute the install plan by spawning npm/npx (not a mock).
 * @param {{ mode?: ClawdbotInstallMode, force?: boolean, dryRun?: boolean, withScripts?: boolean }} [opts]
 */
export function runClawdbotInstall(opts = {}) {
  const plan = planClawdbotInstall(opts);
  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      plan,
      results: [],
    };
  }

  /** @type {{ step: string, status: number | null, stdout: string, stderr: string }[]} */
  const results = [];
  for (const step of plan.steps) {
    const [cmd, ...args] = step.argv;
    const result = spawnSync(cmd, args, {
      encoding: "utf8",
      env: process.env,
      shell: process.platform === "win32",
    });
    results.push({
      step: step.step,
      status: result.status,
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
      error: result.error ? String(result.error.message || result.error) : null,
    });
    if (result.status !== 0) {
      return {
        ok: false,
        dryRun: false,
        plan,
        results,
        error:
          results.at(-1)?.stderr ||
          results.at(-1)?.error ||
          `clawdbot-go install step "${step.step}" failed (exit ${result.status})`,
        hints: plan.hints,
      };
    }
  }

  return {
    ok: true,
    dryRun: false,
    plan,
    results,
    next: plan.after,
    hints: plan.hints,
  };
}
