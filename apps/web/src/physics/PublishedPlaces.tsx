import { useEffect, useState } from "react";
import { placeSchema, type PlaceConfig } from "@island/contracts";
import { api } from "../api";
export default function PublishedPlaces({
  disabled,
  visit,
}: {
  disabled: boolean;
  visit(id: string): void;
}) {
  const [places, setPlaces] = useState<PlaceConfig[]>([]),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api<{ places: unknown[] }>("/content/places")
      .then((feed) => {
        const values = feed.places.map((p) => placeSchema.parse(p));
        if (active) setPlaces(values);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <details className="physics-library-activities">
      <summary>我的小天地</summary>
      <p>前往账号已安装的发布场景，出发前会保存家园。</p>
      {loading ? (
        <span role="status">正在读取…</span>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : places.length ? (
        places.map((p) => (
          <button key={p.id} disabled={disabled} onClick={() => visit(p.id)}>
            {p.name}
          </button>
        ))
      ) : (
        <span>还没有安装的小天地。</span>
      )}
      <button disabled={loading} onClick={() => retry((n) => n + 1)}>
        刷新小天地
      </button>
    </details>
  );
}
