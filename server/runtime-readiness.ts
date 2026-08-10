import { createHash } from "node:crypto";

export type WebsiteRuntimeReadinessOptions<
  TSkills,
  TDependencies extends Record<string, unknown>,
> = {
  releaseChannel: "production" | "development";
  paymentMode: "zpay";
  buildSha: string | null;
  imageDigest: string | null;
  requireReleaseIdentity?: boolean;
  getSkills: () => Promise<TSkills>;
  getDependencies: () => Promise<TDependencies>;
  getVisitorStats: () => Promise<{ ready: true }>;
  assertConfiguration?: () => Promise<void> | void;
  validationStore: {
    assertReady(): Promise<void>;
    persistenceIdentity(): Promise<string>;
  };
};

/**
 * Shared production preflight and /readyz probe. Liveness deliberately does
 * not call this function: a live process must remain observable while an
 * upstream dependency or persistent store is unavailable.
 */
export async function collectWebsiteRuntimeReadiness<
  TSkills,
  TDependencies extends Record<string, unknown>,
>(options: WebsiteRuntimeReadinessOptions<TSkills, TDependencies>) {
  if (
    options.requireReleaseIdentity &&
    (!/^[a-f0-9]{40}$/.test(options.buildSha ?? "") ||
      !/^sha256:[a-f0-9]{64}$/.test(options.imageDigest ?? ""))
  ) {
    throw new Error("WEBSITE_RELEASE_IDENTITY_INVALID");
  }
  await options.assertConfiguration?.();
  const [skills, dependencies, visitorStats, persistenceIdentity] =
    await Promise.all([
      options.getSkills(),
      options.getDependencies(),
      options.getVisitorStats(),
      options.validationStore
        .assertReady()
        .then(() => options.validationStore.persistenceIdentity()),
    ]);

  return {
    status: "ok" as const,
    channel: options.releaseChannel,
    releaseChannel: options.releaseChannel,
    paymentMode: options.paymentMode,
    buildSha: options.buildSha,
    imageDigest: options.imageDigest,
    skills,
    dependencies: {
      ...dependencies,
      visitorStats,
      customQuestionValidationStore: {
        ready: true as const,
        persistenceIdentitySha256: createHash("sha256")
          .update(persistenceIdentity, "utf8")
          .digest("hex"),
      },
    },
  };
}
