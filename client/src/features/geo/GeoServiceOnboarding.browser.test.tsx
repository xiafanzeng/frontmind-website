// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearGeoServiceContractProfile,
  GeoServiceOnboarding,
} from "./GeoServiceOnboarding";
import type { GeoServiceActivation } from "./types";

const activation: GeoServiceActivation = {
  status: "profile_required",
  questionId: "question-01",
  category: "product_scenario",
  amountFen: 150_000,
  billingMonths: 1,
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

type SubmitProfile = ComponentProps<
  typeof GeoServiceOnboarding
>["onSubmitProfile"];

function renderOnboarding(
  onSubmitProfile: SubmitProfile,
  serviceActivation: GeoServiceActivation = activation,
) {
  render(
    <GeoServiceOnboarding
      activation={serviceActivation}
      companyName="深圳星辰科技有限公司"
      categoryLabel="产品场景"
      question="深圳星辰科技适合哪些企业使用？"
      contractHref="/contracts/frontmind-geo-monthly-optimization-service-agreement.html?category=product_scenario"
      isPreview={false}
      onSubmitProfile={onSubmitProfile}
      onCheckout={vi.fn()}
      onCreateAccount={vi.fn()}
      onCheckStatus={vi.fn()}
    />,
  );
}

function completeProfile() {
  fireEvent.change(screen.getByLabelText(/统一社会信用代码/), {
    target: { value: "91440300MA5F12345X" },
  });
  fireEvent.change(screen.getByLabelText(/企业联系地址/), {
    target: { value: "深圳市南山区科技园一号" },
  });
  fireEvent.change(
    screen.getByLabelText(/签约经办人/, {
      selector: 'input[name="signatoryName"]',
    }),
    {
      target: { value: "张三" },
    },
  );
  fireEvent.change(screen.getByLabelText(/^职务/), {
    target: { value: "运营负责人" },
  });
  fireEvent.change(screen.getByLabelText(/手机号/), {
    target: { value: "13800138000" },
  });
  fireEvent.change(screen.getByLabelText(/电子邮箱/), {
    target: { value: "contracts@example.com" },
  });
  fireEvent.click(screen.getByLabelText(/我确认以上信息真实有效/));
  fireEvent.click(screen.getByRole("button", { name: /提交资料并联系管理员/ }));
}

describe("GeoServiceOnboarding contract-code dialog", () => {
  it("removes the matching local contract profile during project deletion", () => {
    sessionStorage.setItem(
      "frontmind:geo-contract-profile:深圳星辰科技有限公司:深圳星辰科技适合哪些企业使用？",
      JSON.stringify({ signatoryName: "张三" }),
    );

    clearGeoServiceContractProfile(
      "深圳星辰科技有限公司",
      "深圳星辰科技适合哪些企业使用？",
    );

    expect(sessionStorage.length).toBe(0);
  });
  it.each([
    {
      label: "未付款但订单已拒绝",
      serviceActivation: {
        ...activation,
        status: "failed" as const,
        manualOrderStatus: "rejected" as const,
      },
      message: "本次签约申请未通过",
    },
    {
      label: "已付款但仍待签约",
      serviceActivation: {
        ...activation,
        status: "signature_required" as const,
        manualOrderStatus: "signature_required" as const,
        paidAt: "2026-07-24T10:00:00.000Z",
      },
      message: "付款已记录，订单状态需要人工核对",
    },
  ])(
    "blocks contract-code submission when $label",
    async ({ serviceActivation, message }) => {
      const onSubmitProfile = vi.fn<SubmitProfile>();
      renderOnboarding(onSubmitProfile, serviceActivation);

      expect(screen.getByText(message)).toBeTruthy();
      const supportButton = screen.getByRole("button", {
        name: "联系支持处理",
      });
      expect(supportButton).toBeTruthy();
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      fireEvent.click(supportButton);
      expect(await screen.findByRole("dialog")).toBeTruthy();
      expect(
        screen.getByAltText("FrontMind 管理员企业微信二维码"),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: /提交资料并联系管理员/ }),
      ).toBeNull();
      expect(screen.queryByLabelText("请输入管理员授权的合同码")).toBeNull();
      expect(onSubmitProfile).not.toHaveBeenCalled();
    },
  );

  it("opens the administrator QR dialog for a terminal activation failure", async () => {
    renderOnboarding(
      vi.fn(async () => undefined),
      {
        ...activation,
        status: "failed",
        orderId: "FM202607240001",
        paidAt: "2026-07-24T10:00:00.000Z",
        provisioningRetryable: false,
        knowledgeImport: {
          status: "failed",
          retryable: false,
          message: "资料需要人工核验",
        },
      },
    );

    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "联系技术支持" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByAltText("FrontMind 管理员企业微信二维码")).toBeTruthy();
  });

  it("opens the administrator QR dialog without exposing or prefilling the default code", async () => {
    renderOnboarding(vi.fn(async () => undefined));
    completeProfile();

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(
      document.querySelector('[data-slot="dialog-overlay"]')?.className,
    ).toContain("geo-dialog-overlay");
    expect(screen.getByAltText("FrontMind 管理员企业微信二维码")).toBeTruthy();
    const codeInput = screen.getByLabelText(
      "请输入管理员授权的合同码",
    ) as HTMLInputElement;
    expect(codeInput.value).toBe("");
    expect(document.body.textContent).not.toContain("frontmind666");
  });

  it("keeps the dialog and profile after an invalid code and clears only the code", async () => {
    const invalidCodeError = Object.assign(
      new Error("合同码不正确，请联系管理员确认。"),
      {
        code: "CONTRACT_CODE_INVALID",
      },
    );
    const onSubmitProfile = vi.fn<SubmitProfile>(async () => {
      throw invalidCodeError;
    });
    renderOnboarding(onSubmitProfile);
    completeProfile();
    const codeInput = (await screen.findByLabelText(
      "请输入管理员授权的合同码",
    )) as HTMLInputElement;

    fireEvent.change(codeInput, { target: { value: "wrong-code" } });
    fireEvent.click(
      screen.getByRole("button", { name: /确认合同码并提交资料/ }),
    );

    await waitFor(() => expect(onSubmitProfile).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(codeInput.value).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("clears the code after any failed request without clearing the profile", async () => {
    const throttledError = Object.assign(
      new Error("尝试次数过多，请稍后再试。"),
      { code: "CONTRACT_CODE_RATE_LIMITED", status: 429 },
    );
    const onSubmitProfile = vi.fn<SubmitProfile>(async () => {
      throw throttledError;
    });
    renderOnboarding(onSubmitProfile);
    completeProfile();
    const codeInput = (await screen.findByLabelText(
      "请输入管理员授权的合同码",
    )) as HTMLInputElement;

    fireEvent.change(codeInput, { target: { value: "one-time-secret" } });
    fireEvent.submit(codeInput.closest("form")!);

    await waitFor(() => expect(onSubmitProfile).toHaveBeenCalledTimes(1));
    expect(codeInput.value).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.getItem(sessionStorage.key(index) || ""),
      ).join("\n"),
    ).not.toContain("one-time-secret");
  });

  it("removes the code when the dialog is closed and opens with an empty field", async () => {
    renderOnboarding(vi.fn(async () => undefined));
    completeProfile();
    const codeInput = (await screen.findByLabelText(
      "请输入管理员授权的合同码",
    )) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "discard-this-code" } });

    fireEvent.click(screen.getByRole("button", { name: "稍后处理" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain("discard-this-code");
    expect(
      Array.from({ length: sessionStorage.length }, (_, index) =>
        sessionStorage.getItem(sessionStorage.key(index) || ""),
      ).join("\n"),
    ).not.toContain("discard-this-code");

    fireEvent.click(
      screen.getByRole("button", { name: /提交资料并联系管理员/ }),
    );
    expect(
      (
        (await screen.findByLabelText(
          "请输入管理员授权的合同码",
        )) as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("submits once and enters payment after the administrator code succeeds", async () => {
    const onSubmitProfile = vi.fn<SubmitProfile>(async () => undefined);
    renderOnboarding(onSubmitProfile);
    completeProfile();
    const codeInput = (await screen.findByLabelText(
      "请输入管理员授权的合同码",
    )) as HTMLInputElement;

    fireEvent.change(codeInput, { target: { value: "administrator-code" } });
    fireEvent.submit(codeInput.closest("form")!);

    await waitFor(() => expect(onSubmitProfile).toHaveBeenCalledTimes(1));
    expect(onSubmitProfile.mock.calls[0]?.[1]).toBe("administrator-code");
    expect(
      await screen.findByText("合同已在企业微信确认，可以付款"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    const contractLink = screen.getByRole("link", { name: /查看合同/ });
    const href = contractLink.getAttribute("href") || "";
    const [contractPath, profileFragment] = href.split("#", 2);
    expect(contractPath).toContain(
      "/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
    );
    expect(contractPath).not.toContain("91440300MA5F12345X");
    expect(contractPath).not.toContain("contracts%40example.com");
    expect(profileFragment).toContain("creditCode=91440300MA5F12345X");
    expect(profileFragment).toContain("email=contracts%40example.com");
  });
});
