import type { BrokerArtifact, BrokerTask } from "./broker";

export type TrustedAssistantOutputFile = Readonly<{
  artifactId: string;
  filename: string;
  mimeType: string;
}>;

function asBrokerTask(value: unknown): Partial<BrokerTask> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<BrokerTask>)
    : undefined;
}

function isJsonArtifact(value: unknown): value is BrokerArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Partial<BrokerArtifact>;
  return (
    typeof artifact.artifactId === "string" &&
    typeof artifact.filename === "string" &&
    typeof artifact.mimeType === "string" &&
    (artifact.filename.toLowerCase().endsWith(".json") ||
      artifact.mimeType.toLowerCase().includes("json"))
  );
}

export function trustedAssistantOutputFiles(
  task: unknown,
): TrustedAssistantOutputFile[] {
  const artifacts = asBrokerTask(task)?.result?.artifacts;
  if (!Array.isArray(artifacts)) return [];
  return artifacts.filter(isJsonArtifact).map((artifact) => ({
    artifactId: artifact.artifactId,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
  }));
}

/**
 * Structured results have already crossed Dashboard's authenticated contract
 * and are the only model-authored business payload trusted by Website.
 */
export function trustedAssistantOutputItems(task: unknown): unknown[] {
  const structuredResult = asBrokerTask(task)?.result?.structuredResult;
  return structuredResult === undefined ? [] : [structuredResult];
}

/** Safe events are display-only and are never reparsed as business JSON. */
export function trustedAssistantOutputTexts(task: unknown): string[] {
  const events = asBrokerTask(task)?.safeEvents;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) =>
    typeof event?.message === "string" && event.message.trim()
      ? [event.message.trim()]
      : [],
  );
}
