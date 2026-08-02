import fs from "node:fs";
import path from "node:path";
import Ajv2020, {
  type AnySchema,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import JSZip from "jszip";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AssessmentRawTaskOutputSchema,
  assertAssessmentOutputScope,
  buildGeoCurrentStateEvaluatorSkillArchive,
} from "../../geo/assessment";

const schemaPath = path.resolve(
  process.cwd(),
  "server/skills/geo-current-state-evaluator/references/raw-output-schema.json",
);

function unavailableIndicator() {
  return {
    rawValue: null,
    measurementStatus: "unavailable",
    confidence: 0,
    calculationBasis: "The supplied evidence cannot measure this indicator.",
    evidenceRefs: [],
    limitations: ["The supplied evidence is insufficient."],
  };
}

function canonicalIneligibleOutput() {
  return {
    schemaVersion: 1,
    assessmentType: "question_baseline",
    question: {
      id: "reputation-01",
      text: "What risks are associated with Acme?",
      category: "reputation",
      rankingMetricEligible: false,
    },
    sample: {
      selectedPlatforms: ["deepseek"],
      repeatPerPlatform: 5,
      expectedResponses: 5,
      successfulResponses: 5,
      failedResponses: 0,
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: unavailableIndicator(),
        webSearchSov: unavailableIndicator(),
        multiPlatformCoverage: unavailableIndicator(),
      },
      semanticCoherence: {
        corePropositionHitRate: unavailableIndicator(),
        toneConsistency: unavailableIndicator(),
      },
      semanticRichness: {
        questionStageCoverage: unavailableIndicator(),
        semanticEntityRichness: unavailableIndicator(),
        contentFormatDiversity: unavailableIndicator(),
      },
      semanticAuthority: {
        authoritativeSourceRatio: unavailableIndicator(),
        structuredDataCompleteness: unavailableIndicator(),
        thirdPartyEndorsement: unavailableIndicator(),
      },
      competitiveAdvantage: {
        firstMentionRate: unavailableIndicator(),
        exclusiveSemanticSpace: unavailableIndicator(),
      },
    },
    rankingDiagnostics: {
      eligible: false,
      totalObservations: 0,
      rankedObservations: 0,
      unmentionedObservations: 0,
      averageRank: null,
      firstPlaceRate: null,
      top3Rate: null,
      top5Rate: null,
      competitorRankGap: null,
      calculationBasis:
        "Ranking is excluded for this named-brand reputation question.",
    },
    platformBreakdown: [
      {
        platform: "deepseek",
        responseCount: 5,
        successfulResponses: 5,
        brandMentionRate: null,
        averageRank: null,
        factAccuracy: null,
        propositionHitRate: null,
        citationCount: 0,
        referenceCount: 5,
        sentiment: "unknown",
        verdict: "The evidence is insufficient for a platform verdict.",
        evidenceRefs: ["deepseek/run-01"],
      },
    ],
    knowledgeVsAnswers: [
      {
        id: "comparison-01",
        topic: "Risk evidence",
        verdict: "omitted",
        platform: null,
        runIndex: null,
        answerExcerpt: null,
        kbClaimId: "claims.risk-01",
        kbClaimText: "The knowledge base documents the relevant risk evidence.",
        kbEvidenceRefs: ["01_company_overview.md"],
        explanation: "The monitored answers omit the documented evidence.",
        recommendedAction:
          "Publish a concise and directly citable evidence page.",
        confidence: 0.8,
      },
    ],
    summary:
      "The single-question sample has insufficient evidence for ranking measurements.",
    priorityActions: [
      {
        priority: 1,
        dimension: "semanticAuthority",
        action: "Publish a concise and directly citable evidence page.",
        expectedImpact: "Improves answer evidence quality.",
        evidenceRefs: ["01_company_overview.md"],
      },
    ],
    limitations: ["This assessment covers one question and one platform."],
  };
}

function eligibleOutput() {
  const output = canonicalIneligibleOutput();
  Object.assign(output.question, {
    category: "product_scenario",
    rankingMetricEligible: true,
  });
  Object.assign(output.rankingDiagnostics, {
    eligible: true,
    totalObservations: 5,
    rankedObservations: 3,
    unmentionedObservations: 2,
    averageRank: 2,
    firstPlaceRate: 0.2,
    top3Rate: 0.4,
    top5Rate: 0.6,
    competitorRankGap: 1,
    calculationBasis:
      "Ranking is measured across the five declared answer slots.",
  });
  return output;
}

function compileSchema(schema: AnySchema) {
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function validationErrors(validate: ValidateFunction) {
  return (validate.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

function validateProductionContract(output: unknown) {
  const result = AssessmentRawTaskOutputSchema.safeParse(output);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues
        .map(
          (issue) =>
            `${issue.path.length ? issue.path.join(".") : "/"} ${issue.message}`,
        )
        .join("; "),
    } as const;
  }
  try {
    assertAssessmentOutputScope(result.data, {
      question: result.data.question,
      platforms: Array.from(new Set(result.data.sample.selectedPlatforms)),
      successfulResponses: result.data.sample.successfulResponses,
      failedResponses: result.data.sample.failedResponses,
    });
    return { success: true, errors: "" } as const;
  } catch (error) {
    return {
      success: false,
      errors: error instanceof Error ? error.message : "scope validation failed",
    } as const;
  }
}

type ContractOutput = ReturnType<typeof canonicalIneligibleOutput>;

function changedOutput(
  source: () => ContractOutput,
  change: (output: ContractOutput) => void,
) {
  return () => {
    const output = source();
    change(output);
    return output;
  };
}

describe("geo-current-state-evaluator model output contract", () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
    validate = compileSchema(schema);
  });

  const parityCases = [
    {
      name: "canonical ineligible 0/0/0 output",
      output: canonicalIneligibleOutput,
      expected: true,
    },
    {
      name: "canonical eligible output",
      output: eligibleOutput,
      expected: true,
    },
    {
      name: "inclusive numeric upper bounds",
      output: changedOutput(eligibleOutput, (output) => {
        Object.assign(output.rankingDiagnostics, {
          totalObservations: 10_000,
          rankedObservations: 5_000,
          unmentionedObservations: 5_000,
          averageRank: 100,
        });
        Object.assign(output.platformBreakdown[0], {
          averageRank: 100,
          citationCount: 10_000,
          referenceCount: 10_000,
        });
      }),
      expected: true,
    },
    {
      name: "duplicate selected platform",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.sample.selectedPlatforms.push("deepseek");
      }),
      expected: false,
    },
    {
      name: "question and ranking eligibility mismatch",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.question.rankingMetricEligible = true;
      }),
      expected: false,
    },
    {
      name: "sample count above its upper bound",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.sample.expectedResponses = 10_001;
      }),
      expected: false,
    },
    {
      name: "ranking count above its upper bound",
      output: changedOutput(eligibleOutput, (output) => {
        output.rankingDiagnostics.totalObservations = 10_001;
        output.rankingDiagnostics.rankedObservations = 10_001;
        output.rankingDiagnostics.unmentionedObservations = 0;
      }),
      expected: false,
    },
    {
      name: "platform response count other than five",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.platformBreakdown[0].responseCount = 6;
      }),
      expected: false,
    },
    {
      name: "platform successful responses exceeding response count",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.platformBreakdown[0].successfulResponses = 6;
      }),
      expected: false,
    },
    {
      name: "successful platform without evidence",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.platformBreakdown[0].evidenceRefs = [];
      }),
      expected: false,
    },
    {
      name: "platform citation count above its upper bound",
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        output.platformBreakdown[0].citationCount = 10_001;
      }),
      expected: false,
    },
    {
      name: "ranking average above its upper bound",
      output: changedOutput(eligibleOutput, (output) => {
        Object.assign(output.rankingDiagnostics, { averageRank: 101 });
      }),
      expected: false,
    },
    ...(
      [
        ["averageRank", 2],
        ["firstPlaceRate", 0.2],
        ["top3Rate", 0.4],
        ["top5Rate", 0.6],
        ["competitorRankGap", 1],
      ] as const
    ).map(([metric, value]) => ({
      name: `non-null ineligible ${metric}`,
      output: changedOutput(canonicalIneligibleOutput, (output) => {
        Object.assign(output.rankingDiagnostics, { [metric]: value });
      }),
      expected: false,
    })),
  ];

  it.each(parityCases)(
    "keeps Ajv/Zod parity for $name",
    ({ output: buildOutput, expected }) => {
      const output = buildOutput();
      const modelValid = validate(output);
      const production = validateProductionContract(output);

      expect(modelValid, validationErrors(validate)).toBe(expected);
      expect(production.success, production.errors).toBe(expected);
      expect(modelValid).toBe(production.success);
    },
  );

  it("keeps legacy ineligible 5/0/0 as an intentional compatibility difference", () => {
    const output = canonicalIneligibleOutput();
    output.rankingDiagnostics.totalObservations = 5;

    const modelValid = validate(output);
    const production = validateProductionContract(output);

    expect(modelValid).toBe(false);
    expect(validationErrors(validate)).toContain(
      "/rankingDiagnostics/totalObservations",
    );
    expect(production.success, production.errors).toBe(true);
    expect(modelValid).not.toBe(production.success);
  });

  it("documents duplicate platform names as a production-only cross-field invariant", () => {
    const output = canonicalIneligibleOutput();
    output.platformBreakdown.push({
      ...output.platformBreakdown[0],
      successfulResponses: 0,
      evidenceRefs: [],
    });

    const modelValid = validate(output);
    const production = validateProductionContract(output);

    expect(modelValid, validationErrors(validate)).toBe(true);
    expect(production.success).toBe(false);
    expect(production.errors).toContain("exactly once");
  });

  it("packages the same parseable Draft 2020-12 schema in the evaluator Skill", async () => {
    const archive = await buildGeoCurrentStateEvaluatorSkillArchive();
    const zip = await JSZip.loadAsync(archive);
    const schemaText = await zip
      .file("references/raw-output-schema.json")
      ?.async("string");

    expect(schemaText).toBeDefined();
    const packagedSchema = JSON.parse(schemaText ?? "") as AnySchema;
    const validatePackaged = compileSchema(packagedSchema);
    const output = canonicalIneligibleOutput();
    expect(validatePackaged(output), validationErrors(validatePackaged)).toBe(
      true,
    );
  });
});
