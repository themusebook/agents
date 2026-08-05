#!/usr/bin/env node
/**
 * npm bin entry for cheshire-terminal-cli
 * (plain .js path for maximum npm/Windows compatibility)
 */
import { runCommand } from "../src/commands.mjs";

const argv = process.argv.slice(2);
const { exitCode, result, text } = await runCommand(argv);

if (text) {
  console.log(text);
} else {
  console.log(JSON.stringify(result, null, 2));
}

process.exit(exitCode ?? 0);
