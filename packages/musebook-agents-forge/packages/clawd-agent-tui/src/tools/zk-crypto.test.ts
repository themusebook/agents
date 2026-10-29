import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bytesToHex, computeNullifier, hexToBytes, verifyProofShape } from './zk-crypto.js';
import { routeIntent } from './zk-intent.js';

test('computeNullifier is deterministic for same secret+context', () => {
  const secret = hexToBytes('11'.repeat(32));
  const a = computeNullifier(secret, 'model-attest:v1:demo');
  const b = computeNullifier(secret, 'model-attest:v1:demo');
  assert.equal(bytesToHex(a), bytesToHex(b));
  assert.equal(a.length, 32);
});

test('computeNullifier domain-separates contexts', () => {
  const secret = hexToBytes('22'.repeat(32));
  const a = computeNullifier(secret, 'ctx-a');
  const b = computeNullifier(secret, 'ctx-b');
  assert.notEqual(bytesToHex(a), bytesToHex(b));
});

test('routeIntent matches nullifier / inspect / attest', () => {
  assert.equal(routeIntent('nullifier for model-attest:v1:demo').intent, 'compute-nullifier');
  assert.equal(routeIntent('inspect config').intent, 'inspect');
  assert.equal(routeIntent('attest this model 0x' + 'ab'.repeat(32)).intent, 'attest-model');
});

test('verifyProofShape rejects tiny points', () => {
  const r = verifyProofShape({
    a: new Uint8Array(8),
    b: new Uint8Array(8),
    c: new Uint8Array(8),
    verifyingKey: new Uint8Array(0),
  });
  assert.equal(r.ok, false);
});
