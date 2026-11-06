// Produces a reviewable unsigned transaction only. It never connects to a signer or broadcasts.
import { execFileSync } from 'node:child_process';
import { residentIdentity, nftIdentity } from './resident-identity.mjs';

const [collection, recipient, uuid, metadataURI, ...extra] = process.argv.slice(2);
if (extra.length || !collection || !recipient || !uuid || !metadataURI) {
  throw new Error('Usage: node tools/prepare-mint.mjs <collection> <recipient> <persisted UUID v4> <ipfs://metadata>');
}
const identity = residentIdentity(uuid);
nftIdentity(97, collection, identity.tokenId);
if (!/^0x[0-9a-f]{40}$/i.test(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error('Recipient address required');
if (!/^ipfs:\/\/[a-zA-Z0-9]+(?:\/[a-zA-Z0-9._/-]*)?$/.test(metadataURI) || Buffer.byteLength(metadataURI) > 512) {
  throw new Error('Use an immutable ipfs:// metadata URI (at most 512 bytes)');
}
// execFileSync passes arguments without shell evaluation.
const data = execFileSync('cast', ['calldata', 'mintResident(address,bytes32,string)', recipient, identity.agentId, metadataURI], { encoding: 'utf8' }).trim();
console.log(JSON.stringify({
  status: 'unsigned', network: 'BSC testnet', identity,
  nft: nftIdentity(97, collection, identity.tokenId), recipient,
  transaction: { chainId: '0x61', to: collection, value: '0x0', data },
  note: 'The collection administrator must sign. Confirm collection code, recipient and metadata before signing.'
}, null, 2));
