import { serverTool } from '@openrouter/agent';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';
import {
  zkComputeNullifierTool,
  zkInspectConfigTool,
  zkLoadProofTool,
  zkOneshotTool,
  zkReadManifestTool,
  zkRouteIntentTool,
  zkVerifyProofShapeTool,
} from './zk-tools.js';
import { zkOmniOneshotTool, zkOmniPlanTool } from './zk-omni-tools.js';

export const tools = [
  // Coding tools
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,

  // ZK Shark domain tools (one-shot capable)
  zkComputeNullifierTool,
  zkLoadProofTool,
  zkVerifyProofShapeTool,
  zkRouteIntentTool,
  zkInspectConfigTool,
  zkReadManifestTool,
  zkOneshotTool,

  // ZK Omnichain Robinhood ↔ Solana
  zkOmniPlanTool,
  zkOmniOneshotTool,

  // OpenRouter server tools
  serverTool({ type: 'openrouter:web_search' }),
  serverTool({ type: 'openrouter:datetime', parameters: { timezone: 'UTC' } }),
];
