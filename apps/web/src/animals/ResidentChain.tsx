import { useEffect, useState } from "react";
import { residentChain, type ResidentChainStatus } from "@island/contracts";
import { api } from "../api";

export function ResidentChain() {
  const [status, setStatus] = useState<ResidentChainStatus | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setStatus(null);
    setError(false);
    void api<ResidentChainStatus>("/residents/chain", { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setStatus(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [attempt]);
  const checked = status?.verification === "verified";
  return (
    <section className="resident-chain">
      <h3>居民 NFT · BSC 主网</h3>
      <p>这位伙伴尚未关联 NFT。现在的对话、记忆与技能仍保存在小岛中。</p>
      <p role="status">
        {checked
          ? "基础合约已上线，链上校验通过。"
          : status?.verification === "mismatch"
            ? "链上状态与部署记录不符，正在等待核查。"
            : error || status
              ? "暂时无法核验链上状态，可以稍后刷新。"
              : "正在核验主网合约…"}
      </p>
      <div className="resident-chain-links">
        <a
          href={`${residentChain.explorer}/address/${residentChain.nft}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          查看 NFT 合约 ↗
        </a>
        <a
          href={`${residentChain.explorer}/address/${residentChain.implementation}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          查看 ERC-6551 实现 ↗
        </a>
      </div>
      {checked && (
        <p className="animal-note">
          核验区块 {status.block} ·{" "}
          {new Date(status.checkedAt).toLocaleString("zh-CN")}
        </p>
      )}
      <p className="animal-note">
        合约地址不是这位伙伴的钱包。铸造与钱包绑定开放后，才会显示她自己的 NFT
        和绑定账户。
      </p>
      <button
        disabled={!status && !error}
        onClick={() => setAttempt((n) => n + 1)}
      >
        刷新链上状态
      </button>
    </section>
  );
}
