import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_SKILL_ARCHIVE_FILENAME,
  AssessmentRawTaskOutputSchema,
  AssessmentTaskOutputValidationError,
  assertAssessmentOutputScope,
  buildAssessmentPrompt,
  buildGeoCurrentStateEvaluatorSkillArchive,
  buildGeoKnowledgeAnswerVerifierSkillArchive,
  calculateQuestionBaselineAssessment,
  clampRawIndicator,
  inspectAssessmentTaskOutput,
  KNOWLEDGE_VERIFIER_SKILL_ARCHIVE_FILENAME,
  parseAssessmentTaskOutput,
  type AssessmentRawTaskOutput,
} from "./assessment";

function indicator(
  rawValue: number,
  calculationBasis = "根据知识库与监控回答逐条核验得到。",
) {
  return {
    rawValue,
    measurementStatus: "measured" as const,
    confidence: 0.8,
    calculationBasis,
    evidenceRefs: ["00_source_index.md", "deepseek/run-01"],
    limitations: [],
  };
}

function unavailable(reason = "本次单问题材料不足，无法可靠测量。") {
  return {
    rawValue: null,
    measurementStatus: "unavailable" as const,
    confidence: 0,
    calculationBasis: reason,
    evidenceRefs: [],
    limitations: [reason],
  };
}

function validRawOutput(): AssessmentRawTaskOutput {
  return {
    schemaVersion: 1,
    assessmentType: "question_baseline",
    question: {
      id: "product-scenario-01",
      text: "科研型企业如何选择 GEO 服务商？",
      category: "product_scenario",
      rankingMetricEligible: true,
    },
    sample: {
      selectedPlatforms: ["deepseek", "doubao"],
      repeatPerPlatform: 5,
      expectedResponses: 10,
      successfulResponses: 9,
      failedResponses: 1,
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: indicator(0.5),
        webSearchSov: unavailable(),
        multiPlatformCoverage: indicator(1),
      },
      semanticCoherence: {
        corePropositionHitRate: indicator(0.5),
        toneConsistency: indicator(
          0.75,
          "可判定回答中 75% 与知识库品牌语调保持一致。",
        ),
      },
      semanticRichness: {
        questionStageCoverage: indicator(0.2),
        semanticEntityRichness: indicator(0),
        contentFormatDiversity: unavailable(),
      },
      semanticAuthority: {
        authoritativeSourceRatio: indicator(0.5),
        structuredDataCompleteness: unavailable(),
        thirdPartyEndorsement: indicator(0.25),
      },
      competitiveAdvantage: {
        firstMentionRate: indicator(0.25),
        exclusiveSemanticSpace: unavailable(),
      },
    },
    rankingDiagnostics: {
      eligible: true,
      totalObservations: 10,
      rankedObservations: 5,
      unmentionedObservations: 5,
      averageRank: 2,
      firstPlaceRate: 0.2,
      top3Rate: 0.4,
      top5Rate: 0.5,
      competitorRankGap: 1,
      calculationBasis: "按十条可排名回答中的品牌与竞品出现顺序统计。",
    },
    platformBreakdown: [
      {
        platform: "deepseek",
        responseCount: 5,
        successfulResponses: 5,
        brandMentionRate: 0.6,
        averageRank: 2,
        factAccuracy: 0.8,
        propositionHitRate: 0.5,
        citationCount: 2,
        referenceCount: 9,
        sentiment: "positive",
        verdict: "品牌能被识别，但核心科研主张传达仍不稳定。",
        evidenceRefs: ["deepseek/run-01"],
      },
      {
        platform: "doubao",
        responseCount: 5,
        successfulResponses: 4,
        brandMentionRate: 0.4,
        averageRank: 3,
        factAccuracy: 0.7,
        propositionHitRate: 0.5,
        citationCount: 1,
        referenceCount: 7,
        sentiment: "mixed",
        verdict: "部分回答提及品牌，但证据引用和事实覆盖不足。",
        evidenceRefs: ["doubao/run-01"],
      },
    ],
    knowledgeVsAnswers: [
      {
        id: "comparison-01",
        topic: "企业定位",
        verdict: "supported",
        platform: "deepseek",
        runIndex: 1,
        answerExcerpt: "FrontMind 强调科研驱动。",
        kbClaimId: "claims.positioning",
        kbClaimText: "FrontMind 以科研驱动的企业 GEO 服务为核心定位。",
        kbEvidenceRefs: ["01_company_overview.md"],
        explanation: "回答主张与知识库定位及其来源一致。",
        recommendedAction: "继续统一各权威页面中的科研驱动定位表达。",
        confidence: 0.95,
      },
      {
        id: "comparison-02",
        topic: "目标客户",
        verdict: "contradicted",
        platform: "doubao",
        runIndex: 2,
        answerExcerpt: "该服务仅面向消费品牌。",
        kbClaimId: "facts.target_segments",
        kbClaimText: "服务对象同时覆盖科研机构与企业客户。",
        kbEvidenceRefs: ["03_products/target-segments.md"],
        explanation: "知识库显示同时覆盖科研与企业客户。",
        recommendedAction: "在企业介绍与问答页明确列出核心客户类型。",
        confidence: 0.9,
      },
      {
        id: "comparison-03",
        topic: "科研验证方法",
        verdict: "omitted",
        platform: null,
        runIndex: null,
        answerExcerpt: null,
        kbClaimId: "claims.differentiators.0",
        kbClaimText: "企业采用科研验证方法检验 GEO 优化效果。",
        kbEvidenceRefs: ["04_capabilities/research.md"],
        explanation: "全部回答均遗漏知识库中的科研验证方法。",
        recommendedAction: "建设可被平台直接引用的科研验证方法说明页。",
        confidence: 0.85,
      },
      {
        id: "comparison-04",
        topic: "客户规模",
        verdict: "unverifiable",
        platform: "deepseek",
        runIndex: 3,
        answerExcerpt: "该企业服务了上千家客户。",
        kbClaimId: null,
        kbClaimText: null,
        kbEvidenceRefs: [],
        explanation: "知识库中没有可支持或反驳该数量的证据。",
        recommendedAction: "在获得可核验证据前避免传播具体客户数量。",
        confidence: 0.8,
      },
    ],
    summary:
      "品牌在所选平台已有基础识别，但科研定位、事实完整度和实际引用稳定性仍需提升。",
    priorityActions: [
      {
        priority: 2,
        dimension: "semanticAuthority",
        action: "补充可被 AI 直接引用的科研方法、证据页与权威第三方来源。",
        expectedImpact: "提升权威信源占比和事实准确度。",
        evidenceRefs: ["00_source_index.md"],
      },
      {
        priority: 1,
        dimension: "semanticCoherence",
        action: "统一官网中的科研定位、目标客户与核心差异点表达。",
        expectedImpact: "提升跨平台核心主张命中率。",
        evidenceRefs: ["01_company_overview.md"],
      },
    ],
    limitations: ["本次仅覆盖两个平台和一个问题。"],
  };
}

function validIneligibleRawOutput(
  totalObservations = 0,
): AssessmentRawTaskOutput {
  const raw = validRawOutput();
  return {
    ...raw,
    question: {
      id: "reputation-01",
      text: "FrontMind 靠谱吗，有哪些问题？",
      category: "reputation",
      rankingMetricEligible: false,
    },
    rankingDiagnostics: {
      eligible: false,
      totalObservations,
      rankedObservations: 0,
      unmentionedObservations: 0,
      averageRank: null,
      firstPlaceRate: null,
      top3Rate: null,
      top5Rate: null,
      competitorRankGap: null,
      calculationBasis: "舆情问题不参与排名指标计算，排名字段统一留空。",
    },
  };
}

describe("GEO current-state assessment task output", () => {
  it("asks Base for schema-required item confidence without asking for a confidence summary", async () => {
    const prompt = await buildAssessmentPrompt({
      companyName: "Acme",
      archiveFilename: "Acme.zip",
      monitoringFilename: "monitoring.json",
      question: {
        id: "product-scenario-01",
        text: "Acme 的产品适合科研团队吗？",
        category: "product_scenario",
        rankingMetricEligible: true,
      },
      monitoring: {
        platforms: ["deepseek"],
        repeatPerPlatform: 5,
        expectedResponses: 5,
        successfulResponses: 5,
        failedResponses: 0,
      },
    });

    expect(prompt).toContain("schema 要求的逐项 confidence");
    expect(prompt).toContain("不得自行计算或输出最终分数、等级、coverage");
    expect(prompt).not.toContain("coverage 或 confidence。");
  });

  it("strictly parses a fenced nested task response", () => {
    const raw = validRawOutput();
    const parsed = parseAssessmentTaskOutput({
      output: [
        {
          role: "assistant",
          type: "message",
          content: [
            {
              type: "text",
              text: `\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``,
            },
          ],
        },
      ],
    });

    expect(parsed.assessmentType).toBe("question_baseline");
    expect(parsed.platformBreakdown).toHaveLength(2);
    expect(parsed.knowledgeVsAnswers.map((item) => item.verdict)).toEqual([
      "supported",
      "contradicted",
      "omitted",
      "unverifiable",
    ]);
  });

  it("accepts legacy ineligible 5/0/0 diagnostics and canonicalizes them for scoring", () => {
    const raw = validIneligibleRawOutput(5);
    const parsed = parseAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });

    expect(parsed.rankingDiagnostics).toMatchObject({
      eligible: false,
      totalObservations: 5,
      rankedObservations: 0,
      unmentionedObservations: 0,
    });
    expect(
      calculateQuestionBaselineAssessment(parsed).rankingDiagnostics,
    ).toMatchObject({
      eligible: false,
      totalObservations: 0,
      rankedObservations: 0,
      unmentionedObservations: 0,
      averageRank: null,
      firstPlaceRate: null,
      top3Rate: null,
      top5Rate: null,
      competitorRankGap: null,
    });
  });

  it("accepts canonical ineligible 0/0/0 diagnostics", () => {
    const inspection = inspectAssessmentTaskOutput({
      output: [
        {
          type: "output_text",
          text: JSON.stringify(validIneligibleRawOutput()),
        },
      ],
    });

    expect(inspection.success).toBe(true);
    if (inspection.success) {
      expect(inspection.data.rankingDiagnostics.totalObservations).toBe(0);
    }
  });

  it("rejects eligible count mismatches with a precise safe path", () => {
    const raw = validRawOutput();
    raw.rankingDiagnostics.totalObservations = 9;
    const inspection = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });

    expect(inspection.success).toBe(false);
    if (!inspection.success) {
      expect(inspection.error).toBeInstanceOf(
        AssessmentTaskOutputValidationError,
      );
      expect(inspection.error.code).toBe("SCHEMA_MISMATCH");
      expect(inspection.error.issues).toContainEqual({
        path: "rankingDiagnostics.totalObservations",
        message: "value does not satisfy a cross-field requirement",
      });
    }
  });

  it("rejects question/diagnostic eligibility mismatches with a precise safe path", () => {
    const raw = validIneligibleRawOutput();
    raw.question = validRawOutput().question;
    const inspection = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });

    expect(inspection.success).toBe(false);
    if (!inspection.success) {
      expect(inspection.error.issues.map((issue) => issue.path)).toContain(
        "rankingDiagnostics.eligible",
      );
    }
  });

  it("rejects ineligible nonzero counts and non-null ranking metrics", () => {
    const raw = validIneligibleRawOutput(5);
    raw.rankingDiagnostics.rankedObservations = 1;
    raw.rankingDiagnostics.unmentionedObservations = 4;
    raw.rankingDiagnostics.averageRank = 2;
    raw.rankingDiagnostics.top3Rate = 0.5;
    const inspection = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });

    expect(inspection.success).toBe(false);
    if (!inspection.success) {
      expect(inspection.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([
          "rankingDiagnostics.rankedObservations",
          "rankingDiagnostics.unmentionedObservations",
          "rankingDiagnostics.averageRank",
          "rankingDiagnostics.top3Rate",
        ]),
      );
    }
  });

  it("classifies missing trusted output, invalid JSON, and schema mismatches", () => {
    const raw = validRawOutput();
    const noTrustedOutput = inspectAssessmentTaskOutput(raw);
    const invalidJson = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: "{ definitely-not-json" }],
    });
    const schemaMismatch = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: "{}" }],
    });

    expect(noTrustedOutput).toMatchObject({
      success: false,
      error: { code: "NO_TRUSTED_OUTPUT", issues: [] },
    });
    expect(invalidJson).toMatchObject({
      success: false,
      error: { code: "INVALID_JSON", issues: [] },
    });
    expect(schemaMismatch).toMatchObject({
      success: false,
      error: { code: "SCHEMA_MISMATCH" },
    });
    if (!schemaMismatch.success) {
      expect(schemaMismatch.error.issues.length).toBeGreaterThan(0);
      expect(schemaMismatch.error.issues.length).toBeLessThanOrEqual(8);
      expect(schemaMismatch.error.issues.every((issue) => issue.path)).toBe(
        true,
      );
      expect(
        schemaMismatch.error.issues.every(
          (issue) => !issue.message.includes(JSON.stringify(raw)),
        ),
      ).toBe(true);
    }
  });

  it("accepts typed task.output text but ignores user, metadata, and reasoning payloads", () => {
    const raw = validRawOutput();
    const injected = {
      ...raw,
      question: {
        ...raw.question,
        text: "来自不可信字段的替换问题？",
      },
    };
    const parsed = parseAssessmentTaskOutput({
      metadata: { text: JSON.stringify(injected) },
      output: [
        {
          role: "user",
          type: "message",
          content: [{ type: "text", text: JSON.stringify(injected) }],
        },
        { type: "reasoning", text: JSON.stringify(injected) },
        { type: "output_text", text: JSON.stringify(raw) },
      ],
    });

    expect(parsed.question.text).toBe(raw.question.text);
    const untrustedOnly = inspectAssessmentTaskOutput({
      metadata: { text: JSON.stringify(raw) },
      output: [
        {
          role: "user",
          type: "message",
          content: [{ type: "text", text: JSON.stringify(raw) }],
        },
        { type: "reasoning", text: JSON.stringify(raw) },
      ],
    });
    expect(untrustedOnly).toMatchObject({
      success: false,
      error: { code: "NO_TRUSTED_OUTPUT" },
    });
    expect(() => {
      if (!untrustedOnly.success) throw untrustedOnly.error;
    }).toThrow(/strict geo-current-state-evaluator JSON/);
  });

  it("rejects model-authored scores and any unknown property", () => {
    const withTopLevelScore = { ...validRawOutput(), finalScore: 88 };
    expect(
      AssessmentRawTaskOutputSchema.safeParse(withTopLevelScore).success,
    ).toBe(false);

    const raw = validRawOutput();
    const withIndicatorScore = {
      ...raw,
      dimensions: {
        ...raw.dimensions,
        semanticCoherence: {
          ...raw.dimensions.semanticCoherence,
          toneConsistency: {
            ...raw.dimensions.semanticCoherence.toneConsistency,
            score: 8,
          },
        },
      },
    };
    expect(
      AssessmentRawTaskOutputSchema.safeParse(withIndicatorScore).success,
    ).toBe(false);
    expect(() =>
      parseAssessmentTaskOutput({ text: JSON.stringify(withTopLevelScore) }),
    ).toThrow(/strict geo-current-state-evaluator JSON/);
  });

  it("requires null raw values for unavailable indicators", () => {
    const raw = validRawOutput();
    const invalid = {
      ...raw,
      dimensions: {
        ...raw.dimensions,
        semanticVisibility: {
          ...raw.dimensions.semanticVisibility,
          webSearchSov: {
            ...raw.dimensions.semanticVisibility.webSearchSov,
            rawValue: 0,
          },
        },
      },
    };
    expect(AssessmentRawTaskOutputSchema.safeParse(invalid).success).toBe(
      false,
    );
  });

  it("rejects unbounded or evidence-free available indicators", () => {
    const raw = validRawOutput();
    const unbounded = {
      ...raw,
      dimensions: {
        ...raw.dimensions,
        semanticVisibility: {
          ...raw.dimensions.semanticVisibility,
          aiSearchVisibility: {
            ...raw.dimensions.semanticVisibility.aiSearchVisibility,
            rawValue: 1.1,
          },
        },
      },
    };
    expect(AssessmentRawTaskOutputSchema.safeParse(unbounded).success).toBe(
      false,
    );

    const evidenceFree = {
      ...raw,
      dimensions: {
        ...raw.dimensions,
        semanticVisibility: {
          ...raw.dimensions.semanticVisibility,
          aiSearchVisibility: {
            ...raw.dimensions.semanticVisibility.aiSearchVisibility,
            evidenceRefs: [],
          },
        },
      },
    };
    expect(AssessmentRawTaskOutputSchema.safeParse(evidenceFree).success).toBe(
      false,
    );
  });

  it("requires evidence for successful platform results and evidenced omissions", () => {
    const raw = validRawOutput();
    const evidenceFreePlatform = {
      ...raw,
      platformBreakdown: raw.platformBreakdown.map((platform, index) =>
        index === 0 ? { ...platform, evidenceRefs: [] } : platform,
      ),
    };
    expect(
      AssessmentRawTaskOutputSchema.safeParse(evidenceFreePlatform).success,
    ).toBe(false);

    const evidenceFreeOmission = {
      ...raw,
      knowledgeVsAnswers: raw.knowledgeVsAnswers.map((comparison) =>
        comparison.verdict === "omitted"
          ? { ...comparison, kbEvidenceRefs: [] }
          : comparison,
      ),
    };
    expect(
      AssessmentRawTaskOutputSchema.safeParse(evidenceFreeOmission).success,
    ).toBe(false);
  });

  it("requires each selected platform exactly once in the platform breakdown", () => {
    const raw = validRawOutput();
    const duplicatePlatform = {
      ...raw,
      platformBreakdown: [
        ...raw.platformBreakdown,
        { ...raw.platformBreakdown[0] },
      ],
    };

    const result = AssessmentRawTaskOutputSchema.safeParse(duplicatePlatform);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["platformBreakdown"] }),
        ]),
      );
    }
  });

  it("keeps omissions unbound and answer comparisons within five run slots", () => {
    const raw = validRawOutput();
    const boundOmission = {
      ...raw,
      knowledgeVsAnswers: raw.knowledgeVsAnswers.map((comparison) =>
        comparison.verdict === "omitted"
          ? { ...comparison, platform: "deepseek" }
          : comparison,
      ),
    };
    expect(AssessmentRawTaskOutputSchema.safeParse(boundOmission).success).toBe(
      false,
    );

    const outOfRangeRun = {
      ...raw,
      knowledgeVsAnswers: raw.knowledgeVsAnswers.map((comparison, index) =>
        index === 0 ? { ...comparison, runIndex: 6 } : comparison,
      ),
    };
    expect(AssessmentRawTaskOutputSchema.safeParse(outOfRangeRun).success).toBe(
      false,
    );
  });

  it("binds the model output to the exact question and monitoring scope", () => {
    const raw = validRawOutput();
    expect(() =>
      assertAssessmentOutputScope(raw, {
        question: raw.question,
        platforms: ["deepseek", "doubao"],
        successfulResponses: 9,
        failedResponses: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertAssessmentOutputScope(
        {
          ...raw,
          question: {
            ...raw.question,
            text: "被替换的问题正文？",
          },
        },
        {
          question: raw.question,
          platforms: ["deepseek", "doubao"],
        },
      ),
    ).toThrow(/question snapshot/i);
    expect(() =>
      assertAssessmentOutputScope(raw, {
        question: raw.question,
        platforms: ["deepseek"],
      }),
    ).toThrow(/platform scope/i);
    expect(() =>
      assertAssessmentOutputScope(
        {
          ...raw,
          knowledgeVsAnswers: raw.knowledgeVsAnswers.map((comparison, index) =>
            index === 0 ? { ...comparison, platform: "kimi" } : comparison,
          ),
        },
        {
          question: raw.question,
          platforms: ["deepseek", "doubao"],
        },
      ),
    ).toThrow(/unexpected platform/i);
    expect(() =>
      assertAssessmentOutputScope(
        {
          ...raw,
          knowledgeVsAnswers: raw.knowledgeVsAnswers.map((comparison, index) =>
            index === 0 ? { ...comparison, runIndex: 6 } : comparison,
          ),
        },
        {
          question: raw.question,
          platforms: ["deepseek", "doubao"],
        },
      ),
    ).toThrow(/unexpected run index/i);
  });
});

describe("deterministic question-baseline scoring", () => {
  it("uses positive tone consistency and preserves missing coverage", () => {
    const assessment = calculateQuestionBaselineAssessment(validRawOutput());

    expect(clampRawIndicator(-2)).toBe(0);
    expect(clampRawIndicator(2)).toBe(1);
    expect(
      assessment.dimensions.semanticVisibility.indicators.multiPlatformCoverage
        .score,
    ).toBe(5);
    expect(
      assessment.dimensions.semanticRichness.indicators.semanticEntityRichness
        .score,
    ).toBe(0);
    expect(
      assessment.dimensions.semanticCoherence.indicators.toneConsistency.score,
    ).toBe(6);
    expect(assessment.overview.score).toBe(33.25);
    expect(assessment.overview.grade).toBe("D");
    expect(assessment.overview.coverage.ratio).toBe(0.75);
    expect(assessment.overview.normalizedMeasuredScore).toBe(44.33);
    expect(assessment.overview.structuralExcludedMaxScore).toBe(0);
    expect(assessment.overview.applicableMaxScore).toBe(100);
    expect(assessment.overview.applicableScore).toBe(33.25);
    expect(assessment.rankingDiagnostics.rankQualityScore).toBe(5.7);
    expect(assessment.rankingDiagnostics.additive).toBe(false);
  });

  it("applies reputation exclusion even when the model supplied visibility values", () => {
    const raw = validRawOutput();
    raw.question = {
      id: "reputation-01",
      text: "FrontMind 靠谱吗，有哪些问题？",
      category: "reputation",
      rankingMetricEligible: false,
    };
    raw.rankingDiagnostics = validIneligibleRawOutput(5).rankingDiagnostics;
    raw.dimensions.competitiveAdvantage.exclusiveSemanticSpace = indicator(
      0.5,
      "五项已核验差异化主张中，有一半能在回答中被准确识别。",
    );
    const assessment = calculateQuestionBaselineAssessment(raw);

    expect(assessment.reputationExclusionApplied).toBe(true);
    expect(
      assessment.dimensions.semanticVisibility.indicators.aiSearchVisibility
        .measurementStatus,
    ).toBe("unavailable");
    expect(
      assessment.dimensions.semanticVisibility.indicators.aiSearchVisibility
        .score,
    ).toBe(0);
    expect(
      assessment.dimensions.competitiveAdvantage.indicators.firstMentionRate
        .score,
    ).toBe(0);
    expect(
      assessment.dimensions.competitiveAdvantage.indicators
        .exclusiveSemanticSpace,
    ).toMatchObject({
      measurementStatus: "measured",
      score: 3.5,
    });
    expect(assessment.rankingDiagnostics.eligible).toBe(false);
    expect(assessment.rankingDiagnostics.rankQualityScore).toBeNull();
    expect(assessment.platformBreakdown[0].brandMentionRate).toBeNull();
    expect(assessment.overview.structuralExcludedMaxScore).toBe(28);
    expect(assessment.overview.applicableMaxScore).toBe(72);
    expect(assessment.overview.applicableScore).toBe(
      Math.round((assessment.overview.score / 72) * 10_000) / 100,
    );
  });

  it("keeps actual citations separate from retrieval references", () => {
    const assessment = calculateQuestionBaselineAssessment(validRawOutput());
    expect(assessment.platformBreakdown[0]).toMatchObject({
      citationCount: 2,
      referenceCount: 9,
    });
  });

  it("sorts evidence-linked actions without changing fact verdicts", () => {
    const assessment = calculateQuestionBaselineAssessment(validRawOutput());
    expect(assessment.priorityActions.map((item) => item.priority)).toEqual([
      1, 2,
    ]);
    expect(assessment.knowledgeVsAnswers.map((item) => item.verdict)).toEqual([
      "supported",
      "contradicted",
      "omitted",
      "unverifiable",
    ]);
  });
});

describe("assessment prompt", () => {
  it("loads the dedicated skill and confines Base to raw evidence extraction", async () => {
    const prompt = await buildAssessmentPrompt({
      companyName: "FrontMind",
      archiveFilename: "FrontMind-kb.zip",
      monitoringFilename: "FrontMind-monitoring.json",
      question: validRawOutput().question,
      monitoring: {
        platforms: ["deepseek"],
        repeatPerPlatform: 5,
        expectedResponses: 5,
        successfulResponses: 5,
        failedResponses: 0,
      },
    });

    expect(prompt).toContain("始终使用 Base 模型");
    expect(prompt).toContain(KNOWLEDGE_VERIFIER_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain(ASSESSMENT_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain("必须先执行 geo-knowledge-answer-verifier");
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);
    expect(prompt).toContain("不得自行计算或输出最终分数");
    expect(prompt).toContain("citationList 与 referenceList 必须分开保留");
    expect(prompt).toContain(
      '"monitoringRecordsFile": "FrontMind-monitoring.json"',
    );
  });

  it("packages both assessment Skills with their complete reference contracts", async () => {
    const [verifier, evaluator] = await Promise.all([
      buildGeoKnowledgeAnswerVerifierSkillArchive(),
      buildGeoCurrentStateEvaluatorSkillArchive(),
    ]);
    const verifierZip = await JSZip.loadAsync(verifier);
    const evaluatorZip = await JSZip.loadAsync(evaluator);
    expect(Object.keys(verifierZip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "references/comparison-contract.json",
    ]);
    expect(Object.keys(evaluatorZip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "references/bsas-baseline-methodology.md",
      "references/raw-output-schema.json",
    ]);
  });
});
