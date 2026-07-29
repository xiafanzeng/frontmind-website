import type { GeoPresalesBroker } from "./broker";
import type {
  GeoPaymentReceiptStore,
  GeoProjectOrderRegistry,
} from "./provisioning";

export type GeoDependencyReadiness = {
  status: "ok";
  agent: {
    credentialConfigured: true;
    monitorCredentialConfigured: true;
    publicUrlConfigured: true;
  };
  projectOrderRegistry: { ready: true };
  paymentReceiptLedger: { ready: true };
};

export function geoPublicBuildSha(
  env: Record<string, string | undefined> = process.env,
) {
  const candidate = (
    env.FRONTMIND_BUILD_SHA ||
    env.GITHUB_SHA ||
    env.RAILWAY_GIT_COMMIT_SHA ||
    ""
  ).trim();
  return /^[a-f0-9]{7,64}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

export function geoReadinessErrorLabel(error: unknown) {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)
    ? error.name
    : "Error";
}

export function createGeoDependencyHealthChecker(options: {
  broker: GeoPresalesBroker;
  projectOrderRegistry: GeoProjectOrderRegistry;
  paymentReceiptStore: GeoPaymentReceiptStore;
  cacheTtlMs?: number;
  now?: () => number;
}) {
  const cacheTtlMs = options.cacheTtlMs ?? 2_000;
  const now = options.now ?? Date.now;
  let cached:
    | {
        expiresAt: number;
        result: GeoDependencyReadiness;
      }
    | undefined;
  let inFlight: Promise<GeoDependencyReadiness> | undefined;

  return async () => {
    const timestamp = now();
    if (cached && cached.expiresAt > timestamp) return cached.result;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const [agent] = await Promise.all([
        options.broker.getStatus(),
        options.projectOrderRegistry.assertReady(),
        options.paymentReceiptStore.assertReady(),
      ]);
      if (
        !agent.ok ||
        !agent.credentialConfigured ||
        !agent.monitorCredentialConfigured ||
        agent.publicUrlConfigured !== true
      ) {
        throw new Error("GEO Agent dependencies are not ready");
      }
      const result: GeoDependencyReadiness = {
        status: "ok",
        agent: {
          credentialConfigured: true,
          monitorCredentialConfigured: true,
          publicUrlConfigured: true,
        },
        projectOrderRegistry: { ready: true },
        paymentReceiptLedger: { ready: true },
      };
      cached = { expiresAt: now() + cacheTtlMs, result };
      return result;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = undefined;
    }
  };
}
