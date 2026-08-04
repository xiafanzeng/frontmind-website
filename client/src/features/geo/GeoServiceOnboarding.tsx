import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CreditCard,
  FileCheck2,
  FileText,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FRONTMIND_CONTACT_EMAILS,
  FRONTMIND_WECHAT_QR_PATH,
} from "@/lib/frontmind-contact";

import type {
  GeoServiceActivation,
  GeoServiceActivationStatus,
  GeoServiceContractProfile,
} from "./types";
import { safePublicAppUrl } from "./safe-url";
import { localizedUserFacingError } from "./error-localization";

type OnboardingStep = "profile" | "payment" | "account";
type GeoServiceContractProfileDraft = Omit<
  GeoServiceContractProfile,
  "authorized"
> & {
  authorized: boolean;
};

export type GeoServiceAccountCredentials = {
  displayName: string;
  username: string;
  password: string;
};

type GeoServiceAccountDraft = GeoServiceAccountCredentials & {
  confirmPassword: string;
};

const STEP_ORDER: OnboardingStep[] = ["profile", "payment", "account"];

const STEP_CONTENT = {
  profile: {
    index: "01",
    label: "签约资料",
    description: "填写资料并联系管理员",
    icon: Building2,
  },
  payment: {
    index: "02",
    label: "付款确认",
    description: "管理员确认后付款",
    icon: CreditCard,
  },
  account: {
    index: "03",
    label: "开通账号",
    description: "企业直接创建账号",
    icon: KeyRound,
  },
} as const;

export type GeoServiceContractFlowIssue =
  | "request_rejected"
  | "request_failed"
  | "paid_contract_mismatch";

export function geoServiceContractFlowIssue(
  activation?: GeoServiceActivation,
): GeoServiceContractFlowIssue | undefined {
  if (!activation) return undefined;
  if (activation.manualOrderStatus === "rejected") return "request_rejected";
  if (
    activation.manualOrderStatus === "failed" ||
    (activation.status === "failed" && !activation.paidAt)
  ) {
    return "request_failed";
  }
  if (
    activation.paidAt &&
    ["contract_preparing", "signature_required"].includes(activation.status)
  ) {
    return "paid_contract_mismatch";
  }
  return undefined;
}

function statusStep(
  status: GeoServiceActivationStatus,
  activation: GeoServiceActivation,
): OnboardingStep {
  if (geoServiceContractFlowIssue(activation)) return "profile";
  if (status === "not_started" || status === "profile_required") {
    return "profile";
  }
  if (status === "contract_preparing" || status === "signature_required") {
    return "profile";
  }
  if (status === "payment_required") return "payment";
  if (status === "failed" && !activation.paidAt) return "profile";
  return "account";
}

export function canRetryGeoServiceKnowledgeImport(
  activation?: GeoServiceActivation,
) {
  return Boolean(
    activation?.status === "failed" &&
      activation.knowledgeImport?.status === "failed" &&
      activation.knowledgeImport.retryable === true &&
      (activation.provisioningStatus === "provisioned" ||
        activation.manualOrderStatus === "active"),
  );
}

function agentLoginUrl(value?: string) {
  return safePublicAppUrl(value, {
    allowLocalDevelopment: import.meta.env.DEV,
  });
}

function formatMoney(amountFen: number) {
  return `¥${(amountFen / 100).toLocaleString("zh-CN")}`;
}

function buildProvisioningSupportHref({
  companyName,
  reference,
  message,
}: {
  companyName: string;
  reference: string;
  message?: string;
}) {
  const subject = `FrontMind 已付款服务开通支持｜${companyName.replace(/[\r\n]+/g, " ").trim() || "待确认企业"}`;
  const body = [
    "您好，FrontMind 团队：",
    "",
    "本订单已付款，但服务开通尚未完成，请协助处理。",
    `企业：${companyName.replace(/[\r\n]+/g, " ").trim() || "待确认企业"}`,
    `订单/开通编号：${reference.replace(/[\r\n]+/g, " ").trim() || "编号待确认"}`,
    message
      ? `后台提示：${message.replace(/[\r\n]+/g, " ").trim()}`
      : "后台提示：未返回具体原因",
    "",
    "谢谢。",
  ].join("\n");
  return `mailto:${FRONTMIND_CONTACT_EMAILS[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildContractStatusSupportHref({
  activation,
  companyName,
  reference,
}: {
  activation: GeoServiceActivation;
  companyName: string;
  reference: string;
}) {
  const subject = `FrontMind 签约状态支持｜${companyName.replace(/[\r\n]+/g, " ").trim() || "待确认企业"}`;
  const body = [
    "您好，FrontMind 团队：",
    "",
    activation.paidAt
      ? "本订单已付款，但签约状态尚未正确同步，请协助核对。"
      : "本次签约申请未能继续，请协助核对并恢复流程。",
    `企业：${companyName.replace(/[\r\n]+/g, " ").trim() || "待确认企业"}`,
    `申请/订单编号：${reference.replace(/[\r\n]+/g, " ").trim() || "编号待确认"}`,
    "",
    "谢谢。",
  ].join("\n");
  return `mailto:${FRONTMIND_CONTACT_EMAILS[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function isChineseCreditCode(value: string) {
  return /^[0-9A-HJ-NPQRTUWXY]{18}$/i.test(value.trim());
}

function profileErrors(profile: GeoServiceContractProfileDraft) {
  const errors: Partial<Record<keyof GeoServiceContractProfile, string>> = {};
  if (profile.legalName.trim().length < 2) {
    errors.legalName = "请填写完整的签约主体名称。";
  }
  if (!isChineseCreditCode(profile.creditCode)) {
    errors.creditCode = "请输入 18 位统一社会信用代码。";
  }
  if (profile.address.trim().length < 5) {
    errors.address = "请填写企业联系地址。";
  }
  if (profile.signatoryName.trim().length < 2) {
    errors.signatoryName = "请填写签约经办人姓名。";
  }
  if (profile.signatoryTitle.trim().length < 2) {
    errors.signatoryTitle = "请填写经办人职务。";
  }
  if (!/^1\d{10}$/.test(profile.mobile.trim())) {
    errors.mobile = "请输入有效的中国大陆手机号。";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
    errors.email = "请输入有效的电子邮箱。";
  }
  if (!profile.authorized) {
    errors.authorized = "请确认经办人已获得企业签约授权。";
  }
  return errors;
}

function contractProfileSessionKey(companyName: string, question: string) {
  return `frontmind:geo-contract-profile:${companyName.trim()}:${question.trim()}`;
}

function readSessionContractProfile(companyName: string, question: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(
      contractProfileSessionKey(companyName, question),
    );
    if (!stored) return undefined;
    const value = JSON.parse(stored) as GeoServiceContractProfileDraft;
    return Object.keys(profileErrors(value)).length === 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeSessionContractProfile(
  companyName: string,
  question: string,
  profile: GeoServiceContractProfile,
) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      contractProfileSessionKey(companyName, question),
      JSON.stringify(profile),
    );
  } catch {
    // Keep the submitted data in component state if session storage is
    // unavailable. Storage failure must not block contract submission.
  }
}

function accountErrors(account: GeoServiceAccountDraft) {
  const errors: Partial<Record<keyof GeoServiceAccountDraft, string>> = {};
  const displayName = account.displayName.trim();
  const username = account.username.trim();
  if (displayName.length < 2 || displayName.length > 128) {
    errors.displayName = "企业显示名称需为 2–128 个字符。";
  }
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    errors.username = "账号需为 3–64 位字母、数字、点、下划线或连字符。";
  }
  if (account.password.length < 8 || account.password.length > 128) {
    errors.password = "密码需为 8–128 个字符。";
  }
  if (account.confirmPassword !== account.password) {
    errors.confirmPassword = "两次输入的密码不一致。";
  }
  return errors;
}

function focusFirstInvalidField(
  form: HTMLFormElement,
  errors: Record<string, unknown>,
) {
  const firstField = Object.keys(errors)[0];
  const control = firstField ? form.elements.namedItem(firstField) : null;
  if (control instanceof HTMLElement) {
    requestAnimationFrame(() => control.focus());
  }
}

function StepButton({
  step,
  current,
  completed,
  enabled,
  onClick,
}: {
  step: OnboardingStep;
  current: boolean;
  completed: boolean;
  enabled: boolean;
  onClick: () => void;
}) {
  const content = STEP_CONTENT[step];
  const Icon = content.icon;
  return (
    <button
      type="button"
      className={`${current ? "is-current" : ""} ${completed ? "is-complete" : ""}`}
      disabled={!enabled}
      aria-current={current ? "step" : undefined}
      onClick={onClick}
    >
      <span className="geo-onboarding-step-icon" aria-hidden="true">
        {completed ? <Check size={16} /> : <Icon size={17} />}
      </span>
      <span>
        <small>{content.index}</small>
        <strong>{content.label}</strong>
        <em>{content.description}</em>
      </span>
    </button>
  );
}

export function GeoServiceOnboarding({
  activation,
  companyName,
  question,
  isPreview,
  onSubmitProfile,
  onCheckout,
  onCreateAccount,
  onCheckStatus,
  onPreviewStatusChange,
}: {
  activation: GeoServiceActivation;
  companyName: string;
  categoryLabel: string;
  question: string;
  isPreview: boolean;
  onSubmitProfile: (
    profile: GeoServiceContractProfile,
    contractCode: string,
  ) => Promise<void>;
  onCheckout: () => void;
  onCreateAccount: (credentials: GeoServiceAccountCredentials) => Promise<void>;
  onCheckStatus?: () => Promise<string | void>;
  onPreviewStatusChange?: (status: GeoServiceActivationStatus) => void;
}) {
  const formId = useId();
  const [previewStatus, setPreviewStatus] =
    useState<GeoServiceActivationStatus>(activation.status);
  const effectiveStatus = isPreview ? previewStatus : activation.status;
  const contractFlowIssue = geoServiceContractFlowIssue(
    isPreview ? { ...activation, status: effectiveStatus } : activation,
  );
  const failedRetryAvailable = canRetryGeoServiceKnowledgeImport(activation);
  const actualStep = statusStep(effectiveStatus, activation);
  const [viewStep, setViewStep] = useState<OnboardingStep>(actualStep);
  const [profile, setProfile] = useState<GeoServiceContractProfileDraft>(
    () =>
      readSessionContractProfile(companyName, question) || {
        legalName: companyName,
        creditCode: "",
        address: "",
        signatoryName: "",
        signatoryTitle: "",
        mobile: "",
        email: "",
        authorized: false,
      },
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof GeoServiceContractProfile, string>>
  >({});
  const [formError, setFormError] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractCode, setContractCode] = useState("");
  const [contractCodeError, setContractCodeError] = useState("");
  const [pendingProfile, setPendingProfile] =
    useState<GeoServiceContractProfile>();
  const [account, setAccount] = useState<GeoServiceAccountDraft>({
    displayName: activation.accountDisplayName || companyName,
    username: activation.accountUsername || "",
    password: "",
    confirmPassword: "",
  });
  const [accountValidation, setAccountValidation] = useState<
    Partial<Record<keyof GeoServiceAccountDraft, string>>
  >({});
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);

  useEffect(() => {
    if (!isPreview) setViewStep(actualStep);
  }, [actualStep, isPreview]);

  const setPreviewWorkflowStatus = (status: GeoServiceActivationStatus) => {
    setPreviewStatus(status);
    onPreviewStatusChange?.(status);
  };

  const currentIndex = STEP_ORDER.indexOf(actualStep);
  const provisioningSupportHref = buildProvisioningSupportHref({
    companyName,
    reference:
      activation.orderId ||
      activation.provisioningReference ||
      activation.manualOrderReference ||
      activation.contractWorkflowReference ||
      "",
    message:
      activation.error ||
      activation.provisioningMessage ||
      activation.knowledgeImport?.message,
  });
  const contractStatusSupportHref = buildContractStatusSupportHref({
    activation,
    companyName,
    reference:
      activation.orderId ||
      activation.manualOrderReference ||
      activation.contractWorkflowReference ||
      "",
  });
  const activeWorkspaceUrl = agentLoginUrl(
    activation.workspaceUrl || activation.accountSetupUrl,
  );
  const closeContractDialog = () => {
    setContractDialogOpen(false);
    setContractCode("");
    setContractCodeError("");
    setPendingProfile(undefined);
  };
  const openStep = (step: OnboardingStep) => {
    const index = STEP_ORDER.indexOf(step);
    if (index <= currentIndex || isPreview) setViewStep(step);
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = profileErrors(profile);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(event.currentTarget, nextErrors);
      return;
    }
    setFormError("");
    const normalizedProfile: GeoServiceContractProfile = {
      ...profile,
      legalName: profile.legalName.trim(),
      creditCode: profile.creditCode.trim().toUpperCase(),
      address: profile.address.trim(),
      signatoryName: profile.signatoryName.trim(),
      signatoryTitle: profile.signatoryTitle.trim(),
      mobile: profile.mobile.trim(),
      email: profile.email.trim().toLowerCase(),
      authorized: true,
    };
    setPendingProfile(normalizedProfile);
    setContractCode("");
    setContractCodeError("");
    setContractDialogOpen(true);
  };

  const confirmContractCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = contractCode.trim();
    if (!normalizedCode) {
      setContractCodeError("请输入管理员提供的合同码。");
      return;
    }
    if (!pendingProfile) {
      setContractCodeError("签约资料已失效，请关闭窗口后重新提交。");
      return;
    }
    setContractCodeError("");
    setFormError("");
    if (isPreview) {
      setProfile(pendingProfile);
      writeSessionContractProfile(companyName, question, pendingProfile);
      setAccount((current) => ({
        ...current,
        displayName: pendingProfile.legalName || companyName,
      }));
      setPreviewWorkflowStatus("payment_required");
      setViewStep("payment");
      closeContractDialog();
      return;
    }
    setProfileSubmitting(true);
    try {
      await onSubmitProfile(pendingProfile, normalizedCode);
      setProfile(pendingProfile);
      writeSessionContractProfile(companyName, question, pendingProfile);
      setAccount((current) => ({
        ...current,
        displayName: pendingProfile.legalName || companyName,
      }));
      closeContractDialog();
      setViewStep("payment");
    } catch (error) {
      const message = localizedUserFacingError(
        error,
        undefined,
        "签约资料暂未提交成功，请稍后重试。",
      );
      setContractCodeError(message);
      // Authorization secrets are never retained after a network attempt.
      setContractCode("");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = accountErrors(account);
    setAccountValidation(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField(event.currentTarget, nextErrors);
      return;
    }
    setFormError("");
    const credentials = {
      displayName: account.displayName.trim(),
      username: account.username.trim(),
      password: account.password,
    };
    if (isPreview) {
      setAccount((current) => ({
        ...current,
        password: "",
        confirmPassword: "",
      }));
      setPreviewWorkflowStatus("active");
      return;
    }
    setAccountSubmitting(true);
    try {
      await onCreateAccount(credentials);
      setAccount((current) => ({
        ...current,
        password: "",
        confirmPassword: "",
      }));
    } catch (error) {
      setFormError(
        localizedUserFacingError(
          error,
          undefined,
          "账号暂未提交成功，请稍后重试。",
        ),
      );
    } finally {
      setAccountSubmitting(false);
    }
  };

  const checkStatus = async () => {
    setFormError("");
    if (isPreview) {
      if (previewStatus === "activation_pending") {
        setPreviewWorkflowStatus("active");
      }
      return;
    }
    if (!onCheckStatus) return;
    setStatusChecking(true);
    try {
      await onCheckStatus();
    } catch (error) {
      setFormError(
        localizedUserFacingError(
          error,
          undefined,
          "暂时无法查询当前状态，请重试。",
        ),
      );
    } finally {
      setStatusChecking(false);
    }
  };

  return (
    <section id="geo-service-onboarding" className="geo-service-onboarding">
      <header className="geo-service-onboarding-header">
        <div>
          <span>服务开通进度</span>
          <h3>确认签约资料并联系管理员，付款后直接创建看板账号</h3>
        </div>
        <div className="geo-service-order-reference">
          <small>{activation.orderId ? "付款订单" : "签约申请"}</small>
          <strong>
            {activation.orderId ||
              activation.contractWorkflowReference ||
              "提交资料后生成"}
          </strong>
        </div>
      </header>

      <nav className="geo-onboarding-steps" aria-label="服务开通流程">
        {STEP_ORDER.map((step, index) => (
          <StepButton
            key={step}
            step={step}
            current={viewStep === step}
            completed={
              index < currentIndex ||
              (effectiveStatus === "active" && step === "account")
            }
            enabled={isPreview || index <= currentIndex}
            onClick={() => openStep(step)}
          />
        ))}
      </nav>

      <div className="geo-onboarding-panel">
        {viewStep === "profile" && contractFlowIssue ? (
          <div className="geo-onboarding-status-panel" role="status">
            <span className="geo-onboarding-large-icon" aria-hidden="true">
              <LockKeyhole size={27} />
            </span>
            <div>
              <small>签约状态需要处理</small>
              <h4>
                {contractFlowIssue === "paid_contract_mismatch"
                  ? "付款已记录，订单状态需要人工核对"
                  : contractFlowIssue === "request_rejected"
                    ? "本次签约申请未通过"
                    : "本次签约申请未能完成"}
              </h4>
              <p>
                {contractFlowIssue === "paid_contract_mismatch"
                  ? "为避免重复提交合同码或重复付款，当前页面不会再次接受签约资料。请联系支持核对付款与合同确认记录。"
                  : contractFlowIssue === "request_rejected"
                    ? "当前申请不能继续提交合同码，也不会进入付款。请联系支持核对主体资料或重新发起申请。"
                    : "当前申请不能继续提交合同码。请联系支持并提供申请编号，我们会协助核对并恢复流程。"}
              </p>
              <div className="geo-onboarding-actions">
                <a href={contractStatusSupportHref}>
                  <Mail size={15} />
                  联系支持处理
                </a>
              </div>
            </div>
          </div>
        ) : viewStep === "profile" ? (
          <form
            className="geo-contract-profile-form"
            onSubmit={submitProfile}
            noValidate
          >
            <div className="geo-onboarding-panel-heading">
              <span className="geo-onboarding-large-icon">
                <Building2 size={25} />
              </span>
              <div>
                <small>签约资料</small>
                <h4>提交主体资料并联系管理员</h4>
                <p>
                  填写资料后扫码联系管理员，在企业微信查看并确认合同；管理员确认后会提供合同码。
                </p>
              </div>
            </div>

            <div className="geo-contract-form-grid">
              <label className="span-2">
                <span>
                  <Building2 size={15} /> 企业签约主体
                </span>
                <input
                  name="legalName"
                  value={profile.legalName}
                  autoComplete="organization"
                  aria-invalid={Boolean(errors.legalName)}
                  aria-describedby={
                    errors.legalName ? `${formId}-legalName-error` : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      legalName: event.target.value,
                    }))
                  }
                  placeholder="请输入营业执照上的完整企业名称"
                />
                {errors.legalName && (
                  <em id={`${formId}-legalName-error`} role="alert">
                    {errors.legalName}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <FileText size={15} /> 统一社会信用代码
                </span>
                <input
                  name="creditCode"
                  value={profile.creditCode}
                  maxLength={18}
                  autoCapitalize="characters"
                  aria-invalid={Boolean(errors.creditCode)}
                  aria-describedby={
                    errors.creditCode ? `${formId}-creditCode-error` : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      creditCode: event.target.value
                        .toUpperCase()
                        .replace(/[^0-9A-Z]/g, ""),
                    }))
                  }
                  placeholder="18 位统一社会信用代码"
                />
                {errors.creditCode && (
                  <em id={`${formId}-creditCode-error`} role="alert">
                    {errors.creditCode}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <MapPin size={15} /> 企业联系地址
                </span>
                <input
                  name="address"
                  value={profile.address}
                  autoComplete="street-address"
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={
                    errors.address ? `${formId}-address-error` : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  placeholder="用于合同送达与联系"
                />
                {errors.address && (
                  <em id={`${formId}-address-error`} role="alert">
                    {errors.address}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <UserRound size={15} /> 签约经办人
                </span>
                <input
                  name="signatoryName"
                  value={profile.signatoryName}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.signatoryName)}
                  aria-describedby={
                    errors.signatoryName
                      ? `${formId}-signatoryName-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      signatoryName: event.target.value,
                    }))
                  }
                  placeholder="请输入真实姓名"
                />
                {errors.signatoryName && (
                  <em id={`${formId}-signatoryName-error`} role="alert">
                    {errors.signatoryName}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <BadgeCheck size={15} /> 职务
                </span>
                <input
                  name="signatoryTitle"
                  value={profile.signatoryTitle}
                  autoComplete="organization-title"
                  aria-invalid={Boolean(errors.signatoryTitle)}
                  aria-describedby={
                    errors.signatoryTitle
                      ? `${formId}-signatoryTitle-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      signatoryTitle: event.target.value,
                    }))
                  }
                  placeholder="例如：法定代表人 / 授权经办人"
                />
                {errors.signatoryTitle && (
                  <em id={`${formId}-signatoryTitle-error`} role="alert">
                    {errors.signatoryTitle}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <Phone size={15} /> 手机号
                </span>
                <input
                  name="mobile"
                  value={profile.mobile}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={11}
                  aria-invalid={Boolean(errors.mobile)}
                  aria-describedby={
                    errors.mobile ? `${formId}-mobile-error` : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      mobile: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  placeholder="用于管理员联系与服务通知"
                />
                {errors.mobile && (
                  <em id={`${formId}-mobile-error`} role="alert">
                    {errors.mobile}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <Mail size={15} /> 电子邮箱
                </span>
                <input
                  name="email"
                  value={profile.email}
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? `${formId}-email-error` : undefined
                  }
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="用于接收服务通知"
                />
                {errors.email && (
                  <em id={`${formId}-email-error`} role="alert">
                    {errors.email}
                  </em>
                )}
              </label>
            </div>

            <label className="geo-contract-authorization">
              <input
                name="authorized"
                type="checkbox"
                checked={profile.authorized}
                aria-invalid={Boolean(errors.authorized)}
                aria-describedby={
                  errors.authorized ? `${formId}-authorized-error` : undefined
                }
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    authorized: event.target.checked,
                  }))
                }
              />
              <span>
                我确认以上信息真实有效，且签约经办人已获得本企业相应授权。
              </span>
            </label>
            {errors.authorized && (
              <p
                id={`${formId}-authorized-error`}
                className="geo-onboarding-error"
                role="alert"
              >
                {errors.authorized}
              </p>
            )}
            {formError && (
              <p className="geo-onboarding-error" role="alert">
                {formError}
              </p>
            )}

            <div className="geo-onboarding-actions">
              <button type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? (
                  <>
                    <Loader2 className="is-spinning" size={16} />
                    正在提交
                  </>
                ) : (
                  <>
                    提交资料并联系管理员 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : null}

        {viewStep === "payment" && (
          <div className="geo-onboarding-status-panel">
            <span className="geo-onboarding-large-icon">
              <CreditCard size={27} />
            </span>
            <div>
              <small>付款确认</small>
              <h4>
                {activation.paidAt
                  ? "服务款项已确认"
                  : "合同已在企业微信确认，可以付款"}
              </h4>
              <p>
                付款订单会锁定本次企业、问题与金额。选择支付方式后，安全收银台会为本单实时生成二维码。
              </p>
              <dl className="geo-onboarding-inline-facts">
                <div>
                  <dt>服务金额</dt>
                  <dd>{formatMoney(activation.amountFen)}</dd>
                </div>
                <div>
                  <dt>服务周期</dt>
                  <dd>开通后连续 30 天</dd>
                </div>
                <div>
                  <dt>合同状态</dt>
                  <dd>管理员已确认</dd>
                </div>
              </dl>
              <div
                className="geo-onboarding-payment-channels"
                aria-label="支持的支付方式"
              >
                <div className="is-alipay">
                  <span>
                    <img
                      src="/geo-builder/payments/alipay.svg"
                      alt=""
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <strong>支付宝支付</strong>
                    <small>选择后由收银台生成真实二维码</small>
                  </div>
                </div>
                <div className="is-wechat-pay">
                  <span>
                    <img
                      src="/geo-builder/payments/wechat-pay.svg"
                      alt=""
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <strong>微信支付</strong>
                    <small>选择后由收银台生成真实二维码</small>
                  </div>
                </div>
              </div>
              <div className="geo-onboarding-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (isPreview) {
                      setPreviewWorkflowStatus("account_setup_required");
                      setViewStep("account");
                    } else {
                      onCheckout();
                    }
                  }}
                >
                  {isPreview ? "模拟付款完成" : "前往付款"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {viewStep === "account" && effectiveStatus === "active" ? (
          <div className="geo-account-created">
            <span className="geo-onboarding-large-icon" aria-hidden="true">
              <BadgeCheck size={27} />
            </span>
            <div>
              <small>服务已开通</small>
              <h4>企业服务看板已就绪</h4>
              <p>
                {activation.accountMode === "bind_existing"
                  ? "已购问题与知识库已完成绑定，可以使用已有账号进入企业服务看板。"
                  : "账号、已购问题与知识库已完成绑定，可以使用刚才设置的账号密码进入企业服务看板。"}
              </p>
              {activeWorkspaceUrl ? (
                <a
                  className="geo-onboarding-workspace-link"
                  href={activeWorkspaceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {activation.workspaceUrl ? "进入看板" : "完成账号设置"}{" "}
                  <ArrowRight size={15} />
                </a>
              ) : (
                <div className="geo-onboarding-actions">
                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={statusChecking || (!isPreview && !onCheckStatus)}
                  >
                    {statusChecking ? (
                      <>
                        <Loader2 className="is-spinning" size={16} />
                        正在获取
                      </>
                    ) : (
                      <>
                        <RefreshCw size={15} />
                        重新获取工作台地址
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : viewStep === "account" &&
          effectiveStatus === "account_setup_required" &&
          activation.accountMode !== "bind_existing" ? (
          <form
            className="geo-account-setup-form"
            onSubmit={submitAccount}
            noValidate
          >
            <div className="geo-onboarding-panel-heading">
              <span className="geo-onboarding-large-icon">
                <KeyRound size={25} />
              </span>
              <div>
                <small>开通看板</small>
                <h4>企业直接创建看板账号</h4>
                <p>
                  款项已确认。在此设置登录信息，系统将创建账号并接入本次已购问题与知识库。
                </p>
              </div>
            </div>

            <div className="geo-account-form-grid">
              <label>
                <span>
                  <Building2 size={15} /> 企业显示名称
                </span>
                <input
                  name="displayName"
                  value={account.displayName}
                  autoComplete="organization"
                  maxLength={128}
                  aria-invalid={Boolean(accountValidation.displayName)}
                  aria-describedby={
                    accountValidation.displayName
                      ? `${formId}-displayName-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="企业服务看板显示名称"
                />
                {accountValidation.displayName && (
                  <em id={`${formId}-displayName-error`} role="alert">
                    {accountValidation.displayName}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <UserRound size={15} /> 登录账号
                </span>
                <input
                  name="username"
                  value={account.username}
                  autoComplete="username"
                  maxLength={64}
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(accountValidation.username)}
                  aria-describedby={
                    accountValidation.username
                      ? `${formId}-username-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      username: event.target.value.replace(
                        /[^a-zA-Z0-9._-]/g,
                        "",
                      ),
                    }))
                  }
                  placeholder="3–64 位字母、数字、点、下划线或连字符"
                />
                {accountValidation.username && (
                  <em id={`${formId}-username-error`} role="alert">
                    {accountValidation.username}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <KeyRound size={15} /> 登录密码
                </span>
                <input
                  name="password"
                  value={account.password}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  aria-invalid={Boolean(accountValidation.password)}
                  aria-describedby={
                    accountValidation.password
                      ? `${formId}-password-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="至少 8 个字符"
                />
                {accountValidation.password && (
                  <em id={`${formId}-password-error`} role="alert">
                    {accountValidation.password}
                  </em>
                )}
              </label>
              <label>
                <span>
                  <ShieldCheck size={15} /> 确认密码
                </span>
                <input
                  name="confirmPassword"
                  value={account.confirmPassword}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  aria-invalid={Boolean(accountValidation.confirmPassword)}
                  aria-describedby={
                    accountValidation.confirmPassword
                      ? `${formId}-confirmPassword-error`
                      : undefined
                  }
                  onChange={(event) =>
                    setAccount((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                  placeholder="再次输入登录密码"
                />
                {accountValidation.confirmPassword && (
                  <em id={`${formId}-confirmPassword-error`} role="alert">
                    {accountValidation.confirmPassword}
                  </em>
                )}
              </label>
            </div>

            {formError && (
              <p className="geo-onboarding-error" role="alert">
                {formError}
              </p>
            )}
            <div className="geo-onboarding-actions">
              <button type="submit" disabled={accountSubmitting}>
                {accountSubmitting ? (
                  <>
                    <Loader2 className="is-spinning" size={16} />
                    正在提交
                  </>
                ) : (
                  <>
                    创建账号并开通看板 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : viewStep === "account" ? (
          <div className="geo-onboarding-status-panel">
            <span className="geo-onboarding-large-icon">
              {effectiveStatus === "failed" ? (
                <LockKeyhole size={27} />
              ) : (
                <FileCheck2 size={27} />
              )}
            </span>
            <div>
              <small>
                {effectiveStatus === "failed" ? "开通需要处理" : "开通看板"}
              </small>
              <h4>
                {effectiveStatus === "activation_pending"
                  ? activation.accountMode === "bind_existing"
                    ? "已有账号已绑定，正在开通看板"
                    : "账号已创建，正在开通看板"
                  : effectiveStatus === "account_setup_required" &&
                      activation.accountMode === "bind_existing"
                    ? "已有账号已绑定，正在开通看板"
                    : effectiveStatus === "provisioning"
                      ? "账号已创建，正在迁移知识库"
                      : effectiveStatus === "failed"
                        ? "本次开通尚未完成"
                        : "正在准备企业服务看板"}
              </h4>
              <p>
                {activation.error ||
                  activation.provisioningMessage ||
                  activation.knowledgeImport?.message ||
                  (activation.accountMode === "bind_existing"
                    ? "系统正在把已购问题和知识库接入已有账号，完成后即可进入看板。"
                    : "系统正在绑定已购问题与知识库，完成后即可进入真实看板。")}
              </p>
              {formError && (
                <p className="geo-onboarding-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="geo-onboarding-actions">
                {effectiveStatus === "failed" && !failedRetryAvailable ? (
                  <a href={provisioningSupportHref}>
                    <Mail size={15} />
                    联系技术支持
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={checkStatus}
                    disabled={statusChecking || (!isPreview && !onCheckStatus)}
                  >
                    {statusChecking ? (
                      <>
                        <Loader2 className="is-spinning" size={16} />
                        正在检查
                      </>
                    ) : (
                      <>
                        <RefreshCw size={15} />
                        {effectiveStatus === "failed"
                          ? "重试同步"
                          : "刷新开通状态"}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        open={contractDialogOpen}
        onOpenChange={(open) => {
          if (profileSubmitting) return;
          if (open) setContractDialogOpen(true);
          else closeContractDialog();
        }}
      >
        <DialogContent
          className="geo-contract-code-dialog"
          overlayClassName="geo-dialog-overlay"
          showCloseButton={!profileSubmitting}
          onEscapeKeyDown={(event) => {
            if (profileSubmitting) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (profileSubmitting) event.preventDefault();
          }}
        >
          <form onSubmit={confirmContractCode} noValidate>
            <DialogHeader>
              <DialogTitle>联系管理员确认合同</DialogTitle>
              <DialogDescription>
                请先扫码添加管理员，在企业微信完成合同确认后，再输入管理员提供的合同码进入付款。
              </DialogDescription>
            </DialogHeader>

            <a
              className="geo-contract-code-qr"
              href={FRONTMIND_WECHAT_QR_PATH}
              target="_blank"
              rel="noreferrer"
              aria-label="打开 FrontMind 管理员企业微信二维码"
            >
              <img
                src={FRONTMIND_WECHAT_QR_PATH}
                alt="FrontMind 管理员企业微信二维码"
              />
            </a>

            <label className="geo-contract-code-field">
              <span>请输入管理员授权的合同码</span>
              <input
                name="contractCode"
                type="password"
                value={contractCode}
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(contractCodeError)}
                aria-describedby={
                  contractCodeError
                    ? `${formId}-contract-code-error`
                    : undefined
                }
                onChange={(event) => {
                  setContractCode(event.target.value);
                  if (contractCodeError) setContractCodeError("");
                }}
                placeholder="请输入合同码"
              />
            </label>
            {contractCodeError && (
              <p
                id={`${formId}-contract-code-error`}
                className="geo-onboarding-error"
                role="alert"
              >
                {contractCodeError}
              </p>
            )}

            <DialogFooter className="geo-contract-code-actions">
              <button
                type="button"
                className="is-secondary"
                disabled={profileSubmitting}
                onClick={closeContractDialog}
              >
                稍后处理
              </button>
              <button type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? (
                  <>
                    <Loader2 className="is-spinning" size={16} />
                    正在确认
                  </>
                ) : (
                  <>
                    确认合同码并提交资料 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
