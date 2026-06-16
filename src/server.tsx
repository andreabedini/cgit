import { serveStatic } from "hono/bun";
import { appendTrailingSlash } from "hono/trailing-slash";
import { factory } from "./app/env";
import { loadConfig } from "./config/config";
import { notFound, statusForError } from "./errors";
import { openRepository } from "./git";
import { scanRepos } from "./git/scan";
import { isBinary } from "./blob";
import { splitRefPath } from "./git/refpath";
import { BlobPage } from "./views/default/BlobPage";
import { TreePage } from "./views/default/TreePage";
import { buildDecorationMap, useRepository } from "./middlewares";
import { ErrorPage } from "./views/default/ErrorPage";
import { LogPage } from "./views/default/LogPage";
import { renderer, repoLayout } from "./views/default/renderer";
import { RepolistPage, type RepoListEntry } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";

export function createApp() {
  const app = factory.createApp();

  app.use(renderer);

  // Infra routes are registered before the repo sub-app so requests like
  // `/healthz` or `/cgit.css` never match the `/:repo` redirect.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/terminal.min.css", serveStatic({ path: "./src/public/terminal.min.css" }));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.get("/", (c) => {
    // Numbered pagination UI is a later milestone; cap to the first page for now.
    const repos = scanRepos(c.env.CGIT_SCAN_PATH).slice(0, c.env.CGIT_REPOLIST_PAGE_SIZE);
    const entries: RepoListEntry[] = repos.map((repo) => {
      const handle = openRepository(repo.path);
      try {
        const last = handle.log({ limit: 1 }).commits[0];
        return { repo, lastCommit: last?.author.when };
      } finally {
        handle.free();
      }
    });
    return c.render(<RepolistPage entries={entries} now={new Date()} />);
  });

  // appendTrailingSlash is a 404 fallback: it sends slash-less paths to their
  // slash form only when the response is 404. Exclude tree/raw so a genuine
  // missing-path 404 there is returned as-is rather than bounced to a slash URL.
  app.use(
    appendTrailingSlash({
      skip: (p) => p.includes("/tree/") || p.includes("/raw/"),
    }),
  );

  // Nested layout adds the per-repo menu; useRepository opens the repo and
  // exposes it (and its discovered metadata) on the context.
  app.use("/:repo/*", repoLayout);
  app.use("/:repo/*", useRepository);

  app.get("/:repo/", (c) => {
    const repo = c.get("repo");
    const refs = repo.references();
    const branches = refs.filter((r) => r.kind === "branch");
    const tags = refs.filter((r) => r.kind === "tag");
    const recentCommits = repo.log({ limit: c.env.CGIT_SUMMARY_LOG }).commits;

    const disc = c.get("disc");
    const cloneUrls = c.env.CGIT_CLONE_URL_BASE
      ? [`${c.env.CGIT_CLONE_URL_BASE.replace(/\/$/, "")}/${disc.name}.git`]
      : [];
    const readme = repo.readFileAtRef(repo.headRef(), "README.md");
    const about = readme ? new TextDecoder().decode(readme) : undefined;

    return c.render(
      <SummaryPage
        name={disc.name}
        description={disc.description}
        branches={branches.slice(0, c.env.CGIT_SUMMARY_BRANCHES)}
        tags={tags.slice(0, c.env.CGIT_SUMMARY_TAGS)}
        recentCommits={recentCommits}
        cloneUrls={cloneUrls}
        about={about}
        now={new Date()}
      />,
    );
  });

  app.get("/:repo/log/", (c) => {
    const disc = c.get("disc");
    
    const repo = c.get("repo");
    const ref = c.req.query("h") || repo.headRef();
    const offset = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    const limit = c.env.CGIT_LOG_PAGE_SIZE;
    const page = repo.log({ ref, offset, limit });
    const decorations = buildDecorationMap(repo.references());

    return c.render(
      <LogPage
        name={disc.name}
        ref={ref}
        commits={page.commits}
        decorations={decorations}
        offset={offset}
        limit={limit}
        hasMore={page.hasMore}
        now={new Date()}
      />,
    );
  });

  app.get("/:repo/tree/*", (c) => {
    const repo = c.get("repo");
    const disc = c.get("disc");
    if (!disc || !repo) throw notFound("Repository not found");
    const tail = c.req.path.slice(`/${disc.name}/tree/`.length);
    const refNames = repo.references().map((r) => r.name);
    const { ref, path } = splitRefPath(tail, refNames, repo.headRef());

    const entries = repo.tree(ref, path);
    if (entries) {
      return c.render(<TreePage name={disc.name} ref={ref} path={path} entries={entries} />);
    }
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes !== null) {
      const binary = isBinary(bytes);
      const text = binary ? undefined : new TextDecoder().decode(bytes);
      return c.render(
        <BlobPage name={disc.name} ref={ref} path={path} binary={binary} text={text} size={bytes.length} />,
      );
    }
    throw notFound(`Path not found: ${path}`);
  });

  app.get("/:repo/raw/*", (c) => {
    const repo = c.get("repo");
    const disc = c.get("disc");
    if (!disc || !repo) throw notFound("Repository not found");
    const tail = c.req.path.slice(`/${disc.name}/raw/`.length);
    const refNames = repo.references().map((r) => r.name);
    const { ref, path } = splitRefPath(tail, refNames, repo.headRef());

    const bytes = repo.readFileAtRef(ref, path);
    if (bytes === null) throw notFound(`Path not found: ${path}`);
    const contentType = isBinary(bytes)
      ? "application/octet-stream"
      : "text/plain; charset=utf-8";
    return new Response(bytes, { headers: { "Content-Type": contentType } });
  });

  app.notFound((c) => {
    c.status(404);
    return c.render(<ErrorPage status={404} message="Not found" />);
  });

  app.onError((err, c) => {
    const status = statusForError(err);
    const message = err instanceof Error ? err.message : "Internal error";
    if (status === 500) console.error(err);
    c.status(status as 400 | 404 | 500);
    return c.render(<ErrorPage status={status} message={message} />);
  });

  return app;
}

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: (req: Request) => createApp().fetch(req, loadConfig()),
};
