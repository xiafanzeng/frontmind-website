import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

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
      "Usage: pnpm verify:production -- --url https://www.frontmind.net [--sha <git-sha>]",
    );
  }
  args.set(key.slice(2), value);
  index += 2;
}

const productionUrl = new URL(args.get("url") || "");
if (productionUrl.protocol !== "https:") {
  throw new Error("--url must be a production HTTPS origin");
}
const expectedSha = (
  args.get("sha") ||
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
  })
)
  .trim()
  .toLowerCase();
if (!/^[a-f0-9]{7,64}$/.test(expectedSha)) {
  throw new Error("--sha must be a 7-64 character hexadecimal Git SHA");
}

const runtimeSkillDefinitions = [
  {
    name: "website-one-shot-kb-builder",
    version: 5,
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
if (String(health?.buildSha || "").toLowerCase() !== expectedSha) {
  throw new Error(
    `buildSha mismatch: expected ${expectedSha}, received ${health?.buildSha ?? "null"}`,
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
  health?.dependencies?.paymentReceiptLedger?.ready !== true
) {
  throw new Error("One or more GEO production dependencies are not ready");
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
      buildSha: expectedSha,
      websiteSkillVersion: websiteSkill.version,
      websiteSkillHash: expectedWebsiteSkill.contentHash,
      runtimeSkills: expectedRuntimeSkills,
      frontendEntry: localEntry,
      frontendEntrySha256: localEntryHash,
    },
    null,
    2,
  ),
);
