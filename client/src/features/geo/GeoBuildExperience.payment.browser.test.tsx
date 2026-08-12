// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import GeoBuildExperience, {
  geoServiceFallbackAmountFen,
  normalizeStoredPendingGeoPayment,
  PaymentDialog,
} from "./GeoBuildExperience";
import { GeoApiError } from "./api";
import type { GeoProject } from "./types";

const apiMocks = vi.hoisted(() => ({
  createGeoPaymentCheckout: vi.fn(),
  getGeoPaymentStatus: vi.fn(),
  getGeoServicePaymentStatus: vi.fn(),
  startGeoLegacyPaidMonitoring: vi.fn(),
  startGeoMonitoring: vi.fn(),
  switchGeoPaymentCheckout: vi.fn(),
  switchGeoServicePaymentCheckout: vi.fn(),
  confirmGeoServiceBankTransfer: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
  saveGeoProject: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  createGeoPaymentCheckout: apiMocks.createGeoPaymentCheckout,
  getGeoPaymentStatus: apiMocks.getGeoPaymentStatus,
  getGeoServicePaymentStatus: apiMocks.getGeoServicePaymentStatus,
  startGeoLegacyPaidMonitoring: apiMocks.startGeoLegacyPaidMonitoring,
  startGeoMonitoring: apiMocks.startGeoMonitoring,
  switchGeoPaymentCheckout: apiMocks.switchGeoPaymentCheckout,
  switchGeoServicePaymentCheckout: apiMocks.switchGeoServicePaymentCheckout,
  confirmGeoServiceBankTransfer: apiMocks.confirmGeoServiceBankTransfer,
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  listGeoProjects: storageMocks.listGeoProjects,
  requestPersistentGeoStorage: storageMocks.requestPersistentGeoStorage,
  saveGeoProject: storageMocks.saveGeoProject,
}));

const project: GeoProject = {
  id: "project-payment-switch",
  remoteToken: "signed-project-token",
  title: "硅基流动",
  input: "硅基流动",
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
  stage: "monitoring",
  status: "ready",
  progress: 100,
  files: [],
  questions: [
    {
      id: "question-01",
      category: "product_scenario",
      question: "硅基流动作为 AI 基础设施服务商靠谱吗？",
      selectable: true,
    },
  ],
  selectedQuestionId: "question-01",
  monitoringEdition: "domestic",
  selectedPlatformIds: ["doubao"],
};

const serviceProject: GeoProject = {
  ...project,
  stage: "service_activation",
  assessment: {
    status: "ready",
    dimensions: [],
    comparisons: [],
  },
  optimizationForecast: {
    status: "ready",
    dimensions: [],
    assumptions: [],
    roadmap: [],
  },
  serviceActivation: {
    status: "payment_required",
    questionId: "question-01",
    category: "product_scenario",
    amountFen: 150_000,
    billingMonths: 1,
    contractWorkflowReference: "manual-order-001",
    contractAuthorizationMode: "external_wechat",
    contractAuthorizedAt: "2026-08-06T09:00:00.000Z",
  },
};

type PaymentDialogProps = ComponentProps<typeof PaymentDialog>;
type StoredPendingPayment = NonNullable<
  ReturnType<typeof normalizeStoredPendingGeoPayment>
>;
type MonitoringPendingPayment = Extract<
  StoredPendingPayment,
  { kind: "monitoring" }
>;
type ServicePendingPayment = Extract<
  NonNullable<PaymentDialogProps["pending"]>,
  { kind: "service" }
>;

function pendingPayment(
  overrides: Partial<MonitoringPendingPayment> = {},
): MonitoringPendingPayment {
  return {
    kind: "monitoring",
    projectId: project.id,
    projectToken: project.remoteToken,
    questionId: "question-01",
    monitoringEdition: "domestic",
    platformIds: ["doubao"],
    checkout: {
      authorization: "signed-payment-authorization",
      orderId: "20260804123456789012345678901234",
      amountFen: 200,
      unitPriceFen: 200,
      answersPerPlatform: 5,
      expiresAt: "2099-08-05T00:00:00.000Z",
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      fields: {
        pid: "merchant-test",
        type: "alipay",
        out_trade_no: "20260804123456789012345678901234",
        notify_url: "https://www.frontmind.net/api/geo/payments/notify",
        return_url: "https://www.frontmind.net/api/geo/payments/return",
        name: "FrontMind GEO 问题现状监控",
        money: "2.00",
        param: "signed-payment-authorization",
        sign: "signed",
        sign_type: "MD5",
      },
    },
    status: "pending",
    statusMessage: "请在新窗口完成支付",
    ...overrides,
  };
}

function servicePendingPayment(
  overrides: Partial<ServicePendingPayment> = {},
): ServicePendingPayment {
  return {
    kind: "service",
    projectId: serviceProject.id,
    projectToken: serviceProject.remoteToken,
    questionId: "question-01",
    monitoringEdition: "domestic",
    category: "product_scenario",
    selectedChannel: "alipay",
    checkout: {
      authorization: "signed-service-payment-authorization",
      orderId: "20260806123456789012345678901234",
      amountFen: 150_000,
      category: "product_scenario",
      billingMonths: 1,
      expiresAt: "2099-08-07T00:00:00.000Z",
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      fields: {
        pid: "merchant-test",
        type: "alipay",
        out_trade_no: "20260806123456789012345678901234",
        notify_url: "https://www.frontmind.net/api/geo/payments/notify",
        return_url: "https://www.frontmind.net/api/geo/payments/return",
        name: "FrontMind GEO 月度优化服务",
        money: "1500.00",
        param: "signed-service-payment-authorization",
        sign: "signed",
        sign_type: "MD5",
      },
    },
    status: "pending",
    statusMessage: "请在新窗口完成支付",
    ...overrides,
  };
}

function dialogProps(
  overrides: Partial<PaymentDialogProps> = {},
): PaymentDialogProps {
  return {
    open: true,
    project: serviceProject,
    pending: servicePendingPayment(),
    creating: false,
    error: "",
    onOpenChange: vi.fn(),
    onStart: vi.fn(),
    onSwitch: vi.fn(),
    onConfirmBank: vi.fn().mockResolvedValue(undefined),
    onBankConfirmationOpenChange: vi.fn(),
    onReopen: vi.fn(),
    onCheck: vi.fn(),
    onContact: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  apiMocks.createGeoPaymentCheckout.mockReset();
  apiMocks.getGeoPaymentStatus.mockReset().mockResolvedValue({
    status: "pending",
    orderId: "20260804123456789012345678901234",
    amountFen: 200,
    message: "等待支付完成",
  });
  apiMocks.getGeoServicePaymentStatus.mockReset().mockResolvedValue({
    status: "pending",
    orderId: "20260806123456789012345678901234",
    amountFen: 150_000,
    message: "等待支付完成",
  });
  apiMocks.startGeoLegacyPaidMonitoring.mockReset();
  apiMocks.startGeoMonitoring.mockReset();
  apiMocks.switchGeoPaymentCheckout.mockReset();
  apiMocks.switchGeoServicePaymentCheckout.mockReset();
  apiMocks.confirmGeoServiceBankTransfer.mockReset();
  storageMocks.listGeoProjects.mockReset().mockResolvedValue([]);
  storageMocks.requestPersistentGeoStorage.mockReset().mockResolvedValue(false);
  storageMocks.saveGeoProject.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("service payment dialog", () => {
  it("uses the overseas two-times service fallback prices", () => {
    expect(geoServiceFallbackAmountFen("product_scenario", "overseas")).toBe(
      300_000,
    );
    expect(geoServiceFallbackAmountFen("reputation", "overseas")).toBe(400_000);
    expect(
      geoServiceFallbackAmountFen("competitor_comparison", "overseas"),
    ).toBe(400_000);
  });

  it("shows the corporate account without creating a ZPAY order", () => {
    const onStart = vi.fn();
    render(
      <PaymentDialog
        {...dialogProps({
          project: serviceProject,
          pending: undefined,
          onStart,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: /支付宝支付/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /微信支付/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /对公账户支付/ }));

    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText("深圳市超前无限科技有限公司")).toBeTruthy();
    expect(
      screen.getByText("香港中文大学（深圳）深港创新创业孵化中心"),
    ).toBeTruthy();
    expect(screen.getByText("中信银行深圳分行")).toBeTruthy();
    expect(screen.getByText("8110301012600865338")).toBeTruthy();
    expect(screen.getByText(/备注签约申请编号 manual-order-001/)).toBeTruthy();
    expect(screen.getByText(/输入管理员提供的确认码/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /确认对公到账/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /支付宝支付/ }));
    expect(onStart).toHaveBeenCalledWith("alipay");
  });

  it("confirms a direct bank transfer through a transient administrator-code dialog", async () => {
    const onConfirmBank = vi.fn().mockResolvedValue(undefined);
    const onBankConfirmationOpenChange = vi.fn();
    render(
      <PaymentDialog
        {...dialogProps({
          project: serviceProject,
          pending: undefined,
          onConfirmBank,
          onBankConfirmationOpenChange,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /对公账户支付/ }));
    fireEvent.click(screen.getByRole("button", { name: /确认对公到账/ }));
    expect(onBankConfirmationOpenChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("heading", { name: "联系管理员确认对公到账" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /管理员企业微信二维码/ })
        .getAttribute("rel"),
    ).toBe("noopener noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "确认到账并继续" }));
    expect(screen.getByText("请输入管理员提供的对公到账确认码。")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("请输入对公到账确认码"), {
      target: { value: "administrator-code-from-chat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认到账并继续" }));
    await waitFor(() => {
      expect(onConfirmBank).toHaveBeenCalledWith(
        "administrator-code-from-chat",
      );
      expect(onBankConfirmationOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("offers all three channels for a pending service order", () => {
    const onSwitch = vi.fn();
    render(
      <PaymentDialog
        {...dialogProps({
          project: serviceProject,
          pending: servicePendingPayment(),
          onSwitch,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /微信支付/ }));
    expect(onSwitch).toHaveBeenCalledWith("wxpay");

    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /对公账户支付/ }));
    expect(onSwitch).toHaveBeenLastCalledWith("bank_transfer");
  });

  it("restores online-to-bank selection, closes every owned cashier, and pauses polling", async () => {
    const initial = servicePendingPayment();
    storageMocks.listGeoProjects.mockResolvedValue([serviceProject]);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const makePopup = () =>
      ({
        opener: window,
        document:
          document.implementation.createHTMLDocument("FrontMind 安全支付"),
        closed: false,
        close: vi.fn(),
      }) as unknown as Window;
    const firstPopup = makePopup();
    const secondPopup = makePopup();
    vi.spyOn(window, "open")
      .mockReturnValueOnce(firstPopup)
      .mockReturnValueOnce(secondPopup);
    vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(
      () => undefined,
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "前往付款" }));
    fireEvent.click(screen.getByRole("button", { name: /重新打开收银台/ }));
    fireEvent.click(screen.getByRole("button", { name: /重新打开收银台/ }));
    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /对公账户支付/ }));

    await waitFor(() => {
      expect(firstPopup.close).toHaveBeenCalledTimes(1);
      expect(secondPopup.close).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          localStorage.getItem("frontmind.geo.pending-payment.v2") || "{}",
        ).selectedChannel,
      ).toBe("bank_transfer");
      expect(screen.getByText(/输入管理员提供的确认码/)).toBeTruthy();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 1_350));
    expect(apiMocks.getGeoServicePaymentStatus).not.toHaveBeenCalled();
  });

  it("switches a restored service order online without changing its order facts", async () => {
    const initial = servicePendingPayment();
    const switchedCheckout = {
      ...initial.checkout,
      fields: {
        ...initial.checkout.fields,
        type: "wxpay",
        sign: "switched-service-signature",
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([serviceProject]);
    apiMocks.switchGeoServicePaymentCheckout.mockResolvedValue(
      switchedCheckout,
    );
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const popup = {
      opener: window,
      document:
        document.implementation.createHTMLDocument("FrontMind 安全支付"),
      closed: false,
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "前往付款" }));
    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /微信支付/ }));

    await waitFor(() => {
      expect(apiMocks.switchGeoServicePaymentCheckout).toHaveBeenCalledWith(
        serviceProject,
        {
          authorization: initial.checkout.authorization,
          method: "wxpay",
        },
      );
      expect(submit).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(
        localStorage.getItem("frontmind.geo.pending-payment.v2") || "{}",
      );
      expect(persisted.selectedChannel).toBe("wxpay");
      expect(persisted.checkout.authorization).toBe(
        initial.checkout.authorization,
      );
      expect(persisted.checkout.orderId).toBe(initial.checkout.orderId);
      expect(persisted.checkout.amountFen).toBe(initial.checkout.amountFen);
      expect(persisted.checkout.expiresAt).toBe(initial.checkout.expiresAt);
      expect(persisted.checkout.fields.type).toBe("wxpay");
    });
  });

  it("confirms a direct bank payment with purchase intent and clears it after success", async () => {
    const updatedProject: GeoProject = {
      ...serviceProject,
      remoteToken: "bank-confirmed-project-token",
      serviceActivation: {
        ...serviceProject.serviceActivation!,
        status: "account_setup_required",
        orderId: "20260806123456789012345678901234",
        paidAt: "2026-08-06T10:05:00.000Z",
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([serviceProject]);
    apiMocks.confirmGeoServiceBankTransfer.mockResolvedValue(updatedProject);
    window.history.replaceState(
      {},
      "",
      "/?purchaseIntent=one-time-purchase-intent-001#geo-builder",
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "前往付款" }));
    fireEvent.click(screen.getByRole("button", { name: /对公账户支付/ }));
    fireEvent.click(screen.getByRole("button", { name: /确认对公到账/ }));
    fireEvent.change(screen.getByPlaceholderText("请输入对公到账确认码"), {
      target: { value: "administrator-direct-bank-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认到账并继续" }));

    await waitFor(() => {
      expect(apiMocks.confirmGeoServiceBankTransfer).toHaveBeenCalledWith(
        serviceProject,
        {
          confirmationCode: "administrator-direct-bank-code",
          purchaseIntent: "one-time-purchase-intent-001",
        },
      );
      expect(window.location.search).toBe("");
      expect(window.location.hash).toBe("#geo-builder");
      expect(
        localStorage.getItem("frontmind.geo.pending-payment.v2"),
      ).toBeNull();
    });
  });

  it("opens a restored bank order without a local project and recovers it after confirmation", async () => {
    const initial = servicePendingPayment({
      selectedChannel: "bank_transfer",
      statusMessage: "已选择对公账户支付，等待管理员确认到账。",
    });
    const updatedProject: GeoProject = {
      ...serviceProject,
      remoteToken: "recovered-bank-project-token",
      serviceActivation: {
        ...serviceProject.serviceActivation!,
        status: "account_setup_required",
        orderId: initial.checkout.orderId,
        paidAt: "2026-08-06T10:05:00.000Z",
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([]);
    apiMocks.confirmGeoServiceBankTransfer.mockResolvedValue(updatedProject);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "等待对公到账确认" }),
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /确认对公到账/ })[0]);
    fireEvent.change(screen.getByPlaceholderText("请输入对公到账确认码"), {
      target: { value: "administrator-recovery-bank-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认到账并继续" }));

    await waitFor(() => {
      expect(apiMocks.confirmGeoServiceBankTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: initial.projectId,
          remoteToken: initial.projectToken,
          stage: "service_activation",
        }),
        {
          confirmationCode: "administrator-recovery-bank-code",
          authorization: initial.checkout.authorization,
        },
      );
      expect(
        localStorage.getItem("frontmind.geo.pending-payment.v2"),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: /继续项目：硅基流动/ }),
      ).toBeTruthy();
    });
  });

  it("reopens and switches online channels for a recovered bank order without an active project", async () => {
    const initial = servicePendingPayment({
      selectedChannel: "bank_transfer",
      statusMessage: "已选择对公账户支付，等待管理员确认到账。",
    });
    const switchedCheckout = {
      ...initial.checkout,
      fields: {
        ...initial.checkout.fields,
        type: "wxpay",
        sign: "recovered-switch-signature",
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([]);
    apiMocks.switchGeoServicePaymentCheckout.mockResolvedValue(
      switchedCheckout,
    );
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const popup = {
      opener: window,
      document:
        document.implementation.createHTMLDocument("FrontMind 安全支付"),
      closed: false,
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: "等待对公到账确认" });

    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /支付宝支付/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /微信支付/ }));
    await waitFor(() => {
      expect(apiMocks.switchGeoServicePaymentCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          id: initial.projectId,
          remoteToken: initial.projectToken,
        }),
        {
          authorization: initial.checkout.authorization,
          method: "wxpay",
        },
      );
      expect(submit).toHaveBeenCalledTimes(2);
      const persisted = JSON.parse(
        localStorage.getItem("frontmind.geo.pending-payment.v2") || "{}",
      );
      expect(persisted.selectedChannel).toBe("wxpay");
      expect(persisted.checkout.fields.type).toBe("wxpay");
    });
  });
});

describe("free monitoring confirmation and service-only payment boundaries", () => {
  it("starts free overseas monitoring without creating a checkout", async () => {
    const overseasProject: GeoProject = {
      ...project,
      monitoringEdition: "overseas",
      selectedPlatformIds: ["chatgpt"],
    };
    storageMocks.listGeoProjects.mockResolvedValue([overseasProject]);
    apiMocks.startGeoMonitoring.mockResolvedValue({
      ...overseasProject,
      remoteToken: "free-monitor-started-token",
      monitoring: {
        runId: "free-overseas-run",
        status: "submitted",
        platforms: ["chatgpt"],
        expectedRecords: 5,
        completedRecords: 0,
        failedRecords: 0,
        answers: [],
      },
    });

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "获取监控答案" }),
    );
    expect(screen.queryByText(/英文翻译/)).toBeNull();
    expect(screen.queryByText(/¥|支付方式|确认并支付/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /确认并获取监控答案/ }));

    await waitFor(() => {
      expect(apiMocks.startGeoMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({
          id: overseasProject.id,
          monitoringEdition: "overseas",
          selectedPlatformIds: ["chatgpt"],
        }),
        expect.objectContaining({
          clientRequestId: expect.any(String),
          questionId: "question-01",
          platformIds: ["chatgpt"],
          monitoringEdition: "overseas",
          onProcessing: expect.any(Function),
        }),
      );
    });
    expect(apiMocks.createGeoPaymentCheckout).not.toHaveBeenCalled();
    expect(apiMocks.switchGeoPaymentCheckout).not.toHaveBeenCalled();
  });

  it("keeps an alternate payment method available after closing and reopening", () => {
    const onOpenChange = vi.fn();
    const onSwitch = vi.fn();
    const props = dialogProps({ onOpenChange, onSwitch });
    const view = render(<PaymentDialog {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "更换支付渠道" }));
    fireEvent.click(screen.getByRole("button", { name: /微信支付/ }));
    expect(onSwitch).toHaveBeenCalledWith("wxpay");

    fireEvent.click(screen.getByRole("button", { name: "稍后查看" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(<PaymentDialog {...props} open={false} />);
    view.rerender(<PaymentDialog {...props} open />);
    expect(screen.getByRole("button", { name: "更换支付渠道" })).toBeTruthy();
  });

  it("announces progress while switching an existing checkout", () => {
    render(<PaymentDialog {...dialogProps({ creating: true })} />);

    expect(screen.getByRole("status").textContent).toContain(
      "正在切换支付方式…",
    );
  });

  it("migrates a cached monitoring checkout through the free confirmation path", async () => {
    const initial = pendingPayment();
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.startGeoMonitoring.mockResolvedValue({
      ...project,
      remoteToken: "free-migration-token",
      monitoring: {
        runId: "free-migration-run",
        status: "submitted",
        platforms: ["doubao"],
        expectedRecords: 5,
        completedRecords: 0,
        failedRecords: 0,
        answers: [],
      },
    });
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    setItem.mockClear();
    removeItem.mockClear();

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    await waitFor(() =>
      expect(storageMocks.listGeoProjects).toHaveBeenCalled(),
    );
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();
    expect(apiMocks.startGeoMonitoring).not.toHaveBeenCalled();
    expect(
      setItem.mock.calls.filter(
        ([key]) => key === "frontmind.geo.pending-payment.v2",
      ),
    ).toHaveLength(0);
    expect(
      removeItem.mock.calls.filter(
        ([key]) => key === "frontmind.geo.pending-payment.v2",
      ),
    ).toHaveLength(0);
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "获取监控答案" }),
    );
    expect(screen.getByText(/检测到切换前的监控订单/)).toBeTruthy();
    expect(screen.queryByText(/¥|支付方式|更换支付渠道/)).toBeNull();
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();
    expect(apiMocks.startGeoMonitoring).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /确认并获取监控答案/ }));

    await waitFor(() => {
      expect(apiMocks.startGeoMonitoring).toHaveBeenCalledWith(
        project,
        expect.objectContaining({
          clientRequestId: expect.any(String),
          questionId: "question-01",
          platformIds: ["doubao"],
          monitoringEdition: "domestic",
          legacyPaymentAuthorization: initial.checkout.authorization,
        }),
      );
    });
    expect(apiMocks.createGeoPaymentCheckout).not.toHaveBeenCalled();
    expect(apiMocks.switchGeoPaymentCheckout).not.toHaveBeenCalled();
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();
    expect(
      removeItem.mock.calls.filter(
        ([key]) => key === "frontmind.geo.pending-payment.v2",
      ).length,
    ).toBeGreaterThan(0);
    expect(localStorage.getItem("frontmind.geo.pending-payment.v2")).toBeNull();
  });

  it("persists a 202 recovery token and resumes the same request after refresh", async () => {
    const initial = pendingPayment();
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    apiMocks.startGeoMonitoring.mockImplementation(
      async (
        operationProject: GeoProject,
        input: {
          clientRequestId: string;
          questionId: string;
          platformIds: string[];
          monitoringEdition: string;
          onProcessing?: (project: GeoProject) => void;
        },
      ) => {
        input.onProcessing?.({
          ...operationProject,
          remoteToken: "durable-monitor-recovery-token",
          monitoringRecovery: {
            schemaVersion: 2,
            clientRequestId: input.clientRequestId,
            questionId: input.questionId,
            monitoringEdition: "domestic",
            platformIds: ["doubao"],
          },
        });
        throw new GeoApiError(
          "海外问题仍在准备中，请稍后使用同一范围重试。",
          202,
          "QUESTION_TRANSLATION_PENDING",
        );
      },
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "获取监控答案" }));
    fireEvent.click(screen.getByRole("button", { name: /确认并获取监控答案/ }));

    await waitFor(() =>
      expect(storageMocks.saveGeoProject).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteToken: "durable-monitor-recovery-token",
          monitoringRecovery: expect.objectContaining({
            clientRequestId: expect.any(String),
          }),
        }),
      ),
    );
    const recoveredProject = storageMocks.saveGeoProject.mock.calls
      .map(([candidate]) => candidate as GeoProject)
      .find(
        (candidate) =>
          candidate.remoteToken === "durable-monitor-recovery-token",
      )!;
    const clientRequestId =
      recoveredProject.monitoringRecovery!.clientRequestId;
    expect(
      localStorage.getItem("frontmind.geo.pending-payment.v2"),
    ).not.toBeNull();
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();

    cleanup();
    storageMocks.listGeoProjects.mockResolvedValue([recoveredProject]);
    apiMocks.startGeoMonitoring.mockReset().mockResolvedValue({
      ...recoveredProject,
      remoteToken: "free-monitor-complete-token",
      monitoringRecovery: undefined,
      monitoring: {
        runId: "free-monitor-run",
        status: "submitted",
        platforms: ["doubao"],
        expectedRecords: 5,
        completedRecords: 0,
        failedRecords: 0,
        answers: [],
      },
    });

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "获取监控答案" }));
    fireEvent.click(screen.getByRole("button", { name: /确认并获取监控答案/ }));

    await waitFor(() => {
      expect(apiMocks.startGeoMonitoring).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteToken: "durable-monitor-recovery-token",
        }),
        expect.objectContaining({ clientRequestId }),
      );
    });
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();
  });

  it("never mounts the monitoring payment dialog for a cached checkout", async () => {
    const initial = pendingPayment();
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /继续项目：硅基流动/ }),
    );

    expect(screen.queryByRole("button", { name: "查看支付进度" })).toBeNull();
    expect(screen.queryByText("确认问题监控订单")).toBeNull();
    expect(screen.queryByRole("button", { name: /支付宝支付/ })).toBeNull();
    expect(screen.getByRole("button", { name: "获取监控答案" })).toBeTruthy();
    expect(apiMocks.getGeoPaymentStatus).not.toHaveBeenCalled();
    expect(apiMocks.startGeoLegacyPaidMonitoring).not.toHaveBeenCalled();
    expect(apiMocks.startGeoMonitoring).not.toHaveBeenCalled();
    expect(apiMocks.createGeoPaymentCheckout).not.toHaveBeenCalled();
    expect(apiMocks.switchGeoPaymentCheckout).not.toHaveBeenCalled();
  });
});
