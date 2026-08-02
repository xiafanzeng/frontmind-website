import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const BUILD_ARTIFACT_IDENTITY_FILENAME = "build-source.json";
export const BUILD_ARTIFACT_MANIFEST_FILENAME = "artifact-manifest.json";

function fullSha(value, label) {
  const sha = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(label);
  return sha;
}

export async function writeBuildArtifactIdentity(buildRoot, buildSourceSha) {
  const sha = fullSha(buildSourceSha, "BUILD_ARTIFACT_SOURCE_SHA_INVALID");
  const resolvedBuildRoot = path.resolve(buildRoot);
  await mkdir(resolvedBuildRoot, { recursive: true });
  const value = {
    schemaVersion: 1,
    buildSourceSha: sha,
  };
  await writeFile(
    path.join(resolvedBuildRoot, BUILD_ARTIFACT_IDENTITY_FILENAME),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return value;
}

export async function readBuildArtifactIdentity(buildRoot) {
  let value;
  try {
    value = JSON.parse(
      await readFile(
        path.join(path.resolve(buildRoot), BUILD_ARTIFACT_IDENTITY_FILENAME),
        "utf8",
      ),
    );
  } catch {
    throw new Error("BUILD_ARTIFACT_IDENTITY_MISSING_OR_INVALID");
  }
  if (
    value?.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/u.test(String(value?.buildSourceSha || ""))
  ) {
    throw new Error("BUILD_ARTIFACT_IDENTITY_MISSING_OR_INVALID");
  }
  return {
    schemaVersion: 1,
    buildSourceSha: String(value.buildSourceSha).toLowerCase(),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalArtifactManifestPayload(value) {
  return `${JSON.stringify({
    schemaVersion: 1,
    buildSourceSha: value.buildSourceSha,
    excludedPaths: [BUILD_ARTIFACT_MANIFEST_FILENAME],
    files: value.files,
  })}\n`;
}

async function collectArtifactFiles(buildRoot, directory = buildRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path
      .relative(buildRoot, absolutePath)
      .split(path.sep)
      .join("/");
    if (relativePath === BUILD_ARTIFACT_MANIFEST_FILENAME) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`BUILD_ARTIFACT_UNSUPPORTED_ENTRY:${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectArtifactFiles(buildRoot, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`BUILD_ARTIFACT_UNSUPPORTED_ENTRY:${relativePath}`);
    }
    const fileStat = await lstat(absolutePath);
    if (!fileStat.isFile()) {
      throw new Error(`BUILD_ARTIFACT_UNSUPPORTED_ENTRY:${relativePath}`);
    }
    const bytes = await readFile(absolutePath);
    files.push({
      path: relativePath,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

export async function createBuildArtifactManifest(buildRoot, buildSourceSha) {
  const resolvedBuildRoot = path.resolve(buildRoot);
  const sourceSha = fullSha(
    buildSourceSha,
    "BUILD_ARTIFACT_SOURCE_SHA_INVALID",
  );
  const files = await collectArtifactFiles(resolvedBuildRoot);
  const frontendJavaScriptFiles = files.filter(
    (file) =>
      file.path.startsWith("public/assets/") && file.path.endsWith(".js"),
  );
  if (
    !files.some((file) => file.path === BUILD_ARTIFACT_IDENTITY_FILENAME) ||
    !files.some((file) => file.path === "index.js") ||
    !files.some((file) => file.path === "verify-live-payment.js") ||
    !files.some((file) => file.path === "public/index.html") ||
    !files.some(
      (file) =>
        file.path.startsWith("public/assets/") && file.path.endsWith(".css"),
    ) ||
    frontendJavaScriptFiles.length < 2 ||
    !files.some((file) => file.path.startsWith("skills/"))
  ) {
    throw new Error("BUILD_ARTIFACT_REQUIRED_COVERAGE_MISSING");
  }
  const base = {
    schemaVersion: 1,
    buildSourceSha: sourceSha,
    excludedPaths: [BUILD_ARTIFACT_MANIFEST_FILENAME],
    files,
  };
  return {
    ...base,
    rootSha256: sha256(canonicalArtifactManifestPayload(base)),
  };
}

export async function writeBuildArtifactManifest(buildRoot, buildSourceSha) {
  const resolvedBuildRoot = path.resolve(buildRoot);
  const manifest = await createBuildArtifactManifest(
    resolvedBuildRoot,
    buildSourceSha,
  );
  const manifestPath = path.join(
    resolvedBuildRoot,
    BUILD_ARTIFACT_MANIFEST_FILENAME,
  );
  try {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o644,
      flag: "wx",
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("BUILD_ARTIFACT_MANIFEST_ALREADY_EXISTS");
    }
    throw error;
  }
  return manifest;
}

function assertArtifactManifestShape(value) {
  if (
    JSON.stringify(Object.keys(value || {}).sort()) !==
      JSON.stringify(
        [
          "buildSourceSha",
          "excludedPaths",
          "files",
          "rootSha256",
          "schemaVersion",
        ].sort(),
      ) ||
    value?.schemaVersion !== 1 ||
    !/^[a-f0-9]{40}$/u.test(String(value?.buildSourceSha || "")) ||
    !/^[a-f0-9]{64}$/u.test(String(value?.rootSha256 || "")) ||
    JSON.stringify(value?.excludedPaths) !==
      JSON.stringify([BUILD_ARTIFACT_MANIFEST_FILENAME]) ||
    !Array.isArray(value?.files)
  ) {
    throw new Error("BUILD_ARTIFACT_MANIFEST_INVALID");
  }
  let previousPath = "";
  for (const file of value.files) {
    if (
      JSON.stringify(Object.keys(file || {}).sort()) !==
        JSON.stringify(["bytes", "path", "sha256"].sort()) ||
      typeof file?.path !== "string" ||
      file.path.length === 0 ||
      file.path.startsWith("/") ||
      file.path.includes("\\") ||
      file.path
        .split("/")
        .some((segment) => !segment || segment === "." || segment === "..") ||
      file.path === BUILD_ARTIFACT_MANIFEST_FILENAME ||
      file.path <= previousPath ||
      !Number.isSafeInteger(file?.bytes) ||
      file.bytes < 0 ||
      !/^[a-f0-9]{64}$/u.test(String(file?.sha256 || ""))
    ) {
      throw new Error("BUILD_ARTIFACT_MANIFEST_INVALID");
    }
    previousPath = file.path;
  }
  const calculatedRoot = sha256(canonicalArtifactManifestPayload(value));
  if (calculatedRoot !== value.rootSha256) {
    throw new Error("BUILD_ARTIFACT_MANIFEST_ROOT_MISMATCH");
  }
}

export async function readBuildArtifactManifest(buildRoot) {
  let value;
  try {
    value = JSON.parse(
      await readFile(
        path.join(path.resolve(buildRoot), BUILD_ARTIFACT_MANIFEST_FILENAME),
        "utf8",
      ),
    );
  } catch {
    throw new Error("BUILD_ARTIFACT_MANIFEST_MISSING_OR_INVALID");
  }
  assertArtifactManifestShape(value);
  return value;
}

export async function verifyBuildArtifactManifest(buildRoot, options = {}) {
  const resolvedBuildRoot = path.resolve(buildRoot);
  const manifest = await readBuildArtifactManifest(resolvedBuildRoot);
  const identity = await readBuildArtifactIdentity(resolvedBuildRoot);
  if (identity.buildSourceSha !== manifest.buildSourceSha) {
    throw new Error("BUILD_ARTIFACT_IDENTITY_MANIFEST_MISMATCH");
  }
  const expectedBuildSourceSha = options.expectedBuildSourceSha
    ? fullSha(
        options.expectedBuildSourceSha,
        "BUILD_ARTIFACT_SOURCE_SHA_INVALID",
      )
    : undefined;
  if (
    expectedBuildSourceSha &&
    expectedBuildSourceSha !== manifest.buildSourceSha
  ) {
    throw new Error("BUILD_ARTIFACT_SOURCE_SHA_MISMATCH");
  }
  const actual = await createBuildArtifactManifest(
    resolvedBuildRoot,
    manifest.buildSourceSha,
  );
  if (
    actual.rootSha256 !== manifest.rootSha256 ||
    JSON.stringify(actual.files) !== JSON.stringify(manifest.files)
  ) {
    throw new Error("BUILD_ARTIFACT_BYTES_MISMATCH");
  }
  return manifest;
}
