import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { siblingDashboardRepositoryRoot } from "./cross-repo-test-path";
import { knowledgeArchiveDescriptorHash } from "./knowledge-base-artifact";
import {
  GeoKnowledgeImportRequestV2Schema,
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

async function fixture(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("Website ↔ Agent provisioning v2 shared contract", () => {
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
    const knowledgeImport = GeoKnowledgeImportRequestV2Schema.parse(
      value.knowledgeImport,
    );
    expect(
      knowledgeArchiveDescriptorHash(value.artifactDescriptor as any),
    ).toBe(knowledgeImport.descriptorHash);
  });

  it("matches the Agent-owned copy when both repositories are checked out", async () => {
    const website = await fixture(localFixturePath);
    const agent = await fixture(agentFixturePath);
    expect(agent).toEqual(website);
  });
});
