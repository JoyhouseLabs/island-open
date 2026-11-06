import { createHash, randomUUID } from 'node:crypto';

// This mapping is independent of name/species/current holder and contains no private user data.
// Persist the UUID before issuing the mint request; retries must reuse it.
export function residentIdentity(uuid = randomUUID()) {
  if (typeof uuid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error('Resident UUID must be a UUID v4');
  }
  uuid = uuid.toLowerCase();
  const agentId = '0x' + createHash('sha256').update('island:resident:v1:' + uuid).digest('hex');
  return { uuid, agentId, tokenId: BigInt(agentId).toString() };
}

export function nftIdentity(chainId, collection, tokenId) {
  if (![56, 97].includes(chainId)) throw new Error('Unsupported BSC chain');
  if (typeof collection !== 'string' || !/^0x[0-9a-f]{40}$/i.test(collection) || /^0x0{40}$/i.test(collection)) {
    throw new Error('Collection address required');
  }
  // Reject JS numbers: uint256 exceeds Number's precise range.
  if (typeof tokenId !== 'string' || !/^[1-9][0-9]*$/.test(tokenId) || BigInt(tokenId) >= 2n ** 256n) {
    throw new Error('Token ID must be a nonzero uint256 decimal string');
  }
  return `eip155:${chainId}/erc721:${collection.toLowerCase()}/${tokenId}`;
}
