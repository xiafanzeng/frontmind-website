import { describe, expect, it, vi } from "vitest";

import {
  canonicalTrustedTaskJson,
  parseTrustedTaskJsonCandidate,
  resolveTrustedTaskJsonOutput,
  trustedTaskJsonObjectCandidates,
  TRUSTED_TASK_JSON_MAX_TOTAL_BYTES,
  TrustedTaskJsonOutputError,
} from "./trusted-task-json-output";

const broker = { downloadArtifact: vi.fn() };

describe("v2 typed task result boundary", () => {
  it("returns the already-typed structured result after business validation", async () => {
    await expect(
      resolveTrustedTaskJsonOutput(
        broker,
        {
          result: {
            structuredResult: { schemaVersion: 2, value: "ok" },
            artifacts: [],
          },
        },
        {
          inspectParsed: (value) => ({ success: true, data: value }),
        },
      ),
    ).resolves.toEqual({ schemaVersion: 2, value: "ok" });
    expect(broker.downloadArtifact).not.toHaveBeenCalled();
  });

  it("does not parse safe events, raw text, files, or Provider-shaped output", async () => {
    await expect(
      resolveTrustedTaskJsonOutput(
        broker,
        {
          safeEvents: [{ message: '{"value":"unsafe"}' }],
          output: { output_text: '{"value":"unsafe"}' },
          result: { artifacts: [{ artifactId: "json-artifact" }] },
        },
        { inspectParsed: () => ({ success: true, data: "unexpected" }) },
      ),
    ).rejects.toMatchObject({
      name: "TrustedTaskJsonOutputError",
      code: "INVALID_JSON",
      diagnostics: {
        channel: "structured_result",
        fileCandidateCount: 0,
      },
    });
    expect(broker.downloadArtifact).not.toHaveBeenCalled();
  });

  it("preserves schema and scope failures without exposing raw payloads", async () => {
    const validation = [{ path: ["schemaVersion"], message: "invalid" }];
    const promise = resolveTrustedTaskJsonOutput(
      broker,
      { result: { structuredResult: { schemaVersion: 1 }, artifacts: [] } },
      {
        inspectParsed: () => ({
          success: false,
          code: "SCHEMA_MISMATCH",
          validation,
        }),
      },
    );
    await expect(promise).rejects.toBeInstanceOf(TrustedTaskJsonOutputError);
    await expect(promise).rejects.toMatchObject({
      code: "SCHEMA_MISMATCH",
      validation,
    });
  });

  it("enforces the bounded structured-result size", async () => {
    await expect(
      resolveTrustedTaskJsonOutput(
        broker,
        {
          result: {
            structuredResult: { value: "x".repeat(TRUSTED_TASK_JSON_MAX_TOTAL_BYTES) },
            artifacts: [],
          },
        },
        { inspectParsed: (value) => ({ success: true, data: value }) },
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("keeps the local marker parser strict and deterministic", () => {
    expect(parseTrustedTaskJsonCandidate('{"b":1,"a":2}')).toEqual({
      b: 1,
      a: 2,
    });
    expect(canonicalTrustedTaskJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(trustedTaskJsonObjectCandidates('```json\n{"a":1}\n```')).toEqual([]);
    expect(parseTrustedTaskJsonCandidate('{"a":"unterminated}')).toBeUndefined();
  });
});
