import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGeoCustomQuestion,
  persistGeoCustomQuestionResultAndAcknowledge,
  readPendingGeoCustomQuestionValidation,
  resumeGeoCustomQuestionValidation,
} from "./api";
import type { GeoProject, GeoQuestion } from "./types";

const project: GeoProject = {
  id: "project-1",
  remoteToken: "signed-project-token",
  title: "示例企业",
  input: "示例企业",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  stage: "question_recommendation",
  status: "ready",
  progress: 100,
  files: [],
  questions: [],
  selectedPlatformIds: [],
};

let localStorageValues: Map<string, string>;

beforeEach(() => {
  localStorageValues = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageValues.set(key, value),
    removeItem: (key: string) => localStorageValues.delete(key),
    clear: () => localStorageValues.clear(),
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notFoundResponse() {
  return jsonResponse(
    {
      ok: false,
      error: {
        code: "CUSTOM_QUESTION_VALIDATION_NOT_FOUND",
        message: "自定义问题验证请求不存在",
      },
    },
    404,
  );
}

function completedPayload(
  clientRequestId: string,
  question: GeoQuestion,
  projectToken = "rotated-project-token",
) {
  return {
    validation: {
      schemaVersion: 1,
      clientRequestId,
      question: question.question,
      state: "completed",
      acknowledgement: "required",
      completionMode: "reservation",
    },
    projectToken,
    question,
    project: {
      id: project.id,
      companyName: project.title,
      status: "completed",
      questions: [question],
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("custom-question API recovery", () => {
  it("keeps a waiting validation pending and polls the same UUID", async () => {
    vi.useFakeTimers();
    const clientRequestId = "44444444-4444-4444-8444-444444444444";
    const question: GeoQuestion = {
      id: "custom-product-question",
      category: "product_scenario",
      question: "示例企业的知识库产品适合哪些业务场景？",
      selectable: true,
    };
    const pending = {
      validation: {
        clientRequestId,
        question: question.question,
        state: "submitted",
        nextPollMs: 800,
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(pending, 202))
      .mockResolvedValueOnce(jsonResponse(pending, 202))
      .mockResolvedValueOnce(
        jsonResponse(completedPayload(clientRequestId, question)),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = createGeoCustomQuestion(project, question.question, {
      clientRequestId,
      pollIntervalMs: 1,
    });
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({
      clientRequestId,
      question: { id: question.id },
      project: { remoteToken: "rotated-project-token" },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/geo/projects/signed-project-token/questions/custom",
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
    ]);
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(clientRequestId);
  });

  it("probes active after a retired UUID 404 and clears only that UUID when both records are absent", async () => {
    const clientRequestId = "55555555-5555-4555-8555-555555555555";
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId,
        question: "示例企业的知识库如何部署？",
        updatedAt: new Date().toISOString(),
      }),
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(notFoundResponse());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resumeGeoCustomQuestionValidation(project),
    ).rejects.toMatchObject({
      status: 410,
      code: "CUSTOM_QUESTION_VALIDATION_EXPIRED",
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/geo/projects/signed-project-token/questions/custom/${clientRequestId}`,
      "/api/geo/projects/signed-project-token/questions/custom/active",
    ]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });

  it("adopts the authoritative active UUID and ACKs only after project persistence", async () => {
    const retiredClientRequestId = "66666666-6666-4666-8666-666666666666";
    const activeClientRequestId = "77777777-7777-4777-8777-777777777777";
    const question: GeoQuestion = {
      id: "custom-active-product-question",
      category: "product_scenario",
      question: "示例企业的知识库产品支持哪些交付方式？",
      selectable: true,
    };
    globalThis.localStorage.setItem(
      `frontmind-geo-custom-question-validation:${project.id}`,
      JSON.stringify({
        projectId: project.id,
        clientRequestId: retiredClientRequestId,
        question: "退役问题",
        updatedAt: new Date().toISOString(),
      }),
    );
    const events: string[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(
        jsonResponse(completedPayload(activeClientRequestId, question)),
      )
      .mockImplementationOnce(async () => {
        events.push("ack");
        return jsonResponse({
          ok: true,
          validation: {
            clientRequestId: activeClientRequestId,
            state: "completed",
            acknowledged: true,
          },
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const recovered = await resumeGeoCustomQuestionValidation(project);
    expect(recovered).toMatchObject({
      clientRequestId: activeClientRequestId,
      question: { id: question.id },
    });
    expect(
      readPendingGeoCustomQuestionValidation(project.id)?.clientRequestId,
    ).toBe(activeClientRequestId);

    await persistGeoCustomQuestionResultAndAcknowledge(recovered!, async () => {
      events.push("persist");
    });
    expect(events).toEqual(["persist", "ack"]);
    expect(readPendingGeoCustomQuestionValidation(project.id)).toBeUndefined();
  });
});
