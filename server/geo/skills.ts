import fs from "node:fs/promises";
import path from "node:path";

type SkillDefinition = {
  name: string;
  files: readonly string[];
};

const WEBSITE_KB_SKILL: SkillDefinition = {
  name: "website-one-shot-kb-builder",
  files: [
    "SKILL.md",
    "references/knowledge-tree.md",
    "references/questioning-strategy.md",
    "references/output-format.md",
    "references/source-manifest.json",
  ],
};

const QUESTION_SKILL: SkillDefinition = {
  name: "geo-question-recommender",
  files: [
    "SKILL.md",
    "references/demark-question-logic.md",
    "references/output-schema.json",
  ],
};

const skillCache = new Map<string, string>();

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
  const cached = skillCache.get(definition.name);
  if (cached) return cached;

  let lastError: unknown;
  for (const root of skillRootCandidates()) {
    try {
      const skillRoot = await fs.realpath(
        path.resolve(root, definition.name),
      );
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
      skillCache.set(definition.name, value);
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

export function loadGeoQuestionRecommenderSkill() {
  return loadSkill(QUESTION_SKILL);
}

export function clearGeoSkillCacheForTests() {
  skillCache.clear();
}
