import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  calculateQuestionBaselineAssessment,
  type AssessmentRawTaskOutput,
} from "./assessment";
import {
  buildGeoOptimizationOutcomeForecastTemplate,
  buildBrandMentionRateForecast,
  buildForecastDisplayOnlyProjection,
  FORECAST_SKILL_ARCHIVE_FILENAME,
  FORECAST_OUTPUT_RESULT_FILENAME,
  FORECAST_OUTPUT_TEMPLATE_FILENAME,
  ForecastTaskOutputValidationError,
  ForecastRawTaskOutputSchema,
  isCompleteForecast,
  buildGeoOptimizationOutcomeForecasterSkillArchive,
  buildOptimizationOutcomeForecastPrompt,
  buildOptimizationOutcomeForecastTaskInput,
  calculateOptimizationOutcomeForecast,
  parseOptimizationOutcomeForecastTaskOutput,
  resolveOptimizationOutcomeForecastTaskOutput,
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
  options: {
    reputation?: boolean;
    unavailableStructuredData?: boolean;
    schemaVersion?: 1 | 2;
    supportedComparison?: boolean;
  } = {},
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
        verdict: options.supportedComparison ? "supported" : "omitted",
        platform: options.supportedComparison ? "deepseek" : null,
        runIndex: options.supportedComparison ? 1 : null,
        answerExcerpt: options.supportedComparison
          ? "回答准确提到了企业定位。"
          : null,
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
  if (options.schemaVersion === 2) {
    value.schemaVersion = 2;
    value.platformBreakdown = value.platformBreakdown.map(
      ({ citationCount = 0, referenceCount = 0, ...platform }) => ({
        ...platform,
        sourceCount: citationCount + referenceCount,
      }),
    );
    value.executiveSummary =
      "当前已形成基础认知，但事实和来源覆盖仍需提升；本月将补齐内容和证据，并在月底按同一口径复测。";
    value.dimensionNarratives = {
      semanticVisibility: {
        currentFinding: "当前回答已经能够识别企业及其主要服务。",
        nextAction: "补齐核心业务内容和稳定的公开来源路径。",
      },
      semanticCoherence: {
        currentFinding: "核心事实基本一致，部分边界仍需统一。",
        nextAction: "统一定位、能力边界和风险说明语言。",
      },
      semanticRichness: {
        currentFinding: "回答已覆盖部分场景，采购信息仍不完整。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要事实已有部分来源支持，独立证据偏少。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "部分差异点已经出现，但表达还不稳定。",
        nextAction: "围绕真实差异点完善对比内容和证据。",
      },
    };
  }
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

function rawV2Forecast(): ForecastRawTaskOutput {
  const legacy = rawForecast();
  return {
    ...legacy,
    schemaVersion: 2,
    scenario: {
      ...legacy.scenario,
      actionIds: [
        "GEO_A1_entity_facts",
        "GEO_A2_ai_visibility",
        "GEO_A3_qa_assets",
        "GEO_A4_positioning_language",
        "GEO_A5_site_schema",
        "GEO_A6_distribution_citations",
      ],
    },
    dimensions: {
      ...legacy.dimensions,
      semanticVisibility: {
        ...legacy.dimensions.semanticVisibility,
        aiSearchVisibility: {
          ...legacy.dimensions.semanticVisibility.aiSearchVisibility,
          actionIds: [
            "GEO_A1_entity_facts",
            "GEO_A2_ai_visibility",
            "GEO_A3_qa_assets",
            "GEO_A4_positioning_language",
            "GEO_A5_site_schema",
            "GEO_A6_distribution_citations",
          ],
        },
      },
    },
    executiveSummary:
      "当前已有稳定的基础认知，但证据与内容覆盖仍需加强；未来四周先补齐事实和问答资产，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "当前回答已能识别企业及其主要服务方向。",
        nextAction: "补齐核心能力内容并建立持续分发路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张的表达存在少量边界不清问题。",
        nextAction: "统一定位、能力边界和风险说明语言。",
      },
      semanticRichness: {
        currentFinding: "采购决策所需的部分关键问题尚未覆盖。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要判断已有部分来源支持但仍不充分。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "可核验差异点尚未形成稳定的统一表达。",
        nextAction: "围绕真实差异点完善对比内容和证据。",
      },
    },
  };
}

describe("GEO optimization forecast schema and parser", () => {
  it("accepts v2 customer narratives and keeps the roadmap concise", () => {
    const raw = rawV2Forecast();
    const parsed = ForecastRawTaskOutputSchema.parse(raw);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.executiveSummary).toContain("未来四周");
    expect(parsed.roadmap.every((phase) => phase.actions.length <= 3)).toBe(
      true,
    );
  });

  it("accepts an independent ordered brand-mention target while preserving old outputs", () => {
    const legacyCompatible = rawV2Forecast();
    expect(
      ForecastRawTaskOutputSchema.parse(legacyCompatible)
        .brandMentionRateTarget,
    ).toBeUndefined();

    const productForecast = {
      ...rawV2Forecast(),
      brandMentionRateTarget: null,
    };
    expect(
      ForecastRawTaskOutputSchema.parse(productForecast).brandMentionRateTarget,
    ).toBeNull();

    const industryForecast = {
      ...rawV2Forecast(),
      brandMentionRateTarget: { low: 0.6, expected: 0.75, high: 0.9 },
    };
    expect(
      ForecastRawTaskOutputSchema.parse(industryForecast)
        .brandMentionRateTarget,
    ).toEqual({ low: 0.6, expected: 0.75, high: 0.9 });

    expect(
      ForecastRawTaskOutputSchema.safeParse({
        ...rawV2Forecast(),
        brandMentionRateTarget: { low: 0.8, expected: 0.7, high: 0.9 },
      }).success,
    ).toBe(false);
    expect(
      ForecastRawTaskOutputSchema.safeParse({
        ...rawV2Forecast(),
        brandMentionRateTarget: { low: 0.6, expected: 0.75, high: 1.1 },
      }).success,
    ).toBe(false);
  });

  it("uses the monitor observation as the brand target floor", () => {
    expect(
      buildBrandMentionRateForecast(
        { current: 0.8, observedAnswers: 4 },
        { low: 0.5, expected: 0.7, high: 0.75 },
      ),
    ).toEqual({
      current: 0.8,
      low: 0.8,
      expected: 0.8,
      high: 0.8,
      observedAnswers: 4,
    });
    expect(
      buildBrandMentionRateForecast(
        { current: 0.4, observedAnswers: 0 },
        { low: 0.5, expected: 0.7, high: 0.8 },
      ),
    ).toBeUndefined();
    expect(
      buildBrandMentionRateForecast({ current: 0.4, observedAnswers: 4 }, null),
    ).toBeUndefined();
  });

  it("keeps safe narratives and roadmap fragments as a display-only partial", () => {
    const raw = structuredClone(rawV2Forecast()) as Record<string, unknown>;
    delete raw.dimensions;
    (raw.roadmap as unknown[]).push({ phase: 5, title: "无效阶段" });

    expect(isCompleteForecast(raw)).toBe(false);
    const projection = buildForecastDisplayOnlyProjection({
      localTaskId: "forecast-1",
      operationId: "operation:forecast-1",
      status: "succeeded",
      safeEvents: [],
      result: { structuredResult: raw, artifacts: [] },
    });

    expect(projection).toMatchObject({
      completeness: "partial",
      horizonWeeks: 4,
      executiveSummary: expect.stringContaining("基础认知"),
    });
    expect(projection?.roadmap.map((phase) => phase.phase)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(Object.keys(projection?.dimensionNarratives ?? {})).toHaveLength(5);
  });

  it("rejects display-only forecast content when guardrails or scenario scope differ", () => {
    const invalidGuardrails = structuredClone(rawV2Forecast()) as Record<
      string,
      unknown
    >;
    delete invalidGuardrails.dimensions;
    invalidGuardrails.claimGuardrails = {
      isGuarantee: true,
      planningAssumptionOnly: true,
      requiresSameScopeRemeasurement: true,
    };
    expect(
      buildForecastDisplayOnlyProjection({
        result: { structuredResult: invalidGuardrails, artifacts: [] },
      }),
    ).toBeUndefined();

    const incompleteScenario = structuredClone(rawV2Forecast()) as Record<
      string,
      unknown
    >;
    delete incompleteScenario.dimensions;
    (incompleteScenario.scenario as { actionIds: string[] }).actionIds = [
      "GEO_A3_qa_assets",
    ];
    expect(
      buildForecastDisplayOnlyProjection({
        result: { structuredResult: incompleteScenario, artifacts: [] },
      }),
    ).toBeUndefined();
  });

  it("keeps business-facing Schema wording out of structural validation", () => {
    const raw = rawV2Forecast();
    raw.dimensionNarratives.semanticAuthority = {
      currentFinding:
        "官网 Schema 标记仍不完整，权威信息的可追溯性还有提升空间。",
      nextAction: "完善官网 Schema 标记，并补充独立、可核验的合规来源。",
    };

    expect(ForecastRawTaskOutputSchema.safeParse(raw).success).toBe(true);
  });

  it("still rejects actual internal schema and effect tokens in customer copy", () => {
    const raw = rawV2Forecast();
    raw.dimensionNarratives.semanticAuthority.currentFinding =
      "当前结果仍带有 observed_outcome 内部枚举，不应直接展示给客户。";
    expect(ForecastRawTaskOutputSchema.safeParse(raw).success).toBe(false);

    raw.dimensionNarratives.semanticAuthority.currentFinding =
      "当前文案错误提到了 output-schema.json，不应直接展示给客户。";
    expect(ForecastRawTaskOutputSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects incomplete v2 indicators and action mappings instead of filling defaults", () => {
    const missingIndicator = rawV2Forecast();
    missingIndicator.dimensions.semanticVisibility.aiSearchVisibility =
      notProjectable();
    expect(
      ForecastRawTaskOutputSchema.safeParse(missingIndicator).success,
    ).toBe(false);

    const missingScenarioAction = rawV2Forecast();
    missingScenarioAction.scenario.actionIds = ["GEO_A3_qa_assets"];
    expect(
      ForecastRawTaskOutputSchema.safeParse(missingScenarioAction).success,
    ).toBe(false);

    const unmappedAction = rawV2Forecast();
    unmappedAction.dimensions.semanticVisibility.aiSearchVisibility = {
      ...unmappedAction.dimensions.semanticVisibility.aiSearchVisibility,
      actionIds: ["GEO_A3_qa_assets"],
    };
    expect(ForecastRawTaskOutputSchema.safeParse(unmappedAction).success).toBe(
      false,
    );

    const wrongEffect = rawV2Forecast();
    wrongEffect.dimensions.semanticRichness.questionStageCoverage = {
      ...wrongEffect.dimensions.semanticRichness.questionStageCoverage,
      effectType: "observed_outcome",
    };
    expect(ForecastRawTaskOutputSchema.safeParse(wrongEffect).success).toBe(
      false,
    );

    const emptyRange = rawV2Forecast();
    emptyRange.dimensions.semanticAuthority.authoritativeSourceRatio = {
      ...emptyRange.dimensions.semanticAuthority.authoritativeSourceRatio,
      gapClosureLow: 0,
      gapClosureHigh: 0,
    };
    expect(ForecastRawTaskOutputSchema.safeParse(emptyRange).success).toBe(
      false,
    );

    const missingSignalWindow = rawV2Forecast();
    missingSignalWindow.dimensions.semanticVisibility.aiSearchVisibility.timeToSignalWeeks =
      null;
    expect(
      ForecastRawTaskOutputSchema.safeParse(missingSignalWindow).success,
    ).toBe(false);

    const excessiveLimitations = rawV2Forecast();
    excessiveLimitations.limitations = [
      "限制一说明",
      "限制二说明",
      "限制三说明",
      "限制四说明",
    ];
    expect(
      ForecastRawTaskOutputSchema.safeParse(excessiveLimitations).success,
    ).toBe(false);
  });

  it("strictly parses a typed Base result", () => {
    const raw = rawForecast();
    const parsed = parseOptimizationOutcomeForecastTaskOutput({
      result: { structuredResult: raw, artifacts: [] },
    });
    expect(parsed.forecastType).toBe("conditional_4_week");
    expect(parsed.roadmap.map((phase) => phase.phase)).toEqual([1, 2, 3, 4]);
  });

  it("fails closed when one forecast operation returns conflicting strict candidates", () => {
    const first = rawForecast();
    const second = structuredClone(first);
    second.summary = `${second.summary} Conflicting version.`;

    expect(() =>
      parseOptimizationOutcomeForecastTaskOutput({
        output: [
          {
            role: "assistant",
            type: "output_text",
            text: JSON.stringify(first),
          },
          {
            role: "assistant",
            type: "output_text",
            text: JSON.stringify(second),
          },
        ],
      }),
    ).toThrow("strict geo-optimization-outcome-forecaster JSON");
  });

  it("rejects malformed forecast text instead of repairing it", () => {
    const raw = rawForecast();
    raw.summary = '规划结果为"可执行但仍需复测"，不得视为结果保证。';
    const malformed = JSON.stringify(raw).replaceAll('\\"', '"');
    expect(() => JSON.parse(malformed)).toThrow();

    expect(() =>
      parseOptimizationOutcomeForecastTaskOutput({
        result: { structuredResult: malformed, artifacts: [] },
      }),
    ).toThrow(/strict geo-optimization-outcome-forecaster JSON/);
  });

  it("does not resolve forecast result files or URLs", async () => {
    const raw = rawForecast();
    const downloads: Array<{
      taskId: string;
      url: string;
      filename?: string;
    }> = [];
    const promise = resolveOptimizationOutcomeForecastTaskOutput(
      {
        async downloadFile() {
          throw new Error("file endpoint should not be used");
        },
        async downloadTaskOutput(taskId, url, filename) {
          downloads.push({ taskId, url, filename });
          return new Response(JSON.stringify(raw));
        },
      },
      {
        output: [
          { type: "output_text", text: "预测已完成，结果见附件。" },
          {
            type: "output_file",
            file_url: "https://agent.example.test/result/forecast",
            filename: "forecast.json",
          },
        ],
      },
      { taskId: "forecast-task" },
    );

    await expect(promise).rejects.toMatchObject({ code: "INVALID_JSON" });
    expect(downloads).toEqual([]);
  });

  it("fails on conflicting valid channels and safely falls back when the file is unavailable", async () => {
    const inline = rawForecast();
    inline.summary =
      "这是 inline 通道中的完整预测摘要，仅用于验证安全回退逻辑。";
    const fromFile = rawForecast();
    fromFile.summary =
      "这是 typed output_file 中的完整预测摘要，应作为首选结果。";

    const conflicting = resolveOptimizationOutcomeForecastTaskOutput(
      {
        async downloadFile() {
          return new Response(JSON.stringify(fromFile));
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          { type: "output_text", text: JSON.stringify(inline) },
          {
            type: "output_file",
            file_id: "forecast-result",
            filename: FORECAST_OUTPUT_RESULT_FILENAME,
          },
        ],
      },
    );
    await expect(conflicting).rejects.toMatchObject({ code: "INVALID_JSON" });

    const fallback = resolveOptimizationOutcomeForecastTaskOutput(
      {
        async downloadFile() {
          throw new Error("provider file expired");
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          { type: "output_text", text: JSON.stringify(inline) },
          {
            type: "output_file",
            file_id: "expired-forecast-result",
            filename: FORECAST_OUTPUT_RESULT_FILENAME,
          },
        ],
      },
    );
    await expect(fallback).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("returns a safe forecast error code for invalid downloaded JSON", async () => {
    const promise = resolveOptimizationOutcomeForecastTaskOutput(
      {
        async downloadFile() {
          return new Response(Buffer.from([0xff, 0xfe, 0xfd]));
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          {
            type: "output_file",
            file_id: "invalid-utf8",
            filename: "forecast.json",
          },
        ],
      },
    );

    await expect(promise).rejects.toBeInstanceOf(
      ForecastTaskOutputValidationError,
    );
    await expect(promise).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("accepts only typed results and ignores raw output, metadata, and reasoning", () => {
    const raw = rawForecast();
    const injected = {
      ...raw,
      summary:
        "来自不可信字段的预测摘要，不应覆盖受信任 assistant 输出中的真实结果。",
    };
    const rawTask = {
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
    };
    expect(() => parseOptimizationOutcomeForecastTaskOutput(rawTask)).toThrow(
      /strict geo-optimization-outcome-forecaster JSON/,
    );
    expect(
      parseOptimizationOutcomeForecastTaskOutput({
        result: { structuredResult: raw, artifacts: [] },
      }).summary,
    ).toBe(raw.summary);
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

  it("accepts completed legacy artifacts with the previous seven audit limitations", () => {
    const legacy = rawForecast();
    legacy.limitations = Array.from(
      { length: 7 },
      (_, index) => `历史任务审计边界 ${index + 1}`,
    );

    const parsed = parseOptimizationOutcomeForecastTaskOutput({
      result: { structuredResult: legacy, artifacts: [] },
    });

    expect(parsed.limitations).toHaveLength(7);
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
      projectable(0.56, 0.75, "observed_outcome");
    expect(
      ForecastRawTaskOutputSchema.safeParse(excessiveObserved).success,
    ).toBe(false);

    const excessiveDirect = rawForecast();
    excessiveDirect.dimensions.semanticRichness.questionStageCoverage =
      projectable(0.76, 0.95, "direct_asset");
    expect(ForecastRawTaskOutputSchema.safeParse(excessiveDirect).success).toBe(
      false,
    );
  });
});

describe("deterministic GEO optimization forecast scoring", () => {
  it("applies the v2 conditional target policy without changing action mapping", () => {
    const raw = rawV2Forecast();
    for (const indicators of Object.values(raw.dimensions)) {
      for (const indicator of Object.values(
        indicators,
      ) as ForecastIndicator[]) {
        indicator.gapClosureLow = 0.01;
        indicator.gapClosureHigh = 0.02;
      }
    }

    const result = calculateOptimizationOutcomeForecast(
      baseline(0.1, { schemaVersion: 2 }),
      raw,
    );

    expect(result.total.current).toBe(8.8);
    expect(result.total.low).toBe(60);
    expect(result.total.expected).toBe(62);
    expect(result.total.high).toBe(64);
    expect(result.applicableTotal.low).toBe(60);
    expect(result.total.upliftLow).toBe(51.2);
    expect(result.total.high).toBeLessThan(100);
    expect(
      Object.values(result.dimensions).reduce(
        (sum, dimension) => sum + dimension.low,
        0,
      ),
    ).toBeCloseTo(result.total.low, 1);
    expect(
      Object.values(result.dimensions).reduce(
        (sum, dimension) => sum + dimension.high,
        0,
      ),
    ).toBeCloseTo(result.total.high, 1);
    expect(
      result.dimensions.semanticVisibility.indicators.aiSearchVisibility
        .actionIds,
    ).toEqual(raw.dimensions.semanticVisibility.aiSearchVisibility.actionIds);
  });

  it("keeps a high v2 planning target below 100 when ten points of headroom do not remain", () => {
    const result = calculateOptimizationOutcomeForecast(
      baseline(0.95, {
        schemaVersion: 2,
        supportedComparison: true,
      }),
      rawV2Forecast(),
    );

    expect(result.applicableTotal.current).toBeGreaterThan(89);
    expect(result.applicableTotal.low).toBe(99);
    expect(result.applicableTotal.high).toBe(99);
    expect(result.applicableTotal.high).toBeLessThan(100);
    expect(result.applicableTotal.upliftLow).toBeLessThan(10);
  });

  it("does not run a v2 forecast against a legacy assessment", () => {
    expect(() =>
      calculateOptimizationOutcomeForecast(baseline(0.1), rawV2Forecast()),
    ).toThrow(/require a v2 assessment/i);
  });

  it("keeps historical v1 sparse-projection compatibility", () => {
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
    expect(indicator.low.raw).toBeGreaterThan(indicator.current.raw);
    expect(indicator.expected.raw).toBeGreaterThanOrEqual(indicator.low.raw!);
    expect(indicator.high.raw).toBeGreaterThanOrEqual(indicator.expected.raw!);
    expect(result.total).toMatchObject({
      current: 50,
      low: 60,
      expected: 63,
      high: 66,
    });
    expect(
      result.dimensions.semanticAuthority.indicators.structuredDataCompleteness
        .measurementStatus,
    ).toBe("projectable");
  });

  it.each([
    [0, "E", 60, 66],
    [0.25, "D", 60, 66],
    [0.45, "C", 60, 66],
    [0.65, "B", 68, 72],
    [0.85, "A", 85, 88],
  ] as const)(
    "maps full-execution baseline %s (%s) to the qualified %s-%s target band",
    (rawValue, grade, targetLow, targetHigh) => {
      const result = calculateOptimizationOutcomeForecast(
        baseline(rawValue),
        rawForecast(maximumOneMonthProjectable),
      );
      expect(result.total.empiricalCap.baselineGrade).toBe(grade);
      expect(result.applicableTotal.low).toBe(targetLow);
      expect(result.applicableTotal.high).toBe(targetHigh);
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
      low: 43.2,
      expected: 45.36,
      high: 47.52,
    });
    expect(result.applicableTotal).toMatchObject({
      rawApplicableMaxScore: 72,
      structuralExcludedMaxScore: 28,
      current: 33.32,
      low: 60,
      expected: 63,
      high: 66,
    });
    expect(result.gradeRange).toMatchObject({
      current: "D",
      low: "C",
      expected: "C",
      high: "C",
    });
    expect(result.applicableGradeRange).toMatchObject({
      current: "D",
      low: "B",
      expected: "B",
      high: "B",
      label: "B",
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

  it("keeps the historical v1 target floor when the accepted sample is partial", () => {
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
      effectiveLow: 19.21,
      effectiveHigh: 23.53,
      lowReliabilityFactor: 0.8,
    });
    expect(result.applicableTotal.low).toBe(60);
    expect(result.applicableTotal.high).toBe(66);
    expect(result.limitations.join("\n")).toContain("复测置信度");
  });

  it("keeps reputation exclusions while giving unavailable indicators an action-backed target", () => {
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
    expect(structured.measurementStatus).toBe("projectable");
    expect(structured.current.raw).toBeNull();
    expect(structured.high.raw).toBeGreaterThan(0);
    expect(structured.rationale).not.toContain("不支持");
    expect(web.measurementStatus).toBe("projectable");
    expect(result.limitations.join("\n")).toContain("舆情题干点名品牌");
    expect(result.applicableTotal.low).toBeGreaterThanOrEqual(60);
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
    expect(result.actions).toHaveLength(6);
    expect(
      result.actions.find((action) => action.id === "GEO_A3_qa_assets"),
    ).toMatchObject({
      id: "GEO_A3_qa_assets",
      label: "问答与场景内容资产",
    });
    expect(
      result.actions.every((action) => action.indicatorPaths.length > 0),
    ).toBe(true);
    expect(result.roadmap).toHaveLength(4);
    expect(result.assumptions).toHaveLength(3);
    expect(result.gradeRange.label).toMatch(/^[A-E](?:–[A-E])?$/);
    expect(result.applicableGradeRange.label).toMatch(/^[A-E](?:–[A-E])?$/);
    expect(result.claimGuardrails.isGuarantee).toBe(false);
  });
});

describe("forecast Base prompt and audited skill loader", () => {
  it("loads the audited skill and invalid-by-default output template", async () => {
    const prompt = await buildOptimizationOutcomeForecastPrompt({
      currentAssessmentFilename: "FrontMind-current-assessment.json",
      knowledgeBaseArchiveFilename: "FrontMind-kb.zip",
      executionScenarioFilename: "FrontMind-full-execution-scenario.json",
      scenarioName: "full_execution",
    });

    expect(prompt).toContain("始终使用 Base 模型");
    expect(prompt).toContain("不得计算或返回分数、等级、分数增量");
    expect(prompt).toContain("v2 保守五维分数");
    expect(prompt).toContain("至少 60 分");
    expect(prompt).toContain("尽量较当前提升 10 分");
    expect(prompt).toContain("不得把规划门槛写成已实现结果");
    expect(prompt).toContain("缺失或不可用时应校验失败");
    expect(prompt).not.toContain("保留现状评估中的单问题范围、不可用指标");
    expect(prompt).not.toContain("不确定时返回 not_projectable");
    expect(prompt).toContain("frontmind-optimization-forecast-task-input.json");
    expect(prompt).not.toContain("FrontMind-current-assessment.json");
    const taskInput = JSON.parse(
      buildOptimizationOutcomeForecastTaskInput({
        currentAssessmentFilename: "FrontMind-current-assessment.json",
        knowledgeBaseArchiveFilename: "FrontMind-kb.zip",
        executionScenarioFilename: "FrontMind-full-execution-scenario.json",
        scenarioName: "full_execution",
      }).body.toString("utf8"),
    );
    expect(taskInput.data).toMatchObject({
      currentAssessmentAttachment: "FrontMind-current-assessment.json",
      knowledgeBaseArchive: "FrontMind-kb.zip",
      executionScenarioAttachment: "FrontMind-full-execution-scenario.json",
      brandMentionRateObservation: null,
    });
    const industryTaskInput = JSON.parse(
      buildOptimizationOutcomeForecastTaskInput({
        currentAssessmentFilename: "FrontMind-industry-assessment.json",
        knowledgeBaseArchiveFilename: "FrontMind-kb.zip",
        executionScenarioFilename: "FrontMind-full-execution-scenario.json",
        scenarioName: "full_execution",
        brandMentionRateObservation: {
          current: 0.4,
          observedAnswers: 5,
        },
      }).body.toString("utf8"),
    );
    expect(industryTaskInput.data.brandMentionRateObservation).toEqual({
      current: 0.4,
      observedAnswers: 5,
    });
    expect(prompt).toContain(FORECAST_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain(FORECAST_OUTPUT_TEMPLATE_FILENAME);
    expect(prompt).not.toContain(FORECAST_OUTPUT_RESULT_FILENAME);
    expect(prompt).toContain("Structured Output 合同");
    expect(prompt).not.toContain("typed output_file");
    expect(prompt).not.toContain("# FILE:");
    expect(Array.from(prompt).length).toBeLessThanOrEqual(3_000);

    const archive = await buildGeoOptimizationOutcomeForecasterSkillArchive();
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "assets/output-template.json",
      "references/impact-forecast-methodology.md",
      "references/output-schema.json",
      "references/source-manifest.json",
    ]);
    const skillText = await zip.file("SKILL.md")!.async("string");
    expect(skillText).toContain("Structured Output contract");
    expect(skillText).toContain("Do not create or attach a result file");
    const archivedTemplate = JSON.parse(
      await zip.file("assets/output-template.json")!.async("string"),
    );
    const directTemplate = JSON.parse(
      (await buildGeoOptimizationOutcomeForecastTemplate()).toString("utf8"),
    );
    expect(directTemplate).toEqual(archivedTemplate);
    expect(directTemplate.brandMentionRateTarget).toBeNull();
    expect(ForecastRawTaskOutputSchema.safeParse(directTemplate).success).toBe(
      false,
    );
    expect(
      Object.values(directTemplate.dimensions).flatMap((dimension) =>
        Object.values(dimension as Record<string, unknown>),
      ),
    ).toHaveLength(13);
    const outputSchema = JSON.parse(
      await zip.file("references/output-schema.json")!.async("string"),
    );
    expect(outputSchema.properties.scenario.properties.actionIds).toMatchObject(
      {
        minItems: 6,
        maxItems: 6,
      },
    );
    expect(outputSchema.properties.brandMentionRateTarget.oneOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "null" })]),
    );
    expect(outputSchema.required).toContain("brandMentionRateTarget");
    expect(
      outputSchema.$defs.indicatorForecast.properties.measurementStatus,
    ).toEqual({ const: "projectable" });
    expect(
      outputSchema.$defs.indicatorForecast.properties.gapClosureHigh,
    ).toMatchObject({
      type: "number",
      exclusiveMinimum: 0,
    });
  });
});
