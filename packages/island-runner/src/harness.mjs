import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const bundlePatch = fileURLToPath(
  new URL("../cordis.patch.yml", import.meta.url),
);
export function runtimeEnvironment(source = process.env) {
  const env = {};
  for (const key of [
    "PATH",
    "HOME",
    "TMPDIR",
    "TEMP",
    "SystemRoot",
    "LANG",
    "DEEPSEEK_API_KEY",
  ])
    if (source[key]) env[key] = source[key];
  return env;
}

/** One owned process per turn: no shared session notifications or invisible conversation history. */
export async function runHarness(
  task,
  {
    stateDir,
    signal,
    model = "deepseek-v4-flash",
    Harness = DeepSeekHarness,
    env = runtimeEnvironment(),
  },
) {
  if (signal.aborted) throw new Error("Cancelled");
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(join(resolve(stateDir), "turn-"));
  const workspace = join(dir, "workspace");
  await mkdir(workspace, { mode: 0o700 });
  const harness = new Harness({
    profile: "sdk-minimal",
    patches: [bundlePatch],
    dshHome: join(dir, "harness"),
    cwd: workspace,
    processCwd: workspace,
    provider: "deepseek-official",
    model,
    maxTokens: 1600,
    initializeTimeoutMs: 30000,
    requestTimeoutMs: 240000,
    env,
    onUserQuestion: async () => ({ cancelled: true }),
  });
  let stopped = false,
    closeError;
  const stop = () => {
    stopped = true;
    void harness.close().catch((e) => {
      closeError = e;
    });
  };
  const remaining = Math.min(
    240000,
    new Date(task.expiresAt).getTime() - Date.now(),
  );
  if (!Number.isFinite(remaining) || remaining <= 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error("Expired");
  }
  const timer = setTimeout(stop, remaining);
  signal.addEventListener("abort", stop, { once: true });
  try {
    if (signal.aborted) {
      stop();
      throw new Error("Cancelled");
    }
    // Prefix blocks native slash-command routing, even for a malicious/malformed assignment.
    const result = await harness.run(
      "Island discussion data follows. Answer with a proposal only.\n" +
        task.prompt,
    );
    if (
      stopped ||
      signal.aborted ||
      ["error", "aborted", "max_tokens"].includes(result.finishReason)
    )
      throw new Error("Incomplete turn");
    const output = result.finalResponse.trim();
    if (!output) throw new Error("Empty response");
    return output.slice(0, 12000);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    try {
      await harness.close(); // A timeout alone does not cancel Harness; prove exit before cleanup/reuse.
      if (closeError) throw closeError;
    } catch (cause) {
      throw Object.assign(
        new Error("Harness exit could not be confirmed", { cause }),
        { code: "HARNESS_CLEANUP" },
      );
    }
    await rm(dir, { recursive: true, force: true });
  }
}
