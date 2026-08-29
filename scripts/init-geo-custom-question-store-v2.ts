import {
  GeoCustomQuestionStoreInitializationError,
  initializeEmptyGeoCustomQuestionValidationStoreV2,
} from "../server/geo/custom-question-validation-store";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

if (!process.argv.includes("--confirm-empty-v2-init")) {
  throw new Error("refusing initialization without --confirm-empty-v2-init");
}

const directory =
  option("--directory") ||
  process.env.FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR?.trim();
if (!directory) {
  throw new Error(
    "provide --directory or FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR",
  );
}

try {
  const result =
    await initializeEmptyGeoCustomQuestionValidationStoreV2(directory);
  process.stdout.write(
    `custom-question v2 store ${result.created ? "initialized" : "verified"}\n`,
  );
} catch (error) {
  if (error instanceof GeoCustomQuestionStoreInitializationError) {
    process.stderr.write(`custom-question v2 store refused: ${error.code}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
