import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(import.meta.dirname, "..");
const buildSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
})
  .trim()
  .toLowerCase();

if (!/^[a-f0-9]{40}$/.test(buildSha)) {
  throw new Error("Could not resolve a full Git SHA for the server build");
}

await build({
  entryPoints: {
    index: resolve(projectRoot, "server", "index.ts"),
    "verify-live-payment": resolve(
      projectRoot,
      "scripts",
      "verify-live-payment.ts",
    ),
  },
  outdir: resolve(projectRoot, "dist"),
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  define: {
    __FRONTMIND_BUILD_SHA__: JSON.stringify(buildSha),
  },
});

console.log(`Server and payment-verification bundles built from ${buildSha}.`);
