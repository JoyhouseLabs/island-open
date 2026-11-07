# Island Runner 与 DeepSeek Harness

实验版 Runner 把 Island 的协同讨论交给本机 DeepSeek Harness 执行。每轮创建一个独立进程，完成后退出并清理临时历史；讨论和人工采纳结果保存在 Island。它不是每个动物常驻的操作系统沙箱。

固定使用 `@deepseek-ai/dsh-sdk-client@0.2.2-rc.1` 与同版运行时，需要 **Node 24.9+**，已在 Linux x64 / Node 24.21.0 验证。Island 原有 Web/API 仍可用 Node 22。SDK 的默认 npm `latest` 标签不是此版本，请使用锁文件，不要直接换成 latest。

## 安装和连接

1. 克隆本开源仓库后，在仓库根目录用 Node 24 执行 `pnpm install --frozen-lockfile`。若在私有 Island 父仓库工作，只在父仓库根目录安装依赖。保留 optional dependencies：Harness 需要对应操作系统的原生扩展，不要把 macOS 的 node_modules 直接复制到 Linux。
2. 在已部署本实验功能的 Island 中登录岛主账号，点击动物 → **协同** → **管理本地设备** → **新建设备凭据**。本次显示的凭据有效 7 天，后台只保存哈希；复制到本机，勿发到聊天或提交 Git。
3. 进入 `packages/island-runner`（私有仓库中是 `open/packages/island-runner`），运行：

   ```sh
   node src/cli.mjs init --origin https://island.joyhouse.chat
   ```

   在交互提示粘贴设备凭据；输入会在本机终端显示。默认写入 `~/.island-runner/runner.json`，权限 0600，已有文件不覆盖。可用 `--config /绝对路径/runner.json` 为不同设备或环境指定文件。
4. 用本机密钥管理工具或终端环境配置 `DEEPSEEK_API_KEY`，然后启动：

   ```sh
   node src/cli.mjs start
   ```

   默认 Harness 模型为 `deepseek-v4-flash`，可通过 `--model` 选择该固定运行时支持的模型。Runner 不下载服务器上的模型 key，不接收服务器指定的命令、工作目录、模型路由或环境变量。
5. 回到动物的“协同”页签，新建讨论，选择本地设备，提交一轮任务。结果先等待你采纳或拒绝；点选另一只动物并选择同一讨论，即可继续。每轮也可选“云端模型”，走 Island 现有模型服务。

生产服务器需要先发布对应的协同 API 和数据库迁移；仅安装 Runner 不会让旧版网站出现入口。开发环境可以连接 `http://localhost:5178` 或 `http://127.0.0.1:3001`，其他地址必须 HTTPS。

## 协同规则

- Runner 发起出站 WSS，使用 Authorization header；本机不开放公网端口。一个设备同一时刻只执行一轮，一个讨论同一时刻只允许一个待办。
- 每轮有任务 UUID、租约 UUID、连接版本、心跳与 5 分钟服务器期限。Runner 最多执行 4 分钟；超时会关闭 Harness 子进程，而不只是放弃等待。
- 断线、撤销或执行状态不明时，不重试、不切换云端。回到岛上核对状态，再决定是否创建新一轮。取消通过下一次心跳通知 Runner，正常情况下约 5 秒。
- 只发送该居民的角色配置、当前指令和最近 8 轮已采纳内容（每条建议最多 3000 字符）。不会自动发送私人短期/长期记忆或本机文件。选用外部模型时，讨论内容会发送给该模型服务。
- 本版为讨论模式，禁用 Shell、文件、插件安装及任意 MCP 工具；采纳建议不等于执行动作。动态技能授权和人机工具审批留给后续版本。
- 讨论可删除；设备可撤销。正常退出会删除本轮本机临时历史，进程被强制杀死可能留下 `~/.island-runner/turns`；确认没有运行中的 Runner 后可手动清理。本机管理员及被攻陷的设备不在进程隔离的防护范围内。

## Harness 生态接入方式

本包包含 `dsh.bundle.patch` 元数据与 `cordis.patch.yml`。Runner 通过官方 SDK 启动固定版本的 **sdk-minimal** profile，再加载此 patch，禁用该 profile 的工具。这个 bundle 仅针对上述组合验证，不能把它当作其他 profile 的完整权限策略；尚未发布 npm 包或提交官方插件市场。

Island 管理账号、角色设定、任务与讨论记录；Harness 管理单轮模型运行；Runner 管理连接、心跳和进程生命周期。角色名称/物种仍是旧角色引用，任务 UUID 不是动物实例 UUID，不承担 ERC-6551 或 NFT 所有权证明。

参考：[官方 SDK](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/sdk/client)、[sdk-minimal profile](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/bundle/sdk-minimal)。DeepSeek Harness/SDK 为其上游许可证所覆盖，Island Runner 沿用本仓库 AGPL-3.0-only。

## 验证

Node 24 环境执行 `pnpm --filter @island/runner test`。测试包含真实 Harness 子进程和本地 Messages 响应服务，检查零工具调用、结果回传、取消清理、凭据隔离与真实 WebSocket；不使用生产 key，不消耗真实模型额度。测试机需要允许 loopback 监听。真实 DeepSeek 服务额度和账号模型权限需由使用者连接后验证。
