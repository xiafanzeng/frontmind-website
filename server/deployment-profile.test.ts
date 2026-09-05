import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { createReleaseProfile } from "../config/release-profile.mjs";
import { assertFrontMindReleaseRuntime } from "./release-channel";

describe("Website deployment target", () => {
  it("preserves the existing .net production profile by default", () => {
    const profile = createReleaseProfile();
    expect(profile).toMatchObject({
      deploymentTarget: "net",
      channel: "production",
      siteUrl: "https://www.frontmind.net",
      clientPortalUrl: "https://dashboard.frontmind.net/login",
      publishSearchIndexes: true,
      requireAgentCredential: true,
      expectedRuntimeEnvironment: {
        FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
        FRONTMIND_PRESALES_AGENT_URL:
          "http://frontmind-dashboard:3001/api/internal/presales/v2",
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://frontmind-dashboard:3001/api/internal/provisioning",
        FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: "frontmind-dashboard",
      },
    });
    expect(
      assertFrontMindReleaseRuntime(
        profile.expectedRuntimeEnvironment,
        profile,
      ),
    ).toEqual({ channel: "production", paymentMode: "zpay" });
  });

  it("uses one .cn profile for SEO, the customer login, and internal Dashboard requests", () => {
    const profile = createReleaseProfile("cn");
    expect(profile).toMatchObject({
      deploymentTarget: "cn",
      siteUrl: "https://www.frontmind.cn",
      clientPortalUrl: "https://dashboard.frontmind.cn/login",
      publishSearchIndexes: true,
      robotsDirective: expect.stringContaining("index, follow"),
      expectedRuntimeEnvironment: {
        FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.cn",
        FRONTMIND_PRESALES_AGENT_URL:
          "http://dashboard:3001/api/internal/presales/v2",
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://dashboard:3001/api/internal/provisioning",
        FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: "dashboard",
      },
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.expectedRuntimeEnvironment)).toBe(true);
    expect(
      assertFrontMindReleaseRuntime(
        {
          ...profile.expectedRuntimeEnvironment,
          FRONTMIND_DEPLOYMENT_TARGET: "cn",
        },
        profile,
      ),
    ).toEqual({ channel: "production", paymentMode: "zpay" });
  });

  it.each(Object.keys(createReleaseProfile("cn").expectedRuntimeEnvironment))(
    "rejects a stale .net runtime value for %s",
    (name) => {
      const cn = createReleaseProfile("cn");
      const net = createReleaseProfile("net");
      const staleValue =
        net.expectedRuntimeEnvironment[
          name as keyof typeof net.expectedRuntimeEnvironment
        ];
      expect(() =>
        assertFrontMindReleaseRuntime(
          { ...cn.expectedRuntimeEnvironment, [name]: staleValue },
          cn,
        ),
      ).toThrow(`FRONTMIND_PRODUCTION_ENDPOINT_INVALID:${name}`);
    },
  );

  it("rejects unknown targets and attempts to switch a built deployment at runtime", () => {
    expect(() => createReleaseProfile("con")).toThrow(
      "FRONTMIND_DEPLOYMENT_TARGET_INVALID",
    );
    const cn = createReleaseProfile("cn");
    expect(() =>
      assertFrontMindReleaseRuntime(
        {
          ...cn.expectedRuntimeEnvironment,
          FRONTMIND_DEPLOYMENT_TARGET: "net",
        },
        cn,
      ),
    ).toThrow("FRONTMIND_DEPLOYMENT_TARGET_RUNTIME_OVERRIDE_REJECTED");
  });

  it("pins the profile into the server bundle even if runtime target variables change", async () => {
    const result = await build({
      entryPoints: [
        fileURLToPath(
          new URL("../config/release-profile.mjs", import.meta.url),
        ),
      ],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      define: { __FRONTMIND_DEPLOYMENT_TARGET__: JSON.stringify("cn") },
    });
    const compiled = result.outputFiles[0].text;
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `${compiled}\nconsole.log(JSON.stringify(releaseProfile));`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, FRONTMIND_DEPLOYMENT_TARGET: "net" },
      },
    );
    expect(JSON.parse(output)).toMatchObject({
      deploymentTarget: "cn",
      siteUrl: "https://www.frontmind.cn",
      clientPortalUrl: "https://dashboard.frontmind.cn/login",
    });
  });
});
