#!/usr/bin/env node
/**
 * Cheshire agent registration helper.
 * Prefer: node cheshire-cli.mjs register:agent --dry-run
 *         node cheshire-cli.mjs register:user --wallet <pubkey>
 *
 * Heavy dual-rail forge: npx cheshire-terminal-agents prepare-robinhood|omni-mint-plan
 */
import { runCommand } from "./src/commands.mjs";

const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0].startsWith("--");
const argv = hasCommand ? args : ["register:agent", "--dry-run", ...args];

const { exitCode, result, text } = await runCommand(argv);
if (text) console.log(text);
else console.log(JSON.stringify(result, null, 2));
process.exit(exitCode ?? 0);
