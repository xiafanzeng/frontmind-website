import { describe, expect, it } from "vitest";

import { secureCommunityArticleLinks } from "./secureArticleLinks";

describe("secureCommunityArticleLinks", () => {
  it("forces external web links into isolated unnamed tabs", () => {
    const html = secureCommunityArticleLinks(
      '<p><a href="https://research.example.org/paper" target="evidence" rel="nofollow opener">论文</a></p>',
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain('target="evidence"');
    expect(html).not.toMatch(/\bopener\b(?! noreferrer)/);
  });

  it("removes named targets from internal and fragment links", () => {
    const html = secureCommunityArticleLinks(
      '<a href="/research" target="research-window" target="second-window">研究</a><a href="#method" target="_blank">方法</a>',
    );

    expect(html).toBe('<a href="/research">研究</a><a href="#method">方法</a>');
  });

  it("adds missing safety tokens without duplicating existing ones", () => {
    const html = secureCommunityArticleLinks(
      '<a href="//example.org/source" target="_blank" rel="noreferrer">来源</a>',
    );

    expect(html).toBe(
      '<a href="//example.org/source" target="_blank" rel="noopener noreferrer">来源</a>',
    );
  });
});
