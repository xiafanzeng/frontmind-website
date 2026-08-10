const MARKDOWN_HEADING = /^\s{0,3}(#{1,6})[\t ]+(.+?)(?:[\t ]+#+[\t ]*)?$/;
const MARKDOWN_THEMATIC_BREAK =
  /^\s{0,3}(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})$/;
const MARKDOWN_FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
function normalizeHeadingText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^[*_~`]+|[*_~`]+$/g, "")
    .replace(/\s+/g, " ");
}

export function visibleKnowledgeSectionSummary(
  value?: string,
): string | undefined {
  const summary = value?.trim();
  if (!summary || /^暂无可展示摘要[。.．]?$/.test(summary)) return undefined;
  return summary;
}

export type PreparedKnowledgeSectionMarkdown = Readonly<{
  markdown: string;
  rendersSectionTitle: boolean;
}>;

export type KnowledgeSectionMarkdownCompatibility = Readonly<{
  archiveContractVersion?: 1 | 2 | 3 | 4;
  titleInjected?: boolean;
}>;

type MarkdownFence = Readonly<{
  marker: "`" | "~";
  length: number;
}>;

function openingFence(line: string): MarkdownFence | undefined {
  const match = line.match(MARKDOWN_FENCE);
  if (!match) return undefined;
  const sequence = match[1]!;
  return {
    marker: sequence[0] as "`" | "~",
    length: sequence.length,
  };
}

function closesFence(line: string, fence: MarkdownFence): boolean {
  const match = line.match(MARKDOWN_FENCE);
  if (!match || match[2]!.trim()) return false;
  const sequence = match[1]!;
  return sequence[0] === fence.marker && sequence.length >= fence.length;
}

function isSetextUnderline(line: string, previousLine?: string): boolean {
  return Boolean(
    previousLine?.trim() &&
      /^\s{0,3}-+[\t ]*$/.test(line) &&
      !MARKDOWN_HEADING.test(previousLine) &&
      !MARKDOWN_FENCE.test(previousLine),
  );
}

function oldGeneratedHeadingIndex(
  lines: readonly string[],
  start: number,
  end: number,
): number | undefined {
  let firstIndex = start;
  while (firstIndex < end && !lines[firstIndex]!.trim()) firstIndex += 1;
  const generatedHeading = lines[firstIndex]?.match(MARKDOWN_HEADING);
  if (!generatedHeading || generatedHeading[1] !== "##") return undefined;

  let originalIndex = firstIndex + 1;
  while (originalIndex < end && !lines[originalIndex]!.trim()) {
    originalIndex += 1;
  }
  const originalHeading = lines[originalIndex]?.match(MARKDOWN_HEADING);
  if (!originalHeading) return undefined;

  const generatedTitle = normalizeHeadingText(generatedHeading[2] ?? "");
  const originalTitle = normalizeHeadingText(originalHeading[2] ?? "");
  return generatedTitle && generatedTitle === originalTitle
    ? firstIndex
    : undefined;
}

function removeLegacyGeneratedHeadings(source: string): string {
  const lines = source.split("\n");
  const removeIndexes = new Set<number>();
  let partStart = 0;
  let fence: MarkdownFence | undefined;

  const inspectPart = (end: number) => {
    const index = oldGeneratedHeadingIndex(lines, partStart, end);
    if (index === undefined) return;
    removeIndexes.add(index);
    for (
      let blankIndex = index + 1;
      blankIndex < end && !lines[blankIndex]!.trim();
      blankIndex += 1
    ) {
      removeIndexes.add(blankIndex);
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const openedFence = openingFence(line);
    if (openedFence) {
      fence = openedFence;
      continue;
    }
    if (
      MARKDOWN_THEMATIC_BREAK.test(line) &&
      !isSetextUnderline(line, lines[index - 1])
    ) {
      inspectPart(index);
      partStart = index + 1;
    }
  }
  inspectPart(lines.length);

  return lines
    .filter((_, index) => !removeIndexes.has(index))
    .join("\n")
    .trim();
}

/**
 * Find the first visible heading using the same leading-comment semantics as
 * the archive parser. Comments may precede a document title, but once visible
 * body text appears we must not scan ahead and mistake a later heading for the
 * section title.
 */
function firstVisibleMarkdownHeading(markdown: string): string | undefined {
  let insideLeadingComment = false;
  for (const rawLine of markdown.split("\n")) {
    let line = rawLine;
    while (true) {
      if (insideLeadingComment) {
        const commentEnd = line.indexOf("-->");
        if (commentEnd < 0) {
          line = "";
          break;
        }
        insideLeadingComment = false;
        line = line.slice(commentEnd + 3);
      }
      const visible = line.trimStart();
      if (!visible) {
        line = "";
        break;
      }
      if (!/^ {0,3}<!--/.test(line)) {
        return line.match(MARKDOWN_HEADING)?.[2];
      }
      const commentEnd = visible.indexOf("-->", 4);
      if (commentEnd < 0) {
        insideLeadingComment = true;
        line = "";
        break;
      }
      line = visible.slice(commentEnd + 3);
    }
  }
  return undefined;
}

/**
 * New archives no longer prepend a generated H2 when the document already has
 * the same leading title. Only an explicit legacy contract/marker enables
 * removal of that precise H2 + same-title-heading shape at the beginning of
 * each top-level document part. All other headings and separators remain.
 */
export function prepareKnowledgeSectionMarkdown(
  markdown: string,
  sectionTitle: string,
  compatibility: KnowledgeSectionMarkdownCompatibility = {},
): PreparedKnowledgeSectionMarkdown {
  const source = markdown.replace(/\r\n?/g, "\n").trim();
  if (!source) return { markdown: "", rendersSectionTitle: false };

  const shouldRemoveLegacyGeneratedHeadings =
    compatibility.titleInjected ??
    (compatibility.archiveContractVersion === 1 ||
      compatibility.archiveContractVersion === 2);
  const prepared = shouldRemoveLegacyGeneratedHeadings
    ? removeLegacyGeneratedHeadings(source)
    : source;
  const firstHeading = firstVisibleMarkdownHeading(prepared);
  const normalizedTitle = normalizeHeadingText(sectionTitle);

  return {
    markdown: prepared,
    rendersSectionTitle:
      Boolean(normalizedTitle) &&
      normalizeHeadingText(firstHeading ?? "") === normalizedTitle,
  };
}
