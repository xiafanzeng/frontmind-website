import { execFileSync } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertCleanProductionBuildSource,
  assertCleanProductionReleaseWorktree,
} from "../scripts/assert-clean-build-source.mjs";
import {
  assertBuildArtifactLineage,
  readBuildArtifactManifest,
  readBuildArtifactIdentity,
  verifyBuildArtifactManifest,
  writeBuildArtifactManifest,
  writeBuildArtifactIdentity,
} from "../scripts/build-artifact-identity.mjs";
import { resolveProductionReleaseIdentity } from "../scripts/production-release-identity.mjs";
import { recreateEmptyProductionBuildRoot } from "../scripts/production-build-root.mjs";
import {
  createRuntimeReleaseArtifactVerifier,
  runtimeReleaseArtifactHealth,
  verifyRuntimeReleaseArtifact,
} from "../scripts/runtime-artifact-integrity.mjs";

const temporaryRepositories: string[] = [];

function git(repositoryRoot: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function createRepository() {
  const repositoryRoot = await mkdtemp(
    path.join(tmpdir(), "frontmind-website-build-source-"),
  );
  temporaryRepositories.push(repositoryRoot);
  git(repositoryRoot, ["init", "-q"]);
  git(repositoryRoot, ["config", "user.email", "release@example.invalid"]);
  git(repositoryRoot, ["config", "user.name", "Release Test"]);
  await mkdir(path.join(repositoryRoot, "dist"));
  await writeFile(path.join(repositoryRoot, "source.ts"), "export {}\n");
  await writeFile(path.join(repositoryRoot, "dist", "index.js"), "old\n");
  git(repositoryRoot, ["add", "-A"]);
  git(repositoryRoot, ["commit", "-qm", "fixture"]);
  return repositoryRoot;
}

async function populateReleaseArtifact(repositoryRoot: string) {
  const distRoot = path.join(repositoryRoot, "dist");
  await mkdir(path.join(distRoot, "public", "assets"), { recursive: true });
  await mkdir(path.join(distRoot, "skills", "fixture"), { recursive: true });
  await writeFile(path.join(distRoot, "index.js"), "server\n");
  await writeFile(
    path.join(distRoot, "verify-live-payment.js"),
    "payment verifier\n",
  );
  await writeFile(path.join(distRoot, "public", "index.html"), "<html />\n");
  await writeFile(
    path.join(distRoot, "public", "assets", "entry.js"),
    "client\n",
  );
  await writeFile(
    path.join(distRoot, "public", "assets", "dynamic.js"),
    "dynamic chunk\n",
  );
  await writeFile(
    path.join(distRoot, "public", "assets", "entry.css"),
    "body {}\n",
  );
  await writeFile(
    path.join(distRoot, "skills", "fixture", "SKILL.md"),
    "# Skill\n",
  );
  return distRoot;
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("production build source identity", () => {
  it("keeps the public release entrance sealed and every ordinary audit read-only", async () => {
    const repositoryRoot = path.resolve(import.meta.dirname, "..");
    const packageJson = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    );
    const unsealedBuilder = await readFile(
      path.join(repositoryRoot, "scripts", "build-unsealed-artifact.mjs"),
      "utf8",
    );
    const productionBuilder = await readFile(
      path.join(repositoryRoot, "scripts", "build-production-release.mjs"),
      "utf8",
    );
    const audit = await readFile(
      path.join(repositoryRoot, "scripts", "audit-production-bundle.mjs"),
      "utf8",
    );

    expect(packageJson.scripts.build).toBe(
      "node scripts/build-unsealed-artifact.mjs",
    );
    expect(packageJson.scripts["build:release"]).toBe(
      "node scripts/build-production-release.mjs",
    );
    expect(unsealedBuilder).toContain("BUILD_ARTIFACT_MANIFEST_FILENAME");
    expect(unsealedBuilder).toContain("await unlink");
    expect(productionBuilder).toContain("writeBuildArtifactManifest");
    expect(audit).toContain("verifyBuildArtifactManifest");
    expect(audit).not.toContain("writeBuildArtifactManifest");
  });

  it("allows only dist drift around an immutable source commit", async () => {
    const repositoryRoot = await createRepository();
    const sha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    expect(assertCleanProductionBuildSource({ repositoryRoot, env: {} })).toBe(
      sha,
    );
    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "new\n");
    await writeFile(path.join(repositoryRoot, "dist", "chunk.js"), "new\n");
    expect(assertCleanProductionBuildSource({ repositoryRoot, env: {} })).toBe(
      sha,
    );
    expect(() =>
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\//u);
  });

  it("requires the formal production entrance to start with clean tracked, staged and untracked dist", async () => {
    const repositoryRoot = await createRepository();
    const sha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    expect(
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toBe(sha);

    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "dirty\n");
    expect(() =>
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/index\.js/u);

    git(repositoryRoot, ["add", "dist/index.js"]);
    expect(() =>
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/index\.js/u);

    git(repositoryRoot, ["restore", "--staged", "--worktree", "dist/index.js"]);
    await writeFile(path.join(repositoryRoot, "dist", "extra.js"), "extra\n");
    expect(() =>
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/extra\.js/u);
    await rm(path.join(repositoryRoot, "dist", "extra.js"));

    await writeFile(path.join(repositoryRoot, ".gitignore"), "*.ignored\n");
    git(repositoryRoot, ["add", ".gitignore"]);
    git(repositoryRoot, ["commit", "-qm", "ignore fixture"]);
    await writeFile(
      path.join(repositoryRoot, "dist", "hidden.ignored"),
      "ignored but unsafe inside dist\n",
    );
    expect(() =>
      assertCleanProductionReleaseWorktree({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/hidden\.ignored/u);
  });

  it("recreates only the exact non-symlink dist root and removes clean stale artifacts", async () => {
    const repositoryRoot = await createRepository();
    const distRoot = path.join(repositoryRoot, "dist");
    await recreateEmptyProductionBuildRoot({
      repositoryRoot,
      buildRoot: distRoot,
    });
    await expect(access(path.join(distRoot, "index.js"))).rejects.toThrow();

    await expect(
      recreateEmptyProductionBuildRoot({
        repositoryRoot,
        buildRoot: path.join(repositoryRoot, "not-dist"),
      }),
    ).rejects.toThrow("BUILD_RELEASE_DIST_TARGET_UNSAFE");

    await rm(distRoot, { recursive: true, force: true });
    await symlink(path.join(repositoryRoot, "source.ts"), distRoot);
    await expect(
      recreateEmptyProductionBuildRoot({ repositoryRoot, buildRoot: distRoot }),
    ).rejects.toThrow("BUILD_RELEASE_DIST_TARGET_IS_SYMLINK");
  });

  it("rejects modified, staged and untracked source paths", async () => {
    const repositoryRoot = await createRepository();
    await writeFile(
      path.join(repositoryRoot, "source.ts"),
      "export const x=1\n",
    );
    expect(() =>
      assertCleanProductionBuildSource({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_SOURCE_NOT_COMMITTED:source\.ts/u);

    git(repositoryRoot, ["add", "source.ts"]);
    expect(() =>
      assertCleanProductionBuildSource({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_SOURCE_NOT_COMMITTED:source\.ts/u);

    git(repositoryRoot, ["commit", "-qm", "source"]);
    await writeFile(path.join(repositoryRoot, "untracked.ts"), "export {}\n");
    expect(() =>
      assertCleanProductionBuildSource({ repositoryRoot, env: {} }),
    ).toThrow(/BUILD_SOURCE_NOT_COMMITTED:untracked\.ts/u);
  });

  it("rejects malformed, mismatched, or mutually inconsistent environment SHAs", async () => {
    const repositoryRoot = await createRepository();
    const sha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    expect(
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: sha, BUILD_SHA: sha.toUpperCase() },
      }),
    ).toBe(sha);
    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: "abc123" },
      }),
    ).toThrow("BUILD_SOURCE_ENV_SHA_INVALID");
    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: "f".repeat(40) },
      }),
    ).toThrow("BUILD_SOURCE_COMMIT_MISMATCH");
    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: sha, COMMIT_SHA: "e".repeat(40) },
      }),
    ).toThrow("BUILD_SOURCE_COMMIT_MISMATCH");
  });

  it("accepts a build-source commit followed only by a dist approval commit", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await writeBuildArtifactIdentity(
      path.join(repositoryRoot, "dist"),
      buildSourceSha,
    );
    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "built\n");
    git(repositoryRoot, ["add", "dist"]);
    git(repositoryRoot, ["commit", "-qm", "approve dist artifact"]);
    const approvalSha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    await expect(
      readBuildArtifactIdentity(path.join(repositoryRoot, "dist")),
    ).resolves.toEqual({ schemaVersion: 1, buildSourceSha });
    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: buildSourceSha },
        expectedBuildSha: buildSourceSha,
      }),
    ).toThrow("BUILD_SOURCE_COMMIT_MISMATCH");
    expect(
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha,
        buildSourceSha,
      }),
    ).toMatchObject({ approvalSha, buildSourceSha });
    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          FRONTMIND_BUILD_SHA: buildSourceSha,
          FRONTMIND_APPROVED_RELEASE_SHA: approvalSha,
          GITHUB_SHA: approvalSha,
          COMMIT_SHA: approvalSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).resolves.toMatchObject({
      approvalSha,
      buildSourceSha,
      buildIdentity: { schemaVersion: 1, buildSourceSha },
    });
    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: buildSourceSha },
      }),
    ).toThrow("BUILD_SOURCE_COMMIT_MISMATCH");
  });

  it("rejects missing or mismatched F environment identity, CI S, and source identity F", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await writeBuildArtifactIdentity(
      path.join(repositoryRoot, "dist"),
      buildSourceSha,
    );
    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "built\n");
    git(repositoryRoot, ["add", "dist"]);
    git(repositoryRoot, ["commit", "-qm", "approve dist"]);
    const approvalSha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          GITHUB_SHA: approvalSha,
          FRONTMIND_BUILD_SHA: buildSourceSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).rejects.toThrow("BUILD_APPROVAL_ENV_SHA_REQUIRED");
    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          FRONTMIND_APPROVED_RELEASE_SHA: buildSourceSha,
          GITHUB_SHA: approvalSha,
          FRONTMIND_BUILD_SHA: buildSourceSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).rejects.toThrow("BUILD_APPROVAL_ENV_SHA_MISMATCH");
    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          FRONTMIND_APPROVED_RELEASE_SHA: approvalSha,
          GITHUB_SHA: buildSourceSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).rejects.toThrow("BUILD_APPROVAL_ENV_SHA_MISMATCH");
    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          FRONTMIND_APPROVED_RELEASE_SHA: approvalSha,
          GITHUB_SHA: approvalSha,
          FRONTMIND_BUILD_SHA: approvalSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).rejects.toThrow("BUILD_SOURCE_COMMIT_MISMATCH");
  });

  it("never re-blesses modified dist bytes after the approval commit", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await writeBuildArtifactIdentity(
      path.join(repositoryRoot, "dist"),
      buildSourceSha,
    );
    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "built\n");
    git(repositoryRoot, ["add", "dist"]);
    git(repositoryRoot, ["commit", "-qm", "approve dist"]);
    const approvalSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await writeFile(
      path.join(repositoryRoot, "dist", "index.js"),
      "tampered\n",
    );

    await expect(
      resolveProductionReleaseIdentity({
        projectRoot: repositoryRoot,
        env: {
          FRONTMIND_APPROVED_RELEASE_SHA: approvalSha,
          GITHUB_SHA: approvalSha,
        },
        approvalSha,
        buildSourceSha,
      }),
    ).rejects.toThrow(/BUILD_APPROVAL_ARTIFACT_NOT_COMMITTED:dist\/index\.js/u);
  });

  it("creates and verifies a deterministic whole-dist manifest and rejects byte tampering", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const distRoot = await populateReleaseArtifact(repositoryRoot);
    await writeBuildArtifactIdentity(distRoot, buildSourceSha);
    const first = await writeBuildArtifactManifest(distRoot, buildSourceSha);
    await expect(
      writeBuildArtifactManifest(distRoot, buildSourceSha),
    ).rejects.toThrow("BUILD_ARTIFACT_MANIFEST_ALREADY_EXISTS");
    expect(first.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "build-source.json",
        "index.js",
        "verify-live-payment.js",
        "public/assets/dynamic.js",
        "public/assets/entry.css",
        "public/assets/entry.js",
        "public/index.html",
        "skills/fixture/SKILL.md",
      ]),
    );
    await expect(
      verifyBuildArtifactManifest(distRoot, {
        expectedBuildSourceSha: buildSourceSha,
      }),
    ).resolves.toMatchObject({ rootSha256: first.rootSha256 });

    await writeFile(
      path.join(distRoot, "public", "assets", "entry.js"),
      "tampered\n",
    );
    await expect(verifyBuildArtifactManifest(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_BYTES_MISMATCH",
    );
  });

  it("rejects added files, malformed roots, and untrusted source SHAs", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const distRoot = await populateReleaseArtifact(repositoryRoot);
    await writeBuildArtifactIdentity(distRoot, buildSourceSha);
    await writeBuildArtifactManifest(distRoot, buildSourceSha);

    await writeFile(path.join(distRoot, "unexpected.js"), "injected\n");
    await expect(verifyBuildArtifactManifest(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_BYTES_MISMATCH",
    );
    await rm(path.join(distRoot, "unexpected.js"));
    await expect(
      verifyBuildArtifactManifest(distRoot, {
        expectedBuildSourceSha: "f".repeat(40),
      }),
    ).rejects.toThrow("BUILD_ARTIFACT_SOURCE_SHA_MISMATCH");

    await writeBuildArtifactIdentity(distRoot, "f".repeat(40));
    await expect(verifyBuildArtifactManifest(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_IDENTITY_MANIFEST_MISMATCH",
    );
    await writeBuildArtifactIdentity(distRoot, buildSourceSha);

    const manifest = await readBuildArtifactManifest(distRoot);
    await writeFile(
      path.join(distRoot, "artifact-manifest.json"),
      JSON.stringify({ ...manifest, rootSha256: "0".repeat(64) }),
    );
    await expect(readBuildArtifactManifest(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_MANIFEST_ROOT_MISMATCH",
    );
  });

  it("rejects an approval descendant containing any non-dist source change", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await writeFile(
      path.join(repositoryRoot, "source.ts"),
      "export const changed=true\n",
    );
    git(repositoryRoot, ["add", "source.ts"]);
    git(repositoryRoot, ["commit", "-qm", "unexpected source change"]);
    const approvalSha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha,
        buildSourceSha,
      }),
    ).toThrow(/BUILD_APPROVAL_CONTAINS_SOURCE_CHANGES:source\.ts/u);
  });

  it("rejects S equals F and an empty approval descendant", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha: buildSourceSha,
        buildSourceSha,
      }),
    ).toThrow("BUILD_APPROVAL_MUST_DIFFER_FROM_SOURCE");

    git(repositoryRoot, ["commit", "--allow-empty", "-qm", "empty approval"]);
    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha: git(repositoryRoot, ["rev-parse", "HEAD"]),
        buildSourceSha,
      }),
    ).toThrow("BUILD_APPROVAL_HAS_NO_ARTIFACT_CHANGES");
  });

  it("rejects a build-source commit outside the approval ancestry", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const tree = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
    const unrelatedApprovalSha = git(repositoryRoot, [
      "commit-tree",
      tree,
      "-m",
      "unrelated approval",
    ]);

    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha: unrelatedApprovalSha,
        buildSourceSha,
      }),
    ).toThrow("BUILD_ARTIFACT_SOURCE_NOT_APPROVAL_ANCESTOR");
  });

  it("rejects missing, malformed, and untrusted artifact identities", async () => {
    const repositoryRoot = await createRepository();
    const distRoot = path.join(repositoryRoot, "dist");
    await expect(readBuildArtifactIdentity(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_IDENTITY_MISSING_OR_INVALID",
    );

    await writeFile(
      path.join(distRoot, "build-source.json"),
      JSON.stringify({ schemaVersion: 1, buildSourceSha: "not-a-sha" }),
    );
    await expect(readBuildArtifactIdentity(distRoot)).rejects.toThrow(
      "BUILD_ARTIFACT_IDENTITY_MISSING_OR_INVALID",
    );

    await writeFile(
      path.join(distRoot, "build-source.json"),
      JSON.stringify({ schemaVersion: 1, buildSourceSha: "e".repeat(40) }),
    );
    const tampered = await readBuildArtifactIdentity(distRoot);
    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha: git(repositoryRoot, ["rev-parse", "HEAD"]),
        buildSourceSha: tampered.buildSourceSha,
      }),
    ).toThrow("BUILD_ARTIFACT_SOURCE_NOT_APPROVAL_ANCESTOR");
  });

  it("does not trim a leading-space source path into the dist allowlist", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    await mkdir(path.join(repositoryRoot, " dist"));
    await writeFile(
      path.join(repositoryRoot, " dist", "looks-like-artifact.js"),
      "source\n",
    );
    git(repositoryRoot, ["add", "--", " dist/looks-like-artifact.js"]);
    git(repositoryRoot, ["commit", "-qm", "leading-space source path"]);
    const approvalSha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    expect(() =>
      assertBuildArtifactLineage({
        repositoryRoot,
        approvalSha,
        buildSourceSha,
      }),
    ).toThrow(/BUILD_APPROVAL_CONTAINS_SOURCE_CHANGES: dist\//u);
  });

  it("requires an external artifact root and distinct approved F at runtime", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const distRoot = await populateReleaseArtifact(repositoryRoot);
    await writeBuildArtifactIdentity(distRoot, buildSourceSha);
    const manifest = await writeBuildArtifactManifest(distRoot, buildSourceSha);
    const approvalSha = "f".repeat(40);

    const verified = await verifyRuntimeReleaseArtifact(distRoot, {
      buildSourceSha,
      approvalSha,
      expectedRootSha256: manifest.rootSha256,
    });
    expect(verified).toMatchObject({
      approvalSha,
      buildSourceSha,
      expectedRootSha256: manifest.rootSha256,
      actualRootSha256: manifest.rootSha256,
    });
    expect(runtimeReleaseArtifactHealth(verified)).toEqual({
      verified: true,
      schemaVersion: 1,
      approvalSha,
      buildSourceSha,
      expectedRootSha256: manifest.rootSha256,
      actualRootSha256: manifest.rootSha256,
      rootSha256: manifest.rootSha256,
      fileCount: manifest.files.length,
    });
    await expect(
      verifyRuntimeReleaseArtifact(distRoot, {
        buildSourceSha,
        approvalSha,
        env: {},
      }),
    ).rejects.toThrow("FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256_REQUIRED");
    await expect(
      verifyRuntimeReleaseArtifact(distRoot, {
        buildSourceSha,
        approvalSha,
        expectedRootSha256: "e".repeat(64),
      }),
    ).rejects.toThrow("FRONTMIND_ARTIFACT_EXTERNAL_ROOT_MISMATCH");
    await expect(
      verifyRuntimeReleaseArtifact(distRoot, {
        buildSourceSha,
        approvalSha: buildSourceSha,
        expectedRootSha256: manifest.rootSha256,
      }),
    ).rejects.toThrow("FRONTMIND_APPROVED_RELEASE_SHA_MUST_DIFFER_FROM_SOURCE");
  });

  it("single-flights concurrent checks, caches for at most five seconds, and detects tampering after TTL", async () => {
    const repositoryRoot = await createRepository();
    const buildSourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
    const distRoot = await populateReleaseArtifact(repositoryRoot);
    await writeBuildArtifactIdentity(distRoot, buildSourceSha);
    const manifest = await writeBuildArtifactManifest(distRoot, buildSourceSha);
    const approvalSha = "e".repeat(40);
    let now = 1_000;
    let verificationCount = 0;
    const verifyArtifact = async () => {
      verificationCount += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return verifyRuntimeReleaseArtifact(distRoot, {
        buildSourceSha,
        approvalSha,
        expectedRootSha256: manifest.rootSha256,
      });
    };
    const verifier = createRuntimeReleaseArtifactVerifier({
      buildRoot: distRoot,
      buildSourceSha,
      ttlMs: 5_000,
      now: () => now,
      verifyArtifact,
    });

    const initialProofs = await Promise.all(
      Array.from({ length: 32 }, () => verifier.verify({ force: true })),
    );
    expect(verificationCount).toBe(1);
    expect(new Set(initialProofs).size).toBe(1);
    await verifier.verify();
    expect(verificationCount).toBe(1);

    await writeFile(path.join(distRoot, "index.js"), "tampered\n");
    now = 5_999;
    await expect(verifier.verify()).resolves.toBe(initialProofs[0]);
    expect(verificationCount).toBe(1);

    now = 6_000;
    await expect(
      Promise.all(Array.from({ length: 32 }, () => verifier.verify())),
    ).rejects.toThrow("BUILD_ARTIFACT_BYTES_MISMATCH");
    expect(verificationCount).toBe(2);
    await expect(verifier.verify()).rejects.toThrow(
      "BUILD_ARTIFACT_BYTES_MISMATCH",
    );
    expect(verificationCount).toBe(2);

    now = 11_000;
    await expect(verifier.verify()).rejects.toThrow(
      "BUILD_ARTIFACT_BYTES_MISMATCH",
    );
    expect(verificationCount).toBe(3);
  });
});
