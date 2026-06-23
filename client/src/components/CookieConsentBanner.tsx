/* Style Note: Corporate Trust Editorial — compliance UI should feel calm, precise, and high-trust rather than promotional or noisy. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/components/SafeLink";
import { useLang } from "@/contexts/LanguageContext";

const STORAGE_KEY = "frontmind-cookie-preferences";

type ConsentState = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

function readStoredConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ConsentState;
  } catch {
    return null;
  }
}

function writeStoredConsent(consent: ConsentState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent("frontmind:consent-updated", { detail: consent }));
}

export default function CookieConsentBanner() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = readStoredConsent();
    if (!stored) {
      setIsOpen(true);
      return;
    }

    setAnalytics(stored.analytics);
    setMarketing(stored.marketing);
  }, []);

  const saveConsent = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const consent: ConsentState = {
      essential: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      updatedAt: new Date().toISOString(),
    };

    writeStoredConsent(consent);
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setIsOpen(false);
  };

  const consentSummary = useMemo(
    () =>
      t(
        "我们使用必要 Cookie 保障站点运行；分析与营销 Cookie 仅在您明确同意后启用。",
        "We use essential cookies to keep the site operational. Analytics and marketing cookies are activated only after your explicit consent.",
      ),
    [t],
  );

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        className="cookie-pref-trigger"
        onClick={() => setIsOpen(true)}
      >
        {t("Cookie 偏好", "Cookie Preferences")}
      </button>

      {isOpen ? (
        <div className="cookie-consent-shell" role="dialog" aria-modal="false" aria-labelledby="cookie-consent-title">
          <div className="cookie-consent-panel">
            <div className="cookie-consent-copy">
              <p className="cookie-consent-kicker">{t("隐私与同意设置", "Privacy & Consent Settings")}</p>
              <h2 id="cookie-consent-title" className="cookie-consent-title">
                {t("管理您的 Cookie 选择", "Manage Your Cookie Choices")}
              </h2>
              <p className="cookie-consent-body">{consentSummary}</p>
              <p className="cookie-consent-note">
                {t(
                  "您可以接受全部、拒绝可选项，或自定义分析与营销类别。详细说明见",
                  "You may accept all, reject optional categories, or customise analytics and marketing preferences. See our",
                )}{" "}
                <Link href="/privacy" className="cookie-inline-link">
                  {t("隐私政策", "Privacy Policy")}
                </Link>
                {t("。", ".")}
              </p>
            </div>

            <div className="cookie-consent-options" aria-label={t("Cookie 类别", "Cookie categories")}>
              <label className="cookie-option cookie-option-locked">
                <div>
                  <span className="cookie-option-title">{t("必要 Cookie", "Essential Cookies")}</span>
                  <span className="cookie-option-text">
                    {t("始终启用，用于站点安全、语言与基础功能。", "Always active for security, language, and core functionality.")}
                  </span>
                </div>
                <span className="cookie-option-status">{t("始终开启", "Always on")}</span>
              </label>

              <label className="cookie-option">
                <div>
                  <span className="cookie-option-title">{t("分析 Cookie", "Analytics Cookies")}</span>
                  <span className="cookie-option-text">
                    {t("帮助我们理解访问行为，以改进内容结构与体验。", "Help us understand visits so we can improve content structure and experience.")}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  aria-label={t("启用分析 Cookie", "Enable analytics cookies")}
                />
              </label>

              <label className="cookie-option">
                <div>
                  <span className="cookie-option-title">{t("营销 Cookie", "Marketing Cookies")}</span>
                  <span className="cookie-option-text">
                    {t("仅在未来启用定向推广与再营销时使用。", "Used only if targeted promotion and remarketing are enabled in the future.")}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  aria-label={t("启用营销 Cookie", "Enable marketing cookies")}
                />
              </label>
            </div>

            <div className="cookie-consent-actions">
              <button type="button" className="cookie-btn cookie-btn-ghost" onClick={() => saveConsent(false, false)}>
                {t("仅保留必要项", "Essential Only")}
              </button>
              <button type="button" className="cookie-btn cookie-btn-secondary" onClick={() => saveConsent(analytics, marketing)}>
                {t("保存偏好", "Save Preferences")}
              </button>
              <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => saveConsent(true, true)}>
                {t("接受全部", "Accept All")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
