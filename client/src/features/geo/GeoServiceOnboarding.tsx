import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CreditCard,
  ExternalLink,
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
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
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

type OnboardingStep = "profile" | "signature" | "payment" | "account";
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

const STEP_ORDER: OnboardingStep[] = [
  "profile",
  "signature",
  "payment",
  "account",
];

const STEP_CONTENT = {
  profile: {
    index: "01",
    label: "签约资料",
    description: "提交企业与经办人",
    icon: Building2,
  },
  signature: {
    index: "02",
    label: "合同查看",
    description: "查看合同并完成签署",
    icon: ShieldCheck,
  },
  payment: {
    index: "03",
    label: "付款确认",
    description: "签署完成后付款",
    icon: CreditCard,
  },
  account: {
    index: "04",
    label: "开通看板",
    description: "企业直接创建账号",
    icon: KeyRound,
  },
} as const;

function statusStep(status: GeoServiceActivationStatus): OnboardingStep {
  if (status === "not_started" || status === "profile_required") {
    return "profile";
  }
  if (status === "contract_preparing" || status === "signature_required") {
    return "signature";
  }
  if (status === "payment_required") return "payment";
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

function buildAdminReminderHref({
  companyName,
  reference,
  question,
}: {
  companyName: string;
  reference: string;
  question: string;
}) {
  const safeCompanyName =
    companyName.replace(/[\r\n]+/g, " ").trim() || "待确认企业";
  const safeReference =
    reference.replace(/[\r\n]+/g, " ").trim() || "编号生成中";
  const subject = `FrontMind 合同发起提醒｜${safeCompanyName}`;
  const body = [
    "您好，FrontMind 团队：",
    "",
    "企业签约资料已提交，请协助核对并发起合同。",
    `企业：${safeCompanyName}`,
    `签约申请：${safeReference}`,
    `本次问题：${question}`,
    "",
    "谢谢。",
  ].join("\n");
  return `mailto:${FRONTMIND_CONTACT_EMAILS[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
  categoryLabel,
  question,
  contractHref,
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
  contractHref: string;
  isPreview: boolean;
  onSubmitProfile: (profile: GeoServiceContractProfile) => Promise<void>;
  onCheckout: () => void;
  onCreateAccount: (credentials: GeoServiceAccountCredentials) => Promise<void>;
  onCheckStatus?: () => Promise<string | void>;
  onPreviewStatusChange?: (status: GeoServiceActivationStatus) => void;
}) {
  const formId = useId();
  const [previewStatus, setPreviewStatus] =
    useState<GeoServiceActivationStatus>(activation.status);
  const effectiveStatus = isPreview ? previewStatus : activation.status;
  const failedRetryAvailable = canRetryGeoServiceKnowledgeImport(activation);
  const actualStep = statusStep(effectiveStatus);
  const [viewStep, setViewStep] = useState<OnboardingStep>(actualStep);
  const [profile, setProfile] = useState<GeoServiceContractProfileDraft>({
    legalName: companyName,
    creditCode: "",
    address: "",
    signatoryName: "",
    signatoryTitle: "",
    mobile: "",
    email: "",
    authorized: false,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof GeoServiceContractProfile, string>>
  >({});
  const [formError, setFormError] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
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
  const contractName = `FrontMind_GEO单题30天服务协议_${
    activation.orderId || activation.contractWorkflowReference || "待生成"
  }.pdf`;
  const contractReference =
    activation.orderId ||
    activation.contractWorkflowReference ||
    "资料已提交，编号生成中";
  const adminReminderHref = buildAdminReminderHref({
    companyName: profile.legalName || companyName,
    reference: contractReference,
    question,
  });
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
  const activeWorkspaceUrl = agentLoginUrl(
    activation.workspaceUrl || activation.accountSetupUrl,
  );
  const signingUrl = safePublicAppUrl(activation.signingUrl);
  const profileSummary = useMemo(
    () => [
      ["签约主体", profile.legalName || companyName],
      ["服务类型", `${categoryLabel} · 1 个问题 / 30 天`],
      ["订单金额", formatMoney(activation.amountFen)],
      ["本次问题", question],
    ],
    [
      activation.amountFen,
      categoryLabel,
      companyName,
      profile.legalName,
      question,
    ],
  );

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
    if (isPreview) {
      setAccount((current) => ({
        ...current,
        displayName: profile.legalName.trim() || companyName,
      }));
      setPreviewWorkflowStatus("contract_preparing");
      setViewStep("signature");
      return;
    }
    setProfileSubmitting(true);
    try {
      await onSubmitProfile({
        ...profile,
        legalName: profile.legalName.trim(),
        creditCode: profile.creditCode.trim().toUpperCase(),
        address: profile.address.trim(),
        signatoryName: profile.signatoryName.trim(),
        signatoryTitle: profile.signatoryTitle.trim(),
        mobile: profile.mobile.trim(),
        email: profile.email.trim().toLowerCase(),
        authorized: true as const,
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "签约资料暂未提交成功，请稍后重试。",
      );
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
        error instanceof Error
          ? error.message
          : "账号暂未提交成功，请稍后重试。",
      );
    } finally {
      setAccountSubmitting(false);
    }
  };

  const checkStatus = async () => {
    setFormError("");
    if (isPreview) {
      if (previewStatus === "contract_preparing") {
        setPreviewWorkflowStatus("signature_required");
      } else if (previewStatus === "signature_required") {
        setPreviewWorkflowStatus("payment_required");
        setViewStep("payment");
      } else if (previewStatus === "activation_pending") {
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
        error instanceof Error
          ? error.message
          : "暂时无法查询当前状态，请重试。",
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
          <h3>提交企业资料、查看合同并付款，再直接创建看板账号</h3>
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
        {viewStep === "profile" && (
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
                <h4>提交合同主体与签约经办人</h4>
                <p>
                  管理员会据此生成合同并在电子签平台发起。实名认证材料直接提交给电子签平台。
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
                  placeholder="用于实名认证与签署通知"
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
                  placeholder="用于接收合同副本"
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
              <a href={contractHref} target="_blank" rel="noreferrer">
                查看合同内容 <ExternalLink size={14} />
              </a>
              <button type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? (
                  <>
                    <Loader2 className="is-spinning" size={16} />
                    正在提交
                  </>
                ) : (
                  <>
                    提交资料，等待管理员发起 <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {viewStep === "signature" && (
          <div className="geo-signature-panel">
            <div className="geo-onboarding-panel-heading">
              <span className="geo-onboarding-large-icon">
                <ShieldCheck size={25} />
              </span>
              <div>
                <small>合同查看</small>
                <h4>
                  {effectiveStatus === "contract_preparing"
                    ? "资料已提交，等待管理员发起合同"
                    : "合同已准备，请查看并完成签署"}
                </h4>
                <p>
                  {effectiveStatus === "contract_preparing"
                    ? "可扫描下方微信二维码或发送提醒邮件，管理员核对主体、服务问题和金额后会发送合同链接。"
                    : "查看合同并签署后，管理员会回传已签 PDF 和签署报告；核验通过即可付款。"}
                </p>
              </div>
            </div>

            <article className="geo-contract-file">
              <span>
                <FileCheck2 size={24} />
              </span>
              <div>
                <strong>{contractName}</strong>
                <small>
                  {activation.contractId
                    ? `合同编号：${activation.contractId}`
                    : "FrontMind GEO 月度优化服务协议"}
                </small>
              </div>
              <a href={contractHref} target="_blank" rel="noreferrer">
                查看内容 <ExternalLink size={14} />
              </a>
            </article>

            <dl className="geo-contract-summary">
              {profileSummary.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            {effectiveStatus === "contract_preparing" && (
              <section
                className="geo-admin-reminder"
                aria-label="联系管理员发起合同"
              >
                <a
                  className="geo-admin-reminder-qr"
                  href={FRONTMIND_WECHAT_QR_PATH}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="打开 FrontMind 管理员微信二维码"
                >
                  <img
                    src={FRONTMIND_WECHAT_QR_PATH}
                    alt="FrontMind 管理员微信二维码"
                  />
                </a>
                <div>
                  <small>提醒管理员</small>
                  <h5>微信扫码或邮件提醒发起合同</h5>
                  <p>
                    提醒时请附上企业名称和签约申请编号，管理员可据此快速定位本次资料。
                  </p>
                  <div>
                    <a
                      href={FRONTMIND_WECHAT_QR_PATH}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开微信二维码 <ExternalLink size={14} />
                    </a>
                    <a href={adminReminderHref}>
                      邮件提醒管理员 <Mail size={14} />
                    </a>
                  </div>
                </div>
              </section>
            )}

            {formError && (
              <p className="geo-onboarding-error" role="alert">
                {formError}
              </p>
            )}
            <div className="geo-onboarding-actions">
              {effectiveStatus === "signature_required" &&
                (signingUrl || isPreview) && (
                  <button
                    type="button"
                    className="is-secondary"
                    onClick={() => {
                      if (isPreview) {
                        setPreviewWorkflowStatus("payment_required");
                        setViewStep("payment");
                      } else if (signingUrl) {
                        window.open(
                          signingUrl,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      }
                    }}
                  >
                    查看并签署合同 <ExternalLink size={15} />
                  </button>
                )}
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
                    {effectiveStatus === "contract_preparing"
                      ? "刷新发起状态"
                      : "我已签署，刷新状态"}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

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
                  : "已签合同核验通过，可以付款"}
              </h4>
              <p>
                付款订单会锁定本次企业、问题、金额与已签合同。选择支付方式后，安全收银台会为本单实时生成二维码。
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
                  <dd>已签署并核验</dd>
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
    </section>
  );
}
