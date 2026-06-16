import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/config";

test("loadConfig uses default MIME types when the config file is missing", () => {
  const cfg = loadConfig({ CGIT_CONFIG: "/nonexistent/cgit.yaml" });
  expect(cfg.mimeTypes.gif).toBe("image/gif");
  expect(cfg.mimeTypes.pdf).toBe("application/pdf");
});

test("loadConfig merges the YAML mimetype section over the defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "cgit-cfg-"));
  try {
    const file = join(dir, "cgit.yaml");
    writeFileSync(file, "mimetype:\n  gif: image/x-custom\n  rs: text/rust\n");
    const cfg = loadConfig({ CGIT_CONFIG: file });
    expect(cfg.mimeTypes.gif).toBe("image/x-custom"); // overridden
    expect(cfg.mimeTypes.rs).toBe("text/rust");        // extended
    expect(cfg.mimeTypes.pdf).toBe("application/pdf");  // default kept
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig throws on a malformed YAML config", () => {
  const dir = mkdtempSync(join(tmpdir(), "cgit-cfg-"));
  try {
    const file = join(dir, "cgit.yaml");
    writeFileSync(file, 'mimetype:\n  gif: "unterminated\n');
    expect(() => loadConfig({ CGIT_CONFIG: file })).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
