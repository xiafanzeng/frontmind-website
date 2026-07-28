function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Returns only provider output items that can represent assistant-authored
 * structured/text output. User messages, reasoning metadata, task metadata and
 * attachments are never traversed.
 */
export function trustedAssistantOutputItems(task: unknown): unknown[] {
  const record = asRecord(task);
  if (!record || !Array.isArray(record.output)) return [];
  const trusted: unknown[] = [];

  for (const value of record.output) {
    if (typeof value === "string") {
      trusted.push(value);
      continue;
    }
    const item = asRecord(value);
    if (!item || item.role === "user") continue;
    const type = String(item.type ?? "").toLowerCase();
    if (
      item.role === "assistant" &&
      (!type || type === "message" || type === "output_message") &&
      Array.isArray(item.content)
    ) {
      for (const content of item.content) {
        const contentRecord = asRecord(content);
        const contentType = String(contentRecord?.type ?? "").toLowerCase();
        if (
          typeof content === "string" ||
          ["text", "output_text"].includes(contentType) ||
          (!contentType &&
            (typeof contentRecord?.text === "string" ||
              typeof contentRecord?.output_text === "string"))
        ) {
          trusted.push(content);
        }
      }
      continue;
    }
    if (["text", "output_text"].includes(type)) trusted.push(item);
  }

  return trusted;
}

export function trustedAssistantOutputTexts(task: unknown): string[] {
  return trustedAssistantOutputItems(task).flatMap((value) => {
    if (typeof value === "string") return value.trim() ? [value] : [];
    const record = asRecord(value);
    if (!record) return [];
    for (const key of ["text", "output_text", "content"]) {
      const text = record[key];
      if (typeof text === "string" && text.trim()) return [text];
    }
    return [];
  });
}
