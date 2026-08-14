import { describe, expect, it } from "vitest";

import { normalizePresalesStructuredResult } from "./structured-result-normalization";

describe("Presales Structured Output transport normalization", () => {
  it("removes only recommendation fields that are optional in Website Zod", () => {
    const input = {
      questions: [
        {
          id: "q-1",
          questionEnglish: null,
          enterpriseAnchor: "FrontMind",
          offeringAnchor: null,
          competitorAnchor: null,
          qaIntent: null,
          evidenceRefs: ["kb/01.md"],
          businessNull: null,
        },
      ],
      rootNull: null,
    };

    expect(
      normalizePresalesStructuredResult(
        "website.question-recommendation",
        input,
      ),
    ).toEqual({
      questions: [
        {
          id: "q-1",
          enterpriseAnchor: "FrontMind",
          evidenceRefs: ["kb/01.md"],
          businessNull: null,
        },
      ],
      rootNull: null,
    });
    expect(input.questions[0]).toHaveProperty("questionEnglish", null);
  });

  it("removes classifier questionEnglish null without deleting nullable anchors", () => {
    expect(
      normalizePresalesStructuredResult("website.custom-question-classifier", {
        decision: "reject",
        questionEnglish: null,
        enterpriseAnchor: null,
        offeringAnchor: null,
      }),
    ).toEqual({
      decision: "reject",
      enterpriseAnchor: null,
      offeringAnchor: null,
    });
  });

  it("normalizes only optional assessment counts and preserves business nulls", () => {
    expect(
      normalizePresalesStructuredResult("website.current-state-assessment", {
        executiveSummary: null,
        dimensionNarratives: null,
        platformBreakdown: [
          {
            sourceCount: null,
            citationCount: null,
            referenceCount: 3,
            averageRank: null,
          },
        ],
      }),
    ).toEqual({
      executiveSummary: null,
      dimensionNarratives: null,
      platformBreakdown: [{ referenceCount: 3, averageRank: null }],
    });
  });

  it("leaves Forecast and translation objects unchanged", () => {
    const forecast = {
      executiveSummary: null,
      dimensions: { semanticVisibility: { gapClosureLow: null } },
    };
    const translation = { questionEnglish: null };
    expect(
      normalizePresalesStructuredResult(
        "website.optimization-forecast",
        forecast,
      ),
    ).toBe(forecast);
    expect(
      normalizePresalesStructuredResult(
        "website.monitor-question-translation",
        translation,
      ),
    ).toBe(translation);
  });
});
