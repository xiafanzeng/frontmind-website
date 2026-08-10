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
  contractAuthorizationMode: "external_wechat",
  contractAuthorizedAt: "2026-07-24T09:00:00.000Z",
};

function renderOnboarding(activation = baseActivation) {
  return renderToStaticMarkup(
    <GeoServiceOnboarding
      activation={activation}
      companyName="深圳星辰科技有限公司"
      categoryLabel="产品场景"
      question="深圳星辰科技适合哪些企业使用？"
      contractHref="/contracts/frontmind-geo-monthly-optimization-service-agreement.html?category=product_scenario"
      isPreview={false}
      onSubmitProfile={vi.fn()}
      onCheckout={vi.fn()}
      onCreateAccount={vi.fn()}
      onCheckStatus={vi.fn()}
    />,
  );
}

describe("GeoServiceOnboarding", () => {
  it("preserves the contract query and replaces its profile hash", () => {
    const href = buildPopulatedServiceContractHref(
      "/contracts/frontmind-geo-monthly-optimization-service-agreement.html?category=reputation&question=%E7%A1%85%E5%9F%BA%E6%B5%81%E5%8A%A8#stale=true",
      {
        legalName: "硅基流动",
        creditCode: "91440300mak683qkx0",
        address: "Building 10, Lingxiu Lanpo Lake",
        signatoryName: "Fanzeng Xia",
        signatoryTitle: "代表人",
        mobile: "13086803181",
        email: "FX394@NYU.EDU",
        authorized: true,
      },
    );
    const [contractPath, profileHash] = href.split("#");
    const profile = new URLSearchParams(profileHash);

    expect(contractPath).toBe(
      "/contracts/frontmind-geo-monthly-optimization-service-agreement.html?category=reputation&question=%E7%A1%85%E5%9F%BA%E6%B5%81%E5%8A%A8",
    );
    expect(profile.get("legalName")).toBe("硅基流动");
    expect(profile.get("creditCode")).toBe("91440300MAK683QKX0");
    expect(profile.get("signatoryName")).toBe("Fanzeng Xia");
    expect(profile.get("email")).toBe("fx394@nyu.edu");
    expect(profile.has("stale")).toBe(false);
  });

  it("shows the external-contract sequence as three ordered steps", () => {
    const html = renderOnboarding();

    expect(html).toContain("签约资料");
    expect(html).toContain("付款确认");
    expect(html).toContain("开通账号");
    expect(html).not.toContain("合同查看");
    expect(html).not.toContain("查看合同内容");
    expect(html).toContain("查看合同");
    expect(html).toContain(
      "frontmind-geo-monthly-optimization-service-agreement",
    );
    const contractLink = html.match(
      /<a[^>]*class="geo-onboarding-contract-view"[^>]*>/,
    )?.[0];
    expect(contractLink).toContain('target="_blank"');
    expect(contractLink).toContain('rel="noopener noreferrer"');
    expect(contractLink).not.toContain("onclick=");
    expect(html.indexOf("签约资料")).toBeLessThan(html.indexOf("付款确认"));
    expect(html.indexOf("付款确认")).toBeLessThan(html.indexOf("开通账号"));
    expect(html).not.toContain(">04</small>");
  });

  it("collects company and authorized signatory details before contract creation", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "profile_required",
      contractWorkflowReference: undefined,
      contractId: undefined,
      signedAt: undefined,
    });

    expect(html).toContain("提交主体资料并联系管理员");
    expect(html).toContain("统一社会信用代码");
    expect(html).toContain("企业联系地址");
    expect(html).toContain("签约经办人");
    expect(html).toContain("提交资料并联系管理员");
    expect(html).not.toContain('type="password"');
  });

  it("routes legacy pending contracts back to the first step without rendering the removed signing panel", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "contract_preparing",
      contractId: undefined,
      signedAt: undefined,
    });

    expect(html).toContain("提交资料并联系管理员");
    expect(html).not.toContain("资料已提交，等待管理员发起合同");
    expect(html).not.toContain("刷新发起状态");
    expect(html).not.toContain("前往付款");
  });

  it("does not expose the removed in-site signing experience for legacy orders", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      signingUrl: "https://sign.example.com/task/001",
      signedAt: undefined,
    });

    expect(html).toContain("提交资料并联系管理员");
    expect(html).not.toContain("合同已准备，请查看并完成签署");
    expect(html).not.toContain("查看并签署合同");
    expect(html).not.toContain("我已签署，刷新状态");
    expect(html).not.toContain("https://sign.example.com/task/001");
    expect(html).not.toContain("前往付款");
    expect(html).not.toContain("银行卡材料");
    expect(html).not.toContain("签署意愿由电子签平台留存");
  });

  it("stops an unpaid rejected order instead of offering a contract code the backend will reject", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "failed",
      manualOrderStatus: "rejected",
      paidAt: undefined,
      error: "管理员确认尚未完成",
    });

    expect(html).toContain("本次签约申请未通过");
    expect(html).toContain("当前申请不能继续提交合同码");
    expect(html).toContain("联系支持处理");
    expect(html).toContain('href="mailto:xiafanzeng@frontmind.com.cn');
    expect(html).not.toContain("提交资料并联系管理员");
    expect(html).not.toContain("企业直接创建看板账号");
    expect(html).not.toContain("前往付款");
  });

  it("stops an unpaid failed order instead of reopening the contract form", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "failed",
      manualOrderStatus: "failed",
      paidAt: undefined,
      error: "订单创建失败",
    });

    expect(html).toContain("本次签约申请未能完成");
    expect(html).toContain("联系支持处理");
    expect(html).not.toContain("提交资料并联系管理员");
    expect(html).not.toContain("前往付款");
  });

  it("keeps a legitimate unpaid signature-required order on the contract-code step", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      manualOrderStatus: "signature_required",
      paidAt: undefined,
    });

    expect(html).toContain("提交主体资料并联系管理员");
    expect(html).toContain("提交资料并联系管理员");
    expect(html).not.toContain("签约状态需要处理");
    expect(html).not.toContain("前往付款");
  });

  it("routes a paid signature-required mismatch to support without offering payment or a contract code", () => {
    const html = renderOnboarding({
      ...baseActivation,
      status: "signature_required",
      manualOrderStatus: "signature_required",
      orderId: "FM202607240099",
      paidAt: "2026-07-24T10:00:00.000Z",
    });

    expect(html).toContain("付款已记录，订单状态需要人工核对");
    expect(html).toContain("不会再次接受签约资料");
    expect(html).toContain("联系支持处理");
    expect(html).not.toContain("提交资料并联系管理员");
    expect(html).not.toContain("前往付款");
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

  it("enables payment after the administrator confirms the WeChat contract", () => {
    const html = renderOnboarding();

    expect(html).toContain("合同已在企业微信确认，可以付款");
    expect(html).toContain("合同状态");
    expect(html).toContain("管理员已确认");
    expect(html).toContain("付款方式：微信 / 支付宝 / 对公账户");
    expect(html).toContain("查看合同");
    expect(html).not.toContain('src="/geo-builder/payments/alipay.svg"');
    expect(html).not.toContain('src="/geo-builder/payments/wechat-pay.svg"');
    expect(html).not.toContain("geo-onboarding-payment-channels");
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
