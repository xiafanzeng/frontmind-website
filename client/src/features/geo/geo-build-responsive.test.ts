import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  fileURLToPath(new URL("./geo-build.css", import.meta.url)),
  "utf8",
);

describe("GEO assessment and monitoring responsive contracts", () => {
  it("uses two columns for execution steps after removing progress text", () => {
    expect(stylesheet).toMatch(
      /\.geo-execution-steps button\s*\{[^}]*grid-template-columns:\s*12px minmax\(0,\s*1fr\);/s,
    );
    expect(stylesheet).not.toMatch(
      /\.geo-execution-steps button\s*\{[^}]*grid-template-columns:[^;}]*\bauto\s*;/s,
    );
  });

  it("keeps the compact 839px assessment navigation", () => {
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

  it("keeps product question cards compact across the three acceptance widths", () => {
    expect(stylesheet).toMatch(
      /\.geo-question-group\.is-product \.geo-question-categories\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(260px,\s*1fr\)\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.geo-question-group\.is-product \.geo-question-categories\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.geo-question-group\.is-product \.geo-question-categories\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(min-width: 840px\)[\s\S]*?\.geo-question-group\.is-product \.geo-question-list > button\s*\{[^}]*min-height:\s*52px/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-question-categories\.is-ranking\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
  });

  it("keeps the assessment section cards in three columns without mobile overflow", () => {
    expect(stylesheet).toMatch(
      /\.geo-assessment-section-tabs\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-assessment-section-tabs button\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*78px/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.geo-assessment-section-tab-description\s*\{[^}]*display:\s*none/s,
    );
  });

  it("keeps the compact knowledge metrics readable at desktop and mobile widths", () => {
    expect(stylesheet).toMatch(
      /\.geo-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-metric-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-knowledge-browser\s*\{[^}]*height:\s*clamp\(390px,\s*calc\(100dvh - 330px\),\s*680px\)/s,
    );
  });

  it("keeps the service map visible when animation variables are absent", () => {
    expect(stylesheet).toMatch(
      /\.geo-service-stage\s*\{[^}]*opacity:\s*1;[^}]*var\(--service-stage-delay,\s*0ms\)\s+both;/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-service-branch\s*\{[^}]*opacity:\s*1;[^}]*var\(--service-node-delay,\s*0ms\)\s+both;/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-service-stage-gate\s*\{[^}]*opacity:\s*1;[^}]*var\(--service-gate-delay,\s*0ms\)\s+both;/s,
    );
  });

  it("stacks reachable dialogs above the movable workbench", () => {
    expect(stylesheet).toMatch(/\.geo-workbench\s*\{[^}]*z-index:\s*80/s);
    expect(stylesheet).toMatch(
      /\.geo-dialog-overlay\s*\{[^}]*z-index:\s*99\s*!important/s,
    );
    expect(stylesheet).not.toMatch(/\.geo-contract-code-dialog\b/);
  });

  it("keeps priority actions full-width with a compact scope note below", () => {
    expect(stylesheet).toMatch(
      /\.geo-assessment-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-assessment-scope-note\s*\{[^}]*min-height:\s*0[^}]*border-left:\s*3px solid[^}]*padding:\s*10px 14px/s,
    );
  });

  it("keeps the three visible platform metrics on one row", () => {
    expect(stylesheet).toMatch(
      /\.geo-assessment-platform-grid dl,[\s\S]*?\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s,
    );
  });

  it("disables retry spinner motion when reduced motion is requested", () => {
    expect(stylesheet).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.is-spinning,[\s\S]*?animation:\s*none !important/s,
    );
  });

  it("stacks monitoring answers and releases reference scrolling at 839px", () => {
    expect(stylesheet).toMatch(
      /\.geo-answer-detail-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.55fr\) minmax\(320px,\s*0\.95fr\)/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-answer-detail-grid\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-answer-reference-panel > ol\s*\{[^}]*max-height:\s*none[^}]*overflow:\s*visible/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-monitor-region-content\s*\{[^}]*z-index:\s*120[^}]*max-height:/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-insight-analysis-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 839px\)[\s\S]*?\.geo-insight-analysis-grid,[\s\S]*?grid-template-columns:\s*1fr/s,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.geo-answer-platform-selector\s*\{[^}]*width:\s*100%/s,
    );
  });

  it("stacks the screenshot dialog above the workbench", () => {
    expect(stylesheet).toMatch(
      /\.geo-monitor-screenshot-overlay\s*\{[^}]*z-index:\s*130\s*!important/s,
    );
    expect(stylesheet).toMatch(
      /\.geo-monitor-screenshot-dialog\s*\{[^}]*z-index:\s*131\s*!important/s,
    );
  });

  it("does not keep styles for the removed single-answer brand panel", () => {
    expect(stylesheet).not.toMatch(/\.geo-answer-auxiliary\b/);
    expect(stylesheet).not.toMatch(/\.geo-answer-brand-analysis\b/);
    expect(stylesheet).not.toMatch(/\.geo-answer-brand-metrics\b/);
    expect(stylesheet).not.toMatch(/\.geo-answer-evaluations\b/);
  });
});
