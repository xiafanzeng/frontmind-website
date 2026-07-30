import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const buildRoot = resolve(projectRoot, process.argv[2] || "dist");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".txt",
  ".yaml",
  ".yml",
]);
const forbiddenFileNames = new Set([
  "provisioning-v2.fixture.json",
  "preview-monitor-evidence.js",
]);
const runtimeSkillNames = [
  "website-one-shot-kb-builder",
  "geo-question-recommender",
  "geo-knowledge-answer-verifier",
  "geo-current-state-evaluator",
  "geo-optimization-outcome-forecaster",
];
const previewSourceFiles = [
  "client/src/features/geo/preview.ts",
  "client/src/features/geo/preview-monitor-evidence.ts",
];
const simplifiedDashboardSource =
  "client/src/features/geo/GeoAgentUserDashboard.tsx";
const simplifiedDashboardStyles = "client/src/features/geo/geo-build.css";
const visitorStatsSourceFiles = [
  "client/src/components/VisitorStats.tsx",
  "client/src/data/visitorStats.ts",
  "server/visitorStats.ts",
];
const forbiddenCustomerFixturePatterns = [
  {
    label: "former customer assessment fixture",
    pattern:
      /香港中文大学（深圳）是\s*985\s*还是\s*211|港中深_AI智能品牌优化方案|preview-cuhksz/i,
  },
  {
    label: "former customer source URL",
    pattern:
      /https:\/\/(?:www|admissions)\.cuhk\.edu\.cn\/(?:zh-hans\/(?:page\/4987|about-us|academics)|node\/911)/i,
  },
  {
    label: "former live monitoring answer",
    pattern:
      /北京敦锋科技有限公司|FrontMind超前智能的运营主体|陆宏远具备自然语言处理/i,
  },
];
const forbiddenPatterns = [
  {
    label: "retired Agent domain",
    pattern: /\bagent\.frontmind\.net\b/i,
  },
  {
    label: "retired Agent portal or access-code UI",
    pattern: /智能体入口|Agent Portal|frontmind2026/i,
  },
  {
    label: "legacy customer preview content",
    pattern: /宏旭|汉腾激光|摩托车骑行装备品牌推荐|hongxu(?:\.demo)?/i,
  },
  {
    label: "cross-repository contract fixture",
    pattern: /跨仓契约示例企业|cuhksz\.geo|FM202607240001|zpay-202607240001/i,
  },
  {
    label: "preview monitoring fixture",
    pattern: /\bPREVIEW_MONITOR_EVIDENCE\b|\bCUHKSZ_ANSWER_COPY\b/,
  },
  {
    label: "anonymous development preview fixture",
    pattern:
      /company\.example\.invalid|匿名平台验收样本|preview-only-do-not-submit/i,
  },
  ...forbiddenCustomerFixturePatterns,
  {
    label: "API key",
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/,
  },
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];
const requiredPatterns = [
  {
    label: "Dashboard client login URL",
    pattern: /https:\/\/dashboard\.frontmind\.net\/login\b/,
  },
];

async function collectTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(path)));
    } else if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

try {
  const buildStat = await stat(buildRoot);
  if (!buildStat.isDirectory()) throw new Error("dist is not a directory");
} catch {
  console.error("Production bundle is missing. Run `pnpm build` first.");
  process.exit(1);
}

const violations = [];

for (const sourceFile of visitorStatsSourceFiles) {
  const content = await readFile(join(projectRoot, sourceFile), "utf8");
  for (const rule of [
    {
      label: "fabricated visitor-stat fallback",
      pattern: /\bfallbackStats\b|\bvisitorStatsSummary\b|\bvisitorCountries\b/,
    },
    {
      label: "legacy visitor-stat baseline",
      pattern: /\bbaselineReads\b|\bliveReads\b/,
    },
  ]) {
    if (rule.pattern.test(content)) {
      violations.push({ file: sourceFile, label: rule.label });
    }
  }
}

for (const sourceFile of previewSourceFiles) {
  const content = await readFile(join(projectRoot, sourceFile), "utf8");
  for (const rule of forbiddenCustomerFixturePatterns) {
    if (rule.pattern.test(content)) {
      violations.push({
        file: sourceFile,
        label: rule.label,
      });
    }
  }
}

const dashboardSourceContent = await readFile(
  join(projectRoot, simplifiedDashboardSource),
  "utf8",
);
if (/brand-system|内容制作体系/.test(dashboardSourceContent)) {
  violations.push({
    file: simplifiedDashboardSource,
    label: "retired simplified-dashboard branch",
  });
}

const dashboardCssContent = await readFile(
  join(projectRoot, simplifiedDashboardStyles),
  "utf8",
);
const dashboardCssStart = dashboardCssContent.indexOf(".geo-agent-dashboard {");
const dashboardCssEnd = dashboardCssContent.indexOf(
  ".geo-agent-dashboard button:focus-visible",
  dashboardCssStart,
);
if (dashboardCssStart < 0 || dashboardCssEnd <= dashboardCssStart) {
  violations.push({
    file: simplifiedDashboardStyles,
    label: "simplified-dashboard CSS boundary is missing",
  });
} else {
  const dashboardCss = dashboardCssContent.slice(
    dashboardCssStart,
    dashboardCssEnd,
  );
  if (/font-size:\s*(?:8|9|10)px\b/.test(dashboardCss)) {
    violations.push({
      file: simplifiedDashboardStyles,
      label: "simplified dashboard contains unreadable 8-10px text",
    });
  }
  if (/"Songti SC"|"Noto Serif SC"|"DM Mono"/.test(dashboardCss)) {
    violations.push({
      file: simplifiedDashboardStyles,
      label: "simplified dashboard contains retired display fonts",
    });
  }
  if (
    !dashboardCss.includes(
      "linear-gradient(135deg, #f8f5fb 0%, #f1edf6 48%, #fbf7ec 100%)",
    )
  ) {
    violations.push({
      file: simplifiedDashboardStyles,
      label: "simplified dashboard is missing the current Agent background",
    });
  }
}

let runtimeSkillFileCount = 0;
for (const skillName of runtimeSkillNames) {
  const sourceSkillRoot = join(projectRoot, "server", "skills", skillName);
  const builtSkillRoot = join(buildRoot, "skills", skillName);
  try {
    const [sourceFiles, builtFiles] = await Promise.all([
      collectTextFiles(sourceSkillRoot),
      collectTextFiles(builtSkillRoot),
    ]);
    const sourceRelativePaths = sourceFiles
      .map((file) => relative(sourceSkillRoot, file))
      .sort();
    const builtRelativePaths = builtFiles
      .map((file) => relative(builtSkillRoot, file))
      .sort();
    runtimeSkillFileCount += builtRelativePaths.length;
    if (
      JSON.stringify(sourceRelativePaths) !== JSON.stringify(builtRelativePaths)
    ) {
      violations.push({
        file: `dist/skills/${skillName}`,
        label: "runtime Skill file list differs from source",
      });
      continue;
    }
    for (const relativePath of sourceRelativePaths) {
      const [sourceContent, builtContent] = await Promise.all([
        readFile(join(sourceSkillRoot, relativePath)),
        readFile(join(builtSkillRoot, relativePath)),
      ]);
      if (!sourceContent.equals(builtContent)) {
        violations.push({
          file: `dist/skills/${skillName}/${relativePath}`,
          label: "runtime Skill content differs from source",
        });
      }
    }
  } catch {
    violations.push({
      file: `dist/skills/${skillName}`,
      label: "missing runtime Skill artifact",
    });
  }
}
if (runtimeSkillFileCount !== 21) {
  violations.push({
    file: "dist/skills",
    label: `runtime Skill bundle must contain exactly 21 files, found ${runtimeSkillFileCount}`,
  });
}

const allEntries = await readdir(buildRoot, {
  recursive: true,
  withFileTypes: true,
});
for (const entry of allEntries) {
  if (entry.isFile() && forbiddenFileNames.has(entry.name)) {
    violations.push({
      file: entry.name,
      label: "development-only fixture",
    });
  }
}

const buildTextFiles = await collectTextFiles(buildRoot);
const requiredPatternMatches = new Set();
for (const file of buildTextFiles) {
  const content = await readFile(file, "utf8");
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      violations.push({
        file: relative(projectRoot, file),
        label: rule.label,
      });
    }
  }
  for (const rule of requiredPatterns) {
    if (rule.pattern.test(content)) requiredPatternMatches.add(rule.label);
  }
}
for (const rule of requiredPatterns) {
  if (!requiredPatternMatches.has(rule.label)) {
    violations.push({
      file: "dist",
      label: `missing required ${rule.label}`,
    });
  }
}

if (violations.length > 0) {
  console.error("Production user-content audit failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.label}`);
  }
  process.exit(1);
}

console.log("Production user-content audit passed.");
