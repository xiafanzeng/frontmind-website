import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { siblingDashboardRepositoryRoot } from "./cross-repo-test-path";
import { knowledgeArchiveDescriptorHash } from "./knowledge-base-artifact";
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
const localV4FixturePath = path.resolve(
  process.cwd(),
  "server/geo/contracts/provisioning-v4.fixture.json",
);
const agentV4FixturePath = path.resolve(
  siblingDashboardRepositoryRoot(),
  "shared/contracts/provisioning-v4.fixture.json",
);
const dashboardCopiesAvailable =
  existsSync(agentFixturePath) && existsSync(agentV4FixturePath);

async function fixture(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Website ↔ Agent provisioning and archive shared contract", () => {
  it("parses the shared purchase, categories, and knowledge artifact contract", async () => {
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
    const knowledgeImport = GeoKnowledgeImportRequestSchema.parse(
      value.knowledgeImport,
    );
    expect(
      knowledgeArchiveDescriptorHash(value.artifactDescriptor as any),
    ).toBe(knowledgeImport.descriptorHash);
  });

  it.skipIf(!dashboardCopiesAvailable)(
    "matches the Agent-owned copy when both repositories are checked out",
    async () => {
      const [website, agent, websiteV4, agentV4] = await Promise.all([
        fixture(localFixturePath),
        fixture(agentFixturePath),
        fixture(localV4FixturePath),
        fixture(agentV4FixturePath),
      ]);
      expect(agent).toEqual(website);
      expect(agentV4).toEqual(websiteV4);
    },
  );

  it("parses v4 and binds its candidate descriptor independently of the final file", async () => {
    const value = await fixture(localV4FixturePath);
    const knowledgeImport = GeoKnowledgeImportRequestSchema.parse(
      value.knowledgeImport,
    );
    expect(knowledgeImport.schemaVersion).toBe(4);
    if (knowledgeImport.schemaVersion !== 4) throw new Error("expected v4");
    expect(
      knowledgeArchiveDescriptorHash(value.candidateDescriptor as any),
    ).toBe(knowledgeImport.candidate.descriptorHash);
    expect(knowledgeImport.finalArtifact.fileId).not.toBe(
      knowledgeImport.candidate.fileId,
    );
  });
});
