// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CurrentAssessment,
  QuestionRecommendation,
} from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";
import type { GeoQuestion } from "./types";

afterEach(cleanup);

function QuestionSelectionHarness({ onContinue }: { onContinue: () => void }) {
  const fixture = createGeoStylePreviewProject("assessment");
  const project = {
    ...fixture,
    selectedQuestionId: undefined,
    selectedIndustryRankingQuestionId: undefined,
    questions: fixture.questions.map((question) =>
      question.category === "industry_ranking"
        ? { ...question, selectable: false }
        : question,
    ),
  };
  const [productQuestionId, setProductQuestionId] = useState<string>();
  const [industryQuestionId, setIndustryQuestionId] = useState<string>();
  const select = (question: GeoQuestion) => {
    if (question.category === "industry_ranking") {
      setIndustryQuestionId(question.id);
    } else {
      setProductQuestionId(question.id);
    }
  };

  return (
    <QuestionRecommendation
      project={project}
      selectionLocked={false}
      selectedProductQuestionId={productQuestionId}
      selectedIndustryRankingQuestionId={industryQuestionId}
      onSelect={select}
      onContinue={onContinue}
    />
  );
}

describe("dual question and assessment perspectives", () => {
  it("keeps the three product categories mutually exclusive and requires one ranking question", () => {
    const onContinue = vi.fn();
    render(<QuestionSelectionHarness onContinue={onContinue} />);

    const continueButton = screen.getByRole("button", {
      name: /确认两个问题并继续/,
    }) as HTMLButtonElement;
    const productScenario = screen.getByRole("button", {
      name: /验收企业的方案适合哪些业务场景？/,
    });
    const reputation = screen.getByRole("button", {
      name: /验收企业的公开口碑如何核验？/,
    });
    const competitor = screen.getByRole("button", {
      name: /验收企业与同类方案 A 的差异是什么？/,
    });
    const ranking = screen.getByRole("button", {
      name: /该行业有哪些值得关注的服务方案？/,
    }) as HTMLButtonElement;

    expect(continueButton.disabled).toBe(true);
    fireEvent.click(productScenario);
    expect(productScenario.getAttribute("aria-pressed")).toBe("true");
    expect(continueButton.disabled).toBe(true);

    fireEvent.click(reputation);
    expect(productScenario.getAttribute("aria-pressed")).toBe("false");
    expect(reputation.getAttribute("aria-pressed")).toBe("true");
    expect(ranking.disabled).toBe(false);

    fireEvent.click(competitor);
    expect(reputation.getAttribute("aria-pressed")).toBe("false");
    expect(competitor.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(ranking);
    expect(ranking.getAttribute("aria-pressed")).toBe("true");
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("keeps independent section tabs under the two assessment perspectives", () => {
    const view = render(
      <CurrentAssessment
        project={createGeoStylePreviewProject("assessment")}
        onContact={vi.fn()}
        onStartService={vi.fn()}
      />,
    );
    const tablist = screen.getByRole("tablist", {
      name: "现状评估问题视角",
    });

    expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
    expect(
      within(tablist).getByRole("tab", { name: /产品与舆情/ }),
    ).toBeTruthy();
    expect(
      within(tablist).getByRole("tab", { name: /行业排名与品牌优胜/ }),
    ).toBeTruthy();
    const productSections = screen.getByRole("tablist", {
      name: "产品与舆情评估内容",
    });
    expect(within(productSections).getAllByRole("tab")).toHaveLength(3);
    expect(
      within(productSections)
        .getByRole("tab", { name: /语义资产现状/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("heading", { name: "语义资产现状" })).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "舆情与知识库对照" }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "当前表现" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /进入下一步：启动服务/ }),
    ).toBeNull();
    expect(view.container.querySelectorAll('[role="tabpanel"]')).toHaveLength(
      2,
    );
    expect(
      view.container.querySelectorAll(".geo-assessment-perspective-section"),
    ).toHaveLength(1);

    fireEvent.click(
      within(productSections).getByRole("tab", {
        name: /舆情与知识库对照/,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "舆情与知识库对照" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "语义资产现状" })).toBeNull();

    fireEvent.click(
      within(productSections).getByRole("tab", { name: /优化后评估/ }),
    );
    expect(screen.getByRole("heading", { name: "优化后评估" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /进入下一步：启动服务/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "舆情与知识库对照" }),
    ).toBeNull();

    fireEvent.click(
      within(tablist).getByRole("tab", { name: /行业排名与品牌优胜/ }),
    );
    const industrySections = screen.getByRole("tablist", {
      name: "行业排名与品牌优胜评估内容",
    });
    expect(within(industrySections).getAllByRole("tab")).toHaveLength(3);
    expect(
      within(industrySections)
        .getByRole("tab", { name: /当前表现/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      view.container.querySelector(".geo-industry-current-performance"),
    ).toBeTruthy();
    expect(screen.getByLabelText("品牌提及率75%")).toBeTruthy();
    expect(screen.queryByLabelText("预期提及率90%")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /联系技术人员对接/ }),
    ).toBeNull();

    fireEvent.click(
      within(industrySections).getByRole("tab", { name: /语义资产现状/ }),
    );
    expect(screen.getByRole("heading", { name: "语义资产现状" })).toBeTruthy();
    expect(screen.queryByLabelText("品牌提及率75%")).toBeNull();

    fireEvent.click(within(tablist).getByRole("tab", { name: /产品与舆情/ }));
    expect(
      screen
        .getByRole("tab", { name: /优化后评估/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("heading", { name: "优化后评估" })).toBeTruthy();

    fireEvent.click(
      within(tablist).getByRole("tab", { name: /行业排名与品牌优胜/ }),
    );
    expect(
      screen
        .getByRole("tab", { name: /语义资产现状/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    const restoredIndustrySections = screen.getByRole("tablist", {
      name: "行业排名与品牌优胜评估内容",
    });
    fireEvent.click(
      within(restoredIndustrySections).getByRole("tab", {
        name: /优化后评估/,
      }),
    );
    expect(screen.getByLabelText("预期提及率90%")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /联系技术人员对接/ }),
    ).toBeTruthy();
    expect(view.container.querySelectorAll('[role="tabpanel"]')).toHaveLength(
      2,
    );
  });

  it("binds an industry assessment retry only to the industry callback", () => {
    const fixture = createGeoStylePreviewProject("assessment");
    const onRetryAssessment = vi.fn();
    const onRetryIndustryAssessment = vi.fn();
    render(
      <CurrentAssessment
        project={{
          ...fixture,
          preview: undefined,
          industryRankingAssessment: {
            ...fixture.industryRankingAssessment!,
            status: "failed",
            totalScore: undefined,
            error: "行业评估未完成",
          },
        }}
        onContact={vi.fn()}
        onRetryAssessment={onRetryAssessment}
        onRetryIndustryAssessment={onRetryIndustryAssessment}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /行业排名与品牌优胜/ }));
    fireEvent.click(screen.getByRole("button", { name: "重新评估" }));
    expect(onRetryIndustryAssessment).toHaveBeenCalledOnce();
    expect(onRetryAssessment).not.toHaveBeenCalled();
  });

  it("binds an industry forecast retry only to the industry callback", () => {
    const fixture = createGeoStylePreviewProject("assessment");
    const onRetryForecast = vi.fn();
    const onRetryIndustryForecast = vi.fn();
    render(
      <CurrentAssessment
        project={{
          ...fixture,
          preview: undefined,
          industryRankingOptimizationForecast: {
            ...fixture.industryRankingOptimizationForecast!,
            status: "failed",
            currentScore: undefined,
            targetLow: undefined,
            targetExpected: undefined,
            targetHigh: undefined,
            error: "行业预测未完成",
          },
        }}
        onContact={vi.fn()}
        onRetryForecast={onRetryForecast}
        onRetryIndustryForecast={onRetryIndustryForecast}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /行业排名与品牌优胜/ }));
    const sectionTabs = screen.getByRole("tablist", {
      name: "行业排名与品牌优胜评估内容",
    });
    const forecastTab = within(sectionTabs).getByRole("tab", {
      name: /优化后评估.*需重新评估/,
    });
    expect(forecastTab).toBeTruthy();
    fireEvent.click(forecastTab);
    fireEvent.click(screen.getByRole("button", { name: "重新评估" }));
    expect(onRetryIndustryForecast).toHaveBeenCalledOnce();
    expect(onRetryForecast).not.toHaveBeenCalled();
  });
});
