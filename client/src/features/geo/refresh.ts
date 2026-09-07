import type { GeoProject } from "./types";

export const GEO_AUTO_REFRESH_INTERVAL_MS = 30_000;
const GEO_AUTO_REFRESH_MAX_INTERVAL_MS = 15 * 60_000;

function hasForecastAwaitingAutomaticStart(project: GeoProject): boolean {
  return [
    {
      baseline: project.assessment,
      forecast: project.optimizationForecast,
      executionEntryId: "optimization-forecast",
    },
    {
      baseline: project.industryRankingAssessment,
      forecast: project.industryRankingOptimizationForecast,
      executionEntryId: "industry-ranking-optimization-forecast",
    },
  ].some(({ baseline, forecast, executionEntryId }) => {
    // Legacy completed forecasts can intentionally project as not_started.
    // Only an absent task needs creation reconciliation; a terminal task does not.
    const hasTerminalTask = project.executionLog?.entries.some(
      (entry) =>
        entry.id === executionEntryId &&
        ["completed", "failed", "partial_review"].includes(entry.status),
    );
    return Boolean(
      baseline?.status === "ready" &&
        baseline.quality?.completeness !== "partial" &&
        baseline.totalScore !== undefined &&
        baseline.dimensions.length === 5 &&
        baseline.dimensions.every(
          (dimension) =>
            dimension.score !== undefined && dimension.maxScore !== undefined,
        ) &&
        (!forecast || forecast.status === "not_started") &&
        !hasTerminalTask,
    );
  });
}

export function geoAutoRefreshDelayMs(
  project: GeoProject,
  nowMs = Date.now(),
): number {
  const backgroundTaskActive = [
    project.assessment?.status,
    project.industryRankingAssessment?.status,
    project.optimizationForecast?.status,
    project.industryRankingOptimizationForecast?.status,
  ].some((status) => status === "queued" || status === "running");
  if (backgroundTaskActive || hasForecastAwaitingAutomaticStart(project)) {
    return GEO_AUTO_REFRESH_INTERVAL_MS;
  }

  const activeMonitoringRuns = [
    project.monitoring,
    project.industryRankingMonitoring,
  ].filter(
    (monitoring) =>
      monitoring && ["submitted", "capturing"].includes(monitoring.status),
  );
  if (
    activeMonitoringRuns.length === 0 ||
    activeMonitoringRuns.some((monitoring) => !monitoring?.nextPollAt)
  ) {
    return GEO_AUTO_REFRESH_INTERVAL_MS;
  }
  const nextPollAt = Math.min(
    ...activeMonitoringRuns.map((monitoring) =>
      Date.parse(monitoring!.nextPollAt!),
    ),
  );
  if (!Number.isFinite(nextPollAt) || nextPollAt <= nowMs)
    return GEO_AUTO_REFRESH_INTERVAL_MS;
  return Math.min(
    GEO_AUTO_REFRESH_MAX_INTERVAL_MS,
    Math.max(GEO_AUTO_REFRESH_INTERVAL_MS, nextPollAt - nowMs + 250),
  );
}

export function geoAutoRefreshDelayLabel(
  project: GeoProject,
  nowMs = Date.now(),
): string {
  const delayMs = geoAutoRefreshDelayMs(project, nowMs);
  if (delayMs < 60_000) return `${Math.ceil(delayMs / 1_000)} 秒`;
  return `约 ${Math.max(1, Math.round(delayMs / 60_000))} 分钟`;
}

export function shouldAutoRefreshGeoProject(project: GeoProject): boolean {
  if (project.preview || project.status === "draft" || !project.remoteToken)
    return false;
  if (
    project.serviceActivation?.contractWorkflowReference &&
    ["activation_pending", "provisioning"].includes(
      project.serviceActivation.status,
    )
  )
    return true;
  if (
    project.serviceActivation?.provisioningVersion === 2 &&
    ["activation_pending", "provisioning"].includes(
      project.serviceActivation.status,
    )
  )
    return true;
  const perspectiveStatuses = [
    project.optimizationForecast?.status,
    project.industryRankingOptimizationForecast?.status,
    project.assessment?.status,
    project.industryRankingAssessment?.status,
    project.monitoring?.status,
    project.industryRankingMonitoring?.status,
  ];
  if (
    perspectiveStatuses.some((status) =>
      ["submitted", "capturing", "queued", "running"].includes(status ?? ""),
    )
  )
    return true;

  // A committed forecast creation can lose its response. A subsequent GET
  // reconciles the same deterministic task instead of issuing another POST.
  if (hasForecastAwaitingAutomaticStart(project)) return true;

  if (project.status === "failed") return false;

  const hasPerspectiveTask = perspectiveStatuses.some(Boolean);
  if (hasPerspectiveTask) return false;

  if (!project.knowledgeBase) return true;
  if (project.questionRecommendation) {
    return project.questionRecommendation.status === "pending";
  }
  // Compatibility for locally stored pre-projection projects. An empty
  // question array alone never proves that a remote task exists.
  if (project.status === "recommending") return true;
  return false;
}

export function canRunGeoAutoRefresh(
  project: GeoProject,
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === "visible" && shouldAutoRefreshGeoProject(project);
}

type RefreshGeoProjectOptions = {
  fetchProject: (project: GeoProject) => Promise<GeoProject>;
  inFlight: Map<string, Promise<GeoProject>>;
  now?: () => string;
  onStart?: (projectId: string) => void;
  onSuccess?: (
    project: GeoProject,
    refreshedAt: string,
  ) => void | Promise<void>;
  onFinish?: (projectId: string) => void;
};

export function refreshGeoProjectOnce(
  project: GeoProject,
  options: RefreshGeoProjectOptions,
): Promise<GeoProject> {
  const existing = options.inFlight.get(project.id);
  if (existing) return existing;

  options.onStart?.(project.id);
  const request = Promise.resolve()
    .then(() => options.fetchProject(project))
    .then(async (updated) => {
      await options.onSuccess?.(
        updated,
        options.now?.() ?? new Date().toISOString(),
      );
      return updated;
    })
    .finally(() => {
      if (options.inFlight.get(project.id) === request)
        options.inFlight.delete(project.id);
      options.onFinish?.(project.id);
    });

  options.inFlight.set(project.id, request);
  return request;
}
