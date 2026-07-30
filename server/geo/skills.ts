import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export type GeoSkillArchiveDefinition = {
  name: string;
  cacheKey?: string;
  files: readonly string[];
};

const WEBSITE_KB_SKILL: GeoSkillArchiveDefinition = {
  name: "website-one-shot-kb-builder",
  files: [
    "SKILL.md",
    "references/dimensions.md",
    "references/candidate-format.md",
  ],
};

const LEGACY_WEBSITE_KB_SKILL: GeoSkillArchiveDefinition = {
  name: "website-one-shot-kb-builder-legacy",
  files: ["SKILL.md"],
};

const QUESTION_SKILL: GeoSkillArchiveDefinition = {
  name: "geo-question-recommender",
  files: [
    "SKILL.md",
    "references/demark-question-logic.md",
    "references/output-schema.json",
  ],
};

const WEBSITE_KB_VALIDATOR: GeoSkillArchiveDefinition = {
  name: "website-one-shot-kb-builder",
  cacheKey: "website-one-shot-kb-builder:validator",
  files: ["scripts/validate_archive.py"],
};

const skillCache = new Map<string, string>();
const GEO_SKILL_ARCHIVE_DATE = new Date("1980-01-01T00:00:00.000Z");

export const WEBSITE_KB_SKILL_ARCHIVE_FILENAME =
  "website-one-shot-kb-builder.skill.zip";
export const QUESTION_SKILL_ARCHIVE_FILENAME =
  "geo-question-recommender.skill.zip";

function skillRootCandidates() {
  const configuredRoot = process.env.FRONTMIND_GEO_SKILLS_DIR?.trim();
  if (configuredRoot) {
    if (!path.isAbsolute(configuredRoot)) {
      throw new Error("FRONTMIND_GEO_SKILLS_DIR must be an absolute path");
    }
    return [configuredRoot];
  }
  if (process.env.NODE_ENV === "production") {
    return [
      path.resolve(process.cwd(), "dist", "skills"),
      path.resolve(import.meta.dirname, "skills"),
    ];
  }
  return [
    path.resolve(process.cwd(), "server", "skills"),
    path.resolve(process.cwd(), "dist", "skills"),
    path.resolve(import.meta.dirname, "..", "skills"),
    path.resolve(import.meta.dirname, "skills"),
  ];
}

async function readSkillEntries(definition: GeoSkillArchiveDefinition) {
  let lastError: unknown;
  for (const root of skillRootCandidates()) {
    try {
      const skillRoot = await fs.realpath(path.resolve(root, definition.name));
      const expectedRoot = `${skillRoot}${path.sep}`;
      return await Promise.all(
        definition.files.map(async (relativePath) => {
          const absolutePath = path.resolve(skillRoot, relativePath);
          if (!absolutePath.startsWith(expectedRoot))
            throw new Error("Unsafe skill path");
          const canonicalPath = await fs.realpath(absolutePath);
          if (!canonicalPath.startsWith(expectedRoot))
            throw new Error("Unsafe skill symlink");
          return {
            relativePath,
            content: await fs.readFile(canonicalPath),
          };
        }),
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not load skill ${definition.name}`);
}

async function loadSkill(definition: GeoSkillArchiveDefinition) {
  const entries = await readSkillEntries(definition);
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify(
        entries.map(({ relativePath, content }) => ({
          relativePath,
          sha256: createHash("sha256").update(content).digest("hex"),
        })),
      ),
    )
    .digest("hex");
  const cacheKey = `${definition.cacheKey || definition.name}:${contentHash}`;
  const cached = skillCache.get(cacheKey);
  if (cached) return cached;

  const value = entries
    .map(
      ({ relativePath, content }) =>
        `# FILE: ${relativePath}\n\n${content.toString("utf8").trim()}`,
    )
    .join("\n\n---\n\n");
  skillCache.set(cacheKey, value);
  return value;
}

export function loadWebsiteKnowledgeBaseSkill() {
  return loadSkill(WEBSITE_KB_SKILL);
}

export async function buildGeoSkillArchive(
  definition: GeoSkillArchiveDefinition,
) {
  if (!definition.files.includes("SKILL.md")) {
    throw new Error(`Skill ${definition.name} is missing SKILL.md`);
  }
  const entries = await readSkillEntries(definition);
  const zip = new JSZip();
  for (const { relativePath, content } of entries) {
    zip.file(relativePath, content, {
      date: GEO_SKILL_ARCHIVE_DATE,
      unixPermissions: 0o100644,
      createFolders: false,
    });
  }
  const files = entries.map(({ relativePath, content }) => ({
    path: relativePath,
    bytes: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
  }));
  const skillHash = createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  zip.file(
    "MANIFEST.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: definition.name,
        entrypoint: "SKILL.md",
        sha256: skillHash,
        files,
      },
      null,
      2,
    )}\n`,
    {
      date: GEO_SKILL_ARCHIVE_DATE,
      unixPermissions: 0o100644,
    },
  );
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
}

export function buildWebsiteKnowledgeBaseSkillArchive() {
  return buildGeoSkillArchive(WEBSITE_KB_SKILL);
}

export function buildLegacyWebsiteKnowledgeBaseSkillArchive() {
  return buildGeoSkillArchive(LEGACY_WEBSITE_KB_SKILL);
}

export function loadGeoQuestionRecommenderSkill() {
  return loadSkill(QUESTION_SKILL);
}

export function buildGeoQuestionRecommenderSkillArchive() {
  return buildGeoSkillArchive(QUESTION_SKILL);
}

export function loadWebsiteKnowledgeBaseValidator() {
  return loadSkill(WEBSITE_KB_VALIDATOR);
}

export function clearGeoSkillCacheForTests() {
  skillCache.clear();
}
