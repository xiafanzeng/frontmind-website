import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenBrandPattern = new RegExp(["ma", "nus"].join(""), "i");

function publicSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return publicSourceFiles(path);
    return /\.(?:html|js|jsx|ts|tsx|txt)$/.test(entry.name) ? [path] : [];
  });
}

describe("public FrontMind brand boundary", () => {
  it("keeps customer-facing website sources free of provider branding", () => {
    const repositoryRoot = resolve(import.meta.dirname, "..");
    const files = [
      ...publicSourceFiles(join(repositoryRoot, "client", "src")),
      join(repositoryRoot, "scripts", "generate-seo-assets.ts"),
      join(repositoryRoot, "vite.config.ts"),
    ];

    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        forbiddenBrandPattern,
      );
    }
  });
});
