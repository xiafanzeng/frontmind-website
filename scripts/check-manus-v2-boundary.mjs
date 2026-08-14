import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function productionSources(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await productionSources(absolutePath)));
    } else if (
      entry.isFile() &&
      /\.(?:[cm]?[jt]sx?)$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) {
      files.push(absolutePath);
    }
  }
  return files;
}

const failures = [];
const forbiddenManusV1 =
  /(?:https:\/\/api\.manus\.ai)?\/v1\/(?:tasks|responses|files)(?:\/|\b)/u;
const forbiddenProviderBoundary =
  /\b(?:provider(?:Task|File|Event|Request)Id|task_id|file_id|upload_url|signedUrl|signed_url|rawOutput|raw_output|output_text|output_file)\b/u;

for (const sourceRoot of ["client/src", "server"]) {
  for (const absolutePath of await productionSources(
    path.join(repositoryRoot, sourceRoot),
  )) {
    const relativePath = path
      .relative(repositoryRoot, absolutePath)
      .split(path.sep)
      .join("/");
    const contents = await readFile(absolutePath, "utf8");
    if (
      forbiddenManusV1.test(contents) ||
      contents.includes("x-manus-api-key") ||
      contents.includes("https://api.manus.ai")
    ) {
      failures.push(`WEBSITE_DIRECT_MANUS_EGRESS_FORBIDDEN:${relativePath}`);
    }
    if (forbiddenProviderBoundary.test(contents)) {
      failures.push(`WEBSITE_PROVIDER_FIELD_FORBIDDEN:${relativePath}`);
    }
    if (
      relativePath.startsWith("client/src/") &&
      contents.includes("/api/internal/presales/")
    ) {
      failures.push(
        `BROWSER_INTERNAL_PRESALES_ROUTE_FORBIDDEN:${relativePath}`,
      );
    }
  }
}

const broker = await readFile(
  path.join(repositoryRoot, "server/geo/broker.ts"),
  "utf8",
);
if (
  !broker.includes('const PRESALES_PATH = "/api/internal/presales/v2";') ||
  /\/api\/internal\/presales\/v1(?:\/|["'])/u.test(broker)
) {
  failures.push("WEBSITE_BROKER_NOT_V2_ONLY");
}
for (const requiredBoundary of [
  "localTaskId",
  "operationId",
  "safeEvents",
  "structuredResult",
  "artifactId",
  "localAssetId",
]) {
  if (!broker.includes(requiredBoundary)) {
    failures.push(`WEBSITE_LOCAL_BOUNDARY_FIELD_MISSING:${requiredBoundary}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("WEBSITE_MANUS_V2_BOUNDARY_OK providerFieldsExposed=0");
}
