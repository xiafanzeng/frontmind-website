import { describe, expect, it } from "vitest";
import {
  createGeoStylePreviewProject,
  GEO_STYLE_PREVIEW_ID,
  isGeoStylePreviewProject,
} from "./preview";
import { GEO_QUESTION_CATEGORIES } from "./types";

describe("GEO anonymous synthetic preview", () => {
  it("keeps every stage open without embedding customer content", () => {
    const project = createGeoStylePreviewProject();

    expect(project.id).toBe(GEO_STYLE_PREVIEW_ID);
    expect(isGeoStylePreviewProject(project)).toBe(true);
    expect(project.preview).toBe(true);
    expect(project.title).toBe("验收企业");
    expect(project.knowledgeBase?.companyName).toBe("验收企业");
    expect(project.knowledgeBase?.completeness).toMatchObject({
      score: 87,
      counts: {
        applicableLeaves: 46,
        verifiedFirstParty: 31,
        verifiedAuthoritative: 7,
        supportedThirdParty: 2,
      },
    });
    expect(project.knowledgeBase?.metrics).toContainEqual(
      expect.objectContaining({
        key: "completeness",
        label: "知识库完整度",
        value: "87%",
      }),
    );
    expect(project.knowledgeBase?.metrics).not.toContainEqual(
      expect.objectContaining({ key: "priority" }),
    );
    expect(JSON.stringify(project)).not.toContain("P0");
    expect(JSON.stringify(project)).not.toContain("急需修复");
    expect(
      project.questions.find(
        (question) => question.id === project.selectedQuestionId,
      )?.question,
    ).toBe("验收企业的公开口碑如何核验？");
    expect(project.stage).toBe("current_assessment");
    expect(project.knowledgeBase).toBeDefined();
    expect(project.selectedQuestionId).toBeTruthy();
    expect(project.monitoring?.runId).toBeTruthy();
    expect(project.assessment?.status).toBe("ready");
    expect(project.optimizationForecast?.status).toBe("ready");

    for (const category of GEO_QUESTION_CATEGORIES) {
      expect(
        project.questions.filter(
          (question) => question.category === category.id,
        ),
      ).toHaveLength(5);
    }

    const productQuestions = project.questions.filter(
      (question) => question.category === "product_scenario",
    );
    const productAnchors = [
      "业务场景",
      "核心能力",
      "实施周期",
      "前置条件",
      "持续运营",
    ];
    expect(
      productQuestions.every((question) =>
        question.question.includes("验收企业"),
      ),
    ).toBe(true);
    expect(
      productQuestions.map((question, index) =>
        question.question.includes(productAnchors[index]),
      ),
    ).toEqual([true, true, true, true, true]);
    expect(
      GEO_QUESTION_CATEGORIES.find(
        (category) => category.id === "product_scenario",
      )?.title,
    ).toBe("产品与服务 Q&A");

    expect(project.monitoring?.status).toBe("completed");
    expect(project.monitoring?.answers).toHaveLength(30);
    expect(project.monitoring?.expectedRecords).toBe(30);
    expect(project.monitoring?.completedRecords).toBe(20);
    expect(project.monitoring?.failedRecords).toBe(10);
    expect(project.selectedPlatformIds).toEqual([
      "doubao",
      "yuanbao",
      "deepseek",
      "baiduai",
      "qianwen",
      "kimi",
    ]);
    expect(
      project.monitoring?.answers.filter(
        (answer) => answer.platformId === "deepseek",
      ),
    ).toHaveLength(5);
    expect(
      project.monitoring?.answers.filter(
        (answer) => answer.platformId === "qianwen",
      ),
    ).toHaveLength(5);
    expect(
      project.monitoring?.answers.filter(
        (answer) => answer.platformId === "baiduai",
      ),
    ).toHaveLength(5);
    expect(
      project.monitoring?.answers.filter(
        (answer) => answer.platformId === "yuanbao",
      ),
    ).toHaveLength(5);
    expect(
      project.monitoring?.answers.filter(
        (answer) => answer.platformId === "kimi",
      ),
    ).toHaveLength(5);
    expect(
      project.monitoring?.answers
        .filter((answer) => answer.status === "completed")
        .every((answer) => answer.answer.includes("验收企业")),
    ).toBe(true);
    expect(
      project.monitoring?.answers.every((answer) =>
        Number.isFinite(new Date(answer.capturedAt ?? "").getTime()),
      ),
    ).toBe(true);

    const baiduAnswers = project.monitoring?.answers
      .filter((answer) => answer.platformId === "baiduai")
      .sort((left, right) => left.runIndex - right.runIndex);
    expect(baiduAnswers?.map((answer) => answer.citations.length)).toEqual([
      2, 2, 2, 2, 2,
    ]);
    expect(baiduAnswers?.map((answer) => answer.references.length)).toEqual([
      4, 4, 4, 4, 4,
    ]);

    const yuanbaoAnswer = project.monitoring?.answers.find(
      (answer) => answer.platformId === "yuanbao",
    );
    expect(yuanbaoAnswer?.citations).toHaveLength(2);
    expect(yuanbaoAnswer?.references).toHaveLength(4);

    const kimiAnswer = project.monitoring?.answers.find(
      (answer) => answer.platformId === "kimi",
    );
    expect(kimiAnswer?.citations).toHaveLength(0);
    expect(kimiAnswer?.references).toHaveLength(0);

    expect(project.assessment).toMatchObject({
      totalScore: 64,
      rawTotalScore: 64,
      applicableMaxScore: 100,
      structuralExcludedMaxScore: 0,
    });
    expect(project.assessment?.dimensions).toHaveLength(5);
    expect(project.assessment?.comparisons).toHaveLength(4);
    expect(project.optimizationForecast).toMatchObject({
      horizonWeeks: 4,
      currentScore: 64,
      targetLow: 76.5,
      targetExpected: 81.5,
      targetHigh: 86.5,
      gradeLow: "B",
      gradeHigh: "A",
      challengeUpperOnly: "A",
    });
    expect(project.serviceActivation).toMatchObject({
      status: "profile_required",
      category: "reputation",
      amountFen: 200_000,
      billingMonths: 1,
    });
    expect(project.optimizationForecast?.dimensions).toHaveLength(5);
    expect(project.optimizationForecast?.roadmap).toHaveLength(4);
    expect(
      project.optimizationForecast?.dimensions.find(
        (dimension) => dimension.id === "competitive_advantage",
      ),
    ).toMatchObject({
      summary: "差异点能够按采购目标拆解，但仍需压缩无条件比较表述。",
      currentScore: 9,
      targetLow: 11,
      targetHigh: 13,
    });
    expect(
      project.optimizationForecast?.roadmap.map((phase) => phase.weeks),
    ).toEqual(["第 1 周", "第 2 周", "第 3 周", "第 4 周"]);

    const serialized = JSON.stringify(project);
    expect(serialized).not.toMatch(
      /香港中文大学|港中深|cuhk|北京敦锋|FrontMind超前智能|陆宏远/i,
    );
    expect(serialized).not.toContain(".cuhk.edu.cn");
  });
});
