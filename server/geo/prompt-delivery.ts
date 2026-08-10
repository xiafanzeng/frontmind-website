import crypto from "node:crypto";

export const GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS = 3_000;

export const GEO_TASK_INPUT_MIME_TYPE = "application/json";
export const GEO_TASK_INPUT_TRUST_BOUNDARY =
  "server_owned_envelope_with_untrusted_customer_and_evidence_data";

export type GeoTaskInputAttachment = Readonly<{
  filename: string;
  body: Buffer;
  mimeType: typeof GEO_TASK_INPUT_MIME_TYPE;
  sha256: string;
}>;

export function geoPromptCodePointLength(prompt: string) {
  return Array.from(prompt).length;
}

export function geoAttachmentSha256(body: string | Buffer) {
  return crypto.createHash("sha256").update(body).digest("hex");
}

export function assertGeoUpstreamPromptBudget(
  prompt: string,
  source = "geo task",
) {
  const codePoints = geoPromptCodePointLength(prompt);
  if (codePoints > GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS) {
    throw new Error(
      `${source} prompt exceeds ${GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS} Unicode code points (${codePoints})`,
    );
  }
  return prompt;
}

export function buildGeoTaskInputAttachment(
  filename: string,
  kind: string,
  data: unknown,
): GeoTaskInputAttachment {
  const document = {
    kind,
    schemaVersion: 1,
    trustBoundary: GEO_TASK_INPUT_TRUST_BOUNDARY,
    data,
  };
  const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
  return {
    filename,
    body,
    mimeType: GEO_TASK_INPUT_MIME_TYPE,
    sha256: geoAttachmentSha256(body),
  };
}

export function parseGeoTaskInputAttachment<T>(
  body: Buffer,
  expectedKind: string,
): T | undefined {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (
      parsed.kind !== expectedKind ||
      parsed.schemaVersion !== 1 ||
      parsed.trustBoundary !== GEO_TASK_INPUT_TRUST_BOUNDARY ||
      !("data" in parsed)
    ) {
      return undefined;
    }
    return parsed.data as T;
  } catch {
    return undefined;
  }
}
