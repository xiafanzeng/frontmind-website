import { describe, expect, it } from "vitest";
import { createGeoDraftProject, isGeoDraftProject } from "./draft";

describe("GEO in-memory draft", () => {
  it("creates a non-remote project shell without retaining File bodies", () => {
    const file = new File(["brochure"], "企业宣传册.pdf", {
      type: "application/pdf",
    });
    const project = createGeoDraftProject("  示例企业  ", [file], {
      id: "draft-fixed",
      now: "2026-07-22T00:00:00.000Z",
    });

    expect(project).toMatchObject({
      id: "draft-fixed",
      remoteToken: "",
      title: "示例企业",
      input: "示例企业",
      status: "draft",
      stage: "enterprise_analysis",
    });
    expect(project.files).toEqual([
      {
        id: "draft-file-1",
        name: "企业宣传册.pdf",
        size: 8,
        type: "application/pdf",
      },
    ]);
    expect(project.files[0]).not.toBe(file);
    expect(isGeoDraftProject(project)).toBe(true);
  });
});
