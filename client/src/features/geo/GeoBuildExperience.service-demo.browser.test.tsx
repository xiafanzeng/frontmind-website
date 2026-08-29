// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "@/contexts/LanguageContext";
import GeoBuildExperience from "./GeoBuildExperience";
import type { GeoProject, GeoServiceActivationStatus } from "./types";

const commercialApiMocks = vi.hoisted(() => ({
  createGeoPaymentCheckout: vi.fn(),
  getGeoPaymentStatus: vi.fn(),
  switchGeoPaymentCheckout: vi.fn(),
  createGeoServicePaymentCheckout: vi.fn(),
  switchGeoServicePaymentCheckout: vi.fn(),
  confirmGeoServiceBankTransfer: vi.fn(),
  submitGeoServiceContractProfile: vi.fn(),
  getGeoServiceContractStatus: vi.fn(),
  getGeoServicePaymentStatus: vi.fn(),
  startGeoService: vi.fn(),
  createGeoServiceAccount: vi.fn(),
  getGeoServiceProvisioningStatus: vi.fn(),
  startGeoOptimizationForecast: vi.fn(),
  startIndustryRankingOptimizationForecast: vi.fn(),
  getGeoProject: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  listGeoProjects: vi.fn(),
  requestPersistentGeoStorage: vi.fn(),
  saveGeoProject: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...commercialApiMocks,
}));

vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  ...storageMocks,
}));

const serviceStatuses: GeoServiceActivationStatus[] = [
  "not_started",
  "profile_required",
  "contract_preparing",
  "signature_required",
  "payment_required",
  "activation_pending",
  "account_setup_required",
  "provisioning",
  "active",
  "failed",
];

function serviceProject(status: GeoServiceActivationStatus): GeoProject {
  return {
    id: `service-demo-${status}`,
    remoteToken: `service-demo-token-${status}`,
    title: "演示企业",
    input: "演示企业",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    stage: "service_activation",
    status: "ready",
    progress: 100,
    files: [],
    questions: [
      {
        id: "question-product",
        category: "product_scenario",
        question: "企业方案适合哪些业务场景？",
        selectable: true,
      },
    ],
    selectedQuestionId: "question-product",
    selectedPlatformIds: ["deepseek"],
    assessment: {
      status: "ready",
      totalScore: 65,
      quality: { completeness: "complete", downstreamEligible: true },
      dimensions: [
        ["semantic_visibility", "语义可见度"],
        ["semantic_coherence", "语义一致性"],
        ["semantic_richness", "语义丰富度"],
        ["semantic_authority", "语义权威度"],
        ["competitive_advantage", "竞争优势"],
      ].map(([id, label]) => ({
        id: id as
          | "semantic_visibility"
          | "semantic_coherence"
          | "semantic_richness"
          | "semantic_authority"
          | "competitive_advantage",
        label,
        score: 13,
        maxScore: 20,
      })),
      comparisons: [],
    },
    optimizationForecast: {
      status: "ready",
      currentScore: 65,
      targetLow: 72,
      targetExpected: 78,
      targetHigh: 84,
      quality: { completeness: "complete", downstreamEligible: true },
      dimensions: [],
      assumptions: [],
      roadmap: [],
    },
    serviceActivation: {
      status,
      questionId: "question-product",
      category: "product_scenario",
      amountFen: 999_900,
      billingMonths: 1,
      contractId: "stale-contract",
      signingUrl: "https://sign.example.invalid/stale",
      orderId: "stale-order",
      accountUsername: "stale-account",
    },
  };
}

beforeEach(() => {
  Object.values(commercialApiMocks).forEach((mock) => mock.mockReset());
  Object.values(storageMocks).forEach((mock) => mock.mockReset());
  storageMocks.requestPersistentGeoStorage.mockResolvedValue(false);
  storageMocks.saveGeoProject.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("public GEO service demo", () => {
  it("leaves automatic forecast progression to GET reconciliation", async () => {
    const base = serviceProject("not_started");
    const project = {
      ...base,
      stage: "current_assessment" as const,
      optimizationForecast: undefined,
      questions: [
        ...base.questions,
        {
          id: "question-industry",
          category: "industry_ranking" as const,
          question: "行业中有哪些值得关注的服务方案？",
          selectable: true,
        },
      ],
      selectedIndustryRankingQuestionId: "question-industry",
      industryRankingAssessment: base.assessment,
      industryRankingOptimizationForecast: undefined,
    };
    storageMocks.listGeoProjects.mockResolvedValueOnce([project]);
    commercialApiMocks.getGeoProject.mockResolvedValue(project);

    render(
      <LanguageProvider initialLang="zh">
        <GeoBuildExperience />
      </LanguageProvider>,
    );
    await screen.findByRole("button", { name: /继续项目：演示企业/ });

    expect(
      commercialApiMocks.startGeoOptimizationForecast,
    ).not.toHaveBeenCalled();
    expect(
      commercialApiMocks.startIndustryRankingOptimizationForecast,
    ).not.toHaveBeenCalled();
  });

  it("ignores retired payment state across every historical service status", async () => {
    for (const status of serviceStatuses) {
      cleanup();
      const project = serviceProject(status);
      storageMocks.listGeoProjects.mockResolvedValueOnce([project]);
      commercialApiMocks.getGeoProject.mockResolvedValue(project);
      localStorage.setItem(
        "frontmind.geo.pending-payment.v2",
        JSON.stringify({
          kind: "service",
          projectId: project.id,
          status: "pending",
          checkout: {
            orderId: "stale-order",
            amountFen: 999_900,
            fields: { money: "9999.00" },
          },
        }),
      );

      const view = render(
        <LanguageProvider initialLang="zh">
          <GeoBuildExperience />
        </LanguageProvider>,
      );
      fireEvent.click(
        await screen.findByRole("button", { name: /继续项目：演示企业/ }),
      );
      if (status === "not_started") {
        fireEvent.click(
          screen.getByRole("button", { name: /步骤 5：服务演示/ }),
        );
      }

      const tabs = await screen.findByRole("tablist", {
        name: "服务演示内容",
      });
      expect(within(tabs).getAllByRole("tab")).toHaveLength(2);
      expect(
        within(tabs).getByRole("tab", { name: /^工作台演示/ }),
      ).toBeTruthy();
      expect(within(tabs).getByRole("tab", { name: /^服务范围/ })).toBeTruthy();
      expect(view.container.textContent).not.toMatch(
        /[¥￥]|\d[\d,.]*\s*元|月费|报价|价格|合同|签约|付款|支付|开户/,
      );
    }

    const { getGeoProject: _genericRefresh, ...commercialWrites } =
      commercialApiMocks;
    Object.values(commercialWrites).forEach((mock) => {
      expect(mock).not.toHaveBeenCalled();
    });
  });
});
