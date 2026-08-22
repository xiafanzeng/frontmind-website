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

    fireEvent.click(ranking);
    expect(ranking.getAttribute("aria-pressed")).toBe("true");
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("uses only two top-level assessment tabs and scopes their long content", () => {
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
    expect(screen.getByText("舆情与知识库对照")).toBeTruthy();
    expect(screen.queryByText("当前表现")).toBeNull();
    expect(view.container.querySelectorAll('[role="tabpanel"]')).toHaveLength(
      1,
    );

    fireEvent.click(
      within(tablist).getByRole("tab", { name: /行业排名与品牌优胜/ }),
    );
    expect(screen.queryByText("舆情与知识库对照")).toBeNull();
    expect(screen.getByText("当前表现")).toBeTruthy();
    expect(screen.getByLabelText("品牌提及率75%")).toBeTruthy();
    expect(screen.getByLabelText("预期提及率90%")).toBeTruthy();
    expect(screen.getAllByText("根据企业实际情况定制").length).toBeGreaterThan(
      0,
    );
    expect(view.container.querySelectorAll('[role="tabpanel"]')).toHaveLength(
      1,
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
    fireEvent.click(screen.getByRole("button", { name: "重新评估" }));
    expect(onRetryIndustryForecast).toHaveBeenCalledOnce();
    expect(onRetryForecast).not.toHaveBeenCalled();
  });
});
