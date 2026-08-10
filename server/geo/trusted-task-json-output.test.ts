import { describe, expect, it } from "vitest";
import {
  parseTrustedTaskJsonCandidate,
  resolveTrustedTaskJsonOutput,
  trustedTaskJsonObjectCandidates,
  TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS,
  TRUSTED_TASK_JSON_MAX_TOTAL_BYTES,
  TrustedTaskJsonOutputError,
  type TrustedTaskJsonCandidateInspection,
} from "./trusted-task-json-output";
import { trustedAssistantOutputFiles } from "./trusted-task-output";

type TestOutput = { valid: true; id?: number };

function inspectTestOutput(
  value: unknown,
): TrustedTaskJsonCandidateInspection<TestOutput> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).valid === true
  ) {
    return { success: true, data: value as TestOutput };
  }
  return { success: false, code: "SCHEMA_MISMATCH" };
}

describe("trusted task JSON output files", () => {
  it("extracts wrapped objects and repairs only a bounded number of in-string quotes", () => {
    const wrapped =
      '评估完成。```json\n{"valid":true,"summary":"说明"结论":结果为"可执行",但需复测。"}\n```';
    const candidates = trustedTaskJsonObjectCandidates(wrapped);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(candidates.map(parseTrustedTaskJsonCandidate)).toContainEqual({
      valid: true,
      summary: '说明"结论":结果为"可执行",但需复测。',
    });

    const excessive = `{"valid":true,"summary":"${'"引用"'.repeat(
      TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS / 2 + 1,
    )}"}`;
    expect(parseTrustedTaskJsonCandidate(excessive)).toBeUndefined();
  });

  it("collects only located typed files at the trusted assistant boundary", () => {
    const files = trustedAssistantOutputFiles({
      metadata: {
        type: "output_file",
        file_id: "metadata-file",
        filename: "metadata.json",
      },
      output: [
        {
          role: "user",
          type: "message",
          content: [
            {
              type: "output_file",
              file_id: "user-file",
              filename: "user.json",
            },
          ],
        },
        {
          role: "tool",
          type: "output_file",
          file_id: "tool-file",
          filename: "tool.json",
        },
        {
          role: "assistant",
          type: "reasoning",
          content: [
            {
              type: "output_file",
              file_id: "reasoning-file",
              filename: "reasoning.json",
            },
          ],
        },
        {
          type: "file",
          file_id: "untyped-file",
          filename: "untyped.json",
        },
        {
          type: "output_file",
          file_id: "top-level",
          filename: "top-level.json",
        },
        {
          type: "output_file",
          file_id: "merged-location",
          filename: "merged.json",
        },
        {
          type: "output_file",
          file_id: "merged-location",
          file_url: "https://agent.example.test/merged",
          filename: "merged.json",
        },
        {
          type: "output_file",
          file_id: "x".repeat(256),
          filename: "overlong-id.json",
        },
        {
          type: "output_file",
          file_url: "x".repeat(4_097),
          filename: "overlong-url.json",
        },
        {
          role: "assistant",
          type: "message",
          content: [
            {
              type: "output_file",
              file_url: "https://agent.example.test/nested",
              filename: "nested.json",
            },
            {
              type: "output_file",
              filename: "missing-location.json",
            },
          ],
        },
      ],
    });

    expect(files).toEqual([
      {
        fileId: "top-level",
        url: undefined,
        filename: "top-level.json",
        mimeType: "application/json",
      },
      {
        fileId: "merged-location",
        url: "https://agent.example.test/merged",
        filename: "merged.json",
        mimeType: "application/json",
      },
      {
        fileId: undefined,
        url: "https://agent.example.test/nested",
        filename: "nested.json",
        mimeType: "application/json",
      },
    ]);
  });

  it("inspects no more than three file candidates", async () => {
    const downloads: string[] = [];
    const task = {
      output: [1, 2, 3, 4].map((id) => ({
        type: "output_file",
        file_id: `file-${id}`,
        filename: `candidate-${id}.json`,
      })),
    };

    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          return new Response("{}");
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      task,
      {
        inspectInline: () => undefined,
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
    expect(downloads).toEqual(["file-1", "file-2", "file-3"]);
  });

  it("accepts one leading UTF-8 BOM and returns the first complete passing file", async () => {
    const downloads: string[] = [];
    const result = await resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          if (fileId === "invalid-utf8") {
            return new Response(Buffer.from([0xff, 0xfe, 0xfd]));
          }
          return new Response(
            Buffer.concat([
              Buffer.from([0xef, 0xbb, 0xbf]),
              Buffer.from('{"valid":true,"id":2}', "utf8"),
            ]),
          );
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          {
            type: "output_file",
            file_id: "invalid-utf8",
            filename: "first.json",
          },
          {
            type: "output_file",
            file_id: "valid-bom",
            filename: "second.json",
          },
        ],
      },
      {
        inspectInline: () => undefined,
        inspectParsed: inspectTestOutput,
      },
    );

    expect(downloads).toEqual(["invalid-utf8", "valid-bom"]);
    expect(result).toEqual({ valid: true, id: 2 });
  });

  it("recovers bounded unescaped quotes from a complete trusted JSON file", async () => {
    const result = await resolveTrustedTaskJsonOutput(
      {
        async downloadFile() {
          return new Response(
            '{"valid":true,"summary":"结果为"可执行但需复测"。"}',
          );
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          {
            type: "output_file",
            file_id: "recoverable",
            filename: "result.json",
          },
        ],
      },
      {
        inspectInline: () => undefined,
        inspectParsed: (value) =>
          value &&
          typeof value === "object" &&
          (value as Record<string, unknown>).valid === true
            ? { success: true, data: value as TestOutput }
            : { success: false, code: "SCHEMA_MISMATCH" },
      },
    );

    expect(result).toMatchObject({ valid: true });
  });

  it("does not inspect inline output before a preferred valid file", async () => {
    let inspectedInline = false;
    const result = await resolveTrustedTaskJsonOutput(
      {
        async downloadFile() {
          return new Response('{"valid":true,"id":7}');
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          { type: "output_text", text: "x".repeat(1024 * 1024) },
          {
            type: "output_file",
            file_id: "preferred",
            filename: "preferred.json",
          },
        ],
      },
      {
        preferredChannel: "output_file",
        inspectInline: () => {
          inspectedInline = true;
          throw new Error("preferred file should resolve first");
        },
        inspectParsed: inspectTestOutput,
      },
    );

    expect(result).toEqual({ valid: true, id: 7 });
    expect(inspectedInline).toBe(false);
  });

  it("shares the three-candidate budget across inline and file output", async () => {
    const downloads: string[] = [];
    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          return new Response("{}");
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [1, 2, 3].map((id) => ({
          type: "output_file",
          file_id: `file-${id}`,
          filename: `candidate-${id}.json`,
        })),
      },
      {
        inspectInline: (_task, context) => {
          expect(context.takeCandidate('{"valid":false,"id":1}')).toBe(true);
          expect(context.takeCandidate('{"valid":false,"id":2}')).toBe(true);
          return { success: false, code: "SCHEMA_MISMATCH" };
        },
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
    expect(downloads).toEqual(["file-1"]);
  });

  it("falls back from file_id to the provider URL for the same descriptor", async () => {
    const urlDownloads: string[] = [];
    const result = await resolveTrustedTaskJsonOutput(
      {
        async downloadFile() {
          let delivered = false;
          return new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                if (!delivered) {
                  delivered = true;
                  controller.enqueue(new TextEncoder().encode('{"valid":'));
                  return;
                }
                controller.error(new Error("connection reset"));
              },
            }),
          );
        },
        async downloadTaskOutput(taskId, url, filename) {
          urlDownloads.push(`${taskId}|${url}|${filename}`);
          return new Response('{"valid":true}');
        },
      },
      {
        id: "task-from-envelope",
        output: [
          {
            type: "output_file",
            file_id: "result-file",
            filename: "result.json",
          },
          {
            type: "output_file",
            file_id: "result-file",
            file_url: "https://agent.example.test/result",
            filename: "result.json",
          },
        ],
      },
      {
        inspectInline: () => undefined,
        inspectParsed: inspectTestOutput,
      },
    );

    expect(result.valid).toBe(true);
    expect(urlDownloads).toEqual([
      "task-from-envelope|https://agent.example.test/result|result.json",
    ]);
  });

  it("reports an unreadable file instead of attributing the failure to inline schema", async () => {
    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile() {
          throw new Error("file endpoint unavailable");
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback unavailable");
        },
      },
      {
        output: [
          { type: "output_text", text: '{"valid":false}' },
          {
            type: "output_file",
            file_id: "unavailable",
            filename: "result.json",
          },
        ],
      },
      {
        inspectInline: () => ({
          success: false,
          code: "SCHEMA_MISMATCH",
        }),
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toMatchObject({
      code: "OUTPUT_FILE_UNAVAILABLE",
      diagnostics: {
        channel: "output_file",
        byteCount: 0,
        fileCandidateCount: 1,
      },
    });
  });

  it("classifies an unreadable output file above the budget as unavailable", async () => {
    const downloads: string[] = [];
    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          return new Response("{}", {
            headers: {
              "content-length": String(TRUSTED_TASK_JSON_MAX_TOTAL_BYTES + 1),
            },
          });
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          { type: "output_text", text: "结果已生成，请查看附件。" },
          {
            type: "output_file",
            file_id: "oversized",
            filename: "oversized.json",
          },
          {
            type: "output_file",
            file_id: "must-not-download",
            filename: "later.json",
          },
        ],
      },
      {
        inspectInline: () => ({ success: false, code: "INVALID_JSON" }),
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toEqual(
      expect.objectContaining<Partial<TrustedTaskJsonOutputError>>({
        name: "TrustedTaskJsonOutputError",
        code: "OUTPUT_FILE_UNAVAILABLE",
        diagnostics: {
          channel: "output_file",
          byteCount: TRUSTED_TASK_JSON_MAX_TOTAL_BYTES,
          fileCandidateCount: 2,
        },
      }),
    );
    expect(downloads).toEqual(["oversized"]);
  });

  it("enforces the four-MiB budget cumulatively across candidates", async () => {
    const downloads: string[] = [];
    const firstBytes = Buffer.alloc(3 * 1024 * 1024, 0x20);
    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          if (fileId === "first") return new Response(firstBytes);
          return new Response('{"valid":true}', {
            headers: { "content-length": String(2 * 1024 * 1024) },
          });
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          {
            type: "output_file",
            file_id: "first",
            filename: "first.json",
          },
          {
            type: "output_file",
            file_id: "second",
            filename: "second.json",
          },
          {
            type: "output_file",
            file_id: "third",
            filename: "third.json",
          },
        ],
      },
      {
        inspectInline: () => undefined,
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toMatchObject({ code: "INVALID_JSON" });
    expect(downloads).toEqual(["first", "second"]);
  });

  it("charges bytes delivered before a non-limit stream failure to the shared budget", async () => {
    const downloads: string[] = [];
    const interruptedBody = () => {
      let delivered = false;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!delivered) {
            delivered = true;
            controller.enqueue(new Uint8Array(3 * 1024 * 1024));
            return;
          }
          controller.error(new Error("connection reset"));
        },
      });
    };
    const promise = resolveTrustedTaskJsonOutput(
      {
        async downloadFile(fileId) {
          downloads.push(fileId);
          if (fileId === "third") return new Response('{"valid":true}');
          return new Response(interruptedBody());
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: ["first", "second", "third"].map((id) => ({
          type: "output_file",
          file_id: id,
          filename: `${id}.json`,
        })),
      },
      {
        inspectInline: () => undefined,
        inspectParsed: inspectTestOutput,
      },
    );

    await expect(promise).rejects.toMatchObject({
      code: "OUTPUT_FILE_UNAVAILABLE",
    });
    expect(downloads).toEqual(["first", "second"]);
  });
});
