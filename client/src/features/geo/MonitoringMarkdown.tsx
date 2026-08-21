import { SafeMarkdown, safePublicMarkdownUrl } from "./SafeMarkdown";
import type { GeoAnswerSource } from "./types";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  title?: string;
  children?: MarkdownNode[];
  data?: {
    hProperties?: Record<string, unknown>;
  };
};

const SKIPPED_CITATION_PARENTS = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
]);

function citationUrlIndex(citations: GeoAnswerSource[]) {
  const byIndex = new Map<number, string | null>();
  for (const citation of citations) {
    if (
      citation.index === undefined ||
      !Number.isSafeInteger(citation.index) ||
      citation.index < 0
    ) {
      continue;
    }
    const safeUrl = safePublicMarkdownUrl(citation.url);
    const current = byIndex.get(citation.index);
    if (current === undefined) {
      byIndex.set(citation.index, safeUrl ?? null);
      continue;
    }
    if (!safeUrl || !current || safeUrl !== current) {
      byIndex.set(citation.index, null);
    }
  }
  return byIndex;
}

function createCitationRemarkPlugin(citations: GeoAnswerSource[]) {
  const urls = citationUrlIndex(citations);
  return () => (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || SKIPPED_CITATION_PARENTS.has(node.type)) return;
      const nextChildren: MarkdownNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || typeof child.value !== "string") {
          visit(child);
          nextChildren.push(child);
          continue;
        }
        const marker = /〔来源\s+(\d{1,9})〕/g;
        let cursor = 0;
        let matched = false;
        for (const match of Array.from(child.value.matchAll(marker))) {
          const offset = match.index ?? 0;
          const index = Number(match[1]);
          const url = urls.get(index);
          if (offset > cursor) {
            nextChildren.push({
              type: "text",
              value: child.value.slice(cursor, offset),
            });
          }
          if (url) {
            nextChildren.push({
              type: "link",
              url,
              title: `引用来源 ${index}`,
              data: {
                hProperties: { className: "geo-citation-marker" },
              },
              children: [{ type: "text", value: `[${index}]` }],
            });
          } else {
            nextChildren.push({ type: "text", value: match[0] });
          }
          cursor = offset + match[0].length;
          matched = true;
        }
        if (!matched) {
          nextChildren.push(child);
          continue;
        }
        if (cursor < child.value.length) {
          nextChildren.push({ type: "text", value: child.value.slice(cursor) });
        }
      }
      node.children = nextChildren;
    };
    visit(tree);
  };
}

export function MonitoringMarkdown({
  markdown,
  citations = [],
}: {
  markdown?: string;
  citations?: GeoAnswerSource[];
}) {
  return (
    <SafeMarkdown
      markdown={markdown}
      className="geo-answer-markdown"
      empty={<p className="geo-answer-empty">本轮没有返回可展示的文字。</p>}
      remarkPlugins={[createCitationRemarkPlugin(citations)]}
    />
  );
}
