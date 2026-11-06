import test from 'node:test';
import assert from 'node:assert/strict';
import { residentIdentity, nftIdentity } from './resident-identity.mjs';
const uuid = '945b9b38-01b0-4f02-97d6-dfa1ac3af3a1';
const collection = '0x1234567890123456789012345678901234567890';

test('agent identity is deterministic, case independent and full uint256', () => {
  const identity = residentIdentity(uuid);
  assert.deepEqual(identity, residentIdentity(uuid.toUpperCase()));
  assert.equal(BigInt(identity.tokenId), BigInt(identity.agentId));
  assert.ok(BigInt(identity.tokenId) > BigInt(Number.MAX_SAFE_INTEGER));
  assert.match(residentIdentity().uuid, /^[0-9a-f-]{36}$/);
  assert.notEqual(residentIdentity().agentId, identity.agentId);
});
test('NFT identities distinguish chain and collection', () => {
  const { tokenId } = residentIdentity(uuid);
  assert.equal(nftIdentity(97, collection, tokenId), `eip155:97/erc721:${collection}/${tokenId}`);
  assert.notEqual(nftIdentity(56, collection, tokenId), nftIdentity(97, collection, tokenId));
  assert.throws(() => nftIdentity(1, collection, tokenId));
  assert.throws(() => nftIdentity(97, '0x' + '0'.repeat(40), tokenId));
});
test('rejects name-based identity and imprecise numeric token IDs', () => {
  assert.throws(() => residentIdentity('resident:水伊布'));
  assert.throws(() => residentIdentity('945b9b38-01b0-1f02-97d6-dfa1ac3af3a1'));
  for (const value of [1, '01', '-1', '0', '1e10', (2n ** 256n).toString()]) {
    assert.throws(() => nftIdentity(97, collection, value));
  }
});
