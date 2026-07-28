import { describe, expect, it } from "vitest";

import {
  collectKnowledgeArchiveDescriptors,
  knowledgeArchiveDescriptorHash,
} from "./knowledge-base-artifact";

describe("website/Agent knowledge artifact contract fixture", () => {
  it("uses the Agent output item identity and canonical descriptor hash", () => {
    const descriptors = collectKnowledgeArchiveDescriptors([
      {
        id: "message-1",
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "知识库已生成" },
          {
            type: "output_file",
            file_id: "file-kb-1",
            filename: "cuhksz_knowledge_base.zip",
            mime_type: "application/zip",
          },
        ],
      },
    ]);

    expect(descriptors).toEqual([
      {
        outputItemId: "message-1:content:1",
        fileId: "file-kb-1",
        url: undefined,
        filename: "cuhksz_knowledge_base.zip",
        mimeType: "application/zip",
      },
    ]);
    expect(knowledgeArchiveDescriptorHash(descriptors[0]!)).toBe(
      "d56e642c0374e5a9abcb96ff4b97b79626ea52abc8bd790d385dd034938451e2",
    );
  });

  it("uses output:index and a URL hash when a typed file has no id", () => {
    const descriptors = collectKnowledgeArchiveDescriptors([
      {
        type: "output_file",
        filename: "kb.zip",
        mimeType: "application/zip",
        url: "https://files.example/kb.zip?sig=one-time",
      },
    ]);

    expect(descriptors[0]).toMatchObject({
      outputItemId: "output:0",
      filename: "kb.zip",
    });
    expect(knowledgeArchiveDescriptorHash(descriptors[0]!)).toBe(
      "22d59039bb6352ebff2dee5860101b9bcc0d5729b3e03a90339bc56455089d05",
    );
  });

  it("does not trust file-shaped metadata or user messages", () => {
    expect(
      collectKnowledgeArchiveDescriptors([
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "output_file",
              file_id: "untrusted-file",
              filename: "untrusted.zip",
            },
          ],
        },
        {
          type: "reasoning",
          metadata: {
            type: "output_file",
            file_id: "nested-file",
            filename: "nested.zip",
          },
        },
      ]),
    ).toEqual([]);
  });
});
