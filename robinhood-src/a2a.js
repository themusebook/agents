/**
 * A2A (Agent-to-Agent) client + server.
 *
 * Binding: HTTP+JSON (A2A spec §11), same shape as Cheshire
 * /a2a/zk-shark — agent card, message:send, tasks, JSON-RPC.
 *
 * Premiere server: eliZERO.
 * Client peers: elizero (local), zk-shark + cheshire-terminal (product).
 */
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLAWD_MINT,
  PRODUCT_ORIGIN,
  PRODUCT_SURFACES,
  cheshireTerminalConnectInfo,
} from './cheshireTerminalRoot.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const ELIZERO_ID = 'elizero';
export const ELIZERO_NAME = 'eliZERO';
export const ELIZERO_VERSION = '1.0.0';
export const A2A_PROTOCOL_VERSION = '1.0';
export const ZK_SHARK_ID = 'zk-shark';
export const CHESHIRE_ID = 'cheshire-terminal';

const tasks = new Map();

export function resetA2aTasks() {
  tasks.clear();
}

function publicOrigin(origin) {
  return String(origin || process.env.CHESHIRE_SITE_URL || PRODUCT_ORIGIN).replace(/\/$/, '');
}

function nowIso() {
  return new Date().toISOString();
}

export function buildElizeroAgentCard(origin) {
  const base = publicOrigin(origin);
  return {
    name: ELIZERO_NAME,
    description:
      'Premiere elizaOS Zero agent powered by $CLAWD. Flat FIFO Zero engine, six-law harness, x402 payments, Tigris handoffs, ACP discovery, and A2A HTTP+JSON.',
    version: ELIZERO_VERSION,
    protocolVersion: A2A_PROTOCOL_VERSION,
    url: `${base}/a2a/${ELIZERO_ID}`,
    provider: {
      organization: 'Cheshire Terminal',
      url: base,
    },
    documentationUrl: `${base}/agents/${ELIZERO_ID}`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'identity',
        name: 'eliZERO Identity',
        description: 'Spawn identity, six-law harness, Zero invariants.',
        tags: ['elizero', 'premiere', 'zero'],
        examples: ['Who is eliZERO?', 'Show your laws.'],
      },
      {
        id: 'clawd-power',
        name: '$CLAWD Power',
        description: 'Mint, birth funding, x402 gating. Decimals are never invented.',
        tags: ['clawd', 'solana', 'x402'],
        examples: ['Show $CLAWD mint.', 'What is birth funding?'],
      },
      {
        id: 'tigris-handoff',
        name: 'Tigris Handoffs',
        description: 'Event-driven writer→watcher artifacts. No polling.',
        tags: ['tigris', 'storage', 'handoff'],
        examples: ['Handoff a result to HedgeDNA.'],
      },
      {
        id: 'acp-discovery',
        name: 'ACP Discovery',
        description: 'Agent Commerce Protocol well-known + catalog resolve.',
        tags: ['acp', 'discovery'],
        examples: ['Discover ACP agents.', 'Resolve elizero on ACP.'],
      },
      {
        id: 'agent-coordination',
        name: 'A2A Coordination',
        description: 'HTTP+JSON messages with Cheshire Terminal and ZK Shark.',
        tags: ['a2a', 'agents', 'coordination'],
        examples: ['List A2A peers.', 'Coordinate with ZK Shark.'],
      },
    ],
    supportedInterfaces: [
      {
        url: `${base}/a2a/${ELIZERO_ID}`,
        protocolBinding: 'HTTP+JSON',
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    extensions: {
      cheshireTerminal: {
        premiere: true,
        hubUrl: `${base}/agents/${ELIZERO_ID}`,
        a2aCardUrl: `${base}/a2a/${ELIZERO_ID}/.well-known/agent-card.json`,
        cheshireClientUrl: `${base}/api/a2a/cheshire/peers/${ELIZERO_ID}`,
        acp: `${base}/.well-known/acp.json`,
        dna: 'agents/elizero',
        token: {
          symbol: 'CLAWD',
          mint: CLAWD_MINT,
          decimalsHint: null,
          birthFunding: '0.069420 SOL + 1000 $CLAWD',
        },
      },
    },
  };
}

export function buildProductAgentCard(origin) {
  const base = publicOrigin(origin);
  return {
    name: 'Cheshire Terminal',
    description:
      'Solana-first agent hub. ACP registry, A2A peers (eliZERO + ZK Shark), MCP, arena, and Skill Hub.',
    version: A2A_PROTOCOL_VERSION,
    protocolVersion: A2A_PROTOCOL_VERSION,
    url: `${base}/.well-known/agent-card.json`,
    provider: { organization: 'Cheshire Terminal', url: base },
    documentationUrl: `${base}/agents`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: [
      { id: 'acp-discovery', name: 'ACP Discovery', tags: ['acp'] },
      { id: 'elizero-a2a', name: 'eliZERO A2A', tags: ['a2a', 'premiere'] },
      { id: 'zk-shark-a2a', name: 'ZK Shark A2A', tags: ['a2a', 'zk'] },
    ],
    extensions: {
      cheshireTerminal: {
        hubUrl: `${base}/agents`,
        elizero: `${base}/a2a/${ELIZERO_ID}`,
        zkShark: `${base}/a2a/${ZK_SHARK_ID}`,
        acp: `${base}/.well-known/acp.json`,
        mcp: `${base}/mcp`,
        arena: `${base}/arena`,
      },
    },
  };
}

export function listA2aPeers(origin) {
  const base = publicOrigin(origin);
  const elizero = buildElizeroAgentCard(base);
  return [
    {
      id: ELIZERO_ID,
      name: elizero.name,
      premiere: true,
      cardUrl: elizero.extensions.cheshireTerminal.a2aCardUrl,
      endpoint: elizero.url,
      protocolBinding: 'HTTP+JSON',
      protocolVersion: A2A_PROTOCOL_VERSION,
      local: true,
    },
    {
      id: ZK_SHARK_ID,
      name: 'ZK Shark',
      premiere: false,
      cardUrl: `${base}/a2a/${ZK_SHARK_ID}/.well-known/agent-card.json`,
      endpoint: `${base}/a2a/${ZK_SHARK_ID}`,
      protocolBinding: 'HTTP+JSON',
      protocolVersion: A2A_PROTOCOL_VERSION,
      local: false,
    },
    {
      id: CHESHIRE_ID,
      name: 'Cheshire Terminal',
      premiere: false,
      cardUrl: `${base}/.well-known/agent-card.json`,
      endpoint: base,
      protocolBinding: 'HTTP+JSON',
      protocolVersion: A2A_PROTOCOL_VERSION,
      local: false,
    },
  ];
}

export function getA2aPeer(id, origin) {
  return listA2aPeers(origin).find((p) => p.id === String(id || '').trim()) || null;
}

function routeElizeroIntent(text) {
  const t = String(text || '').trim();
  const lower = t.toLowerCase();
  if (!t) return { action: 'help', args: { reason: 'empty message' } };
  if (/\b(who|identity|laws?|eli\s*zero|elizero)\b/i.test(lower)) return { action: 'identity' };
  if (/\b(clawd|mint|power|birth|x402|funding)\b/i.test(lower)) return { action: 'clawd' };
  if (/\b(dna|soul|identity\.md|tools\.md)\b/i.test(lower)) return { action: 'dna' };
  if (/\b(tigris|handoff|storage|bucket)\b/i.test(lower)) return { action: 'tigris' };
  if (/\bacp\b/i.test(lower)) return { action: 'acp' };
  if (/\b(a2a|peer|coordinate|delegate|zk.?shark)\b/i.test(lower)) return { action: 'coordinate' };
  if (/\bhelp\b/i.test(lower)) return { action: 'help' };
  return { action: 'help', args: { echo: t } };
}

function elizeroReply(text, origin) {
  const base = publicOrigin(origin);
  const route = routeElizeroIntent(text);
  switch (route.action) {
    case 'identity':
      return {
        text: 'eliZERO online. Premiere eliza Zero agent. Flat FIFO. Zero recursion. Six-law harness. DNA at agents/elizero.',
        data: {
          action: route.action,
          id: ELIZERO_ID,
          hub: `${base}/agents/${ELIZERO_ID}`,
          card: `${base}/a2a/${ELIZERO_ID}/.well-known/agent-card.json`,
        },
      };
    case 'clawd':
      return {
        text: `$CLAWD mint ${CLAWD_MINT}. Birth funding 0.069420 SOL + 1000 $CLAWD. Decimals are not invented. Payments: x402.`,
        data: {
          action: route.action,
          symbol: 'CLAWD',
          mint: CLAWD_MINT,
          decimalsHint: null,
          birthFunding: '0.069420 SOL + 1000 $CLAWD',
        },
      };
    case 'dna':
      return {
        text: 'DNA bundle: agents/elizero — character.json, clawd-power.json, IDENTITY.md, SOUL.md, USER.md, TOOLS.md.',
        data: { action: route.action, path: 'agents/elizero' },
      };
    case 'tigris':
      return {
        text: 'Tigris handoffs are event-driven. Writer PutObject → webhook → watcher GetObject. No polling. Sequence by Last-Modified; idempotent on ETag.',
        data: {
          action: route.action,
          cli: 'ct-agents storage handoff --from elizero --to hedgedna --file ./report.json',
        },
      };
    case 'acp':
      return {
        text: `ACP well-known ${base}/.well-known/acp.json. Local index GET /api/agents/acp. Premiere ${ELIZERO_ID}.`,
        data: {
          action: route.action,
          wellKnown: `${base}/.well-known/acp.json`,
          index: `${base}/api/agents/acp`,
        },
      };
    case 'coordinate':
      return {
        text: `A2A HTTP+JSON at ${base}/a2a/${ELIZERO_ID}. Peers: eliZERO, ZK Shark, Cheshire Terminal.`,
        data: {
          action: route.action,
          peers: listA2aPeers(base).map((p) => ({ id: p.id, endpoint: p.endpoint })),
          zkShark: `${base}/a2a/${ZK_SHARK_ID}`,
        },
      };
    case 'help':
    default:
      return {
        text: route.args?.echo
          ? `eliZERO heard: ${route.args.echo}. Ask identity, $CLAWD, DNA, Tigris, ACP, or A2A peers.`
          : 'eliZERO A2A. Ask: who are you · $CLAWD mint · DNA · Tigris handoff · ACP · list peers.',
        data: { action: 'help', intents: ['identity', 'clawd', 'dna', 'tigris', 'acp', 'coordinate'] },
      };
  }
}

export function handleElizeroSendMessage({ text, message, origin } = {}) {
  const fromParts = (message?.parts || [])
    .map((p) => (p.kind === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
  const body = String(text || fromParts || '').trim();
  if (!body) throw new Error('text or message parts is required');

  const userMessage = message || {
    role: 'user',
    parts: [{ kind: 'text', text: body }],
    messageId: `msg-${randomUUID()}`,
  };
  const reply = elizeroReply(body, origin);
  const agentMessage = {
    role: 'agent',
    parts: [
      { kind: 'text', text: reply.text },
      { kind: 'data', data: reply.data },
    ],
    messageId: `elizero-${randomUUID()}`,
  };
  const task = {
    id: randomUUID(),
    contextId: userMessage.contextId || randomUUID(),
    status: { state: 'completed', timestamp: nowIso(), message: agentMessage },
    history: [userMessage, agentMessage],
    artifacts: [
      {
        artifactId: randomUUID(),
        name: 'elizero-reply',
        parts: agentMessage.parts,
      },
    ],
    metadata: { agent: ELIZERO_ID, premiere: true },
  };
  tasks.set(task.id, task);
  return task;
}

export function getA2aTask(id) {
  return tasks.get(String(id || '')) || null;
}

export function listA2aTasks({ contextId } = {}) {
  const all = [...tasks.values()];
  if (!contextId) return all;
  return all.filter((t) => t.contextId === contextId);
}

export function cancelA2aTask(id) {
  const task = getA2aTask(id);
  if (!task) return null;
  task.status = { state: 'canceled', timestamp: nowIso() };
  tasks.set(task.id, task);
  return task;
}

export async function fetchA2aCard(peerId, {
  origin,
  fetchImpl,
} = {}) {
  const peer = getA2aPeer(peerId, origin);
  if (!peer) throw new Error(`unknown A2A peer: ${peerId}`);
  if (peer.id === ELIZERO_ID && !fetchImpl) return buildElizeroAgentCard(origin);
  if (peer.id === CHESHIRE_ID && !fetchImpl) return buildProductAgentCard(origin);
  if (!fetchImpl) return { id: peer.id, url: peer.cardUrl, deferred: true };
  const res = await fetchImpl(peer.cardUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`A2A card HTTP ${res.status} for ${peer.id}`);
  return res.json();
}

export async function sendA2aMessage({
  peer = ELIZERO_ID,
  text,
  origin,
  fetchImpl,
} = {}) {
  const body = String(text || '').trim();
  if (!body) throw new Error('text is required');
  const target = getA2aPeer(peer, origin);
  if (!target) throw new Error(`unknown A2A peer: ${peer}`);

  if (target.id === ELIZERO_ID && !fetchImpl) {
    return {
      client: 'cheshire-terminal-agents',
      peer: target.id,
      source: 'local',
      task: handleElizeroSendMessage({ text: body, origin }),
    };
  }

  const impl = fetchImpl || fetch;
  const res = await impl(`${target.endpoint}/v1/message:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      message: {
        role: 'user',
        parts: [{ kind: 'text', text: body }],
        messageId: `ct-agents-${Date.now()}`,
      },
    }),
  });
  if (!res.ok) throw new Error(`A2A send HTTP ${res.status}: ${await res.text()}`);
  return {
    client: 'cheshire-terminal-agents',
    peer: target.id,
    source: 'remote',
    task: await res.json(),
  };
}

export function handleA2aJsonRpc(body, origin) {
  const id = body?.id ?? 1;
  const method = String(body?.method || '');
  const params = body?.params || {};
  try {
    if (method === 'message/send' || method === 'SendMessage') {
      const text = String(params.text || params.message?.parts?.[0]?.text || '').trim();
      if (!text) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'text or message.parts[].text is required' } };
      }
      return { jsonrpc: '2.0', id, result: handleElizeroSendMessage({ text, origin }) };
    }
    if (method === 'tasks/get' || method === 'GetTask') {
      const task = getA2aTask(params.id);
      if (!task) return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Task not found' } };
      return { jsonrpc: '2.0', id, result: task };
    }
    if (method === 'tasks/list' || method === 'ListTasks') {
      return { jsonrpc: '2.0', id, result: listA2aTasks() };
    }
    if (method === 'tasks/cancel' || method === 'CancelTask') {
      const task = cancelA2aTask(params.id);
      if (!task) return { jsonrpc: '2.0', id, error: { code: -32001, message: 'Task not found' } };
      return { jsonrpc: '2.0', id, result: task };
    }
    if (method === 'agent/getAuthenticatedExtendedCard' || method === 'GetAgentCard') {
      return { jsonrpc: '2.0', id, result: buildElizeroAgentCard(origin) };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    };
  }
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') flags.help = true;
    else if (token.startsWith('--')) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[name] = next;
        i += 1;
      } else flags[name] = true;
    } else flags._.push(token);
  }
  return flags;
}

function printHelp() {
  console.log(`ct-agents a2a — Agent-to-Agent client + server (HTTP+JSON)

  ct-agents a2a                    eliZERO card + peers
  ct-agents a2a card [--peer id]   Agent card (elizero | zk-shark | cheshire-terminal)
  ct-agents a2a peers              List A2A peers
  ct-agents a2a send --text "…"    Message eliZERO locally
  ct-agents a2a send --peer zk-shark --text "…" --site https://cheshireterminal.ai
  ct-agents a2a tasks              In-process task list

Local server routes (via ct-agents serve):
  GET  /a2a/elizero/.well-known/agent-card.json
  POST /a2a/elizero/v1/message:send
  GET  /api/a2a/peers
  POST /api/a2a/cheshire/peers/elizero/message
`);
}

export async function runA2aCli(argv = [], root = PACKAGE_ROOT) {
  const args = [...argv];
  const sub = args[0] && !args[0].startsWith('-') ? args.shift() : 'status';
  const flags = parseFlags(args);
  if (sub === 'help' || flags.help) {
    printHelp();
    return 0;
  }
  const origin = flags.site || flags.origin || process.env.CHESHIRE_SITE_URL || PRODUCT_ORIGIN;

  if (sub === 'status') {
    console.log(JSON.stringify({
      protocol: 'A2A',
      binding: 'HTTP+JSON',
      premiere: ELIZERO_ID,
      card: buildElizeroAgentCard(origin),
      peers: listA2aPeers(origin),
      cheshireTerminal: cheshireTerminalConnectInfo(root),
      product: PRODUCT_SURFACES,
    }, null, 2));
    return 0;
  }
  if (sub === 'card') {
    const peer = flags.peer || flags._[0] || ELIZERO_ID;
    const card = peer === CHESHIRE_ID
      ? buildProductAgentCard(origin)
      : peer === ELIZERO_ID
        ? buildElizeroAgentCard(origin)
        : await fetchA2aCard(peer, { origin, fetchImpl: flags.remote ? fetch : undefined });
    console.log(JSON.stringify(card, null, 2));
    return 0;
  }
  if (sub === 'peers') {
    console.log(JSON.stringify({ peers: listA2aPeers(origin) }, null, 2));
    return 0;
  }
  if (sub === 'send') {
    const text = flags.text || flags._.join(' ');
    const result = await sendA2aMessage({
      peer: flags.peer || ELIZERO_ID,
      text,
      origin,
      fetchImpl: flags.remote ? fetch : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  if (sub === 'tasks') {
    console.log(JSON.stringify({ tasks: listA2aTasks({ contextId: flags.context }) }, null, 2));
    return 0;
  }
  printHelp();
  return 1;
}
