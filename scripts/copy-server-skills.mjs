import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(projectRoot, "server", "skills");
const outputRoot = path.join(projectRoot, "dist", "skills");
const skillNames = [
  "website-one-shot-kb-builder",
  "geo-question-recommender",
  "geo-custom-question-classifier",
  "geo-current-state-evaluator",
  "geo-optimization-outcome-forecaster",
];

await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(outputRoot, { recursive: true });

for (const skillName of skillNames) {
  await fs.cp(
    path.join(sourceRoot, skillName),
    path.join(outputRoot, skillName),
    {
      recursive: true,
      force: true,
    },
  );
}
