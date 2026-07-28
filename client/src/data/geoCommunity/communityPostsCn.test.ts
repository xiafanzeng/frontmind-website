import { describe, expect, it } from "vitest";
import { communityPostsCn } from "./communityPostsCn";
import { sourceBlogIndex } from "./sourceBlogIndex";

function slugForSourcePath(path: string) {
  return path.split("/").filter(Boolean).at(-1);
}

describe("localized GEO community posts", () => {
  it("keeps every indexed source post backed by non-empty localized content", () => {
    const postsBySlug = new Map(
      communityPostsCn.map((post) => [post.slug, post]),
    );

    expect(postsBySlug.size).toBe(communityPostsCn.length);
    expect(communityPostsCn).toHaveLength(sourceBlogIndex.counts.all);

    for (const sourcePost of sourceBlogIndex.posts) {
      const post = postsBySlug.get(slugForSourcePath(sourcePost.path) || "");
      expect(post, sourcePost.path).toBeDefined();
      expect(post?.titleCn.trim(), sourcePost.path).not.toBe("");
      expect(post?.metaCn.trim(), sourcePost.path).not.toBe("");
      expect(post?.htmlCn.trim().length, sourcePost.path).toBeGreaterThan(500);
    }
  });

  it("ships the newest indexed article as a complete rendered-content record", () => {
    const post = communityPostsCn.find(
      (item) => item.slug === "world-first-ai-scientist-geo-research",
    );

    expect(post?.titleCn).toBe("打造全球首个 GEO 研究 AI 科学家");
    expect(post?.tldrCn.length).toBeGreaterThan(0);
    expect(post?.htmlCn).toContain("GEO 研究科学家");
  });
});
