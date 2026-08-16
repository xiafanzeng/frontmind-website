import { describe, expect, it } from "vitest";

import { normalizeBusinessOwnerName } from "../../shared/business-owner-name";

describe("business owner name", () => {
  it("normalizes NFKC and collapses Unicode whitespace", () => {
    expect(normalizeBusinessOwnerName("  Ａｌｉｃｅ　张三  ")).toBe(
      "Alice 张三",
    );
    expect(normalizeBusinessOwnerName("Jean·Luc O’Neil-3.0")).toBe(
      "Jean·Luc O’Neil-3.0",
    );
  });

  it.each([
    "",
    "张三\n李四",
    "张三\u2028李四",
    "张三\u202e李四",
    "张三()",
    "张三/李四",
    "张三😀",
    "张".repeat(41),
  ])("rejects unsafe or out-of-contract input %#", (value) => {
    expect(() => normalizeBusinessOwnerName(value)).toThrow(
      "BUSINESS_OWNER_NAME_INVALID",
    );
  });
});
