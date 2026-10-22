# 心灵家园 · Island（开源客户端）

一个以 React、R3F 和 Three.js 为基础的个人岛屿世界客户端：三维主岛与各处小天地、植被生成、动物居民、种植与摆放、昼夜四季与声景、本地草稿。

本仓库只包含**客户端和共享规则**。账号、云存档、内容平台、管理台与云端服务由官方后端提供，不在此仓库中。

| 目录 | 职责 |
|---|---|
| `apps/web` | React 界面、R3F 场景、音频、本地草稿与同步客户端 |
| `packages/contracts` | 客户端与服务端共用的接口协议和 Zod 运行时校验 |
| `packages/world-core` | 确定性生成、地形采样、摆放规则、成长与行走，不依赖 WebGL |
| `scripts/prepare-assets.mjs` | 下载狐狸 GLB、生成原创环境声与资源清单 |

`contracts` 与 `world-core` 是公开协议和规则：客户端用它们预检，服务端会用同样的规则再次校验。任何权限、权益和摆放结果都以服务端为准。

## 本地运行

需要 Node.js 22.12+ 与 pnpm 10。

```bash
pnpm install
pnpm assets:prepare
pnpm dev
```

打开 **http://localhost:5178/island**。开发服务器把 `/api` 代理到 `127.0.0.1:3001`；没有后端时以游客身份运行，修改保存在浏览器 IndexedDB 草稿中，登录、云存档、参观与在线功能不可用。

植被预览：`http://localhost:5178/vegetation.html`。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

推送到 `main` 或打开拉取请求时，GitHub Actions 会跑同样的三项检查。

## 内容与扩展

用户可构建的物品以**数据内容包**形式提供（模型、贴图、参数与受支持的行为 ID），不加载任意 JS/React 代码。上传、审核、发布与售卖由官方服务端流程处理。

## 许可证

| 部分 | 许可 |
|---|---|
| 客户端 `apps/web` 及仓库默认部分 | [AGPL-3.0-only](LICENSE) |
| `packages/contracts`、`packages/world-core` | [Apache-2.0](packages/contracts/LICENSE) |
| 素材 | 见 [素材许可](apps/web/public/assets/LICENSE.md) 与 [CREDITS](apps/web/public/assets/CREDITS.md) |
| 名称与标识 | 不随代码授权，见 [商标说明](TRADEMARKS.md) |

完整说明见 [LICENSING](LICENSING.md)。参与贡献前请阅读 [CONTRIBUTING](CONTRIBUTING.md) 并签署 [CLA](CLA.md)。

## 官方 Web 与统一登录

官方入口为 https://app.joyhouse.chat ，授权网关为 https://auth.joyhouse.chat 。生产后端启用统一授权后，界面提供「微信扫码登录」与「微信内授权登录」，完成授权后返回应用。客户端只接收 Island 会话，中央授权码交换和账号身份映射均由服务器处理。
