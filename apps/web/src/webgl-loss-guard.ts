/** Global DOM guard for WebGL context loss.
 *
 * Browsers may tear down WebGL contexts at any time — mobile backgrounding,
 * GPU resets, memory pressure. Three.js can only rebuild the context when
 * the `webglcontextlost` event's default is prevented, and nothing in the
 * app did that: a lost context froze the scene until a manual reload. This
 * guard covers every canvas (island, sub-scenes, learning, workshop,
 * previews) from one capture-phase listener pair, because context events
 * do not bubble but still traverse the capture phase.
 */
export function installWebGLLossGuard() {
  if (typeof document === "undefined" || (document as { __webglGuard?: boolean }).__webglGuard)
    return;
  (document as { __webglGuard?: boolean }).__webglGuard = true;
  let overlay: HTMLDivElement | null = null;
  let stalledTimer: number | undefined;
  const dismiss = () => {
    if (stalledTimer) window.clearTimeout(stalledTimer);
    stalledTimer = undefined;
    overlay?.remove();
    overlay = null;
  };
  const reveal = (canvas: HTMLCanvasElement) => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "webgl-lost";
    const card = document.createElement("div");
    card.className = "webgl-lost-card";
    const title = document.createElement("strong");
    title.textContent = "画面走丢了，正在找回…";
    const note = document.createElement("small");
    note.textContent = "设备暂时收回了 3D 画笔，一般几秒内会自己回来。";
    const reload = document.createElement("button");
    reload.textContent = "重新打开页面";
    reload.addEventListener("click", () => location.reload());
    card.append(title, note, reload);
    overlay.append(card);
    // The R3F container div wraps its canvas and is positioned, so the
    // overlay covers exactly the frozen scene; body is the odd-case host.
    (canvas.parentElement ?? document.body).appendChild(overlay);
    // If restoration never arrives, keep the door open: surface the reload
    // button prominently instead of an endless "restoring" promise.
    stalledTimer = window.setTimeout(
      () => overlay?.classList.add("webgl-lost-stalled"),
      8000,
    );
  };
  document.addEventListener(
    "webglcontextlost",
    (e) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault(); // without this three cannot restore the context
      reveal(e.target);
    },
    true,
  );
  document.addEventListener(
    "webglcontextrestored",
    (e) => {
      if (e.target instanceof HTMLCanvasElement) dismiss();
    },
    true,
  );
}
