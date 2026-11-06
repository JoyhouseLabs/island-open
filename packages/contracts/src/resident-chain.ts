/** Public deployment identity. These are contracts, never an animal's account. */
export const residentChain = {
  chainId: 56,
  network: "BNB Smart Chain",
  nft: "0xb35d63e3766A8A7855A5890013DA24b2A1E0434d",
  implementation: "0x3A459C721e6dEa062DDD0Cc6917A41f0295cA9BD",
  registry: "0x000000006551c19487814612e58FE06813775758",
  deploymentBlock: 131994742,
  explorer: "https://bscscan.com",
} as const;

export type ResidentChainStatus = {
  deployment: typeof residentChain;
  /** No animal-instance binding or wallet authority is inferred from deployment. */
  integration: "contracts_only";
  verification: "verified" | "unavailable" | "mismatch";
  checkedAt: string;
  block: string | null;
  administrator: string | null;
};
