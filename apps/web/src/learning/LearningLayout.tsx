import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useOutletContext } from "react-router";
import type { AuthConfig, User } from "@island/contracts";
import { api, RequestError } from "../api";
import "./learning.css";
export function useLearner() {
  return useOutletContext<{ user: User }>().user;
}
export default function LearningLayout() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null),
    [config, setConfig] = useState<AuthConfig | null>(null),
    [ready, setReady] = useState(false),
    [enabled, setEnabled] = useState(false),
    [error, setError] = useState("");
  async function load() {
    setReady(false);
    setError("");
    try {
      const [caps, auth] = await Promise.all([
        api<{ features?: { learning?: boolean } }>("/capabilities"),
        api<AuthConfig>("/auth/config"),
      ]);
      setEnabled(!!caps.features?.learning);
      setConfig(auth);
      setUser(
        await api<User>("/auth/me").catch((e) => {
          if (e instanceof RequestError && e.status === 401) return null;
          throw e;
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时无法连接学习中心。");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="learn-root">
      <header className="learn-header">
        <Link to="/learn" className="learn-brand">
          ✦ 心灵家园 <span>学习中心</span>
        </Link>
        <Link to="/island">回到小岛 ↗</Link>
      </header>
      {!ready ? (
        <section className="learn-empty" role="status">
          正在打开学习中心…
        </section>
      ) : error ? (
        <section className="learn-empty" role="alert">
          <p>{error}</p>
          <button onClick={() => void load()}>重新连接</button>
        </section>
      ) : !enabled ? (
        <section className="learn-empty">
          <h1>学习中心正在准备中</h1>
          <p>开放后，可以从书屋接取任务，也可以在这里自由选择。</p>
        </section>
      ) : !user ? (
        <section className="learn-empty">
          <span className="learn-eyebrow">保存每一次小小发现</span>
          <h1>登录后，继续你的探索</h1>
          <p>学习进度与作品会保存到你的账号，换设备也可以继续。</p>
          {config?.joyhouse && (
            <a
              className="learn-primary"
              href={`/api/auth/joyhouse/start?returnTo=${encodeURIComponent(location.pathname)}`}
            >
              微信登录并返回学习
            </a>
          )}
          {config?.development && (
            <button
              onClick={() => {
                setError("");
                void api<User>("/auth/development", {
                  method: "POST",
                  body: JSON.stringify({ name: "demo" }),
                })
                  .then(setUser)
                  .catch((e) => setError(e.message));
              }}
            >
              本地开发账号登录
            </button>
          )}
          {!config?.joyhouse && !config?.development && (
            <p>当前登录入口尚未配置，请稍后再来。</p>
          )}
        </section>
      ) : (
        <Outlet context={{ user }} />
      )}
    </main>
  );
}
