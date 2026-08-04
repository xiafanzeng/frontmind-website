const MARKDOWN_HEADING = /^\s{0,3}#{1,6}[\t ]+(.+?)(?:[\t ]+#+[\t ]*)?$/;

function normalizeHeadingText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^[*_~`]+|[*_~`]+$/g, "")
    .replace(/\s+/g, " ");
}

export type PreparedKnowledgeSectionMarkdown = Readonly<{
  markdown: string;
  rendersSectionTitle: boolean;
}>;

/**
 * Knowledge archives may concatenate several source files that each repeat the
 * branch heading. Within the leading heading run, keep only the last matching
 * title—the one visually closest to the body—and leave all later content intact.
 */
export function prepareKnowledgeSectionMarkdown(
  markdown: string,
  sectionTitle: string,
): PreparedKnowledgeSectionMarkdown {
  const source = markdown.replace(/\r\n?/g, "\n").trim();
  if (!source) return { markdown: "", rendersSectionTitle: false };

  const normalizedTitle = normalizeHeadingText(sectionTitle);
  if (!normalizedTitle) {
    return { markdown: source, rendersSectionTitle: false };
  }

  const lines = source.split("\n");
  const matchingHeadingIndexes: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    const heading = line.match(MARKDOWN_HEADING);
    if (
      !heading ||
      normalizeHeadingText(heading[1] ?? "") !== normalizedTitle
    ) {
      break;
    }
    matchingHeadingIndexes.push(index);
  }

  if (matchingHeadingIndexes.length === 0) {
    return { markdown: source, rendersSectionTitle: false };
  }

  const keepIndex = matchingHeadingIndexes.at(-1)!;
  const removeIndexes = new Set(
    matchingHeadingIndexes.filter((index) => index !== keepIndex),
  );
  const prepared = lines
    .filter((_, index) => !removeIndexes.has(index))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { markdown: prepared, rendersSectionTitle: true };
}
