import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { verifyBuildArtifactManifest } from "./build-artifact-identity.mjs";
import { resolveProductionReleaseIdentity } from "./production-release-identity.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; ) {
  const key = process.argv[index];
  if (key === "--") {
    index += 1;
    continue;
  }
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) {
    throw new Error(
      "Usage: pnpm verify:production -- --url https://www.frontmind.net --approval-sha <full-git-sha> --build-source-sha <full-git-sha> --artifact-root <sha256> [--store-id <persistence-identity-sha256>]",
    );
  }
  args.set(key.slice(2), value);
  index += 2;
}

const productionUrl = new URL(args.get("url") || "");
if (productionUrl.protocol !== "https:") {
  throw new Error("--url must be a production HTTPS origin");
}
const { approvalSha, buildSourceSha } = await resolveProductionReleaseIdentity({
  projectRoot,
  env: process.env,
  approvalSha: args.get("approval-sha"),
  buildSourceSha: args.get("build-source-sha"),
  legacyBuildSourceSha: args.get("sha"),
});
const localArtifact = await verifyBuildArtifactManifest(
  resolve(projectRoot, "dist"),
  { expectedBuildSourceSha: buildSourceSha },
);
const expectedArtifactRoot = String(
  args.get("artifact-root") ||
    process.env.FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256 ||
    "",
)
  .trim()
  .toLowerCase();
if (!/^[a-f0-9]{64}$/u.test(expectedArtifactRoot)) {
  throw new Error(
    "--artifact-root or FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256 must be a 64-character SHA-256 value",
  );
}
if (localArtifact.rootSha256 !== expectedArtifactRoot) {
  throw new Error(
    "The externally approved artifact root differs from the local dist bytes",
  );
}
const expectedStoreIdentity = args.get("store-id")?.trim().toLowerCase();
if (expectedStoreIdentity && !/^[a-f0-9]{64}$/.test(expectedStoreIdentity)) {
  throw new Error("--store-id must be a 64-character SHA-256 value");
}

const runtimeSkillDefinitions = [
  {
    name: "website-one-shot-kb-builder",
    version: 6,
    files: [
      "SKILL.md",
      "agents/openai.yaml",
      "references/dimensions.md",
      "references/candidate-format.md",
      "scripts/build_candidate.py",
    ],
  },
  {
    name: "geo-question-recommender",
    version: 1,
    files: [
      "SKILL.md",
      "references/demark-question-logic.md",
      "references/output-schema.json",
    ],
  },
  {
    name: "geo-custom-question-classifier",
    version: 1,
    files: ["SKILL.md", "agents/openai.yaml", "references/output-schema.json"],
  },
  {
    name: "geo-knowledge-answer-verifier",
    version: 1,
    files: ["SKILL.md", "references/comparison-contract.json"],
  },
  {
    name: "geo-current-state-evaluator",
    version: 1,
    files: [
      "SKILL.md",
      "references/bsas-baseline-methodology.md",
      "references/raw-output-schema.json",
    ],
  },
  {
    name: "geo-optimization-outcome-forecaster",
    version: 1,
    files: [
      "SKILL.md",
      "references/impact-forecast-methodology.md",
      "references/output-schema.json",
      "references/source-manifest.json",
    ],
  },
];

async function expectedRuntimeSkill(definition) {
  const skillRoot = resolve(projectRoot, "server", "skills", definition.name);
  const contents = await Promise.all(
    definition.files.map(async (relativePath) => ({
      relativePath,
      content: await readFile(resolve(skillRoot, relativePath), "utf8"),
    })),
  );
  const contentHash = createHash("sha256")
    .update(
      contents
        .map(
          ({ relativePath, content }) =>
            `# FILE: ${relativePath}\n\n${content.trim()}`,
        )
        .join("\n\n---\n\n"),
      "utf8",
    )
    .digest("hex");
  return {
    name: definition.name,
    version: definition.version,
    contentHash,
  };
}

const expectedRuntimeSkills = await Promise.all(
  runtimeSkillDefinitions.map(expectedRuntimeSkill),
);

async function fetchOk(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "FrontMindReleaseVerifier/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response;
}

const healthUrl = new URL("/healthz", productionUrl);
const health = await (await fetchOk(healthUrl)).json();
if (health?.status !== "ok") throw new Error("/healthz is not ready");
if (String(health?.buildSha || "").toLowerCase() !== buildSourceSha) {
  throw new Error(
    `buildSha mismatch: expected ${buildSourceSha}, received ${health?.buildSha ?? "null"}`,
  );
}
if (
  health?.artifact?.verified !== true ||
  health?.artifact?.schemaVersion !== localArtifact.schemaVersion ||
  String(health?.artifact?.approvalSha || "").toLowerCase() !== approvalSha ||
  String(health?.artifact?.buildSourceSha || "").toLowerCase() !==
    buildSourceSha ||
  String(health?.artifact?.expectedRootSha256 || "").toLowerCase() !==
    expectedArtifactRoot ||
  String(health?.artifact?.actualRootSha256 || "").toLowerCase() !==
    expectedArtifactRoot ||
  String(health?.artifact?.rootSha256 || "").toLowerCase() !==
    expectedArtifactRoot ||
  health?.artifact?.fileCount !== localArtifact.files.length
) {
  throw new Error(
    "Production artifact root differs from the byte-verified local dist",
  );
}

const skills = Array.isArray(health?.skills) ? health.skills : [];
const skillsByName = new Map(skills.map((skill) => [skill?.name, skill]));
if (
  skills.length !== expectedRuntimeSkills.length ||
  skillsByName.size !== expectedRuntimeSkills.length
) {
  throw new Error("Production must expose the exact six runtime Skills");
}
for (const expectedSkill of expectedRuntimeSkills) {
  const actualSkill = skillsByName.get(expectedSkill.name);
  if (!actualSkill || actualSkill.status !== "ok") {
    throw new Error(`${expectedSkill.name} must report status=ok`);
  }
  if (actualSkill.version !== expectedSkill.version) {
    throw new Error(`${expectedSkill.name} version differs from local source`);
  }
  if (actualSkill.contentHash !== expectedSkill.contentHash) {
    throw new Error(`${expectedSkill.name} hash differs from local source`);
  }
}
const websiteSkill = skills.find(
  (skill) => skill?.name === "website-one-shot-kb-builder",
);
const expectedWebsiteSkill = expectedRuntimeSkills.find(
  (skill) => skill.name === "website-one-shot-kb-builder",
);
if (!websiteSkill || !expectedWebsiteSkill) {
  throw new Error("website-one-shot-kb-builder readiness is missing");
}
if (
  health?.dependencies?.status !== "ok" ||
  health?.dependencies?.agent?.credentialConfigured !== true ||
  health?.dependencies?.agent?.monitorCredentialConfigured !== true ||
  health?.dependencies?.agent?.publicUrlConfigured !== true ||
  health?.dependencies?.projectOrderRegistry?.ready !== true ||
  health?.dependencies?.paymentReceiptLedger?.ready !== true ||
  health?.dependencies?.customQuestionValidationStore?.ready !== true
) {
  throw new Error("One or more GEO production dependencies are not ready");
}
const persistenceIdentitySha256 = String(
  health?.dependencies?.customQuestionValidationStore
    ?.persistenceIdentitySha256 || "",
).toLowerCase();
if (!/^[a-f0-9]{64}$/.test(persistenceIdentitySha256)) {
  throw new Error(
    "customQuestionValidationStore.persistenceIdentitySha256 is missing or invalid",
  );
}
if (
  expectedStoreIdentity &&
  persistenceIdentitySha256 !== expectedStoreIdentity
) {
  throw new Error(
    "Custom-question persistence identity changed across deployment recreation",
  );
}

function frontendEntry(html) {
  const matches = Array.from(
    html.matchAll(
      /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/gi,
    ),
  );
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error("Could not identify one frontend entry script");
  }
  return matches[0][1];
}

const localHtml = await readFile(
  resolve(projectRoot, "dist", "public", "index.html"),
  "utf8",
);
const remoteHtml = await (await fetchOk(productionUrl)).text();
const localEntry = frontendEntry(localHtml);
const remoteEntry = frontendEntry(remoteHtml);
if (localEntry !== remoteEntry) {
  throw new Error(
    `Frontend entry mismatch: expected ${localEntry}, received ${remoteEntry}`,
  );
}

const localEntryBytes = await readFile(
  resolve(projectRoot, "dist", "public", "assets", basename(localEntry)),
);
const remoteEntryBytes = Buffer.from(
  await (await fetchOk(new URL(remoteEntry, productionUrl))).arrayBuffer(),
);
const localEntryHash = createHash("sha256")
  .update(localEntryBytes)
  .digest("hex");
const remoteEntryHash = createHash("sha256")
  .update(remoteEntryBytes)
  .digest("hex");
if (localEntryHash !== remoteEntryHash) {
  throw new Error("Production frontend entry content differs from local build");
}

console.log(
  JSON.stringify(
    {
      status: "verified",
      url: productionUrl.origin,
      approvalSha,
      buildSourceSha,
      customQuestionPersistenceIdentitySha256: persistenceIdentitySha256,
      websiteSkillVersion: websiteSkill.version,
      websiteSkillHash: expectedWebsiteSkill.contentHash,
      runtimeSkills: expectedRuntimeSkills,
      artifactRootSha256: expectedArtifactRoot,
      artifactFileCount: localArtifact.files.length,
      frontendEntry: localEntry,
      frontendEntrySha256: localEntryHash,
    },
    null,
    2,
  ),
);
