# Island 居民 NFT 与 ERC-6551 账户

2026-11-06，按用户确认采用 **ERC-721 居民身份 + ERC-6551 Token Bound Account（TBA）**。**两份基础合约已于 2026-11-06 部署 BSC 主网，源码通过 Sourcify 验证。** 地址、交易、编译参数和费用见 [部署清单](deployments/56.json)。尚未铸造居民 NFT，尚未接入 Island 登录、角色实例或后台，现有动物还未成为 NFT。

## 已实现

- `ResidentNFT`：管理员发行，一个永久 `agentId` 对应一枚 NFT；Token ID 为该 bytes32 的 uint256 值。元数据 URI 铸造时写入，此版无修改入口。收藏品管理员不能代替持有人支配居民账户。
- `ResidentAccount`：通过标准 Registry 创建的 ERC-1167 账户；支持 ERC-165、ERC-6551、ERC-1271、ERC-721/1155 收取和原生币收取。当前 NFT 持有人可执行 CALL；禁用 delegatecall/create/create2。
- 主账户约定固定 Registry、implementation、salt=0、chainId、collection、tokenId。第三方仍可创建其他 TBA，Island 只认登记的主账户，不能把“地址存在”视为资产已铸造或归属已确认。
- `mintResident` 一笔交易完成 TBA 创建、NFT 铸造和元数据记录；重复 agentId 不可发行，失败整体回滚。`predictAccount` 支持部署前计算，`accountOf` 要求 NFT 已存在。
- 每次 NFT 转移递增 `ownershipNonce`，即使转出后又转回也不复用旧授权。NFT 的 approve/operator 不是账户执行权。
- 受限技能：每个 delegate 一条授权，限定**完整 calldata 哈希、目标地址、到期时间、次数、单次原生币额度与总额度**；可替换和撤销。最长 30 天、最多 1000 次。delegate 不能获得通用 execute 或 ERC-1271 签名权，不能把目标设为账户自身或所属 NFT 合约。
- 受限技能调用失败时，状态和预算随交易回滚；成功消耗次数/预算，禁止重入。链上失败交易仍可能消耗外部交易发送者的 gas，不应无限重试。
- ERC-1271 使用 `signatureDigest(hash)` 返回的 EIP-712 摘要，包含链、账户地址和 NFT ownershipNonce，避免跨账户和转让后重放。支持 EOA 与 ERC-1271 合约持有人。调用方仍须给原始 hash 加入用途、一次性 nonce 和过期时间；不要假设任意 DApp 的通用签名方式都兼容。

## 身份与记忆

`tools/resident-identity.mjs` 生成随机 UUID v4，并计算 `sha256("island:resident:v1:" + lowercaseUUID)` 作为 agentId。先持久化 UUID，再提交铸造；重试沿用原 UUID。动物名字、物种、当前钱包、账号或对话内容不进入身份哈希。Token ID 在 JSON 中始终使用十进制字符串，不能用 JavaScript Number。

同一物种可有多只独立居民。链上唯一标识是 `(chainId, collection, tokenId)`；TBA 是它的主资产账户。模型、短期记忆、长期摘要和私人对话留在链下。NFT 所有权变更不等于私人聊天可转移；现有 Island 按用户隔离的记忆目前没有改动。

## 固定依赖与编译

- Foundry（本次验证 1.5.1）、Solidity **0.8.30**、optimizer 200、EVM **Cancun**。
- OpenZeppelin Contracts **5.7.0**，所需 29 个源码文件原样放在 `vendor/openzeppelin`，附 MIT 许可证、来源和逐文件 SHA-256；不使用浮动依赖。
- `fixtures/registry.json` 保存 ERC-6551 规范的标准部署交易与 runtime。固定地址 `0x000000006551c19487814612e58FE06813775758`，runtime code hash 为 `0xda1d5b06e579f9e42e59b00fbc22939896ecb38dc8830d40de0a2508fecd6735`。
- BSC 已支持 Cancun/MCOPY，依据 [BSC 链配置](https://github.com/bnb-chain/bsc/blob/master/params/config.go) 和 [BEP-342](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-342.md)。

从 `open/chain` 执行（无需修改 Web/API 的 pnpm 依赖）：

```bash
forge build
forge test -vv
node --test tools/identity.test.mjs
node tools/export-abi.mjs
```

离线已有编译器可传 `--use /absolute/path/to/solc-0.8.30 --offline`。`out`、`cache`、`broadcast` 与环境文件不提交。公开 ABI 在 `abi/`，合约修改后重新生成。

## BSC 测试网流程

部署脚本只允许 chainId **97**，主网 56 会拒绝；不会自行部署 Registry，也不会读取明文私钥。部署前准备管理员公开地址、实际签名钱包和测试网 gas。签名者与 NFT 管理员可以不同。

1. `node tools/check-network.mjs`：只读检查 chainId、区块高度和 Registry 的完整 runtime。可用 `BSC_TESTNET_RPC` 指向 HTTPS RPC；不输出带凭据的 RPC URL。
2. 设置 `ISLAND_NFT_ADMIN` 为已确认的管理员公开地址；可采用多签钱包。
3. 使用 Foundry 本地 keystore 或硬件钱包，先模拟：

```bash
forge script script/DeployResidents.s.sol:DeployResidents \
  --rpc-url "$BSC_TESTNET_RPC" --account island-testnet
```

4. 核对模拟输出、管理员、网络和两份合约后，实际签名部署时增加 `--broadcast`。保存 receipt、部署区块、两份地址、源码与代码哈希；在浏览器验证源码，再登记到 Island 配置。此处为测试网流程；主网已部署地址见 [部署清单](deployments/56.json)。
5. 先上传只含公开信息的角色元数据，持久化居民 UUID；运行 `node tools/prepare-mint.mjs <collection> <recipient> <UUID-v4> <ipfs://metadata>` 生成可审查的未签名交易。该工具不发送交易、不申请签名、不自动创建 UUID。管理员确认后再用钱包签名。
6. 确认 receipt 成功后，核对 `ownerOf`、`accountOf`、账户 `token()`、`owner()`、implementation 和链；链下绑定不能只信客户端提交的交易哈希。

## BSC 主网部署准备（2026-11-06）

用户提出改用正式网，新增 `script/DeployResidentsMainnet.s.sol:DeployResidentsMainnet`，固定 chainId **56**。原测试网脚本继续只允许 97；主网入口通过 `run(address administrator)` 显式接收公开管理员地址，不依赖测试网的管理员环境变量。两者均核验标准 Registry 的完整 runtime code hash。

先模拟（不加 `--broadcast`）：

```bash
forge script script/DeployResidentsMainnet.s.sol:DeployResidentsMainnet \
  --sig 'run(address)' "$ISLAND_NFT_ADMIN" \
  --rpc-url "$BSC_MAINNET_RPC" \
  --keystore "$ISLAND_DEPLOY_KEYSTORE" --password-file "$ISLAND_DEPLOY_PASSWORD_FILE"
```

使用本机加密 keystore，密钥和口令不写命令参数、不提交仓库、不上传生产服务器。只有实际发送时才增加 `--broadcast`；应保存两笔交易的 receipt、合约地址、部署区块、构造参数与代码验证结果。本次主网部署因本机 Foundry 联网组件故障，改为主网 RPC 模拟两笔创建交易、Cast 本机离线签名、RPC 按顺序广播；交易内容与相同编译配置产生的创建字节码逐字节一致。地址见 [部署清单](deployments/56.json)。主网部署不等于独立安全审计完成，也没有激活岛屿的钱包/NFT 功能。

主网只读核验：标准 Registry runtime 与规范一致。费用必须用发送前的 RPC gasPrice 和部署模拟重算；历史 gas 报价不是固定价格。`tools/prepare-mint.mjs` 仍固定测试网，不能把它生成的交易直接发到主网；本次准备只涉及部署两份基础合约。

## 已验证与边界

- 35 项本地 EVM 测试通过，含 2 项各 256 轮 fuzz；覆盖标准接口、原子铸造、确定性地址、持有人控制、资产保持、管理员隔离、转让/转回撤权、精确参数授权、额度/次数/过期、失败回滚、重入、签名重放、合约持有人、错误链、部署脚本模拟、测试网/主网相互拒绝以及主网配置下铸造、转移和旧授权失效。
- 3 项 Node 身份测试通过；未签名铸造交易编码与 ABI 解码一致。
- 通过 BSC 测试网公共 RPC 读取标准 Registry 字节码，与规范 runtime 完全一致；这是先前测试网只读检查。随后主网部署已成功，两个 runtime 均与重编译结果匹配，NFT immutable 参数和 owner/getter 核对通过；Sourcify 对创建与运行代码均返回 match。其向 Etherscan 的同步返回公共服务每日额度已满，不声称已获 BscScan 源码验证标记。
- 岛屿动物卡片和管理台提供主网合约状态入口，API `/api/residents/chain` 只读核验固定网络、三份合约 runtime 和 NFT 参数。状态缓存最多 60 秒，带核验区块与时间；RPC 失败不显示为校验成功。客户端公开常量在 `packages/contracts/src/resident-chain.ts`。
- 具体动物的永久实例登记、铸造、钱包绑定、所有权同步、MCP 到链上技能执行器或记忆迁移尚未开放。合约实现地址不是居民的绑定账户，页面不会把现有动物标为已经铸造。
- 技能委托签名者是单独执行钱包/服务，不是 LLM；模型只提出动作，执行器还需校验当前授权再签名。资金与 MCP 凭据不得交给模型。
- calldata 授权可包含代币转移或 approve：原生币额度不会限制其中的 ERC-20 数量，必须审查完整参数。旧持有人通过通用 execute 留下的 ERC-20/NFT 外部批准不会因 NFT 转让自动撤销；此版转让失效的是本合约的技能授权和所有权绑定签名。
- 阻止 NFT 转入自己的主 TBA（含 unsafe transfer）；不保证识别任意多层、跨收藏品或第三方账户的循环所有权。当前产品不开放居民 NFT 嵌套持有。
- 基础合约已部署主网，自定义账户和权限逻辑尚未经独立安全审计；不提供交易市场或已接入游戏的真实资金托管功能。

规范与实现来源：[ERC-6551](https://eips.ethereum.org/EIPS/eip-6551)、[ERC-721](https://eips.ethereum.org/EIPS/eip-721)、[OpenZeppelin 5.7.0](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.7.0)、[BSC RPC](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)。

本模块自有代码沿用仓库 AGPL-3.0-only；`vendor/openzeppelin` 保留其 MIT 许可。ERC-6551 接口和 Registry fixture 标明规范来源（规范为 CC0）。
