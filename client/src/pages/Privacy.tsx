/* Style Note: Corporate Trust Editorial — legal pages should read like a concise institutional memorandum: clear hierarchy, compact density, and quiet authority. */
import type { ReactNode } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionLabel from "@/components/SectionLabel";
import { useLang } from "@/contexts/LanguageContext";

function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="fm-legal-section">
      <h2 id={id} className="fm-legal-heading">
        {title}
      </h2>
      <div className="fm-legal-prose">{children}</div>
    </section>
  );
}

type PrivacyProps = {
  includeChrome?: boolean;
};

export default function Privacy({ includeChrome = true }: PrivacyProps) {
  const { t, lang } = useLang();

  usePageMeta({
    title: t("FrontMind 隐私政策", "FrontMind Privacy Policy"),
    description: t(
      "查看 FrontMind 关于信息处理、Cookie 同意和联系数据使用方式的隐私政策。",
      "Review the FrontMind privacy policy covering information processing, cookie consent, and contact data usage.",
    ),
    lang,
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {includeChrome && <Navbar />}
      <main id="main-content" className="pt-28 md:pt-36 pb-20">
        <div className="container max-w-5xl">
          <header className="fm-legal-hero">
            <SectionLabel text={t("法律与合规", "Legal & Compliance")} color="gold" />
            <h1 className="fm-legal-title">
              {t("FrontMind 隐私政策", "FrontMind Privacy Policy")}
            </h1>
            <p className="fm-legal-intro">
              {t(
                "本页面说明 FrontMind 如何收集、使用、保护和保存您在访问网站、提交联系表单以及设置 Cookie 偏好时提供的信息。",
                "This page explains how FrontMind collects, uses, protects, and stores information when you browse the website, submit a contact form, or manage cookie preferences.",
              )}
            </p>
          </header>

          <div className="fm-legal-shell">
            <LegalSection id="privacy-controller" title={t("1. 我们处理哪些信息", "1. What Information We Process")}>
              <p>
                {t(
                  "当您浏览本网站时，我们可能处理基础技术信息，例如浏览器类型、语言偏好、访问时间与页面访问行为。当您主动提交表单时，我们还会处理您填写的姓名、邮箱、公司、行业、需求说明以及 Cookie 偏好设置。",
                  "When you browse this site, we may process basic technical information such as browser type, language preference, visit time, and page interaction data. When you voluntarily submit a form, we also process the name, email, company, industry, request details, and cookie preferences you provide.",
                )}
              </p>
            </LegalSection>

            <LegalSection id="privacy-purpose" title={t("2. 处理目的", "2. Purposes of Processing")}>
              <p>
                {t(
                  "这些信息仅用于回应业务咨询、安排沟通、改进网站内容结构、维护网站安全与记录您的同意偏好。除非获得您的额外许可，我们不会将联系表单中的信息用于无关营销用途。",
                  "This information is used only to respond to business enquiries, arrange communications, improve site structure, maintain site security, and record your consent preferences. Unless you provide additional permission, we do not use contact-form data for unrelated marketing activities.",
                )}
              </p>
            </LegalSection>

            <LegalSection id="privacy-cookies" title={t("3. Cookie 与同意管理", "3. Cookies and Consent Management")}>
              <p>
                {t(
                  "网站默认仅保留必要 Cookie。分析与营销类别在您明确选择同意前不会启用。您可以随时通过页面底部的 Cookie 偏好按钮重新打开设置并修改选择。",
                  "The website defaults to essential cookies only. Analytics and marketing categories are not enabled until you explicitly opt in. You may reopen the preference panel at any time through the cookie preferences button and change your selection.",
                )}
              </p>
            </LegalSection>

            <LegalSection id="privacy-retention" title={t("4. 保存期限", "4. Retention Period")}>
              <p>
                {t(
                  "业务咨询信息仅在实现沟通目的所必需的期限内保存；Cookie 偏好会保存在您的浏览器本地，以便在后续访问中继续应用您的选择。",
                  "Business enquiry data is retained only for as long as necessary to fulfil the communication purpose. Cookie preferences are stored locally in your browser so your choices can be respected on subsequent visits.",
                )}
              </p>
            </LegalSection>

            <LegalSection id="privacy-rights" title={t("5. 您的权利", "5. Your Rights")}>
              <p>
                {t(
                  "您可以请求访问、更正或删除您主动提交的信息，也可以撤回对可选 Cookie 的同意。如果您希望行使这些权利，请通过联系页面与我们沟通。",
                  "You may request access to, correction of, or deletion of the information you voluntarily submitted. You may also withdraw consent for optional cookies. Please contact us through the contact page if you wish to exercise these rights.",
                )}
              </p>
            </LegalSection>

            <LegalSection id="privacy-contact" title={t("6. 联系方式", "6. Contact")}>
              <p>
                {t(
                  "如您对本隐私政策有任何疑问，或希望就数据处理事宜与我们联系，请使用 Contact 页面提交请求。",
                  "If you have questions about this policy or want to contact us regarding data processing, please use the Contact page to submit your request.",
                )}
              </p>
            </LegalSection>
          </div>
        </div>
      </main>
      {includeChrome && <Footer />}
    </div>
  );
}
