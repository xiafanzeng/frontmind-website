import { describe, expect, it } from "vitest";

import { localizedUserFacingError } from "./error-localization";

describe("localizedUserFacingError", () => {
  it("keeps existing Chinese messages", () => {
    expect(localizedUserFacingError("邀请码不正确", 401)).toBe("邀请码不正确");
  });

  it("translates common authentication and network failures", () => {
    expect(localizedUserFacingError("Invalid username or password", 401)).toBe(
      "用户名或密码不正确。",
    );
    expect(localizedUserFacingError(new Error("Failed to fetch"))).toBe(
      "网络连接异常，请检查网络后重试。",
    );
  });

  it("replaces unknown English server details with a Chinese status message", () => {
    expect(localizedUserFacingError("upstream database exploded", 503)).toBe(
      "服务暂时不可用，请稍后重试。",
    );
  });
});
