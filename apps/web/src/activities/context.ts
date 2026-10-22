import { createContext, useContext } from "react";
import type { User } from "@island/contracts";
export type ActivityScope = {
  user: User;
  href(path: string): string;
  home: string;
  library: string;
  returnTo: string;
  notify(message: string): void;
  record(event: { type: string; detail?: string }): void;
};
export const ActivityContext = createContext<ActivityScope | null>(null);
export function useActivity() {
  const value = useContext(ActivityContext);
  if (!value) throw new Error("活动账号尚未准备好");
  return value;
}
