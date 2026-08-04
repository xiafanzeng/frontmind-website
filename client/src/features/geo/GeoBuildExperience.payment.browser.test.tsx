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
import GeoBuildExperience, { PaymentDialog } from "./GeoBuildExperience";
import type { GeoProject } from "./types";

const apiMocks = vi.hoisted(() => ({
  getGeoPaymentStatus: vi.fn(),
  startGeoMonitoring: vi.fn(),
  switchGeoPaymentCheckout: vi.fn(),
}));
const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getGeoPaymentStatus: apiMocks.getGeoPaymentStatus,
  startGeoMonitoring: apiMocks.startGeoMonitoring,
  switchGeoPaymentCheckout: apiMocks.switchGeoPaymentCheckout,
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  listGeoProjects: storageMocks.listGeoProjects,
  requestPersistentGeoStorage: storageMocks.requestPersistentGeoStorage,
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
  selectedPlatformIds: ["doubao"],
};

type PaymentDialogProps = ComponentProps<typeof PaymentDialog>;
type MonitoringPendingPayment = Extract<
  NonNullable<PaymentDialogProps["pending"]>,
  { kind: "monitoring" }
>;

function pendingPayment(
  overrides: Partial<MonitoringPendingPayment> = {},
): MonitoringPendingPayment {
  return {
    kind: "monitoring",
    projectId: project.id,
    projectToken: project.remoteToken,
    questionId: "question-01",
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

function dialogProps(
  overrides: Partial<PaymentDialogProps> = {},
): PaymentDialogProps {
  return {
    open: true,
    project,
    pending: pendingPayment(),
    purpose: "monitoring",
    creating: false,
    error: "",
    onOpenChange: vi.fn(),
    onStart: vi.fn(),
    onSwitch: vi.fn(),
    onReopen: vi.fn(),
    onCheck: vi.fn(),
    onContact: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  apiMocks.getGeoPaymentStatus.mockReset().mockResolvedValue({
    status: "pending",
    orderId: "20260804123456789012345678901234",
    amountFen: 200,
    message: "等待支付完成",
  });
  apiMocks.startGeoMonitoring.mockReset();
  apiMocks.switchGeoPaymentCheckout.mockReset();
  storageMocks.listGeoProjects.mockReset().mockResolvedValue([]);
  storageMocks.requestPersistentGeoStorage.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("monitoring payment dialog", () => {
  it("keeps an alternate payment method available after closing and reopening", () => {
    const onOpenChange = vi.fn();
    const onSwitch = vi.fn();
    const props = dialogProps({ onOpenChange, onSwitch });
    const view = render(<PaymentDialog {...props} />);

    const switchButton = screen.getByRole("button", {
      name: "更换为微信支付",
    });
    fireEvent.click(switchButton);
    expect(onSwitch).toHaveBeenCalledWith("wxpay");

    fireEvent.click(screen.getByRole("button", { name: "稍后查看" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(<PaymentDialog {...props} open={false} />);
    view.rerender(<PaymentDialog {...props} open />);
    expect(screen.getByRole("button", { name: "更换为微信支付" })).toBeTruthy();
  });

  it("does not offer switching for an expired checkout", () => {
    render(
      <PaymentDialog
        {...dialogProps({
          pending: pendingPayment({
            checkout: {
              ...pendingPayment().checkout,
              expiresAt: "2020-01-01T00:00:00.000Z",
            },
          }),
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: /更换为/ })).toBeNull();
  });

  it("announces progress while switching an existing checkout", () => {
    render(<PaymentDialog {...dialogProps({ creating: true })} />);

    expect(screen.getByRole("status").textContent).toContain(
      "正在切换支付方式…",
    );
  });

  it("replaces the persisted cashier form after switching from a reopened order", async () => {
    const initial = pendingPayment();
    const switchedCheckout = {
      ...initial.checkout,
      fields: {
        ...initial.checkout.fields,
        type: "wxpay",
        sign: "switched-signature",
      },
    };
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.switchGeoPaymentCheckout.mockResolvedValue(switchedCheckout);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const paymentDocument =
      document.implementation.createHTMLDocument("FrontMind 安全支付");
    const popup = {
      opener: window,
      document: paymentDocument,
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
    fireEvent.click(
      await screen.findByRole("button", { name: "查看支付进度" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "稍后查看" }));
    fireEvent.click(screen.getByRole("button", { name: "查看支付进度" }));
    fireEvent.click(screen.getByRole("button", { name: "更换为微信支付" }));

    await waitFor(() => {
      expect(apiMocks.switchGeoPaymentCheckout).toHaveBeenCalledWith(project, {
        questionId: "question-01",
        platformIds: ["doubao"],
        authorization: initial.checkout.authorization,
        method: "wxpay",
      });
      expect(submit).toHaveBeenCalledTimes(1);
      expect(
        JSON.parse(
          localStorage.getItem("frontmind.geo.pending-payment.v2") || "{}",
        ).checkout.fields.type,
      ).toBe("wxpay");
    });
    expect(screen.getAllByText(/微信支付/).length).toBeGreaterThan(0);
  });

  it("does not submit a switched cashier after polling confirms payment", async () => {
    const initial = pendingPayment();
    const switchedCheckout = {
      ...initial.checkout,
      fields: {
        ...initial.checkout.fields,
        type: "wxpay" as const,
        sign: "switched-signature",
      },
    };
    let resolvePaymentStatus!: (value: {
      status: "paid";
      orderId: string;
      amountFen: number;
      paidAt: string;
      message: string;
    }) => void;
    const paymentStatus = new Promise<{
      status: "paid";
      orderId: string;
      amountFen: number;
      paidAt: string;
      message: string;
    }>((resolve) => {
      resolvePaymentStatus = resolve;
    });
    let resolveSwitch!: (value: typeof switchedCheckout) => void;
    const switchResult = new Promise<typeof switchedCheckout>((resolve) => {
      resolveSwitch = resolve;
    });
    storageMocks.listGeoProjects.mockResolvedValue([project]);
    apiMocks.getGeoPaymentStatus.mockReturnValue(paymentStatus);
    apiMocks.startGeoMonitoring.mockImplementation(
      () => new Promise<GeoProject>(() => undefined),
    );
    apiMocks.switchGeoPaymentCheckout.mockReturnValue(switchResult);
    localStorage.setItem(
      "frontmind.geo.pending-payment.v2",
      JSON.stringify(initial),
    );
    const paymentDocument =
      document.implementation.createHTMLDocument("FrontMind 安全支付");
    const popup = {
      opener: window,
      document: paymentDocument,
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
    fireEvent.click(
      await screen.findByRole("button", { name: "查看支付进度" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "更换为微信支付" }));

    expect(screen.getByRole("status").textContent).toContain(
      "正在切换支付方式…",
    );
    await waitFor(
      () => expect(apiMocks.getGeoPaymentStatus).toHaveBeenCalledTimes(1),
      { timeout: 2_500 },
    );

    await act(async () => {
      resolvePaymentStatus({
        status: "paid",
        orderId: initial.checkout.orderId,
        amountFen: initial.checkout.amountFen,
        paidAt: "2026-08-04T03:15:00.000Z",
        message: "支付成功",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("付款已确认，正在启动监控")).toBeTruthy();
      expect(apiMocks.startGeoMonitoring).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveSwitch(switchedCheckout);
    });
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("frontmind.geo.pending-payment.v2") || "{}",
      );
      expect(submit).not.toHaveBeenCalled();
      expect(popup.close).toHaveBeenCalledTimes(1);
      expect(persisted.status).toBe("paid");
      expect(persisted.checkout.fields.type).toBe("alipay");
    });
  });
});
