import { useState } from "react";
import { useLocation } from "react-router";
import type { AuthConfig } from "@island/contracts";
export default function PhysicsLogin({
  auth,
  busy,
  login,
}: {
  auth: AuthConfig | null;
  busy: boolean;
  login(development: boolean, name: string): Promise<void>;
}) {
  const [name, setName] = useState("旅人"),
    location = useLocation();
  return (
    <section className="physics-login">
      <h2>登录后进入世界</h2>
      <p>世界会保存到账号；参观也需要一个名字。</p>
      {auth?.joyhouse && (
        <a
          href={`/api/auth/joyhouse/start?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        >
          微信登录并返回
        </a>
      )}
      {auth?.development && (
        <button disabled={busy} onClick={() => void login(true, name)}>
          本地开发账号登录
        </button>
      )}
      <label>
        你的名字
        <input
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !name.trim()}
        onClick={() => void login(false, name)}
      >
        以访客身份进入
      </button>
    </section>
  );
}
