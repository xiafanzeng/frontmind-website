import { describe, expect, it } from "vitest";
import { safePublicAppUrl } from "./safe-url";

describe("safePublicAppUrl", () => {
  it("accepts a credential-free public HTTPS workspace", () => {
    expect(
      safePublicAppUrl("https://dashboard.frontmind.net/workspaces/acme"),
    ).toBe("https://dashboard.frontmind.net/workspaces/acme");
  });

  it.each([
    "https://user:secret@dashboard.frontmind.net/workspaces/acme",
    "http://dashboard.frontmind.net/workspaces/acme",
    "https://127.0.0.1/admin",
    "https://192.168.1.10/admin",
    "https://[::1]/admin",
    "https://agent.internal/admin",
    "https://agent/admin",
  ])("rejects a non-public or credential-bearing app URL: %s", (url) => {
    expect(safePublicAppUrl(url)).toBeUndefined();
  });

  it("allows only explicit HTTP loopback targets in local development", () => {
    expect(
      safePublicAppUrl("http://localhost:3001/login", {
        allowLocalDevelopment: true,
      }),
    ).toBe("http://localhost:3001/login");
    expect(
      safePublicAppUrl("https://localhost:3001/login", {
        allowLocalDevelopment: true,
      }),
    ).toBeUndefined();
  });
});
