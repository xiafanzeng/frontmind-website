import type { GeoProject } from "./types";

export const GEO_AUTO_REFRESH_INTERVAL_MS = 30_000;
const GEO_AUTO_REFRESH_MAX_INTERVAL_MS = 15 * 60_000;

export function geoAutoRefreshDelayMs(
  project: GeoProject,
  nowMs = Date.now(),
): number {
  if (
    !["submitted", "capturing"].includes(project.monitoring?.status ?? "") ||
    !project.monitoring?.nextPollAt
  ) {
    return GEO_AUTO_REFRESH_INTERVAL_MS;
  }
  const nextPollAt = Date.parse(project.monitoring.nextPollAt);
  if (!Number.isFinite(nextPollAt) || nextPollAt <= nowMs) {
    return GEO_AUTO_REFRESH_INTERVAL_MS;
  }
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
  if (project.status === "failed") return false;

  if (
    ["queued", "running"].includes(project.optimizationForecast?.status ?? "")
  )
    return true;
  if (["ready", "failed"].includes(project.optimizationForecast?.status ?? ""))
    return false;
  if (["queued", "running"].includes(project.assessment?.status ?? ""))
    return true;
  if (["ready", "failed"].includes(project.assessment?.status ?? ""))
    return false;

  if (["failed", "partial_review"].includes(project.monitoring?.status ?? ""))
    return false;
  if (["submitted", "capturing"].includes(project.monitoring?.status ?? ""))
    return true;
  if (project.monitoring?.status === "completed") return false;

  if (!project.knowledgeBase) return true;
  if (project.status === "recommending") return true;
  if (project.questions.length === 0) return true;
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
