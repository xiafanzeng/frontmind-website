const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const baseUrl = args.get("--url") || process.env.FRONTMIND_PUBLIC_BASE_URL;
if (!baseUrl) {
  throw new Error("--url or FRONTMIND_PUBLIC_BASE_URL is required");
}
const expectedBuildSha = (
  args.get("--build-sha") || process.env.FRONTMIND_BUILD_SHA || ""
)
  .trim()
  .toLowerCase();
if (expectedBuildSha && !/^[a-f0-9]{40}$/u.test(expectedBuildSha)) {
  throw new Error("--build-sha must be a full Git SHA");
}
const expectedRuntimeSkills = [
  { name: "website-one-shot-kb-builder", version: 6 },
  { name: "geo-question-recommender", version: 1 },
  { name: "geo-custom-question-classifier", version: 1 },
  { name: "geo-knowledge-answer-verifier", version: 1 },
  { name: "geo-current-state-evaluator", version: 1 },
  { name: "geo-optimization-outcome-forecaster", version: 1 },
];

async function readJson(pathname) {
  const response = await fetch(new URL(pathname, baseUrl), {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  return response.json();
}

const [health, readiness] = await Promise.all([
  readJson("/healthz"),
  readJson("/readyz"),
]);
if (
  health?.status !== "ok" ||
  health?.service !== "frontmind-website" ||
  readiness?.status !== "ok"
) {
  throw new Error("Website health/readiness contract failed");
}
if (
  expectedBuildSha &&
  (health?.buildSha !== expectedBuildSha ||
    readiness?.buildSha !== expectedBuildSha)
) {
  throw new Error("Production build SHA differs from the deployed image");
}
if (
  readiness?.dependencies?.customQuestionValidationStore?.ready !== true ||
  !Array.isArray(readiness?.skills)
) {
  throw new Error("Website deep readiness is incomplete");
}
const runtimeSkills = readiness.skills.map(({ name, version }) => ({
  name,
  version,
}));
if (JSON.stringify(runtimeSkills) !== JSON.stringify(expectedRuntimeSkills)) {
  throw new Error("Production must expose the exact six runtime Skills");
}
console.log(
  JSON.stringify({
    status: "verified",
    buildSha: health.buildSha,
    skills: readiness.skills.length,
  }),
);
