export const agentAccessCodes = [
  "frontmind2026",
] as const;

export function isValidAgentAccessCode(code: string) {
  const normalizedCode = code.trim();
  return agentAccessCodes.some((accessCode) => accessCode === normalizedCode);
}
