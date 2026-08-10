const attributeValuePattern = (name: string, global = false) =>
  new RegExp(
    `\\s+${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    global ? "gi" : "i",
  );

function readAttribute(attributes: string, name: string) {
  const match = attributes.match(attributeValuePattern(name));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function removeAttribute(attributes: string, name: string) {
  return attributes.replace(attributeValuePattern(name, true), "");
}

function isExternalWebLink(href: string) {
  return /^(?:https?:)?\/\//i.test(href.trim());
}

/**
 * Community posts are imported HTML. Keep link-window policy at the render
 * boundary so a future content import cannot introduce a reusable named
 * window. External web links get a fresh, isolated tab; internal links stay
 * in the current tab.
 */
export function secureCommunityArticleLinks(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (tag, attributes: string) => {
    const href = readAttribute(attributes, "href");
    if (!href) return tag;

    const withoutTarget = removeAttribute(attributes, "target");
    if (!isExternalWebLink(href)) {
      return `<a${withoutTarget}>`;
    }

    const existingRel = readAttribute(withoutTarget, "rel") ?? "";
    const relTokens = existingRel
      .split(/\s+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .filter(
        (token) =>
          token !== "opener" && token !== "noopener" && token !== "noreferrer",
      );
    const safeRel = Array.from(
      new Set(["noopener", "noreferrer", ...relTokens]),
    ).join(" ");
    const safeAttributes = removeAttribute(withoutTarget, "rel");

    return `<a${safeAttributes} target="_blank" rel="${safeRel}">`;
  });
}
