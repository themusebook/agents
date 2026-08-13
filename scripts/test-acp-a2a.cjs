#!/usr/bin/env node
/**
 * ACP + A2A client/server smoke + Cheshire Terminal surface resolver.
 */
'use strict';

const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'ct-agents.js');
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.error('FAIL:', msg);
}
function ok(msg) {
  console.log('OK:', msg);
}

function runCli(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

async function main() {
  const ct = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/cheshireTerminalRoot.js')).href);
  const acp = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/acp.js')).href);
  const a2a = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/a2a.js')).href);
  const proto = await import(pathToFileURL(path.join(ROOT, 'robinhood-src/protocolHttp.js')).href);

  const inspected = ct.inspectCheshireTerminalSurfaces(ROOT);
  if (!inspected.surfaces.skills || !inspected.surfaces.cli) {
    fail('cheshire terminal surfaces missing skills/cli keys');
  } else ok('surface map includes skills + cli');

  const required = [
    'skills', 'skillsStore', 'agents', 'client', 'mcpServer',
    'registry', 'robinhoodAgents', 'agentArena', 'agentArenaSkill', 'cli',
  ];
  for (const id of required) {
    if (!inspected.surfaces[id]) fail(`missing surface ${id}`);
  }
  if (failures.some((f) => f.startsWith('missing surface'))) {
    /* already recorded */
  } else ok('all 10 cheshire-terminal surfaces listed');

  if (inspected.resolved) {
    const present = required.filter((id) => inspected.surfaces[id].exists);
    if (present.length < 8) fail(`expected most local surfaces; got ${present.join(',')}`);
    else ok(`local checkout resolved (${present.length}/10 surfaces)`);
    if (!inspected.surfaces.agentArena.exists) fail('agent-arena not resolved');
    if (!inspected.surfaces.agentArenaSkill.exists) fail('agent-arena-skill not resolved');
    if (!inspected.surfaces.registry.exists) fail('registry not resolved');
    if (!inspected.surfaces.cli.exists) fail('cli not resolved');
  } else {
    ok('cheshire-terminal-main not present (resolver still returns map)');
  }

  const arenaSkill = ct.findCheshireTerminalSkillMd('agent-arena', ROOT);
  if (inspected.resolved && !arenaSkill) fail('agent-arena SKILL.md not found');
  else if (arenaSkill) ok('agent-arena SKILL.md resolved from checkout');

  const discovery = acp.buildAcpDiscovery({ root: ROOT, origin: 'http://localhost:9' });
  if (discovery.schemaVersion !== 'openclawd.acp.registry.v1') fail('ACP schemaVersion');
  else ok('ACP schemaVersion openclawd.acp.registry.v1');
  if (discovery.premiereAgent !== 'elizero') fail('ACP premiere is not elizero');
  else ok('ACP premiere=elizero');
  if (discovery.chain?.token?.mint !== ct.CLAWD_MINT) fail('ACP mint drift');
  else ok('ACP $CLAWD mint matches');

  const agents = acp.listAcpAgents({ root: ROOT, origin: 'http://localhost:9' });
  if (agents.length !== 139) fail(`ACP list expected 139, got ${agents.length}`);
  else ok('ACP lists 139 catalog agents');
  const premiere = acp.getAcpAgent('elizero', { root: ROOT });
  if (!premiere?.premiere) fail('elizero ACP record not premiere');
  else ok('elizero ACP record marked premiere');

  a2a.resetA2aTasks();
  const card = a2a.buildElizeroAgentCard('http://localhost:9');
  if (card.url !== 'http://localhost:9/a2a/elizero') fail(`bad elizero card url ${card.url}`);
  else ok('eliZERO A2A card URL');
  if (card.extensions.cheshireTerminal.token.decimalsHint !== null) fail('invented decimals');
  else ok('A2A card does not invent $CLAWD decimals');

  const peers = a2a.listA2aPeers('https://cheshireterminal.ai');
  const ids = peers.map((p) => p.id);
  if (!ids.includes('elizero') || !ids.includes('zk-shark') || !ids.includes('cheshire-terminal')) {
    fail(`A2A peers ${ids.join(',')}`);
  } else ok('A2A peers: elizero, zk-shark, cheshire-terminal');

  const task = a2a.handleElizeroSendMessage({ text: 'who are you', origin: 'http://localhost:9' });
  if (task.status.state !== 'completed') fail('A2A send not completed');
  const reply = task.status.message.parts.find((p) => p.kind === 'text')?.text || '';
  if (!/eliZERO/i.test(reply)) fail(`identity reply: ${reply}`);
  else ok('A2A identity reply names eliZERO');

  const clawd = a2a.handleElizeroSendMessage({ text: 'show $CLAWD mint' });
  const clawdText = clawd.status.message.parts.find((p) => p.kind === 'text')?.text || '';
  if (!clawdText.includes(ct.CLAWD_MINT)) fail('A2A clawd reply missing mint');
  else ok('A2A clawd reply includes mint');

  const rpc = a2a.handleA2aJsonRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'GetAgentCard',
  }, 'http://localhost:9');
  if (rpc.result?.name !== 'eliZERO') fail('JSON-RPC GetAgentCard');
  else ok('A2A JSON-RPC GetAgentCard');

  const cliAcp = runCli(['acp']);
  if (cliAcp.status !== 0) fail(`ct-agents acp exited ${cliAcp.status}: ${cliAcp.stderr}`);
  else {
    const body = JSON.parse(cliAcp.stdout);
    if (body.premiereAgent !== 'elizero') fail('cli acp premiere');
    else ok('ct-agents acp prints discovery');
  }

  const cliA2a = runCli(['a2a', 'send', '--text', 'who are you']);
  if (cliA2a.status !== 0) fail(`ct-agents a2a send exited ${cliA2a.status}: ${cliA2a.stderr}`);
  else {
    const body = JSON.parse(cliA2a.stdout);
    if (body.peer !== 'elizero' || body.source !== 'local') fail('a2a send source');
    else ok('ct-agents a2a send local eliZERO');
  }

  const connect = runCli(['connect']);
  if (connect.status !== 0) fail(`connect exited ${connect.status}`);
  else {
    const conn = JSON.parse(connect.stdout);
    if (!conn.cheshireTerminal?.surfaces?.agentArena) fail('connect missing agent-arena');
    if (!conn.cheshireTerminal?.surfaces?.cli) fail('connect missing cli surface');
    if (!conn.cheshireTerminal?.surfaces?.registry) fail('connect missing registry');
    if (conn.acp?.cli !== 'ct-agents acp') fail('connect missing acp.cli');
    if (conn.a2a?.elizero !== 'https://cheshireterminal.ai/a2a/elizero') fail('connect a2a.elizero');
    if (conn.productHubs?.arena !== 'https://cheshireterminal.ai/arena') fail('connect productHubs.arena');
    else ok('connect surfaces arena + registry + cli + ACP/A2A');
  }

  // in-process HTTP: card + message:send
  const server = http.createServer(async (req, res) => {
    const handled = await proto.handleProtocolRequest(req, res, {
      root: ROOT,
      origin: 'http://127.0.0.1',
    });
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const cardRes = await fetch(`${base}/a2a/elizero/.well-known/agent-card.json`);
    const cardJson = await cardRes.json();
    if (cardJson.name !== 'eliZERO') fail('HTTP card name');
    else ok('HTTP GET eliZERO agent card');

    const sendRes = await fetch(`${base}/a2a/elizero/v1/message:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'list a2a peers' }),
    });
    const sent = await sendRes.json();
    if (sent.status?.state !== 'completed') fail('HTTP send state');
    else ok('HTTP POST message:send');

    const acpRes = await fetch(`${base}/api/agents/acp`);
    const acpJson = await acpRes.json();
    if (acpJson.premiereAgent !== 'elizero') fail('HTTP ACP premiere');
    else ok('HTTP GET /api/agents/acp');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length) {
    console.error(`\ntest-acp-a2a: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log('\ntest-acp-a2a: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
