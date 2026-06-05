import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FixtureRepo {
  path: string;            // path to the bare repo
  commitSubjects: string[]; // newest-first
  branches: string[];
  tags: string[];
  cleanup: () => void;
}

async function run(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "author@example.com",
      GIT_AUTHOR_DATE: "2026-06-01T10:00:00Z",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "author@example.com",
      GIT_COMMITTER_DATE: "2026-06-01T10:00:00Z",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  }
}

export async function createFixtureRepo(): Promise<FixtureRepo> {
  const root = mkdtempSync(join(tmpdir(), "cgit-ts-fixture-"));
  try {
    const work = join(root, "work");
    const bare = join(root, "repo.git");

    await run(root, "init", "-q", "-b", "main", work);
    await Bun.write(join(work, "README.md"), "# Fixture\n\nHello world.\n");
    await run(work, "add", "README.md");
    await run(work, "commit", "-q", "-m", "Add README");
    await Bun.write(join(work, "a.txt"), "first\n");
    await run(work, "add", "a.txt");
    await run(work, "commit", "-q", "-m", "Add a.txt");
    await run(work, "tag", "v1.0");
    await Bun.write(join(work, "b.txt"), "second\n");
    await run(work, "add", "b.txt");
    await run(work, "commit", "-q", "-m", "Add b.txt");

    // Publish to a bare repo (what the server actually serves).
    await run(root, "clone", "-q", "--bare", work, bare);

    const cleanup = () => rmSync(root, { recursive: true, force: true });
    return {
      path: bare,
      commitSubjects: ["Add b.txt", "Add a.txt", "Add README"],
      branches: ["main"],
      tags: ["v1.0"],
      cleanup,
    };
  } catch (err) {
    rmSync(root, { recursive: true, force: true });
    throw err;
  }
}
