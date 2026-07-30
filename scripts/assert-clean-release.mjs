import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const status = execFileSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  {
    cwd: projectRoot,
    encoding: "utf8",
  },
).trim();

if (status) {
  throw new Error(
    "Release builds require a clean Git checkout. Commit and push the source, then build from a fresh clone.",
  );
}

console.log("Clean release checkout verified.");
