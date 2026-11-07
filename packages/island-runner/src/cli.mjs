#!/usr/bin/env node
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { connectRunner, runnerURL } from "./runner.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    origin: { type: "string" },
    config: { type: "string" },
    model: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help || !positionals.length) {
  console.log(
    "Island Runner · DeepSeek Harness 讨论版\n  node src/cli.mjs init --origin https://island.joyhouse.chat\n  DEEPSEEK_API_KEY（在本机环境配置） node src/cli.mjs start\n可选 --config /绝对路径/runner.json；需要 Node >=24.9。设备凭据只在 init 提示中粘贴，不放进命令行。",
  );
} else {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 9))
    throw new Error("Runner requires Node >=24.9");
  const configFile = resolve(
    values.config || join(homedir(), ".island-runner", "runner.json"),
  );
  if (positionals[0] === "init") {
    runnerURL(values.origin || "");
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const token = (
        await input.question(
          "粘贴岛上新建设备时显示的一次性凭据（输入会显示在本机终端）：",
        )
      ).trim();
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid token");
      await mkdir(dirname(configFile), { recursive: true, mode: 0o700 });
      await writeFile(
        configFile,
        JSON.stringify({ origin: values.origin, token }),
        { mode: 0o600, flag: "wx" },
      );
      console.log(
        "设备配置已保存。用本机环境变量 DEEPSEEK_API_KEY 配置模型凭据，再执行 start。",
      );
    } finally {
      input.close();
    }
  } else if (positionals[0] === "start") {
    const info = await stat(configFile);
    if (process.platform !== "win32" && info.mode & 0o077)
      throw new Error("Device config must be private: chmod 600");
    const config = JSON.parse(await readFile(configFile, "utf8"));
    if (!process.env.DEEPSEEK_API_KEY)
      throw new Error(
        "Set DEEPSEEK_API_KEY locally; no cloud key is downloaded",
      );
    const abort = new AbortController();
    process.once("SIGINT", () => abort.abort());
    process.once("SIGTERM", () => abort.abort());
    const runner = connectRunner({
      ...config,
      model: values.model,
      stateDir: join(dirname(configFile), "turns"),
      signal: abort.signal,
    });
    await runner.done;
  } else throw new Error("Use init or start");
}
