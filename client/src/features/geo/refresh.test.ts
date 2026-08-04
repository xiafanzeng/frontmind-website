import { describe, expect, it, vi } from "vitest";
import {
  canRunGeoAutoRefresh,
  geoAutoRefreshDelayLabel,
  geoAutoRefreshDelayMs,
  GEO_AUTO_REFRESH_INTERVAL_MS,
  refreshGeoProjectOnce,
  shouldAutoRefreshGeoProject,
} from "./refresh";
import type { GeoProject } from "./types";

function project(overrides: Partial<GeoProject> = {}): GeoProject {
  return {
    id: "project-1",
    remoteToken: "remote-token",
    title: "FrontMind",
    input: "https://frontmind.cn",
    createdAt: "2026-07-22T08:00:00.000Z",
    updatedAt: "2026-07-22T08:00:00.000Z",
    stage: "current_assessment",
    status: "ready",
    progress: 100,
    files: [],
    knowledgeBase: {
      metrics: [],
      sections: [],
      sources: [],
      assets: [],
    },
    questions: [
      {
        id: "question-1",
        category: "reputation",
        question: "FrontMind 是一家什么样的公司？",
        selectable: true,
      },
    ],
    selectedQuestionId: "question-1",
    selectedPlatformIds: ["doubao"],
    ...overrides,
  };
}

describe("GEO project refresh policy", () => {
  it("uses a calm 30 second automatic refresh interval", () => {
    expect(GEO_AUTO_REFRESH_INTERVAL_MS).toBe(30_000);
  });

  it.each(["activation_pending", "provisioning"] as const)(
    "keeps polling a v2 service after payment while activation is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            serviceActivation: {
              status,
              provisioningVersion: 2,
              questionId: "question-1",
              category: "reputation",
              amountFen: 200_000,
              billingMonths: 1,
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each(["activation_pending", "provisioning"] as const)(
    "keeps polling a manual service after payment while activation is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            serviceActivation: {
              status,
              contractWorkflowReference: "manual-order-001",
              questionId: "question-1",
              category: "reputation",
              amountFen: 200_000,
              billingMonths: 1,
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each(["contract_preparing", "signature_required"] as const)(
    "does not poll a manual contract while activation is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            serviceActivation: {
              status,
              contractWorkflowReference: "manual-order-001",
              questionId: "question-1",
              category: "reputation",
              amountFen: 200_000,
              billingMonths: 1,
            },
          }),
        ),
      ).toBe(false);
    },
  );

  it("does not poll a paid legacy order that is still marked signature required", () => {
    expect(
      shouldAutoRefreshGeoProject(
        project({
          serviceActivation: {
            status: "signature_required",
            contractWorkflowReference: "manual-order-001",
            questionId: "question-1",
            category: "reputation",
            amountFen: 200_000,
            billingMonths: 1,
            paidAt: "2026-07-28T01:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
  });

  it.each(["submitted", "capturing"] as const)(
    "refreshes while monitoring is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            monitoring: {
              runId: "run-1",
              status,
              platforms: ["doubao"],
              expectedRecords: 5,
              completedRecords: 0,
              failedRecords: 0,
              answers: [],
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it("waits for the provider nextPollAt instead of issuing empty 30-second reads", () => {
    const now = Date.parse("2026-07-28T01:00:00.000Z");
    const monitored = project({
      monitoring: {
        runId: "run-1",
        status: "capturing",
        platforms: ["doubao"],
        expectedRecords: 5,
        completedRecords: 0,
        failedRecords: 0,
        answers: [],
        nextPollAt: "2026-07-28T01:05:00.000Z",
      },
    });

    expect(geoAutoRefreshDelayMs(monitored, now)).toBe(300_250);
    expect(
      geoAutoRefreshDelayMs(monitored, Date.parse("2026-07-28T01:06:00.000Z")),
    ).toBe(GEO_AUTO_REFRESH_INTERVAL_MS);
    expect(geoAutoRefreshDelayLabel(monitored, now)).toBe("约 5 分钟");
    expect(
      geoAutoRefreshDelayLabel(
        monitored,
        Date.parse("2026-07-28T01:06:00.000Z"),
      ),
    ).toBe("30 秒");
  });

  it.each(["completed", "failed", "partial_review"] as const)(
    "stops monitoring refresh when status is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            monitoring: {
              runId: "run-1",
              status,
              platforms: ["doubao"],
              expectedRecords: 5,
              completedRecords: 5,
              failedRecords: 0,
              answers: [],
            },
          }),
        ),
      ).toBe(false);
    },
  );

  it.each(["queued", "running"] as const)(
    "refreshes while assessment is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            assessment: { status, dimensions: [], comparisons: [] },
          }),
        ),
      ).toBe(true);
    },
  );

  it("keeps refreshing an active assessment after monitoring completes", () => {
    expect(
      shouldAutoRefreshGeoProject(
        project({
          monitoring: {
            runId: "run-1",
            status: "completed",
            platforms: ["doubao"],
            expectedRecords: 5,
            completedRecords: 5,
            failedRecords: 0,
            answers: [],
          },
          assessment: {
            status: "running",
            dimensions: [],
            comparisons: [],
          },
        }),
      ),
    ).toBe(true);
  });

  it.each(["ready", "failed"] as const)(
    "stops assessment refresh when status is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            assessment: { status, dimensions: [], comparisons: [] },
          }),
        ),
      ).toBe(false);
    },
  );

  it.each(["queued", "running"] as const)(
    "keeps refreshing while the optimization forecast is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            assessment: { status: "ready", dimensions: [], comparisons: [] },
            optimizationForecast: {
              status,
              dimensions: [],
              assumptions: [],
              roadmap: [],
            },
          }),
        ),
      ).toBe(true);
    },
  );

  it.each(["ready", "failed"] as const)(
    "stops refresh when the optimization forecast is %s",
    (status) => {
      expect(
        shouldAutoRefreshGeoProject(
          project({
            assessment: { status: "ready", dimensions: [], comparisons: [] },
            optimizationForecast: {
              status,
              dimensions: [],
              assumptions: [],
              roadmap: [],
            },
          }),
        ),
      ).toBe(false);
    },
  );

  it("does not auto-refresh previews, drafts, or hidden pages", () => {
    expect(shouldAutoRefreshGeoProject(project({ preview: true }))).toBe(false);
    expect(
      shouldAutoRefreshGeoProject(
        project({ remoteToken: "", status: "draft" }),
      ),
    ).toBe(false);
    expect(
      canRunGeoAutoRefresh(
        project({
          monitoring: {
            runId: "run-1",
            status: "capturing",
            platforms: ["doubao"],
            expectedRecords: 5,
            completedRecords: 1,
            failedRecords: 0,
            answers: [],
          },
        }),
        "hidden",
      ),
    ).toBe(false);
  });

  it("stops when the project itself has failed", () => {
    expect(
      shouldAutoRefreshGeoProject(
        project({
          status: "failed",
          monitoring: {
            runId: "run-1",
            status: "capturing",
            platforms: ["doubao"],
            expectedRecords: 5,
            completedRecords: 1,
            failedRecords: 0,
            answers: [],
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("refreshGeoProjectOnce", () => {
  it("deduplicates concurrent refreshes and records one successful refresh", async () => {
    let resolveRequest: ((value: GeoProject) => void) | undefined;
    const fetchProject = vi.fn(
      () =>
        new Promise<GeoProject>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const inFlight = new Map<string, Promise<GeoProject>>();
    const onSuccess = vi.fn();
    const current = project();
    const updated = project({ updatedAt: "2026-07-22T08:01:00.000Z" });
    const options = {
      fetchProject,
      inFlight,
      now: () => "2026-07-22T08:01:01.000Z",
      onSuccess,
    };

    const first = refreshGeoProjectOnce(current, options);
    const second = refreshGeoProjectOnce(current, options);

    expect(first).toBe(second);
    expect(inFlight.has(current.id)).toBe(true);
    await vi.waitFor(() => expect(fetchProject).toHaveBeenCalledTimes(1));
    resolveRequest?.(updated);

    await expect(first).resolves.toBe(updated);
    expect(onSuccess).toHaveBeenCalledWith(updated, "2026-07-22T08:01:01.000Z");
    expect(inFlight.has(current.id)).toBe(false);
  });

  it("clears the in-flight lock after a failed refresh", async () => {
    const fetchProject = vi.fn().mockRejectedValue(new Error("offline"));
    const inFlight = new Map<string, Promise<GeoProject>>();
    const current = project();

    await expect(
      refreshGeoProjectOnce(current, { fetchProject, inFlight }),
    ).rejects.toThrow("offline");
    expect(inFlight.has(current.id)).toBe(false);
  });

  it("keeps the refresh fenced until an async observation commit finishes", async () => {
    let releaseCommit: (() => void) | undefined;
    const current = project();
    const updated = project({ updatedAt: "2026-07-22T08:02:00.000Z" });
    const inFlight = new Map<string, Promise<GeoProject>>();
    const onSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCommit = resolve;
        }),
    );

    const request = refreshGeoProjectOnce(current, {
      fetchProject: vi.fn().mockResolvedValue(updated),
      inFlight,
      onSuccess,
    });
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(inFlight.has(current.id)).toBe(true);

    releaseCommit?.();
    await expect(request).resolves.toBe(updated);
    expect(inFlight.has(current.id)).toBe(false);
  });
});
