// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GeoApiError } from "./api";
import { QuestionRecommendation } from "./GeoBuildExperience";
import { createGeoStylePreviewProject } from "./preview";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("custom GEO question validation", () => {
  it("shows an enterprise-unrelated rejection as an input error instead of a recoverable rate limit", async () => {
    const message =
      "该问题与「硅基流动」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。";
    const onCreateCustom = vi.fn(async () => {
      throw new GeoApiError(
        message,
        422,
        "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        {
          validation: {
            clientRequestId: "47474747-4747-4747-8747-474747474747",
            question: "FrontMind是什么企业？",
            state: "rejected",
            error: { retryable: false },
          },
        },
      );
    });

    render(
      <QuestionRecommendation
        project={createGeoStylePreviewProject()}
        selectionLocked={false}
        onSelect={vi.fn()}
        onCreateCustom={onCreateCustom}
        onContact={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("自定义优化问题") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "FrontMind是什么企业？" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(onCreateCustom).toHaveBeenCalledTimes(1));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain("操作过于频繁");
    expect(alert.textContent).not.toContain("恢复同一验证");

    const blockedButton = screen.getByRole("button", { name: /请修改问题/ });
    expect((blockedButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "硅基流动是什么企业？" } });
    const retryButton = screen.getByRole("button", { name: /验证并继续/ });
    expect((retryButton as HTMLButtonElement).disabled).toBe(false);
  });
});
