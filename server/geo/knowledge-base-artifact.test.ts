import { describe, expect, it } from "vitest";

import {
  collectKnowledgeArchiveDescriptors,
  knowledgeArchiveDescriptorHash,
  knowledgeArchiveFileIdFromUrl,
  rankedKnowledgeArchiveDescriptors,
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

  it.each(["user", "tool", "system", "developer"])(
    "does not collect a top-level %s resource",
    (role) => {
      expect(
        collectKnowledgeArchiveDescriptors([
          {
            id: `${role}-file`,
            type: "output_file",
            role,
            file_id: `file-${role}`,
            filename: "website-lead-candidate-v1.zip",
            mime_type: "application/zip",
          },
        ]),
      ).toEqual([]);
    },
  );

  it("uses a bounded deterministic child identity without changing the parent identity", () => {
    const parentId = "m".repeat(255);
    const output = [
      {
        id: parentId,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_file",
            file_id: "file-long-parent",
            filename: "kb.zip",
            mime_type: "application/zip",
          },
        ],
      },
    ];

    const first = collectKnowledgeArchiveDescriptors(output);
    const second = collectKnowledgeArchiveDescriptors(output);

    expect(first).toHaveLength(1);
    expect(first).toEqual(second);
    expect(first[0]?.outputItemId).toMatch(/^content:[a-f0-9]{64}$/u);
    expect(first[0]?.outputItemId.length).toBeLessThanOrEqual(255);
    expect(parentId).toHaveLength(255);
  });

  it.each([
    {
      id: " message-1",
      type: "output_file",
      file_id: "file-1",
      filename: "kb.zip",
    },
    {
      id: "m".repeat(256),
      type: "output_file",
      file_id: "file-1",
      filename: "kb.zip",
    },
    {
      type: "output_file",
      file_id: " file-1",
      filename: "kb.zip",
    },
    {
      type: "output_file",
      file_id: "f".repeat(256),
      filename: "kb.zip",
    },
    {
      type: "output_file",
      file_url: " https://files.example/kb.zip",
      filename: "kb.zip",
    },
    {
      type: "output_file",
      file_url: `https://files.example/${"x".repeat(8_193)}`,
      filename: "kb.zip",
    },
  ])("rejects lossy output/file/url identity normalization", (item) => {
    expect(collectKnowledgeArchiveDescriptors([item])).toEqual([]);
  });

  it("rejects conflicting aliases and an explicit file ID that conflicts with its URL", () => {
    expect(
      collectKnowledgeArchiveDescriptors([
        {
          type: "output_file",
          file_id: "file-one",
          fileId: "file-two",
          filename: "kb.zip",
        },
        {
          type: "output_file",
          file_id: "file-one",
          url: "https://api.example/v1/files/file-two/content",
          filename: "kb.zip",
        },
        {
          type: "output_file",
          file_url: "https://files.example/one.zip",
          fileUrl: "https://files.example/two.zip",
          filename: "kb.zip",
        },
      ]),
    ).toEqual([]);
  });

  it("preserves matching aliases and a valid typed file identity exactly", () => {
    expect(
      collectKnowledgeArchiveDescriptors([
        {
          id: "output-file-1",
          type: "output_file",
          file_id: "file-one",
          fileId: "file-one",
          url: "https://api.example/v1/files/file-one/content?download=1",
          filename: "kb.zip",
        },
      ]),
    ).toEqual([
      {
        outputItemId: "output-file-1",
        fileId: "file-one",
        url: "https://api.example/v1/files/file-one/content?download=1",
        filename: "kb.zip",
        mimeType: "application/zip",
      },
    ]);
  });

  it("keeps empty optional aliases as missing instead of normalizing an identity", () => {
    expect(
      collectKnowledgeArchiveDescriptors([
        {
          id: "",
          type: "output_file",
          file_id: "",
          fileId: "file-one",
          url: "",
          filename: "kb.zip",
        },
      ]),
    ).toEqual([
      {
        outputItemId: "output:0",
        fileId: "file-one",
        url: undefined,
        filename: "kb.zip",
        mimeType: "application/zip",
      },
    ]);
  });

  it("rejects malformed or lossy file IDs embedded in file URLs", () => {
    expect(
      knowledgeArchiveFileIdFromUrl(
        "https://api.example/v1/files/%20file-one/content",
      ),
    ).toBeUndefined();
    expect(
      knowledgeArchiveFileIdFromUrl(
        `https://api.example/v1/files/${"f".repeat(256)}/content`,
      ),
    ).toBeUndefined();
    expect(
      knowledgeArchiveFileIdFromUrl(
        "https://api.example/v1/files/%E0%A4%A/content",
      ),
    ).toBeUndefined();
    expect(
      knowledgeArchiveFileIdFromUrl(
        "https://api.example/v1/files/file-one/content",
      ),
    ).toBe("file-one");
  });

  it("ranks the fixed candidate name ahead of other assistant ZIP files", () => {
    const descriptors = rankedKnowledgeArchiveDescriptors([
      {
        type: "output_file",
        file_id: "generic",
        filename: "research.zip",
      },
      {
        type: "output_file",
        file_id: "named",
        filename: "knowledge-base-candidate-recovered.zip",
      },
      {
        type: "output_file",
        file_id: "exact",
        filename: "website-lead-candidate-v1.zip",
      },
      {
        type: "output_file",
        file_id: "fourth",
        filename: "other.zip",
      },
    ]);

    expect(descriptors.map((descriptor) => descriptor.fileId)).toEqual([
      "exact",
      "named",
      "generic",
    ]);
  });
});
