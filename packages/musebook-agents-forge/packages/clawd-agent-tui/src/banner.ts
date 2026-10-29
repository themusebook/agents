const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const GRAY = '\x1b[90m';

// CLAWD — block letters sized for ~60 columns
const LOGO = `
   ██████╗██╗      █████╗ ██╗    ██╗██████╗
  ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗
  ██║     ██║     ███████║██║ █╗ ██║██║  ██║
  ██║     ██║     ██╔══██║██║███╗██║██║  ██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝`;

const SUB = '  ZK Shark  ·  Shark of All Streets  ·  nullifiers · groth16 · light';

export function printBanner(model: string): void {
  console.log(CYAN + BOLD + LOGO + RESET);
  console.log(MAGENTA + SUB + RESET);
  console.log(`  ${DIM}model${RESET}  ${CYAN}${model}${RESET}`);
  console.log(`  ${DIM}mode ${RESET}  ${GRAY}interactive · --oneshot "…" for single-shot${RESET}`);
  console.log();
}
