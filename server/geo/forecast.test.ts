import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  calculateQuestionBaselineAssessment,
  type AssessmentRawTaskOutput,
} from "./assessment";
import {
  FORECAST_SKILL_ARCHIVE_FILENAME,
  ForecastRawTaskOutputSchema,
  buildGeoOptimizationOutcomeForecasterSkillArchive,
  buildOptimizationOutcomeForecastPrompt,
  calculateOptimizationOutcomeForecast,
  parseOptimizationOutcomeForecastTaskOutput,
  type ForecastIndicator,
  type ForecastRawTaskOutput,
} from "./forecast";

function assessmentIndicator(rawValue: number) {
  return {
    rawValue,
    measurementStatus: "measured" as const,
    confidence: 0.85,
    calculationBasis: "依据同问题监控答案与企业知识库逐项核验。",
    evidenceRefs: ["assessment.dimensions", "kb/01_company.md"],
    limitations: [],
  };
}

function unavailableAssessmentIndicator() {
  return {
    rawValue: null,
    measurementStatus: "unavailable" as const,
    confidence: 0,
    calculationBasis: "本次单问题材料不足，无法可靠测量该指标。",
    evidenceRefs: [],
    limitations: ["本次单问题材料不足，无法可靠测量该指标。"],
  };
}

function baseline(
  rawValue: number,
  options: { reputation?: boolean; unavailableStructuredData?: boolean } = {},
) {
  const measured = () => assessmentIndicator(rawValue);
  const rankingEligible = !options.reputation;
  const value: AssessmentRawTaskOutput = {
    schemaVersion: 1,
    assessmentType: "question_baseline",
    question: {
      id: "question-01",
      text: options.reputation
        ? "FrontMind 超前智能好不好？"
        : "FrontMind 超前智能适合哪些企业使用？",
      category: options.reputation ? "reputation" : "product_scenario",
      rankingMetricEligible: rankingEligible,
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
        aiSearchVisibility: measured(),
        webSearchSov: measured(),
        multiPlatformCoverage: measured(),
      },
      semanticCoherence: {
        corePropositionHitRate: measured(),
        toneConsistency: measured(),
      },
      semanticRichness: {
        questionStageCoverage: measured(),
        semanticEntityRichness: measured(),
        contentFormatDiversity: measured(),
      },
      semanticAuthority: {
        authoritativeSourceRatio: measured(),
        structuredDataCompleteness: options.unavailableStructuredData
          ? unavailableAssessmentIndicator()
          : measured(),
        thirdPartyEndorsement: measured(),
      },
      competitiveAdvantage: {
        firstMentionRate: measured(),
        exclusiveSemanticSpace: measured(),
      },
    },
    rankingDiagnostics: rankingEligible
      ? {
          eligible: true,
          totalObservations: 5,
          rankedObservations: 5,
          unmentionedObservations: 0,
          averageRank: 2,
          firstPlaceRate: rawValue,
          top3Rate: rawValue,
          top5Rate: rawValue,
          competitorRankGap: 1,
          calculationBasis: "按五次回答中的品牌与竞品出现顺序统计。",
        }
      : {
          eligible: false,
          totalObservations: 0,
          rankedObservations: 0,
          unmentionedObservations: 0,
          averageRank: null,
          firstPlaceRate: null,
          top3Rate: null,
          top5Rate: null,
          competitorRankGap: null,
          calculationBasis: "舆情问题不参与品牌排名指标计算。",
        },
    platformBreakdown: [
      {
        platform: "deepseek",
        responseCount: 5,
        successfulResponses: 5,
        brandMentionRate: rankingEligible ? rawValue : null,
        averageRank: rankingEligible ? 2 : null,
        factAccuracy: rawValue,
        propositionHitRate: rawValue,
        citationCount: 1,
        referenceCount: 4,
        sentiment: "neutral",
        verdict: "回答存在基础品牌认知，但证据覆盖与主张表达仍有提升空间。",
        evidenceRefs: ["deepseek/run-01"],
      },
    ],
    knowledgeVsAnswers: [
      {
        id: "comparison-01",
        topic: "企业定位",
        verdict: "omitted",
        platform: null,
        runIndex: null,
        answerExcerpt: null,
        kbClaimId: "claims.positioning",
        kbClaimText: "企业知识库包含一条与当前问题相关的可核验定位主张。",
        kbEvidenceRefs: ["kb/01_company.md"],
        explanation: "本次回答未完整传达知识库中的相关定位主张。",
        recommendedAction: "在后续内容资产中补充该定位主张及其可核验证据。",
        confidence: 0.8,
      },
    ],
    summary:
      "当前同问题回答已形成可评分基线，后续目标只能作为完整执行与同口径复测前提下的条件区间。",
    priorityActions: [
      {
        priority: 1,
        dimension: "semanticCoherence",
        action: "统一企业定位、核心主张与可核验事实的表达口径。",
        expectedImpact: "提高核心主张命中与事实一致性。",
        evidenceRefs: ["kb/01_company.md"],
      },
    ],
    limitations: ["本次仅覆盖一个问题与一个平台。"],
  };
  return calculateQuestionBaselineAssessment(value);
}

function projectable(
  low = 0.2,
  high = 0.4,
  effectType: "direct_asset" | "observed_outcome" = "observed_outcome",
): ForecastIndicator {
  return {
    measurementStatus: "projectable",
    gapClosureLow: low,
    gapClosureHigh: high,
    effectType,
    confidence: 0.7,
    actionIds: ["GEO_A3_qa_assets"],
    rationale: "知识库与现状差距支持建立可验证的条件目标区间。",
    dependencies: ["完成计划内容资产并通过发布质量检查"],
    evidenceRefs: ["current-assessment.json#/priorityActions/0"],
    timeToSignalWeeks: 4,
    verificationMetric: "同问题、同平台、同重复次数复测该原始指标",
  };
}

function expectedEffectType(path: string) {
  return [
    "semanticCoherence.toneConsistency",
    "semanticRichness.questionStageCoverage",
    "semanticRichness.semanticEntityRichness",
    "semanticRichness.contentFormatDiversity",
    "semanticAuthority.structuredDataCompleteness",
  ].includes(path)
    ? ("direct_asset" as const)
    : ("observed_outcome" as const);
}

function maximumOneMonthProjectable(path: string) {
  const effectType = expectedEffectType(path);
  return effectType === "direct_asset"
    ? projectable(0.65, 0.9, effectType)
    : projectable(0.2, 0.4, effectType);
}

function notProjectable(): ForecastIndicator {
  return {
    measurementStatus: "not_projectable",
    gapClosureLow: null,
    gapClosureHigh: null,
    effectType: "not_applicable",
    confidence: 0,
    actionIds: [],
    rationale: "当前证据不足，不能建立可审计的条件目标区间。",
    dependencies: [],
    evidenceRefs: [],
    timeToSignalWeeks: null,
    verificationMetric: "补齐基线证据后重新判断是否可预测",
  };
}

function rawForecast(
  indicatorFactory: (path: string) => ForecastIndicator = (path) =>
    projectable(0.2, 0.4, expectedEffectType(path)),
): ForecastRawTaskOutput {
  return {
    schemaVersion: 1,
    forecastType: "conditional_4_week",
    horizonWeeks: 4,
    scenario: {
      name: "full_execution",
      actionIds: ["GEO_A3_qa_assets"],
      assumptions: [
        "企业按计划完成全部事实核验与内容资产建设",
        "发布页面能够被正常抓取、收录并保持稳定访问",
        "第 2 周检查执行进度，第 4 周严格使用相同问题与平台复测",
      ],
      verificationWeeks: [2, 4],
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: indicatorFactory(
          "semanticVisibility.aiSearchVisibility",
        ),
        webSearchSov: indicatorFactory("semanticVisibility.webSearchSov"),
        multiPlatformCoverage: indicatorFactory(
          "semanticVisibility.multiPlatformCoverage",
        ),
      },
      semanticCoherence: {
        corePropositionHitRate: indicatorFactory(
          "semanticCoherence.corePropositionHitRate",
        ),
        toneConsistency: indicatorFactory("semanticCoherence.toneConsistency"),
      },
      semanticRichness: {
        questionStageCoverage: indicatorFactory(
          "semanticRichness.questionStageCoverage",
        ),
        semanticEntityRichness: indicatorFactory(
          "semanticRichness.semanticEntityRichness",
        ),
        contentFormatDiversity: indicatorFactory(
          "semanticRichness.contentFormatDiversity",
        ),
      },
      semanticAuthority: {
        authoritativeSourceRatio: indicatorFactory(
          "semanticAuthority.authoritativeSourceRatio",
        ),
        structuredDataCompleteness: indicatorFactory(
          "semanticAuthority.structuredDataCompleteness",
        ),
        thirdPartyEndorsement: indicatorFactory(
          "semanticAuthority.thirdPartyEndorsement",
        ),
      },
      competitiveAdvantage: {
        firstMentionRate: indicatorFactory(
          "competitiveAdvantage.firstMentionRate",
        ),
        exclusiveSemanticSpace: indicatorFactory(
          "competitiveAdvantage.exclusiveSemanticSpace",
        ),
      },
    },
    roadmap: [
      {
        phase: 1,
        weeks: "第 1 周",
        title: "事实与定位修复",
        actions: ["核验实体、定位、术语与支撑证据"],
        verificationGate: "全部关键主张均可追溯到知识库证据",
      },
      {
        phase: 2,
        weeks: "第 2 周",
        title: "问题资产建设",
        actions: ["完成问题、场景、比较与 FAQ 内容资产"],
        verificationGate: "内容资产通过事实与质量检查",
      },
      {
        phase: 3,
        weeks: "第 3 周",
        title: "分发与权威建设",
        actions: ["发布并检查抓取、收录与引用路径"],
        verificationGate: "关键页面可访问且收录状态有记录",
      },
      {
        phase: 4,
        weeks: "第 4 周",
        title: "同口径复测",
        actions: ["按原问题、平台与次数重新监控"],
        verificationGate: "复测样本范围与当前基线完全一致",
      },
    ],
    summary:
      "在完整执行、成功发布收录并按相同范围复测的前提下，品牌语义资产存在可验证的一个月条件提升空间。",
    limitations: [
      "该预测仅覆盖当前单一问题。",
      "模型更新与第三方引用不受企业直接控制。",
      "所有区间必须经相同监控范围复测确认。",
    ],
    claimGuardrails: {
      isGuarantee: false,
      planningAssumptionOnly: true,
      requiresSameScopeRemeasurement: true,
    },
  };
}

describe("GEO optimization forecast schema and parser", () => {
  it("strictly parses a fenced nested Base response", () => {
    const raw = rawForecast();
    const parsed = parseOptimizationOutcomeForecastTaskOutput({
      output: [
        {
          role: "assistant",
          type: "message",
          content: [
            {
              type: "text",
              text: `preface with {ignored: true}\n\`\`\`json\n${JSON.stringify(raw)}\n\`\`\`\nafter`,
            },
          ],
        },
      ],
    });
    expect(parsed.forecastType).toBe("conditional_4_week");
    expect(parsed.roadmap.map((phase) => phase.phase)).toEqual([1, 2, 3, 4]);
  });

  it("accepts typed task.output text but ignores user, metadata, and reasoning payloads", () => {
    const raw = rawForecast();
    const injected = {
      ...raw,
      summary:
        "来自不可信字段的预测摘要，不应覆盖受信任 assistant 输出中的真实结果。",
    };
    const parsed = parseOptimizationOutcomeForecastTaskOutput({
      metadata: { content: JSON.stringify(injected) },
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

    expect(parsed.summary).toBe(raw.summary);
    expect(() =>
      parseOptimizationOutcomeForecastTaskOutput({
        metadata: { content: JSON.stringify(raw) },
        output: [
          {
            role: "user",
            type: "message",
            content: [{ type: "text", text: JSON.stringify(raw) }],
          },
          { type: "reasoning", text: JSON.stringify(raw) },
        ],
      }),
    ).toThrow(/strict geo-optimization-outcome-forecaster JSON/);
  });

  it("rejects scores, reversed ranges, and invalid not-projectable fields", () => {
    expect(
      ForecastRawTaskOutputSchema.safeParse({
        ...rawForecast(),
        totalScore: 88,
      }).success,
    ).toBe(false);

    const reversed = rawForecast();
    reversed.dimensions.semanticVisibility.aiSearchVisibility = projectable(
      0.8,
      0.2,
    );
    expect(ForecastRawTaskOutputSchema.safeParse(reversed).success).toBe(false);

    const invalidUnavailable = rawForecast();
    invalidUnavailable.dimensions.semanticVisibility.aiSearchVisibility = {
      ...notProjectable(),
      gapClosureLow: 0,
    };
    expect(
      ForecastRawTaskOutputSchema.safeParse(invalidUnavailable).success,
    ).toBe(false);
  });

  it("rejects horizons, signal timing, and roadmap labels outside one month", () => {
    expect(
      ForecastRawTaskOutputSchema.safeParse({
        ...rawForecast(),
        horizonWeeks: 12,
      }).success,
    ).toBe(false);

    const lateSignal = rawForecast();
    lateSignal.dimensions.semanticVisibility.aiSearchVisibility = {
      ...lateSignal.dimensions.semanticVisibility.aiSearchVisibility,
      timeToSignalWeeks: 5,
    };
    expect(ForecastRawTaskOutputSchema.safeParse(lateSignal).success).toBe(
      false,
    );

    const quarterlyRoadmap = rawForecast();
    quarterlyRoadmap.roadmap[3] = {
      ...quarterlyRoadmap.roadmap[3],
      weeks: "第 11-12 周",
    };
    expect(
      ForecastRawTaskOutputSchema.safeParse(quarterlyRoadmap).success,
    ).toBe(false);
  });

  it("rejects gap closure above the one-month effect ceilings", () => {
    const excessiveObserved = rawForecast();
    excessiveObserved.dimensions.semanticVisibility.aiSearchVisibility =
      projectable(0.21, 0.4, "observed_outcome");
    expect(
      ForecastRawTaskOutputSchema.safeParse(excessiveObserved).success,
    ).toBe(false);

    const excessiveDirect = rawForecast();
    excessiveDirect.dimensions.semanticRichness.questionStageCoverage =
      projectable(0.66, 0.9, "direct_asset");
    expect(ForecastRawTaskOutputSchema.safeParse(excessiveDirect).success).toBe(
      false,
    );
  });
});

describe("deterministic GEO optimization forecast scoring", () => {
  it("maps gap closure to raw targets with server-owned weights", () => {
    const onlyVisibility = rawForecast((path) =>
      path === "semanticVisibility.aiSearchVisibility"
        ? projectable(0.2, 0.4)
        : notProjectable(),
    );
    const result = calculateOptimizationOutcomeForecast(
      baseline(0.5),
      onlyVisibility,
    );
    const indicator =
      result.dimensions.semanticVisibility.indicators.aiSearchVisibility;

    expect(indicator.current.raw).toBe(0.5);
    expect(indicator.low.raw).toBe(0.6);
    expect(indicator.expected.raw).toBe(0.65);
    expect(indicator.high.raw).toBe(0.7);
    expect(result.total).toMatchObject({
      current: 50,
      low: 51.5,
      expected: 52.25,
      high: 53,
    });
  });

  it.each([
    [0, "E", 10, 18],
    [0.25, "D", 12, 18],
    [0.45, "C", 7, 12],
    [0.65, "B", 3, 7],
    [0.85, "A", 0, 3],
  ] as const)(
    "caps full-execution baseline %s (%s) at %s-%s raw points",
    (rawValue, grade, capLow, capHigh) => {
      const result = calculateOptimizationOutcomeForecast(
        baseline(rawValue),
        rawForecast(maximumOneMonthProjectable),
      );
      expect(result.total.empiricalCap.baselineGrade).toBe(grade);
      expect(result.total.upliftLow).toBeLessThanOrEqual(capLow);
      expect(result.total.upliftHigh).toBeLessThanOrEqual(capHigh);
      expect(result.total.low).toBeLessThanOrEqual(result.total.expected);
      expect(result.total.expected).toBeLessThanOrEqual(result.total.high);
    },
  );

  it("keeps scoreable differentiator clarity in a reputation forecast", () => {
    const result = calculateOptimizationOutcomeForecast(
      baseline(1 / 3, { reputation: true }),
      rawForecast(maximumOneMonthProjectable),
    );

    expect(result.total).toMatchObject({
      current: 23.99,
      low: 35.99,
      expected: 38.99,
      high: 41.99,
    });
    expect(result.applicableTotal).toMatchObject({
      rawApplicableMaxScore: 72,
      structuralExcludedMaxScore: 28,
      current: 33.32,
      low: 49.99,
      expected: 54.15,
      high: 58.32,
    });
    expect(result.gradeRange).toMatchObject({
      current: "D",
      low: "D",
      expected: "D",
      high: "C",
    });
    expect(result.applicableGradeRange).toMatchObject({
      current: "D",
      low: "C",
      expected: "C",
      high: "C",
      label: "C",
    });
    expect(
      result.dimensions.competitiveAdvantage.indicators.firstMentionRate,
    ).toMatchObject({
      measurementStatus: "not_projectable",
      current: { raw: null, score: 0 },
    });
    const exclusiveSemanticSpace =
      result.dimensions.competitiveAdvantage.indicators.exclusiveSemanticSpace;
    expect(exclusiveSemanticSpace).toMatchObject({
      measurementStatus: "projectable",
      current: { raw: 1 / 3, score: 2.33 },
    });
    expect(exclusiveSemanticSpace.low.score).toBeGreaterThan(
      exclusiveSemanticSpace.current.score,
    );
    expect(exclusiveSemanticSpace.high.score).toBeGreaterThan(
      exclusiveSemanticSpace.low.score,
    );
    expect(result.dimensions.competitiveAdvantage.low).toBeGreaterThan(
      result.dimensions.competitiveAdvantage.current,
    );
    expect(result.dimensions.competitiveAdvantage.high).toBeGreaterThan(
      result.dimensions.competitiveAdvantage.low,
    );
  });

  it("reduces only the low target when the accepted baseline sample is partial", () => {
    const complete = baseline(1 / 3, { reputation: true });
    const partial = {
      ...complete,
      scope: {
        ...complete.scope,
        successfulResponses: 3,
        failedResponses: 2,
      },
    };
    const result = calculateOptimizationOutcomeForecast(
      partial,
      rawForecast(maximumOneMonthProjectable),
    );

    expect(result.total.empiricalCap).toMatchObject({
      low: 12,
      high: 18,
      effectiveLow: 9.6,
      effectiveHigh: 18,
      lowReliabilityFactor: 0.8,
    });
    expect(result.total.upliftLow).toBeLessThanOrEqual(9.6);
    expect(result.total.upliftHigh).toBeLessThanOrEqual(18);
    expect(result.limitations.join("\n")).toContain("挑战上沿");
  });

  it("keeps unavailable and reputation-excluded indicators unprojected", () => {
    const result = calculateOptimizationOutcomeForecast(
      baseline(0.2, {
        reputation: true,
        unavailableStructuredData: true,
      }),
      rawForecast(),
    );
    const visibility =
      result.dimensions.semanticVisibility.indicators.aiSearchVisibility;
    const structured =
      result.dimensions.semanticAuthority.indicators.structuredDataCompleteness;
    const web = result.dimensions.semanticVisibility.indicators.webSearchSov;

    expect(visibility.measurementStatus).toBe("not_projectable");
    expect(visibility.current.raw).toBeNull();
    expect(visibility.high.raw).toBeNull();
    expect(structured.measurementStatus).toBe("not_projectable");
    expect(structured.high.raw).toBeNull();
    expect(web.measurementStatus).toBe("projectable");
    expect(result.limitations.join("\n")).toContain("舆情题干点名品牌");
    expect(result.limitations.join("\n")).toContain("未知基线");
  });

  it("cancels model projections that cross the server effect boundary", () => {
    const mismatched = rawForecast((path) =>
      path === "semanticRichness.questionStageCoverage"
        ? projectable(0.2, 0.4, "observed_outcome")
        : notProjectable(),
    );
    const result = calculateOptimizationOutcomeForecast(
      baseline(0.4),
      mismatched,
    );
    const indicator =
      result.dimensions.semanticRichness.indicators.questionStageCoverage;

    expect(indicator.measurementStatus).toBe("not_projectable");
    expect(indicator.high.raw).toBe(0.4);
    expect(indicator.effectType).toBe("not_applicable");
    expect(result.limitations.join("\n")).toContain(
      "effectType 与服务端指标边界不符",
    );
  });

  it("returns an auditable action plan, roadmap, assumptions, and grade range", () => {
    const result = calculateOptimizationOutcomeForecast(
      baseline(0.45),
      rawForecast(),
    );
    expect(result.actions[0]).toMatchObject({
      id: "GEO_A3_qa_assets",
      label: "问答与场景内容资产",
    });
    expect(result.actions[0].indicatorPaths).toHaveLength(13);
    expect(result.roadmap).toHaveLength(4);
    expect(result.assumptions).toHaveLength(3);
    expect(result.gradeRange.label).toMatch(/^[A-E](?:–[A-E])?$/);
    expect(result.applicableGradeRange.label).toMatch(/^[A-E](?:–[A-E])?$/);
    expect(result.claimGuardrails.isGuarantee).toBe(false);
  });
});

describe("forecast Base prompt and audited skill loader", () => {
  it("loads all four skill files and keeps final scoring on the server", async () => {
    const prompt = await buildOptimizationOutcomeForecastPrompt({
      currentAssessmentFilename: "FrontMind-current-assessment.json",
      knowledgeBaseArchiveFilename: "FrontMind-kb.zip",
      executionScenarioFilename: "FrontMind-full-execution-scenario.json",
      scenarioName: "full_execution",
    });

    expect(prompt).toContain("始终使用 Base 模型");
    expect(prompt).toContain("不得计算或返回分数、等级、分数增量");
    expect(prompt).toContain("适用范围");
    expect(prompt).toContain(
      '"currentAssessmentAttachment": "FrontMind-current-assessment.json"',
    );
    expect(prompt).toContain('"knowledgeBaseArchive": "FrontMind-kb.zip"');
    expect(prompt).toContain(
      '"executionScenarioAttachment": "FrontMind-full-execution-scenario.json"',
    );
    expect(prompt).toContain(FORECAST_SKILL_ARCHIVE_FILENAME);
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);

    const archive = await buildGeoOptimizationOutcomeForecasterSkillArchive();
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "references/impact-forecast-methodology.md",
      "references/output-schema.json",
      "references/source-manifest.json",
    ]);
  });
});
