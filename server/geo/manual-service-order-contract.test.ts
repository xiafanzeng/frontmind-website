import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GeoManualServiceOrderResponseSchema } from "./provisioning";

const fixturePath = fileURLToPath(
  new URL(
    "../../shared/contracts/manual-service-order-v1.fixture.json",
    import.meta.url,
  ),
);
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = JSON.parse(fixtureText) as {
  fixtureId: string;
  externalWechatFlow: Record<string, unknown>;
  legacyElectronicSignatureFlow: Record<string, unknown>;
};

describe("shared manual-service-order response contract", () => {
  it("matches the exact fixture shared with Dashboard", () => {
    expect(fixture.fixtureId).toBe(
      "frontmind-manual-service-order-v1-2026-08-02",
    );
    expect(createHash("sha256").update(fixtureText).digest("hex")).toBe(
      "e7119dd3340f60e49bc678fd2c8d30e716e37f474dfcd6beca0479499c4b7e98",
    );
  });

  it("parses every new and legacy response without inventing production fields", () => {
    for (const response of [
      ...Object.values(fixture.externalWechatFlow),
      ...Object.values(fixture.legacyElectronicSignatureFlow),
    ]) {
      expect(
        GeoManualServiceOrderResponseSchema.safeParse(response).success,
      ).toBe(true);
    }

    const created = fixture.externalWechatFlow.created as Record<
      string,
      Record<string, unknown>
    >;
    const authorized = fixture.externalWechatFlow.authorized as Record<
      string,
      Record<string, unknown>
    >;
    expect(created.order).not.toHaveProperty("amountFen");
    expect(created.order).toMatchObject({ marketEdition: "overseas" });
    expect(authorized.order).toMatchObject({
      status: "payment_required",
      marketEdition: "overseas",
      contractAuthorizationMode: "external_wechat",
    });
    expect(
      Object.values(fixture.legacyElectronicSignatureFlow).every(
        (response) =>
          (response as Record<string, Record<string, unknown>>).order
            .marketEdition === "domestic",
      ),
    ).toBe(true);
    expect(JSON.stringify(fixture.externalWechatFlow)).not.toMatch(
      /contractId|signingUrl|signedAt/,
    );
  });
});
