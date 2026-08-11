import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { siblingDashboardRepositoryRoot } from "./cross-repo-test-path";

const originalConfiguredRoot = process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT;
const temporaryRoots: string[] = [];
const developmentSuffix = "-dev";
const dashboardRepositoryName = "frontmind-dashboard";
const dashboardDevelopmentRepositoryName = `${dashboardRepositoryName}${developmentSuffix}`;
const websiteRepositoryName = "frontmind-website";
const websiteDevelopmentRepositoryName = `${websiteRepositoryName}${developmentSuffix}`;

afterEach(() => {
  if (originalConfiguredRoot === undefined) {
    delete process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT;
  } else {
    process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT = originalConfiguredRoot;
  }
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixtureWorkspace(name: string, siblings: string[]) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "frontmind-repos-"));
  temporaryRoots.push(parent);
  const cwd = path.join(parent, name);
  fs.mkdirSync(cwd);
  for (const sibling of siblings) fs.mkdirSync(path.join(parent, sibling));
  return { parent, cwd };
}

describe("cross-repository Dashboard test path", () => {
  it("honors the explicit Dashboard repository root", () => {
    const configured = path.join(os.tmpdir(), "explicit-frontmind-dashboard");
    process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT = configured;
    expect(
      siblingDashboardRepositoryRoot(
        path.join("/ignored", websiteDevelopmentRepositoryName),
      ),
    ).toBe(path.resolve(configured));
  });

  it("prefers the Dashboard Dev sibling from a Website Dev workspace", () => {
    delete process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT;
    const { parent, cwd } = fixtureWorkspace(websiteDevelopmentRepositoryName, [
      dashboardRepositoryName,
      dashboardDevelopmentRepositoryName,
    ]);
    expect(siblingDashboardRepositoryRoot(cwd)).toBe(
      path.join(parent, dashboardDevelopmentRepositoryName),
    );
  });

  it("keeps production and legacy fallback priority outside Dev", () => {
    delete process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT;
    const production = fixtureWorkspace(websiteRepositoryName, [
      dashboardRepositoryName,
      dashboardDevelopmentRepositoryName,
      "frontmind-agent",
    ]);
    expect(siblingDashboardRepositoryRoot(production.cwd)).toBe(
      path.join(production.parent, dashboardRepositoryName),
    );

    const legacy = fixtureWorkspace(websiteRepositoryName, ["frontmind-agent"]);
    expect(siblingDashboardRepositoryRoot(legacy.cwd)).toBe(
      path.join(legacy.parent, "frontmind-agent"),
    );
  });
});
