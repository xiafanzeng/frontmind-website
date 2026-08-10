import { releaseProfile } from "../config/release-profile.mjs";

const testModule =
  releaseProfile.channel === "development"
    ? "./test-development-release-flow.mjs"
    : "./test-production-release-flow.mjs";

await import(testModule);
