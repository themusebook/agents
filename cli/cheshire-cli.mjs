#!/usr/bin/env node
/**
 * Cheshire Terminal CLI entrypoint.
 * Defaults to https://cheshireterminal.ai — override with CHESHIRE_SITE_URL.
 */
import { runCommand } from "./src/commands.mjs";

const argv = process.argv.slice(2);

const { exitCode, result, text } = await runCommand(argv);

if (text) {
  console.log(text);
} else {
  console.log(JSON.stringify(result, null, 2));
}

process.exit(exitCode ?? 0);
