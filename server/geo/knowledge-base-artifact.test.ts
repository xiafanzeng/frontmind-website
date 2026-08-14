import { describe, expect, it } from "vitest";

import {
  collectKnowledgeArchiveDescriptors,
  isExplicitKnowledgeCandidateDescriptor,
  knowledgeArchiveDescriptorHash,
  rankedKnowledgeArchiveDescriptors,
  WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME,
} from "./knowledge-base-artifact";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function artifact(
  artifactId: string,
  filename = WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME,
  sha256 = SHA_A,
) {
  return {
    artifactId,
    filename,
    mimeType: "application/zip",
    bytes: 1024,
    sha256,
  };
}

describe("Website v2 local knowledge artifact contract", () => {
  it("accepts only complete local ZIP artifact metadata", () => {
    expect(collectKnowledgeArchiveDescriptors([artifact("artifact-1")])).toEqual([
      {
        outputItemId: "artifact:0:artifact-1",
        artifactId: "artifact-1",
        filename: WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME,
        mimeType: "application/zip",
        bytes: 1024,
        sha256: SHA_A,
      },
    ]);
  });

  it.each([
    { ...artifact("artifact-1"), artifactId: " artifact-1" },
    { ...artifact("artifact-1"), filename: "candidate.txt", mimeType: "text/plain" },
    { ...artifact("artifact-1"), bytes: 0 },
    { ...artifact("artifact-1"), sha256: "not-a-hash" },
    { fileId: "provider-file", filename: "candidate.zip" },
    { url: "https://provider.example/signed", filename: "candidate.zip" },
  ])("rejects incomplete or Provider-shaped descriptor %#", (value) => {
    expect(collectKnowledgeArchiveDescriptors([value])).toEqual([]);
  });

  it("ranks the fixed candidate name before generic ZIPs and bounds inspection", () => {
    const ranked = rankedKnowledgeArchiveDescriptors([
      artifact("generic-1", "generic-1.zip"),
      artifact("named", WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME),
      artifact("generic-2", "generic-2.zip"),
      artifact("generic-3", "generic-3.zip"),
    ]);
    expect(ranked.map((entry) => entry.artifactId)).toEqual([
      "named",
      "generic-1",
      "generic-2",
    ]);
    expect(isExplicitKnowledgeCandidateDescriptor(ranked[0]!)).toBe(true);
    expect(isExplicitKnowledgeCandidateDescriptor(ranked[1]!)).toBe(false);
  });

  it("binds the canonical descriptor hash to local identity and content", () => {
    const first = collectKnowledgeArchiveDescriptors([artifact("artifact-1")])[0]!;
    const replay = collectKnowledgeArchiveDescriptors([artifact("artifact-1")])[0]!;
    const changed = collectKnowledgeArchiveDescriptors([
      artifact("artifact-1", WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME, SHA_B),
    ])[0]!;
    expect(knowledgeArchiveDescriptorHash(first)).toBe(
      knowledgeArchiveDescriptorHash(replay),
    );
    expect(knowledgeArchiveDescriptorHash(changed)).not.toBe(
      knowledgeArchiveDescriptorHash(first),
    );
  });
});
