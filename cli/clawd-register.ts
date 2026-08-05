/**
 * Cheshire Terminal agent registration (TypeScript entry).
 *
 * Replaces the old openclawd Metaplex stub that used solanaclawd.com placeholders.
 * Site defaults: https://cheshireterminal.ai
 *
 * Usage:
 *   npx tsx cli/clawd-register.ts --dry-run
 *   npx tsx cli/clawd-register.ts register:user --wallet <base58>
 *   npx tsx cli/clawd-register.ts register:agent --confirm --name my-agent
 *
 * Dual-rail forge (EVM + Solana) lives in the cheshire-terminal-agents package:
 *   npx cheshire-terminal-agents prepare-robinhood --file cli/cheshire-registration.json
 *   npx cheshire-terminal-agents omni-mint-plan --file agent.json --chain 46630
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "cheshire-cli.mjs");
const args = process.argv.slice(2);
const forwarded =
  args.length === 0 || args[0]?.startsWith("--")
    ? ["register:agent", "--dry-run", ...args]
    : args;

const result = spawnSync(process.execPath, [entry, ...forwarded], {
  stdio: "inherit",
  env: {
    ...process.env,
    CHESHIRE_SITE_URL: process.env.CHESHIRE_SITE_URL || "https://cheshireterminal.ai",
  },
});

process.exit(result.status ?? 1);
