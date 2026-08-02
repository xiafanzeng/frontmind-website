import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GeoPaymentReceiptEnvelopeSchema } from "./provisioning";
import { siblingDashboardRepositoryRoot } from "./cross-repo-test-path";

const websiteFixturePath = path.resolve(
  process.cwd(),
  "server/geo/contracts/payment-receipt-v1.fixture.json",
);
const agentFixturePath = path.resolve(
  siblingDashboardRepositoryRoot(),
  "shared/contracts/payment-receipt-v1.fixture.json",
);
const dashboardCopyAvailable = existsSync(agentFixturePath);

async function fixture(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

describe("Website ↔ Agent payment receipt v1 shared contract", () => {
  it.skipIf(!dashboardCopyAvailable)(
    "parses the Website-owned fixture and matches the Agent-owned copy",
    async () => {
      const website = GeoPaymentReceiptEnvelopeSchema.parse(
        await fixture(websiteFixturePath),
      );
      const agent = GeoPaymentReceiptEnvelopeSchema.parse(
        await fixture(agentFixturePath),
      );
      expect(agent).toEqual(website);
    },
  );
});
