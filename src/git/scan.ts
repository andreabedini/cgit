import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

export interface DiscoveredRepo {
  name: string;
  path: string;
  description?: string;
  owner?: string;
}

function isGitRepo(dir: string): boolean {
  // Bare repo: HEAD + objects/ directly inside.
  if (existsSync(join(dir, "HEAD")) && existsSync(join(dir, "objects"))) return true;
  // Non-bare: a .git directory.
  return existsSync(join(dir, ".git", "HEAD"));
}

function readDescription(dir: string): string | undefined {
  const path = join(dir, "description");
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8").trim();
  if (!text || text.startsWith("Unnamed repository")) return undefined;
  return text;
}

export function scanRepos(root: string): DiscoveredRepo[] {
  if (!existsSync(root)) return [];
  const repos: DiscoveredRepo[] = [];
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!isGitRepo(dir)) continue;
    repos.push({
      name: basename(entry).replace(/\.git$/, ""),
      path: dir,
      description: readDescription(dir),
    });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}
