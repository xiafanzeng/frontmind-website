import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

type SkillDefinition = {
  name: string;
  cacheKey?: string;
  files: readonly string[];
};

const WEBSITE_KB_SKILL: SkillDefinition = {
  name: "website-one-shot-kb-builder",
  files: ["SKILL.md"],
};

const QUESTION_SKILL: SkillDefinition = {
  name: "geo-question-recommender",
  files: [
    "SKILL.md",
    "references/demark-question-logic.md",
    "references/output-schema.json",
  ],
};

const WEBSITE_KB_VALIDATOR: SkillDefinition = {
  name: "website-one-shot-kb-builder",
  cacheKey: "website-one-shot-kb-builder:validator",
  files: ["scripts/validate_archive.py"],
};

const skillCache = new Map<string, string>();
const WEBSITE_KB_SKILL_ARCHIVE_DATE = new Date("1980-01-01T00:00:00.000Z");

export const WEBSITE_KB_SKILL_ARCHIVE_FILENAME =
  "website-one-shot-kb-builder.skill.zip";

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

async function loadSkill(definition: SkillDefinition) {
  const cacheKey = definition.cacheKey || definition.name;
  const cached = skillCache.get(cacheKey);
  if (cached) return cached;

  let lastError: unknown;
  for (const root of skillRootCandidates()) {
    try {
      const skillRoot = await fs.realpath(path.resolve(root, definition.name));
      const sections = await Promise.all(
        definition.files.map(async (relativePath) => {
          const absolutePath = path.resolve(skillRoot, relativePath);
          const expectedRoot = `${skillRoot}${path.sep}`;
          if (!absolutePath.startsWith(expectedRoot))
            throw new Error("Unsafe skill path");
          const canonicalPath = await fs.realpath(absolutePath);
          if (!canonicalPath.startsWith(expectedRoot))
            throw new Error("Unsafe skill symlink");
          const content = await fs.readFile(canonicalPath, "utf8");
          return `# FILE: ${relativePath}\n\n${content.trim()}`;
        }),
      );
      const value = sections.join("\n\n---\n\n");
      skillCache.set(cacheKey, value);
      return value;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Could not load skill ${definition.name}`);
}

export function loadWebsiteKnowledgeBaseSkill() {
  return loadSkill(WEBSITE_KB_SKILL);
}

export async function buildWebsiteKnowledgeBaseSkillArchive() {
  const loaded = await loadWebsiteKnowledgeBaseSkill();
  const prefix = "# FILE: SKILL.md\n\n";
  if (!loaded.startsWith(prefix)) {
    throw new Error("Website knowledge-base Skill entrypoint is invalid");
  }
  const skill = loaded.slice(prefix.length);
  const skillHash = createHash("sha256").update(skill).digest("hex");
  const zip = new JSZip();
  zip.file("SKILL.md", skill, {
    date: WEBSITE_KB_SKILL_ARCHIVE_DATE,
    unixPermissions: 0o100644,
  });
  zip.file(
    "MANIFEST.json",
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: "website-one-shot-kb-builder",
        entrypoint: "SKILL.md",
        sha256: skillHash,
      },
      null,
      2,
    )}\n`,
    {
      date: WEBSITE_KB_SKILL_ARCHIVE_DATE,
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

export function loadGeoQuestionRecommenderSkill() {
  return loadSkill(QUESTION_SKILL);
}

export function loadWebsiteKnowledgeBaseValidator() {
  return loadSkill(WEBSITE_KB_VALIDATOR);
}

export function clearGeoSkillCacheForTests() {
  skillCache.clear();
}
