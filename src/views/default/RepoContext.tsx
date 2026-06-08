import { createContext, useContext } from "hono/jsx";

export interface RepoCtx {
  name: string;
  ref?: string;
}

export const RepoContext = createContext<RepoCtx>({ name: "" });

export function useRepo(): RepoCtx {
  return useContext(RepoContext);
}
