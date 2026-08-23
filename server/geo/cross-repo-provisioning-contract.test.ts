import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { siblingDashboardRepositoryRoot } from "./cross-repo-test-path";
import {
  expectedContractHashes,
  PRESALES_CAPABILITIES,
  PRESALES_CONTRACT_VERSION,
} from "./broker";
import {
  GeoKnowledgeImportRequestSchema,
  GeoPurchaseProvisionRequestV2Schema,
} from "./provisioning";

const localFixturePath = path.resolve(
  process.cwd(),
  "server/geo/contracts/provisioning-v2.fixture.json",
);
const agentFixturePath = path.resolve(
  siblingDashboardRepositoryRoot(),
  "shared/contracts/provisioning-v2.fixture.json",
);
const localV5FixturePath = path.resolve(
  process.cwd(),
  "server/geo/contracts/provisioning-v5.fixture.json",
);
const agentV5FixturePath = path.resolve(
  siblingDashboardRepositoryRoot(),
  "shared/contracts/provisioning-v5.fixture.json",
);
const dashboardPurchaseCopyAvailable = existsSync(agentFixturePath);
const dashboardV5CopyAvailable = existsSync(agentV5FixturePath);
const localPresalesHashesPath = path.resolve(
  process.cwd(),
  "server/geo/contracts/presales-v2-contract-hashes.fixture.json",
);
const dashboardPresalesHashesPath = path.resolve(
  siblingDashboardRepositoryRoot(),
  "shared/contracts/presales-v2-contract-hashes.fixture.json",
);
const dashboardPresalesHashesAvailable = existsSync(
  dashboardPresalesHashesPath,
);
const OPTIMIZATION_FORECAST_ROOT_FIELDS = [
  "brandMentionRateTarget",
  "claimGuardrails",
  "dimensionNarratives",
  "dimensions",
  "executiveSummary",
  "forecastType",
  "horizonWeeks",
  "limitations",
  "roadmap",
  "scenario",
  "schemaVersion",
  "summary",
] as const;
const localForecastOutputSchemaPath = path.resolve(
  process.cwd(),
  "server/skills/geo-optimization-outcome-forecaster/references/output-schema.json",
);

async function fixture(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Website ↔ Agent provisioning and archive shared contract", () => {
  it("pins Website readiness to the canonical descriptor hashes", async () => {
    const value = await fixture(localPresalesHashesPath);
    expect(value).toEqual({
      presalesContractVersion: PRESALES_CONTRACT_VERSION,
      capabilities: PRESALES_CAPABILITIES,
      contractHashes: expectedContractHashes(),
      contractRootFields: {
        "website.optimization-forecast": OPTIMIZATION_FORECAST_ROOT_FIELDS,
      },
    });
    expect(
      (value.contractRootFields as Record<string, readonly string[]>)[
        "website.optimization-forecast"
      ],
    ).toContain("brandMentionRateTarget");
    const forecastOutputSchema = await fixture(localForecastOutputSchemaPath);
    expect([...(forecastOutputSchema.required as string[])].sort()).toEqual(
      OPTIMIZATION_FORECAST_ROOT_FIELDS,
    );
  });

  it.skipIf(!dashboardPresalesHashesAvailable)(
    "matches the Dashboard canonical descriptor hash fixture",
    async () => {
      const [website, dashboard] = await Promise.all([
        fixture(localPresalesHashesPath),
        fixture(dashboardPresalesHashesPath),
      ]);
      expect(website).toEqual(dashboard);
    },
  );

  it("parses the shared purchase and categories contract", async () => {
    const value = await fixture(localFixturePath);
    const request = value.purchaseRequest as Record<string, any>;
    for (const category of value.questionCategories as string[]) {
      expect(
        GeoPurchaseProvisionRequestV2Schema.parse({
          ...request,
          service: {
            ...request.service,
            purchasedQuestion: {
              ...request.service.purchasedQuestion,
              category,
            },
          },
        }).service.purchasedQuestion.category,
      ).toBe(category);
    }
  });

  it.skipIf(!dashboardPurchaseCopyAvailable)(
    "matches the Agent-owned purchase copy when both repositories are checked out",
    async () => {
      const [website, agent] = await Promise.all([
        fixture(localFixturePath),
        fixture(agentFixturePath),
      ]);
      expect(agent).toEqual(website);
    },
  );

  it("parses the v5 local-artifact knowledge import contract", async () => {
    const value = await fixture(localV5FixturePath);
    const knowledgeImport = GeoKnowledgeImportRequestSchema.parse(
      value.knowledgeImport,
    );
    expect(knowledgeImport.schemaVersion).toBe(5);
    expect(knowledgeImport.candidateArtifactId).not.toBe(
      knowledgeImport.finalArtifactId,
    );
    expect(JSON.stringify(knowledgeImport)).not.toMatch(
      /taskId|fileId|outputItemId|signedUrl/,
    );
  });

  it.skipIf(!dashboardV5CopyAvailable)(
    "matches the Agent-owned v5 local-artifact copy",
    async () => {
      const [website, agent] = await Promise.all([
        fixture(localV5FixturePath),
        fixture(agentV5FixturePath),
      ]);
      expect(agent).toEqual(website);
    },
  );
});
