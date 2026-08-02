import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("CI workflow", () => {
  it("takes the pnpm version only from package.json", async () => {
    const workflow = await readFile(
      path.resolve(".github/workflows/ci-release.yml"),
      "utf8",
    );
    expect(workflow).not.toMatch(/pnpm\/action-setup@v4\s+with:\s+version:/gu);
  });
});
