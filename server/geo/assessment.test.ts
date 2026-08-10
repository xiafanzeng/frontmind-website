import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_SKILL_ARCHIVE_FILENAME,
  AssessmentRawTaskOutputSchema,
  AssessmentTaskOutputValidationError,
  assertAssessmentOutputScope,
  buildAssessmentPrompt,
  buildAssessmentTaskInput,
  buildGeoCurrentStateEvaluatorSkillArchive,
  calculateQuestionBaselineAssessment,
  clampRawIndicator,
  inspectAssessmentTaskOutput,
  parseAssessmentTaskOutput,
  resolveAssessmentTaskOutput,
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

function validV2RawOutput(): AssessmentRawTaskOutput {
  const legacy = validIneligibleRawOutput();
  return {
    ...legacy,
    schemaVersion: 2,
    dimensions: {
      ...legacy.dimensions,
      semanticVisibility: {
        ...legacy.dimensions.semanticVisibility,
        webSearchSov: indicator(
          0.4,
          "按知识库证据与五次回答中的品牌事实覆盖比例计算。",
        ),
      },
      semanticRichness: {
        ...legacy.dimensions.semanticRichness,
        contentFormatDiversity: indicator(
          0.6,
          "按结论、优势、场景、风险与核验建议五个层次计算。",
        ),
      },
      semanticAuthority: {
        ...legacy.dimensions.semanticAuthority,
        structuredDataCompleteness: indicator(
          0.5,
          "按重要主张能够追溯至统一来源的比例计算。",
        ),
      },
      competitiveAdvantage: {
        ...legacy.dimensions.competitiveAdvantage,
        exclusiveSemanticSpace: indicator(
          0.5,
          "按已验证差异点被准确表达的比例计算。",
        ),
      },
    },
    platformBreakdown: legacy.platformBreakdown.map(
      ({ citationCount = 0, referenceCount = 0, ...platform }) => ({
        ...platform,
        sourceCount: citationCount + referenceCount,
      }),
    ),
    knowledgeVsAnswers: legacy.knowledgeVsAnswers.map((comparison, index) =>
      index === 1
        ? {
            ...comparison,
            verdict: "supported" as const,
            explanation: "回答主张已经由知识库中的目标客户事实和来源支持。",
          }
        : comparison,
    ),
    executiveSummary:
      "当前回答已形成基础认知，但证据覆盖仍不完整；本月应补齐核心事实和来源路径，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "五次回答能够识别企业及其主要服务方向。",
        nextAction: "补充核心能力与权威证据之间的清晰引用路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张在不同回答中的表达基本一致。",
        nextAction: "统一定位、能力边界与风险说明的表达口径。",
      },
      semanticRichness: {
        currentFinding: "回答已覆盖部分关键方面，但采购信息仍不完整。",
        nextAction: "补齐部署、风险和采购核验类问答内容。",
      },
      semanticAuthority: {
        currentFinding: "部分重要判断已有来源支持，但独立证据偏少。",
        nextAction: "建设可追溯的官方事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "部分已验证差异点能够被回答准确表达。",
        nextAction: "围绕可核验差异点建立统一的对比语言。",
      },
    },
  };
}

describe("GEO current-state assessment task output", () => {
  it("asks Base for item confidence while leaving aggregate results to the server", async () => {
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

    expect(prompt).toContain(
      "schema 要求的事实四分类、confidence 与 0-1 原始指标",
    );
    expect(prompt).toContain("最终分数、等级和来源数量由服务端计算或校正");
    expect(prompt).not.toContain("confidence 汇总");
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

  it("recovers unescaped ASCII quotes inside trusted assessment strings", () => {
    const raw = validV2RawOutput();
    raw.dimensions.semanticCoherence.toneConsistency.calculationBasis =
      '五轮回答基调一致为"有优势但有风险"的中立评价。';
    raw.platformBreakdown[0].verdict =
      '整体呈现"技术有优势但商业风险显著"的中立评价。';
    raw.knowledgeVsAnswers[0].kbClaimText =
      '公司预期达到港交所"已商业化公司"的收入要求。';
    raw.priorityActions[0].action = '纠正回答中"缺乏企业级管控"的错误认知。';
    raw.summary =
      '回答大量强调"商业风险显著"，同时把企业级能力描述为"较弱"，需要依据知识库纠正。';

    const malformed = JSON.stringify(raw).replaceAll('\\"', '"');
    expect(Buffer.byteLength(malformed, "utf8")).toBeGreaterThan(5_000);
    expect(() => JSON.parse(malformed)).toThrow();

    const parsed = parseAssessmentTaskOutput({
      output: [{ type: "output_text", text: malformed }],
    });

    expect(parsed).toEqual(raw);
  });

  it("canonicalizes non-core v2 transport fields without inventing core assessment content", () => {
    const raw = structuredClone(validV2RawOutput()) as Record<string, unknown>;
    delete raw.limitations;
    const platformBreakdown = raw.platformBreakdown as Array<
      Record<string, unknown>
    >;
    for (const platform of platformBreakdown) delete platform.sourceCount;

    const inspection = inspectAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });
    expect(inspection.success).toBe(true);
    if (inspection.success) {
      expect(inspection.data.limitations).toEqual([]);
      expect(
        inspection.data.platformBreakdown.map((item) => item.sourceCount),
      ).toEqual([0, 0]);
    }

    delete raw.summary;
    expect(
      inspectAssessmentTaskOutput({
        output: [{ type: "output_text", text: JSON.stringify(raw) }],
      }),
    ).toMatchObject({
      success: false,
      error: { code: "SCHEMA_MISMATCH" },
    });
  });

  it("resolves a trusted JSON output_file after acknowledgement-only inline text", async () => {
    const raw = validRawOutput();
    const downloadedFileIds: string[] = [];
    const parsed = await resolveAssessmentTaskOutput(
      {
        async downloadFile(fileId) {
          downloadedFileIds.push(fileId);
          return new Response(
            Buffer.concat([
              Buffer.from([0xef, 0xbb, 0xbf]),
              Buffer.from(JSON.stringify(raw), "utf8"),
            ]),
          );
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        id: "assessment-task",
        output: [
          { type: "output_text", text: "收到任务，正在执行评估。" },
          {
            type: "output_text",
            text: "以下是符合 raw-output-schema.json 的单个 JSON 对象。",
          },
          {
            role: "assistant",
            type: "message",
            content: [
              {
                type: "output_file",
                file_id: "assessment-result",
                filename: "assessment.json",
              },
            ],
          },
        ],
      },
    );

    expect(downloadedFileIds).toEqual(["assessment-result"]);
    expect(parsed.question).toEqual(raw.question);
  });

  it("keeps inline priority and does not download when inline JSON fully passes", async () => {
    const raw = validRawOutput();
    let downloadCount = 0;
    const parsed = await resolveAssessmentTaskOutput(
      {
        async downloadFile() {
          downloadCount += 1;
          return new Response("{}");
        },
        async downloadTaskOutput() {
          downloadCount += 1;
          return new Response("{}");
        },
      },
      {
        output: [
          { type: "output_text", text: JSON.stringify(raw) },
          {
            type: "output_file",
            file_id: "unused-file",
            filename: "unused.json",
          },
        ],
      },
    );

    expect(parsed.question.id).toBe(raw.question.id);
    expect(downloadCount).toBe(0);
  });

  it("continues to a file when inline JSON passes schema but fails scope", async () => {
    const raw = validRawOutput();
    const wrongScope = {
      ...raw,
      question: { ...raw.question, id: "wrong-question" },
    };
    const validatedQuestionIds: string[] = [];
    const parsed = await resolveAssessmentTaskOutput(
      {
        async downloadFile() {
          return new Response(JSON.stringify(raw));
        },
        async downloadTaskOutput() {
          throw new Error("URL fallback should not be used");
        },
      },
      {
        output: [
          { type: "output_text", text: JSON.stringify(wrongScope) },
          {
            type: "output_file",
            file_id: "scoped-result",
            filename: "scoped-result.json",
          },
        ],
      },
      {
        validate(candidate) {
          validatedQuestionIds.push(candidate.question.id);
          if (candidate.question.id !== raw.question.id) {
            throw new Error("scope mismatch detail must not escape");
          }
        },
      },
    );

    expect(validatedQuestionIds).toEqual(["wrong-question", raw.question.id]);
    expect(parsed.question.id).toBe(raw.question.id);
  });

  it("reports a safe scope classification when no candidate matches scope", async () => {
    const raw = validRawOutput();
    await expect(
      resolveAssessmentTaskOutput(
        {
          async downloadFile() {
            return new Response(JSON.stringify(raw));
          },
          async downloadTaskOutput() {
            throw new Error("URL fallback should not be used");
          },
        },
        {
          output: [
            {
              type: "output_file",
              file_id: "wrong-scope",
              filename: "wrong-scope.json",
            },
          ],
        },
        {
          validate() {
            throw new Error("sensitive request scope detail");
          },
        },
      ),
    ).rejects.toMatchObject({
      name: "AssessmentTaskOutputValidationError",
      code: "SCOPE_MISMATCH",
      issues: [],
    });
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

  it("rejects unbounded indicators and accepts optional evidence references", () => {
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
    const evidenceFreeResult =
      AssessmentRawTaskOutputSchema.safeParse(evidenceFree);
    expect(evidenceFreeResult.success).toBe(true);
    if (evidenceFreeResult.success) {
      expect(
        evidenceFreeResult.data.dimensions.semanticVisibility.aiSearchVisibility
          .evidenceRefs,
      ).toEqual([]);
    }

    const omittedEvidence = structuredClone(raw) as unknown as {
      dimensions: {
        semanticVisibility: {
          aiSearchVisibility: { evidenceRefs?: string[] };
        };
      };
    };
    delete omittedEvidence.dimensions.semanticVisibility.aiSearchVisibility
      .evidenceRefs;
    const omittedEvidenceResult =
      AssessmentRawTaskOutputSchema.safeParse(omittedEvidence);
    expect(omittedEvidenceResult.success).toBe(true);
    if (omittedEvidenceResult.success) {
      expect(
        omittedEvidenceResult.data.dimensions.semanticVisibility
          .aiSearchVisibility.evidenceRefs,
      ).toEqual([]);
    }
  });

  it("accepts empty evidence for platform results and knowledge comparisons", () => {
    const raw = validRawOutput();
    const evidenceFreePlatform = {
      ...raw,
      platformBreakdown: raw.platformBreakdown.map((platform, index) =>
        index === 0 ? { ...platform, evidenceRefs: [] } : platform,
      ),
    };
    expect(
      AssessmentRawTaskOutputSchema.safeParse(evidenceFreePlatform).success,
    ).toBe(true);

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
    ).toBe(true);
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

  it("scores all five dimensions for a named-brand reputation question in v2", () => {
    const assessment = calculateQuestionBaselineAssessment(validV2RawOutput());

    expect(assessment.schemaVersion).toBe(2);
    expect(assessment.algorithmVersion).toBe(
      "question_baseline_v2_conservative",
    );
    expect(assessment.reputationExclusionApplied).toBe(false);
    expect(
      Object.values(assessment.dimensions).every(
        (dimension) => dimension.score > 0,
      ),
    ).toBe(true);
    expect(
      assessment.dimensions.semanticVisibility.indicators.multiPlatformCoverage
        .normalizedRawValue,
    ).toBe(0.9);
    expect(assessment.overview.score).toBe(
      Object.values(assessment.dimensions).reduce(
        (total, dimension) => total + dimension.score,
        0,
      ),
    );
    expect(assessment.platformBreakdown[0].sourceCount).toBe(11);
  });

  it("deduplicates 25 candidate topics in order, keeps the first 10, and still scores them", () => {
    const fixture = validV2RawOutput();
    const comparison = fixture.knowledgeVsAnswers[0];
    const candidateTopics = [
      "企业定位",
      "目标客户",
      "  企业定位  ",
      "科研验证方法",
      "服务范围",
      "部署方式",
      "合规能力",
      "价格边界",
      "数据安全",
      "客户案例",
      "实施周期",
      "投资回报",
      "技术架构",
      "交付团队",
      "售后支持",
      "行业经验",
      "模型覆盖",
      "内容能力",
      "监测能力",
      "优化方法",
      "风险控制",
      "采购流程",
      "服务地域",
      "合作模式",
      "未来规划",
    ];
    const raw: AssessmentRawTaskOutput = {
      ...fixture,
      sample: {
        selectedPlatforms: ["doubao"],
        repeatPerPlatform: 5,
        expectedResponses: 5,
        successfulResponses: 5,
        failedResponses: 0,
      },
      platformBreakdown: [
        {
          ...fixture.platformBreakdown[1],
          responseCount: 5,
          successfulResponses: 5,
          sourceCount: 28,
        },
      ],
      knowledgeVsAnswers: candidateTopics.map((topic, index) => ({
        ...comparison,
        id: `candidate-comparison-${index + 1}`,
        topic,
        platform: "doubao" as const,
        runIndex: (index % 5) + 1,
      })),
    };

    const parsed = parseAssessmentTaskOutput({
      output: [{ type: "output_text", text: JSON.stringify(raw) }],
    });
    const assessment = calculateQuestionBaselineAssessment(parsed);
    const dimensions = Object.values(assessment.dimensions);

    expect(parsed.sample.successfulResponses).toBe(5);
    expect(parsed.knowledgeVsAnswers.map((item) => item.topic)).toEqual([
      "企业定位",
      "目标客户",
      "科研验证方法",
      "服务范围",
      "部署方式",
      "合规能力",
      "价格边界",
      "数据安全",
      "客户案例",
      "实施周期",
    ]);
    expect(assessment.knowledgeVsAnswers).toHaveLength(10);
    expect(parsed.platformBreakdown[0].sourceCount).toBe(28);
    expect(dimensions).toHaveLength(5);
    expect(dimensions.every((dimension) => dimension.score > 0)).toBe(true);
    expect(assessment.overview.score).toBeCloseTo(
      dimensions.reduce((sum, dimension) => sum + dimension.score, 0),
      8,
    );
  });

  it("rejects incomplete v2 indicators instead of publishing them as zero", () => {
    const raw = validV2RawOutput();
    raw.dimensions.semanticAuthority.structuredDataCompleteness = unavailable();

    expect(AssessmentRawTaskOutputSchema.safeParse(raw).success).toBe(false);
  });

  it("preserves a genuine evidence-backed zero without adding a score floor", () => {
    const raw = validV2RawOutput();
    raw.dimensions.semanticCoherence.corePropositionHitRate = indicator(0);
    raw.dimensions.semanticCoherence.toneConsistency = indicator(0);

    const assessment = calculateQuestionBaselineAssessment(raw);
    expect(assessment.dimensions.semanticCoherence.score).toBe(0);
  });

  it("caps knowledge-dependent v2 indicators by comparison net support", () => {
    const raw = validV2RawOutput();
    raw.dimensions.semanticVisibility.webSearchSov = {
      ...raw.dimensions.semanticVisibility.webSearchSov,
      rawValue: 1,
    };

    const assessment = calculateQuestionBaselineAssessment(raw);
    expect(
      assessment.dimensions.semanticVisibility.indicators.webSearchSov,
    ).toMatchObject({
      rawValue: 1,
      normalizedRawValue: 0.5,
      score: 5,
    });
    expect(
      assessment.dimensions.semanticVisibility.indicators.aiSearchVisibility
        .normalizedRawValue,
    ).toBe(0.5);
  });

  it("rejects a publishable v2 indicator with zero evidence confidence", () => {
    const raw = validV2RawOutput();
    raw.dimensions.semanticAuthority.authoritativeSourceRatio = {
      ...raw.dimensions.semanticAuthority.authoritativeSourceRatio,
      confidence: 0,
    };

    expect(AssessmentRawTaskOutputSchema.safeParse(raw).success).toBe(false);
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
  it("uses one lightweight evaluator Skill for a single-pass assessment", async () => {
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

    expect(prompt).toContain("此任务使用 Base 模型");
    expect(prompt).toContain(ASSESSMENT_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain("任务仅附带一个");
    expect(prompt).toContain("在一次任务内完成轻量知识对照和现状评估");
    expect(prompt).toContain("最多 25 个仅含标题的候选主题");
    expect(prompt).toContain("排序最前的 10 个唯一重点主题");
    expect(prompt).toContain("不要分析其余候选主题");
    expect(prompt).toContain("证据引用字段可留空或省略");
    expect(prompt).toContain("目标 20 分钟内返回");
    expect(prompt).not.toContain("geo-knowledge-answer-verifier");
    expect(prompt).not.toContain("bsas-baseline-methodology");
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);
    expect(prompt).toContain("最终分数、等级和来源数量由服务端计算或校正");
    expect(prompt).toContain("输出 schemaVersion=2");
    expect(prompt).toContain(
      "frontmind-current-state-assessment-task-input.json",
    );
    expect(prompt).not.toContain("FrontMind-monitoring.json");
    const taskInput = JSON.parse(
      buildAssessmentTaskInput({
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
      }).body.toString("utf8"),
    );
    expect(taskInput.data.monitoringRecordsFile).toBe(
      "FrontMind-monitoring.json",
    );
    expect(Array.from(prompt).length).toBeLessThanOrEqual(3_000);
  });

  it("packages only the evaluator Skill and its output schema", async () => {
    const evaluator = await buildGeoCurrentStateEvaluatorSkillArchive();
    const evaluatorZip = await JSZip.loadAsync(evaluator);
    expect(Object.keys(evaluatorZip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "references/raw-output-schema.json",
    ]);
    expect(evaluatorZip.file("references/bsas-baseline-methodology.md")).toBe(
      null,
    );
  });
});
