import { describe, expect, it } from "vitest";
import { nextCustomQuestionTransientErrorCount } from "./router";

describe("custom question transient observation counter", () => {
  it("saturates at the persisted schema maximum", () => {
    expect(nextCustomQuestionTransientErrorCount(99, true)).toBe(100);
    expect(nextCustomQuestionTransientErrorCount(100, true)).toBe(100);
  });

  it("starts a new observation series at one", () => {
    expect(nextCustomQuestionTransientErrorCount(100, false)).toBe(1);
  });
});
