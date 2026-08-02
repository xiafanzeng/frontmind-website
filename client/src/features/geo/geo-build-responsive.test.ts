import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  fileURLToPath(new URL("./geo-build.css", import.meta.url)),
  "utf8",
);

describe("GEO assessment and onboarding responsive contracts", () => {
  it("keeps three onboarding steps and the compact 839px navigation", () => {
    expect(stylesheet).toMatch(
      /\.geo-onboarding-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-onboarding-steps\s*\{[^}]*overflow-x:\s*auto/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-assessment-tabs\s*\{[^}]*overflow-x:\s*auto/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-assessment-waiting\s*\{[^}]*display:\s*block/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-comparison-ledger-grid\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
  });

  it("keeps the contract-code dialog usable on a 520px or short viewport", () => {
    expect(stylesheet).toMatch(
      /\.geo-contract-code-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 2rem\)[^}]*overflow-y:\s*auto/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.geo-contract-code-actions\s*\{[^}]*flex-direction:\s*column-reverse/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-contract-code-qr\s*\{[^}]*width:\s*min\(220px,\s*64vw\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.geo-assessment-section-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    );
  });

  it("keeps priority actions full-width with a compact scope note below", () => {
    expect(stylesheet).toMatch(
      /\.geo-assessment-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-assessment-scope-note\s*\{[^}]*min-height:\s*0[^}]*border-left:\s*3px solid[^}]*padding:\s*10px 14px/s,
    );
  });
});
