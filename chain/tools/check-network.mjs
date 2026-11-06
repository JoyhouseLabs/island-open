// Read-only RPC preflight. No key, transaction, wallet or account mutation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const fixture = JSON.parse(await readFile(new URL('../fixtures/registry.json', import.meta.url), 'utf8'));
const endpoint = new URL(process.env.BSC_TESTNET_RPC ?? 'https://bsc-testnet-dataseed.bnbchain.org');
if (endpoint.protocol !== 'https:') throw new Error('HTTPS RPC required');
async function rpc(method, params) {
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  } catch { throw new Error('RPC connection failed'); }
  if (!response.ok) throw new Error('RPC HTTP failure');
  const data = await response.json();
  if (data.error || data.id !== 1 || data.result === undefined) throw new Error('RPC response rejected');
  return data.result;
}
assert.equal(await rpc('eth_chainId', []), '0x61', 'Expected BSC testnet (97)');
const block = await rpc('eth_blockNumber', []);
assert.match(block, /^0x[0-9a-f]+$/i);
assert.equal(await rpc('eth_getCode', [fixture.registry, block]), fixture.runtime, 'Canonical registry bytecode differs');
console.log(JSON.stringify({ chainId: 97, block: BigInt(block).toString(), registry: fixture.registry, canonicalCodeVerified: true, transactionSent: false }));
