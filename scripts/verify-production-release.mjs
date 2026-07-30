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

const websiteSkillFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/dimensions.md",
  "references/candidate-format.md",
  "scripts/build_candidate.py",
];
const skillRoot = resolve(
  projectRoot,
  "server",
  "skills",
  "website-one-shot-kb-builder",
);
const skillContents = await Promise.all(
  websiteSkillFiles.map(async (relativePath) => ({
    relativePath,
    content: await readFile(resolve(skillRoot, relativePath), "utf8"),
  })),
);
const expectedSkillHash = createHash("sha256")
  .update(
    skillContents
      .map(
        ({ relativePath, content }) =>
          `# FILE: ${relativePath}\n\n${content.trim()}`,
      )
      .join("\n\n---\n\n"),
    "utf8",
  )
  .digest("hex");

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
if (skills.length !== 5 || skills.some((skill) => skill?.status !== "ok")) {
  throw new Error("All five runtime Skills must report status=ok");
}
const websiteSkill = skills.find(
  (skill) => skill?.name === "website-one-shot-kb-builder",
);
if (websiteSkill?.version !== 5) {
  throw new Error("website-one-shot-kb-builder must report version 5");
}
if (websiteSkill?.contentHash !== expectedSkillHash) {
  throw new Error("Production website Skill hash differs from local source");
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
      websiteSkillHash: expectedSkillHash,
      frontendEntry: localEntry,
      frontendEntrySha256: localEntryHash,
    },
    null,
    2,
  ),
);
