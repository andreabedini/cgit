import { test, expect } from "bun:test";
import { RepoContext, useRepo } from "../../src/views/default/RepoContext";

function DeepChild() {
  const { name, ref } = useRepo();
  return <a href={`/${name}/log/?h=${ref}`}>link</a>;
}

function Wrapper() {
  return (
    <RepoContext.Provider value={{ name: "alpha", ref: "main" }}>
      <div>
        <DeepChild />
      </div>
    </RepoContext.Provider>
  );
}

test("useRepo reads the provided repo context from a nested component", () => {
  const html = Wrapper().toString();
  expect(html).toContain('href="/alpha/log/?h=main"');
});
