import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readBuildArtifactIdentity,
  verifyBuildArtifactManifest,
  writeBuildArtifactIdentity,
  writeBuildArtifactManifest,
} from "../scripts/build-artifact-identity.mjs";
import { assertCleanProductionBuildSource } from "../scripts/assert-clean-build-source.mjs";

const temporaryDirectories: string[] = [];

async function makeBuildRoot() {
  const buildRoot = await mkdtemp(path.join(tmpdir(), "website-image-content-"));
  temporaryDirectories.push(buildRoot);
  await mkdir(path.join(buildRoot, "public", "assets"), { recursive: true });
  await mkdir(path.join(buildRoot, "skills", "website-one-shot-kb-builder"), {
    recursive: true,
  });
  await Promise.all([
    writeFile(path.join(buildRoot, "index.js"), "server"),
    writeFile(path.join(buildRoot, "verify-live-payment.js"), "payment"),
    writeFile(path.join(buildRoot, "public", "index.html"), "<main>site</main>"),
    writeFile(path.join(buildRoot, "public", "assets", "app.css"), "body{}"),
    writeFile(path.join(buildRoot, "public", "assets", "app.js"), "app"),
    writeFile(path.join(buildRoot, "public", "assets", "vendor.js"), "vendor"),
    writeFile(
      path.join(buildRoot, "skills", "website-one-shot-kb-builder", "SKILL.md"),
      "skill",
    ),
  ]);
  return buildRoot;
}

function git(repositoryRoot: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("production image content identity", () => {
  it("seals and verifies the content generated during the image build", async () => {
    const buildRoot = await makeBuildRoot();
    const sourceSha = "a".repeat(40);
    await writeBuildArtifactIdentity(buildRoot, sourceSha);
    const manifest = await writeBuildArtifactManifest(buildRoot, sourceSha);

    await expect(readBuildArtifactIdentity(buildRoot)).resolves.toEqual({
      schemaVersion: 1,
      buildSourceSha: sourceSha,
    });
    await expect(
      verifyBuildArtifactManifest(buildRoot, {
        expectedBuildSourceSha: sourceSha,
      }),
    ).resolves.toEqual(manifest);
  });

  it("detects bytes changed before the image layer is committed", async () => {
    const buildRoot = await makeBuildRoot();
    const sourceSha = "b".repeat(40);
    await writeBuildArtifactIdentity(buildRoot, sourceSha);
    await writeBuildArtifactManifest(buildRoot, sourceSha);
    await writeFile(path.join(buildRoot, "index.js"), "tampered");

    await expect(
      verifyBuildArtifactManifest(buildRoot, {
        expectedBuildSourceSha: sourceSha,
      }),
    ).rejects.toThrow("BUILD_ARTIFACT_BYTES_MISMATCH");
  });

  it("does not embed the retired approval-SHA runtime contract", async () => {
    const serverSource = await readFile(
      path.resolve(import.meta.dirname, "index.ts"),
      "utf8",
    );
    expect(serverSource).not.toContain("runtime-artifact-integrity");
    expect(serverSource).not.toContain("FRONTMIND_APPROVED_RELEASE_SHA");
    expect(serverSource).toContain('app.get("/readyz"');
  });

  it("rejects dist force-added to a real source repository", async () => {
    const repositoryRoot = await mkdtemp(
      path.join(tmpdir(), "website-tracked-dist-"),
    );
    temporaryDirectories.push(repositoryRoot);
    git(repositoryRoot, ["init", "-q"]);
    git(repositoryRoot, ["config", "user.email", "release@example.invalid"]);
    git(repositoryRoot, ["config", "user.name", "FrontMind Release Test"]);
    await Promise.all([
      writeFile(path.join(repositoryRoot, ".gitignore"), "/dist/\n"),
      writeFile(path.join(repositoryRoot, "source.ts"), "export {};\n"),
      mkdir(path.join(repositoryRoot, "dist"), { recursive: true }),
    ]);
    await writeFile(path.join(repositoryRoot, "dist", "index.js"), "built\n");
    git(repositoryRoot, ["add", ".gitignore", "source.ts"]);
    git(repositoryRoot, ["add", "-f", "dist/index.js"]);
    git(repositoryRoot, ["commit", "-qm", "force-add generated output"]);
    const sourceSha = git(repositoryRoot, ["rev-parse", "HEAD"]);

    expect(() =>
      assertCleanProductionBuildSource({
        repositoryRoot,
        env: { FRONTMIND_BUILD_SHA: sourceSha },
      }),
    ).toThrow("BUILD_RELEASE_DIST_MUST_NOT_BE_TRACKED:dist/index.js");
  });
});
