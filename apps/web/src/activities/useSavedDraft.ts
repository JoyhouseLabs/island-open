import { useState, type SetStateAction } from "react";
/** Every caller supplies an account-scoped key and validates persisted input. */
export function useSavedDraft<T>(
  key: string,
  initial: T,
  parse: (value: unknown) => T,
) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      return { key, value: raw ? parse(JSON.parse(raw)) : initial, error: "" };
    } catch {
      return { key, value: initial, error: "本机草稿无法读取，原记录仍保留。" };
    }
  };
  const [state, setState] = useState(read);
  if (state.key !== key) setState(read());
  const set = (next: SetStateAction<T>) =>
    setState((current) => {
      const value =
        typeof next === "function"
          ? (next as (v: T) => T)(current.value)
          : next;
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return { key, value, error: "" };
      } catch {
        return {
          key,
          value,
          error: "本机草稿保存失败，离开前请复制需要保留的内容。",
        };
      }
    });
  return [state.value, set, state.error] as const;
}
