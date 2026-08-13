/**
 * ACP + A2A HTTP handlers for ct-agents serve.
 * Dynamic routes run before the static public/ fallback.
 */
import { loadLocalAcpRegistry, buildAcpDiscovery, listAcpAgents, getAcpAgent } from './acp.js';
import {
  ELIZERO_ID,
  buildElizeroAgentCard,
  buildProductAgentCard,
  listA2aPeers,
  getA2aPeer,
  handleElizeroSendMessage,
  handleA2aJsonRpc,
  getA2aTask,
  listA2aTasks,
  cancelA2aTask,
} from './a2a.js';

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization',
  });
  res.end(JSON.stringify(body, null, 2));
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({ text: raw });
      }
    });
    req.on('error', reject);
  });
}

function originOf(req, fallback) {
  const host = req.headers.host;
  if (host) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    return `${proto}://${host}`;
  }
  return fallback;
}

function textFromBody(body) {
  const message = body?.message;
  const fromParts = message?.parts
    ?.map((p) => (p.kind === 'text' ? p.text : ''))
    .filter(Boolean)
    .join('\n');
  return String(body?.text || fromParts || '').trim();
}

/**
 * @returns {Promise<boolean>} true if the request was handled
 */
export async function handleProtocolRequest(req, res, { root, origin } = {}) {
  const url = String(req.url || '/').split('?')[0];
  const method = String(req.method || 'GET').toUpperCase();
  const base = originOf(req, origin);

  if (method === 'OPTIONS' && (url.startsWith('/a2a/') || url.startsWith('/api/a2a') || url.startsWith('/api/agents/acp'))) {
    json(res, 204, {});
    return true;
  }

  if (method === 'GET' && url === '/.well-known/acp.json') {
    const shipped = loadLocalAcpRegistry(root);
    if (shipped) {
      json(res, 200, shipped);
      return true;
    }
    json(res, 200, buildAcpDiscovery({ root, origin: base }));
    return true;
  }

  if (method === 'GET' && url === '/.well-known/agent-card.json') {
    json(res, 200, buildProductAgentCard(base));
    return true;
  }

  if (method === 'GET' && url === '/api/agents/acp') {
    json(res, 200, buildAcpDiscovery({ root, origin: base }));
    return true;
  }

  if (method === 'GET' && url === '/api/agents/acp/agents') {
    const agents = listAcpAgents({ root, origin: base });
    json(res, 200, { protocol: 'ACP', count: agents.length, agents });
    return true;
  }

  const acpShow = url.match(/^\/api\/agents\/acp\/agents\/([^/]+)$/);
  if (method === 'GET' && acpShow) {
    const agent = getAcpAgent(decodeURIComponent(acpShow[1]), { root, origin: base });
    if (!agent) {
      json(res, 404, { error: 'ACP agent not found', id: acpShow[1] });
      return true;
    }
    json(res, 200, agent);
    return true;
  }

  if (method === 'GET' && (url === '/api/a2a/peers' || url === '/a2a/peers')) {
    json(res, 200, { success: true, peers: listA2aPeers(base) });
    return true;
  }

  const cardPaths = new Set([
    `/a2a/${ELIZERO_ID}`,
    `/a2a/${ELIZERO_ID}/`,
    `/a2a/${ELIZERO_ID}/.well-known/agent-card.json`,
    `/a2a/${ELIZERO_ID}/card`,
    `/a2a/${ELIZERO_ID}/agent-card.json`,
    `/api/a2a/${ELIZERO_ID}`,
    `/api/a2a/${ELIZERO_ID}/.well-known/agent-card.json`,
  ]);
  if (method === 'GET' && cardPaths.has(url)) {
    json(res, 200, buildElizeroAgentCard(base));
    return true;
  }

  if (method === 'GET' && (
    url === `/api/a2a/cheshire/peers/${ELIZERO_ID}` ||
    url === `/api/a2a/cheshire/peers/${ELIZERO_ID}/card`
  )) {
    json(res, 200, {
      success: true,
      peer: getA2aPeer(ELIZERO_ID, base),
      card: buildElizeroAgentCard(base),
    });
    return true;
  }

  if (method === 'GET' && (url === `/a2a/${ELIZERO_ID}/v1/tasks` || url === `/a2a/${ELIZERO_ID}/tasks`)) {
    json(res, 200, listA2aTasks());
    return true;
  }

  const taskGet = url.match(new RegExp(`^/a2a/${ELIZERO_ID}/(?:v1/)?tasks/([^/]+)$`));
  if (method === 'GET' && taskGet) {
    const task = getA2aTask(taskGet[1]);
    if (!task) {
      json(res, 404, { error: 'Task not found' });
      return true;
    }
    json(res, 200, task);
    return true;
  }

  const sendPaths = new Set([
    `/a2a/${ELIZERO_ID}`,
    `/a2a/${ELIZERO_ID}/v1/message:send`,
    `/a2a/${ELIZERO_ID}/message:send`,
    `/a2a/${ELIZERO_ID}/message`,
    `/api/a2a/${ELIZERO_ID}/v1/message:send`,
    `/api/a2a/cheshire/peers/${ELIZERO_ID}`,
    `/api/a2a/cheshire/peers/${ELIZERO_ID}/message`,
  ]);

  if (method === 'POST' && sendPaths.has(url)) {
    const body = await readJsonBody(req);
    const text = textFromBody(body);
    if (!text) {
      json(res, 400, { error: 'message parts or text is required' });
      return true;
    }
    try {
      const task = handleElizeroSendMessage({ text, message: body.message, origin: base });
      json(res, 200, url.includes('/cheshire/peers/')
        ? { success: true, client: 'cheshire-terminal-agents', peer: ELIZERO_ID, task }
        : task);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (method === 'POST' && url === `/a2a/${ELIZERO_ID}/jsonrpc`) {
    const body = await readJsonBody(req);
    json(res, 200, handleA2aJsonRpc(body, base));
    return true;
  }

  const cancel = url.match(new RegExp(`^/a2a/${ELIZERO_ID}/(?:v1/)?tasks/([^/]+)(?::cancel|/cancel)$`));
  if (method === 'POST' && cancel) {
    const task = cancelA2aTask(cancel[1]);
    if (!task) {
      json(res, 404, { error: 'Task not found' });
      return true;
    }
    json(res, 200, task);
    return true;
  }

  return false;
}
