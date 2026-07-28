import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { pageCatalog } from "../client/src/data/geoCommunity/pageCatalog";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  projectRoot,
  "client/src/data/geoCommunity/pageCatalogSummary.ts",
);

const summaries = pageCatalog.map(
  ({ path: pagePath, sourceTitle, h1, description }) => ({
    path: pagePath,
    sourceTitle,
    h1,
    description,
  }),
);

const generatedSource = await format(
  `/* This file is generated from pageCatalog.ts.
 * Run \`pnpm generate:community-summary\` after changing the source catalog. */
export type GeoCommunityPageSummary = {
  path: string;
  sourceTitle?: string;
  h1?: string;
  description?: string;
};

export const pageCatalogSummary: GeoCommunityPageSummary[] = ${JSON.stringify(
    summaries,
    null,
    2,
  )};
`,
  { parser: "typescript" },
);

if (process.argv.includes("--check")) {
  const currentSource = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : "";
  if (currentSource !== generatedSource) {
    throw new Error(
      "GEO community summary is stale. Run `pnpm generate:community-summary`.",
    );
  }
} else {
  fs.writeFileSync(outputPath, generatedSource, "utf8");
}
