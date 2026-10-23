import type { AccountInventory } from "../activities/useAccountInventory";
import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  avatarProfileSchema,
  type AvatarConfig,
  type AvatarProfile,
} from "@island/contracts";
import { unlocks } from "@island/world-core";
import { AvatarPreview } from "../player/AvatarModel";
import { avatarForms, avatarHats, avatarAccents } from "../player/avatar";
import { api } from "../api";

export default function PhysicsDressing({
  close,
  inventory,
}: {
  close(): void;
  inventory: AccountInventory;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    generation = useRef(0);
  const [profile, setProfile] = useState<AvatarProfile | null>(null),
    [draft, setDraft] = useState<AvatarConfig | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = async () => {
    const request = ++generation.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const p = avatarProfileSchema.parse(
        await api(`/physics/avatar?accountId=${inventory.accountId}`),
      );
      if (alive.current && request === generation.current) {
        setProfile(p);
        setDraft(p.avatar);
      }
    } catch (e) {
      if (alive.current && request === generation.current)
        setError(e instanceof Error ? e.message : "载入失败");
    } finally {
      if (alive.current && request === generation.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const node = dialog.current!;
    node.showModal();
    void load();
    return () => {
      alive.current = false;
      generation.current++;
      node.close();
    };
  }, []);
  const save = async () => {
    if (!profile || !draft || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const p = avatarProfileSchema.parse(
        await api("/physics/avatar", {
          method: "PUT",
          body: JSON.stringify({
            avatar: draft,
            accountId: inventory.accountId,
            expectedRevision: profile.revision,
          }),
        }),
      );
      if (alive.current) {
        setProfile(p);
        setDraft(p.avatar);
        setMessage("形象已保存到账号");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const buy = async (unlock: string, hat: AvatarConfig["hat"]) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!(await inventory.buy(unlock))) return;
      const p = avatarProfileSchema.parse(
        await api(`/physics/avatar?accountId=${inventory.accountId}`),
      );
      if (alive.current) {
        setProfile((previous) =>
          previous
            ? { ...previous, stars: p.stars, ownedHats: p.ownedHats }
            : p,
        );
        setDraft((d) => (d ? { ...d, hat } : p.avatar));
        setMessage("帽饰已兑换，保存后穿戴");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "兑换失败");
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="physics-content-dialog physics-dressing"
      aria-labelledby="physics-dressing-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="physics-actions">
        <h2 id="physics-dressing-title">我的形象</h2>
        <button disabled={busy} onClick={close}>
          关闭装扮
        </button>
        {message && <p role="status">{message}</p>}
        {(error || inventory.error) && (
          <p role="alert">{error || inventory.error}</p>
        )}
      </header>
      <p>形象随账号保存，在自己的世界和朋友的岛上都能使用。</p>
      {profile && draft ? (
        <>
          <div className="physics-avatar-preview">
            <Canvas
              dpr={[1, 1.5]}
              camera={{ position: [0, 0.95, 3.3], fov: 38 }}
            >
              <ambientLight intensity={1.1} />
              <directionalLight position={[2, 4, 3]} intensity={2} />
              <AvatarPreview config={draft} />
            </Canvas>
          </div>
          <fieldset disabled={busy}>
            <legend>选择形象</legend>
            <div className="physics-actions">
              {avatarForms.map((f) => (
                <button
                  key={f.id}
                  aria-pressed={draft.form === f.id}
                  onClick={() => {
                    setDraft({ ...draft, form: f.id });
                    setMessage("");
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>主题色</legend>
            <div className="physics-actions">
              {avatarAccents.map((c) => (
                <button
                  key={c}
                  aria-label={`主题色 ${c}`}
                  aria-pressed={draft.accent === c}
                  onClick={() => {
                    setDraft({ ...draft, accent: c });
                    setMessage("");
                  }}
                >
                  <span
                    className="physics-avatar-color"
                    style={{ background: c }}
                  />
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>
              帽饰 · {inventory.state?.stars ?? profile.stars} 颗星星
            </legend>
            <div className="physics-actions">
              {avatarHats.map((h) => {
                const owned =
                    profile.ownedHats.includes(h.id) ||
                    !!(h.unlockId && inventory.state?.owned[h.unlockId]),
                  cost = unlocks.find((u) => u.id === h.unlockId)?.cost;
                return (
                  <button
                    key={h.id}
                    aria-pressed={draft.hat === h.id}
                    onClick={() => {
                      if (owned) {
                        setDraft({ ...draft, hat: h.id });
                        setMessage("");
                      } else if (h.unlockId) void buy(h.unlockId, h.id);
                    }}
                  >
                    {h.name}
                    {!owned ? ` · ${cost}★兑换` : ""}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="physics-actions">
            <button disabled={busy} onClick={() => void save()}>
              保存形象
            </button>
            <button disabled={busy} onClick={() => void load()}>
              重新载入形象
            </button>
          </div>
        </>
      ) : busy ? (
        <p role="status">正在打开装扮小屋…</p>
      ) : (
        <button onClick={() => void load()}>重新载入形象</button>
      )}
    </dialog>
  );
}
