import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { runHarness, runtimeEnvironment } from "../src/harness.mjs";
import { runnerURL, connectRunner } from "../src/runner.mjs";
import { WebSocketServer } from "ws";

test("runner requires secure origin and scrubs credentials from child environment", () => {
  assert.equal(
    runnerURL("https://island.example"),
    "wss://island.example/api/collaboration/runner",
  );
  assert.match(runnerURL("http://127.0.0.1:3001"), /^ws:/);
  for (const value of [
    "http://example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
  ])
    assert.throws(() => runnerURL(value));
  assert.deepEqual(
    runtimeEnvironment({
      PATH: "/bin",
      DEEPSEEK_API_KEY: "local-model-key",
      ISLAND_TOKEN: "never",
      DATABASE_URL: "never",
      NODE_OPTIONS: "never",
      DSH_HOME: "never",
    }),
    { PATH: "/bin", DEEPSEEK_API_KEY: "local-model-key" },
  );
});

test("cancellation closes owned runtime and removes transient history", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "island-cancel-"));
  const abort = new AbortController();
  let closed = false,
    rejectRun;
  class FakeHarness {
    run() {
      setTimeout(() => abort.abort(), 10);
      return new Promise((_, reject) => {
        rejectRun = reject;
      });
    }
    async close() {
      closed = true;
      rejectRun?.(new Error("closed"));
    }
  }
  try {
    await assert.rejects(
      runHarness(
        {
          prompt: "/permission danger-full-access",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        { stateDir, signal: abort.signal, Harness: FakeHarness },
      ),
    );
    assert.ok(closed);
    assert.deepEqual(await readdir(stateDir), []);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test(
  "real pinned Harness executes a turn against local Messages fixture with zero callable tools",
  { timeout: 60000 },
  async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "island-harness-"));
    const calls = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const part of req) body += part;
      calls.push({ url: req.url, body: body ? JSON.parse(body) : null });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const events = [
        {
          type: "message_start",
          message: {
            id: "msg_island",
            type: "message",
            role: "assistant",
            model: "deepseek-v4-flash",
            content: [],
            stop_reason: null,
            usage: { input_tokens: 20, output_tokens: 0 },
          },
        },
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "我们可以一起在池塘边观察水草。" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 18 },
        },
        { type: "message_stop" },
      ];
      for (const event of events)
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const patch = join(stateDir, "fixture.yml");
    await writeFile(
      patch,
      `- id: llm-deepseek\n  config:\n    apiKeyEnv: DEEPSEEK_API_KEY\n    baseURL: http://127.0.0.1:${server.address().port}\n    thinking: disabled\n`,
    );
    class FixtureHarness extends DeepSeekHarness {
      constructor(options) {
        super({ ...options, patches: [...options.patches, patch] });
      }
      async run(...args) {
        const result = await super.run(...args);
        assert.notEqual(result.finishReason, "error", JSON.stringify(result.events));
        return result;
      }
    }
    try {
      const output = await runHarness(
        {
          prompt: "你是水伊布。给岛主一个建议。",
          expiresAt: new Date(Date.now() + 50000).toISOString(),
        },
        {
          stateDir: join(stateDir, "turns"),
          signal: new AbortController().signal,
          Harness: FixtureHarness,
          env: { ...runtimeEnvironment(), DEEPSEEK_API_KEY: "fixture-only" },
        },
      );
      assert.match(output, /水草/);
      assert.ok(calls.length >= 1);
      for (const call of calls) {
        assert.match(call.url, /messages/);
        assert.equal(call.body.tools?.length ?? 0, 0);
      }
      assert.deepEqual(await readdir(join(stateDir, "turns")), []);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(stateDir, { recursive: true, force: true });
    }
  },
);

test(
  "real WebSocket runner executes one assignment, receipts it, and stops on disconnect",
  { timeout: 10000 },
  async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const task = {
      taskId: "11111111-1111-4111-8111-111111111111",
      leaseId: "22222222-2222-4222-8222-222222222222",
      prompt: "hello",
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
    let executions = 0,
      receipt;
    server.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "ready", protocol: 1 }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === "claim")
          socket.send(JSON.stringify({ type: "task", task }));
        if (msg.type === "complete") {
          receipt = msg;
          socket.send(JSON.stringify({ type: "ack", taskId: task.taskId }));
          socket.close();
        }
      });
    });
    const runner = connectRunner({
      origin: `http://127.0.0.1:${server.address().port}`,
      token: "a".repeat(64),
      log() {},
      execute: async () => {
        executions++;
        return "建议";
      },
    });
    try {
      await runner.done;
      assert.equal(executions, 1);
      assert.equal(receipt.output, "建议");
    } finally {
      runner.stop();
      for (const socket of server.clients) socket.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
