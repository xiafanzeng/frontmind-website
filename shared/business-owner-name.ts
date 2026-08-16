const INVALID_CONTROLS = new RegExp(
  "[\\p{Cc}\\p{Cf}\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]",
  "u",
);
const ALLOWED_CHARACTERS = new RegExp("^[\\p{L}\\p{M}\\p{N} ·・.\\-'’]+$", "u");
const UNICODE_WHITESPACE = new RegExp("\\s+", "gu");

export const BUSINESS_OWNER_NAME_MAX_CODE_POINTS = 40;

/**
 * One browser/server normalization boundary for the business owner attached to
 * a newly invited Website project. The value is metadata, never model input.
 */
export function normalizeBusinessOwnerName(value: string): string {
  if (INVALID_CONTROLS.test(value)) {
    throw new Error("BUSINESS_OWNER_NAME_INVALID");
  }
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(UNICODE_WHITESPACE, " ");
  const codePoints = Array.from(normalized);
  if (
    codePoints.length < 1 ||
    codePoints.length > BUSINESS_OWNER_NAME_MAX_CODE_POINTS ||
    !ALLOWED_CHARACTERS.test(normalized)
  ) {
    throw new Error("BUSINESS_OWNER_NAME_INVALID");
  }
  return normalized;
}
