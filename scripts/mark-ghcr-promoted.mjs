#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DIGEST_RE = /^sha256:[a-f0-9]{64}$/;
const IMAGE_RE = /^ghcr\.io\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)+$/;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function runDocker(args, { allowFailure = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? "unknown error";
    throw new Error(`docker ${args.join(" ")} failed: ${detail.trim()}`);
  }
  return result;
}

function inspectDigest(reference) {
  const result = runDocker(
    ["buildx", "imagetools", "inspect", reference, "--format", "{{.Manifest.Digest}}"],
    { allowFailure: true },
  );
  if (result.status !== 0) return null;
  const digest = result.stdout.trim();
  if (!DIGEST_RE.test(digest)) throw new Error(`registry returned an invalid digest for ${reference}`);
  return digest;
}

function tagDigest(image, digest, tag) {
  runDocker(["buildx", "imagetools", "create", "--tag", `${image}:${tag}`, `${image}@${digest}`]);
  const actual = inspectDigest(`${image}:${tag}`);
  if (actual !== digest) throw new Error(`${tag} resolved to ${actual}, expected ${digest}`);
}

function compactTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("--timestamp must be a valid ISO timestamp");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildPromotionMarker({ markerPrefix, timestamp, runId, attempt, digest }) {
  if (!/^[a-z][a-z0-9-]*$/.test(markerPrefix)) throw new Error("invalid markerPrefix");
  if (!/^[0-9]+$/.test(runId ?? "") || !/^[0-9]+$/.test(attempt ?? "")) {
    throw new Error("runId and attempt must be numeric");
  }
  if (!DIGEST_RE.test(digest ?? "")) throw new Error("invalid digest");
  const marker = `${markerPrefix}-v1-${compactTimestamp(timestamp)}-run-${runId}-attempt-${attempt}-sha256-${digest.slice("sha256:".length)}`;
  if (marker.length > 128) throw new Error("promotion marker exceeds the OCI tag length limit");
  return marker;
}

function main() {
  const image = argument("--image", process.env.IMAGE);
  const digest = argument("--digest", process.env.DIGEST ?? process.env.IMAGE_DIGEST);
  const markerPrefix = argument("--marker-prefix", "deployed");
  const runId = argument("--run-id", process.env.GITHUB_RUN_ID);
  const attempt = argument("--attempt", process.env.GITHUB_RUN_ATTEMPT ?? "1");
  const timestamp = argument("--timestamp", new Date().toISOString());
  const extraCurrentTag = argument("--extra-current-tag", null);
  if (!IMAGE_RE.test(image ?? "")) throw new Error("--image must be a lowercase ghcr.io repository");
  if (!DIGEST_RE.test(digest ?? "")) throw new Error("--digest must be sha256:<64 lowercase hex>");
  if (!/^[a-z][a-z0-9-]*$/.test(markerPrefix)) throw new Error("invalid --marker-prefix");
  if (!/^[0-9]+$/.test(runId ?? "") || !/^[0-9]+$/.test(attempt ?? "")) {
    throw new Error("--run-id and --attempt must be numeric");
  }
  if (extraCurrentTag && !/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(extraCurrentTag)) {
    throw new Error("invalid --extra-current-tag");
  }

  const marker = buildPromotionMarker({ markerPrefix, timestamp, runId, attempt, digest });
  if (inspectDigest(`${image}:${marker}`)) {
    throw new Error(`immutable promotion marker already exists: ${marker}`);
  }
  tagDigest(image, digest, marker);

  const currentTag = `${markerPrefix}-current`;
  const previousTag = `${markerPrefix}-previous`;
  const priorDigest = inspectDigest(`${image}:${currentTag}`);
  if (priorDigest && priorDigest !== digest) tagDigest(image, priorDigest, previousTag);
  tagDigest(image, digest, currentTag);
  if (extraCurrentTag) tagDigest(image, digest, extraCurrentTag);
  console.log(JSON.stringify({ image, digest, marker, priorDigest }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
