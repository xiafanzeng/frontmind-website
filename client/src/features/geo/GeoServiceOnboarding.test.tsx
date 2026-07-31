import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  buildPopulatedServiceContractHref,
  GeoServiceOnboarding,
} from "./GeoServiceOnboarding";
import type { GeoServiceActivation } from "./types";

const baseActivation: GeoServiceActivation = {
  status: "payment_required",
  questionId: "question-01",
  category: "product_scenario",
  amountFen: 150_000,
  billingMonths: 1,
  contractWorkflowReference: "manual-order-001",
  contractId: "FM-CONTRACT-001",
  signedAt: "2026-07-24T09:00:00.000Z",
};

function renderOnboarding(activation = baseActivation) {
  return renderToStaticMarkup(
    <GeoServiceOnboarding
      activation={activation}
      companyName="深圳星辰科技有限公司"
      categoryLabel="产品场景"
      question="深圳星辰科技适合哪些企业使用？"
      contractHref="/contracts/frontmind-geo.html"
      isPreview={false}
      onSubmitProfile={vi.fn()}
      onCheckout={vi.fn()}
      onCreateAccount={vi.fn()}
      onCheckStatus={vi.fn()}
    />,
  );
}

describe("GeoServiceOnboarding", () => {
  it("keeps submitted contract fields in the URL fragment for a render-ready PDF without sending them to the server", () => {
    const href = buildPopulatedServiceContractHref(
      "/contracts/frontmind-geo.html?category=product_scenario&order=FM-001",
      {
        legalName: "深圳星辰科技有限公司",
        creditCode: "91440300ma5f12345x",
        address: "深圳市南山区科技园一号",
        signatoryName: "张三",
        signatoryTitle: "运营负责人",
        mobile: "13800138000",
        email: "CONTRACTS@example.com",
        authorized: true,
      },
    );

    expect(href).toContain("?category=product_scenario&order=FM-001#");
    expect(href.split("#")[0]).not.toContain("13800138000");
    const profile = new URLSearchParams(href.split("#")[1]);
    expect(profile.get("legalName")).toBe("深圳星辰科技有限公司");
    expect(profile.get("creditCode")).toBe("91440300MA5F12345X");
    expect(profile.get("email")).toBe("contracts@example.com");
  });

  it("shows the sign-first sequence as four ordered steps", () => {
    const html = renderOnboarding();

    expect(html).toContain("签约资料");
    expect(html).toContain("合同查看");
    expect(html).toContain("付款确认");
    expect(html).toContain("开通看板");
    expect(html.indexOf("合同查看")).toBeLessThan(html.indexOf("付款确认"));
    expect(html).not.toContain("人工签约");
    expect(html).not.toContain(">05</small>");
  });

  it("collects company and authorized signatory details before contract creation", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "profile_required",
      contractWorkflowReference: undefined,
      contractId: undefined,
      signedAt: undefined,
    });

    expect(html).toContain("提交合同主体与签约经办人");
    expect(html).toContain("统一社会信用代码");
    expect(html).toContain("企业联系地址");
    expect(html).toContain("签约经办人");
    expect(html).toContain("提交资料，等待管理员发起");
    expect(html).not.toContain('type="password"');
  });

  it("shows the configured WeChat QR and an executable admin reminder while the contract is being prepared", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "contract_preparing",
      contractId: undefined,
      signedAt: undefined,
    });

    expect(html).toContain("资料已提交，等待管理员发起合同");
    expect(html).toContain('src="/geo-builder/contact-wechat.png"');
    expect(html).toContain("打开微信二维码");
    expect(html).toContain("邮件提醒管理员");
    expect(html).toContain('href="mailto:xiafanzeng@frontmind.com.cn');
    expect(html).toContain("FrontMind%20%E5%90%88%E5%90%8C%E5%8F%91%E8%B5%B7");
    expect(html).toContain("刷新发起状态");
    expect(html).not.toContain("前往付款");
  });

  it("shows the trusted signing URL only after the contract is issued", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      signingUrl: "https://sign.example.com/task/001",
      signedAt: undefined,
    });

    expect(html).toContain("合同已准备，请查看并完成签署");
    expect(html).toContain("查看并签署合同");
    expect(html).toContain("我已签署，刷新状态");
    expect(html).not.toContain("前往付款");
    expect(html).not.toContain("银行卡材料");
    expect(html).not.toContain("签署意愿由电子签平台留存");
  });

  it("does not render a credential-bearing or private signing URL", () => {
    const credentialUrl = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      signingUrl: "https://user:secret@sign.example.com/task/001",
      signedAt: undefined,
    });
    const privateUrl = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      signingUrl: "https://127.0.0.1/task/001",
      signedAt: undefined,
    });

    expect(credentialUrl).not.toContain("查看并签署合同");
    expect(privateUrl).not.toContain("查看并签署合同");
    expect(credentialUrl).not.toContain("user:secret");
    expect(privateUrl).not.toContain("127.0.0.1");
  });

  it("enables payment only after signed evidence has been verified", () => {
    const html = renderOnboarding();

    expect(html).toContain("已签合同核验通过，可以付款");
    expect(html).toContain("合同状态");
    expect(html).toContain("已签署并核验");
    expect(html).toContain('src="/geo-builder/payments/alipay.svg"');
    expect(html).toContain('src="/geo-builder/payments/wechat-pay.svg"');
    expect(html).toContain("选择后由收银台生成真实二维码");
    expect(html).toContain("前往付款");
  });

  it("lets the enterprise create its account directly after payment", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "account_setup_required",
      accountMode: "create",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
    });

    expect(html).toContain("企业直接创建看板账号");
    expect(html).toContain("企业显示名称");
    expect(html).toContain('value="深圳星辰科技有限公司"');
    expect(html).toContain("登录账号");
    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html).toContain("创建账号并开通看板");
    expect(html).not.toContain("提交账号，等待管理员开通");
    expect(html).not.toContain("进入看板");
  });

  it("shows account provisioning without an additional administrator-wait message", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "activation_pending",
      accountMode: "create",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
    });

    expect(html).toContain("账号已创建，正在开通看板");
    expect(html).not.toContain("等待管理员");
    expect(html).toContain("刷新开通状态");
    expect(html).not.toContain("前往付款");
    expect(html).not.toContain("进入看板");
  });

  it("skips credential creation when an existing account is already bound", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "activation_pending",
      accountMode: "bind_existing",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
    });

    expect(html).toContain("已有账号已绑定，正在开通看板");
    expect(html).not.toContain("企业直接创建看板账号");
    expect(html).not.toContain('type="password"');
  });

  it("offers a real synchronization retry only for retryable provisioning failures", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "failed",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
      provisioningStatus: "provisioned",
      knowledgeImport: {
        status: "failed",
        retryable: true,
        message: "知识库同步暂时不可用",
      },
      error: "知识库同步暂时不可用",
    });

    expect(html).toContain("重试同步");
    expect(html).not.toContain("重试查询");
    expect(html).not.toContain("联系技术支持");
  });

  it("does not mislabel a retryable provisioning failure as a real synchronization retry", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "failed",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
      provisioningStatus: "failed",
      provisioningRetryable: true,
      error: "账号开通失败",
    });

    expect(html).toContain("联系技术支持");
    expect(html).not.toContain("重试同步");
  });

  it("routes a terminal paid provisioning failure to actionable support", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "failed",
      orderId: "FM202607240001",
      paidAt: "2026-07-24T10:00:00.000Z",
      provisioningRetryable: false,
      knowledgeImport: {
        status: "failed",
        retryable: false,
        message: "资料需要人工核验",
      },
    });

    expect(html).toContain("联系技术支持");
    expect(html).toContain('href="mailto:xiafanzeng@frontmind.com.cn');
    expect(html).toContain("FM202607240001");
    expect(html).not.toContain("重试查询");
    expect(html).not.toContain("重试同步");
  });

  it("links to the provisioned Agent workspace only after activation", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "active",
      accountDisplayName: "深圳星辰科技",
      accountUsername: "xingchen",
      accountSetupUrl: "https://dashboard.frontmind.net/account/setup/legacy",
      workspaceUrl: "https://dashboard.frontmind.net/login",
      activatedAt: "2026-07-24T10:05:00.000Z",
    });

    expect(html).toContain("服务已开通");
    expect(html).toContain('href="https://dashboard.frontmind.net/login"');
    expect(html).toContain("进入看板");
    expect(html).not.toContain("设置登录密码后进入看板");
    expect(html).not.toContain("官网不会收集或保存密码");
    expect(html).not.toContain("/account/setup/legacy");
    expect(html).not.toContain('type="password"');
  });

  it("does not invent a generic Agent URL when activation omitted the handoff URLs", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "active",
      accountDisplayName: "深圳星辰科技",
      accountUsername: "xingchen",
      accountSetupUrl: undefined,
      workspaceUrl: undefined,
      activatedAt: "2026-07-24T10:05:00.000Z",
    });

    expect(html).toContain("重新获取工作台地址");
    expect(html).not.toContain('href="https://dashboard.frontmind.net/');
  });

  it("fails closed when the returned workspace URL is not public", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "active",
      accountDisplayName: "深圳星辰科技",
      workspaceUrl: "https://192.168.1.10/admin",
      activatedAt: "2026-07-24T10:05:00.000Z",
    });

    expect(html).toContain("重新获取工作台地址");
    expect(html).not.toContain("192.168.1.10");
  });
});
