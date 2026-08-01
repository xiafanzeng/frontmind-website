import { assertCleanProductionReleaseWorktree } from "./assert-clean-build-source.mjs";

const sha = assertCleanProductionReleaseWorktree({ env: process.env });
console.log(`Clean production release worktree verified at ${sha}.`);
