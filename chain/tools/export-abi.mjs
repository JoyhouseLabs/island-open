import { readFile, writeFile, mkdir } from 'node:fs/promises';
const destination = new URL('../abi/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const [file, contract] of [['ResidentAccount.sol', 'ResidentAccount'], ['ResidentNFT.sol', 'ResidentNFT'], ['IERC6551.sol', 'IERC6551Registry']]) {
  const artifact = JSON.parse(await readFile(new URL(`../out/${file}/${contract}.json`, import.meta.url), 'utf8'));
  await writeFile(new URL(contract + '.json', destination), JSON.stringify(artifact.abi, null, 2) + '\n');
}
console.log('Exported three public ABIs from compiled artifacts');
