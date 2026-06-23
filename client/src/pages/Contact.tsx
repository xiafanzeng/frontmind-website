/* Style Note: Corporate Editorial Precision — contact page should feel concise, high-trust, and conversion-oriented without losing refinement. */
import { useState } from "react";
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  Clock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
} from "lucide-react";

/* ============================================================
   Contact Page — Academic Consulting Style
   ============================================================ */

const CTA_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663574964680/kqDR6C992NM8WoGVvcwuPU/frontmind-cta-scene-XSQHkwEMYtwgJ8WUCXEzzY.webp";

type ContactProps = {
  includeChrome?: boolean;
};

export default function Contact({ includeChrome = true }: ContactProps) {
  const revealHero = useReveal();
  const revealForm = useReveal();
  const revealInfo = useReveal();
  const revealFaq = useReveal();
  const { t, lang } = useLang();

  usePageMeta({
    title: t("联系 FrontMind", "Contact FrontMind"),
    description: t(
      "联系 FrontMind，讨论 GEO 与 AI 品牌定位、智能体增长、企业级 AI 工作流部署与 FDE 入驻。",
      "Contact FrontMind to discuss GEO and AI positioning, agentic growth, enterprise AI workflow deployment, and FDE embedding.",
    ),
    lang,
    schemaType: "ContactPage",
  });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    industry: "",
    message: "",
    service: "geo-positioning",
    privacyConsent: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(t("感谢您，我们已收到您的咨询。", "Thank you. We have received your enquiry."), {
      description: t("FrontMind 团队将基于您的业务背景进行阅读，并与您确认合适的沟通方式。", "The FrontMind team will review your business context and confirm the appropriate next conversation."),
    });
    setFormData({ name: "", email: "", company: "", industry: "", message: "", service: "geo-positioning", privacyConsent: false });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {includeChrome && <Navbar />}

      {/* ═══════════ HERO ═══════════ */}
      <section aria-label="Page Section" className="relative pt-28 pb-16 md:pt-36 md:pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center opacity-10" style={{ backgroundImage: `url(${CTA_IMG})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#f5f5f7] via-[#f5f5f7]/95 to-[#f5f5f7]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(#3D1560 1px, transparent 1px), linear-gradient(90deg, #3D1560 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div
          ref={revealHero.ref}
          className={`container relative z-10 reveal ${revealHero.isVisible ? "visible" : ""}`}
        >
          <div className="max-w-3xl">
            <SectionLabel text={t("联系我们", "Contact Us")} color="purple" />
            <h1 className="text-4xl md:text-5xl font-bold text-[#1A1A2E] leading-tight mb-6" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t(
                <>与 FrontMind<br />讨论企业 AI 化落地</>,
                <>Speak with FrontMind<br />About Enterprise AI Deployment</>
              )}
            </h1>
            <p className="text-lg text-[#6B7280] leading-relaxed max-w-2xl" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "如果您的企业正在面对 AI 搜索、智能体增长或内部流程 AI 化的新问题，我们可以从战略认知、用例诊断、模型与工具选型、数据与流程接入，到 FDE 入驻部署展开一次高质量讨论。",
                "If your enterprise is facing AI search, agentic growth, or internal workflow transformation, we can discuss strategy, use-case diagnosis, tooling, data and workflow integration, and FDE deployment.",
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ FORM + INFO ═══════════ */}
      <section aria-label="Page Section" className="py-16 md:py-24">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Contact Form */}
            <div
              ref={revealForm.ref}
              className={`lg:col-span-7 reveal ${revealForm.isVisible ? "visible" : ""}`}
            >
              <div className="fm-form-shell p-8 md:p-10">
                <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {t("提交业务咨询", "Submit a Business Enquiry")}
                </h2>
                <p className="text-sm text-[#6B7280] mb-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {t("请简要说明您的品牌背景、市场语境与当前关注的问题，我们将据此判断最适合的沟通方式。", "Briefly share your brand context, market situation, and current questions so we can determine the most appropriate conversation.")}
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {t("姓名 *", "Full Name *")}
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="fm-field px-4 py-3 text-sm placeholder-[#9CA3AF]"
                        placeholder={t("您的姓名", "Your name")}
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {t("邮箱 *", "Email *")}
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="fm-field px-4 py-3 text-sm placeholder-[#9CA3AF]"
                        placeholder="you@company.com"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {t("公司", "Company")}
                      </label>
                      <input
                        type="text"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="fm-field px-4 py-3 text-sm placeholder-[#9CA3AF]"
                        placeholder={t("公司名称", "Company name")}
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {t("行业", "Industry")}
                      </label>
                      <select
                        value={formData.industry}
                        onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                        className="fm-field px-4 py-3 text-sm bg-white"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        <option value="">{t("选择行业", "Select industry")}</option>
                        <option value="saas">{t("企业 SaaS", "Enterprise SaaS")}</option>
                        <option value="ecommerce">{t("电商与零售", "E-Commerce & Retail")}</option>
                        <option value="healthcare">{t("医疗健康", "Healthcare & Medical")}</option>
                        <option value="legal">{t("法律服务", "Legal Services")}</option>
                        <option value="finance">{t("金融服务", "Financial Services")}</option>
                        <option value="education">{t("教育培训", "Education & Training")}</option>
                        <option value="travel">{t("旅游酒店", "Travel & Hospitality")}</option>
                        <option value="other">{t("其他", "Other")}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {t("关注方向", "Area of Interest")}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { value: "geo-positioning", label: t("GEO 与 AI 品牌定位咨询", "GEO and AI positioning advisory") },
                        { value: "growth-agents", label: t("获客/营销/客服智能体", "Acquisition/marketing/service agents") },
                        { value: "workflow-deployment", label: t("企业级 AI 工作流部署", "Enterprise AI workflow deployment") },
                        { value: "fde-embedding", label: t("FDE 入驻与端到端落地", "FDE embedding and end-to-end deployment") },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`fm-choice flex items-center gap-2.5 px-4 py-3 cursor-pointer text-sm ${
                            formData.service === option.value
                              ? "fm-choice-active text-[#3D1560]"
                              : "text-[#6B7280]"
                          }`}
                          style={{ fontFamily: "'DM Sans', sans-serif" }}
                        >
                          <input
                            type="radio"
                            name="service"
                            value={option.value}
                            checked={formData.service === option.value}
                            onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                            className="sr-only"
                          />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.service === option.value ? "border-[#3D1560]" : "border-[#d1d5db]"}`}>
                            {formData.service === option.value && <div className="w-2 h-2 rounded-full bg-[#3D1560]" />}
                          </div>
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1A1A2E] mb-1.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                      {t("留言", "Message")}
                    </label>
                    <textarea
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      rows={4}
                      className="fm-field px-4 py-3 text-sm placeholder-[#9CA3AF] resize-none"
                      placeholder={t("请简要说明您的品牌、市场语境和希望讨论的问题", "Briefly describe your brand, market context, and the questions you would like to discuss")}
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-[rgba(61,21,96,0.08)] bg-white/80 px-4 py-3 text-sm text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <input
                      type="checkbox"
                      name="privacy_consent"
                      required
                      checked={formData.privacyConsent}
                      onChange={(e) => setFormData({ ...formData, privacyConsent: e.target.checked })}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#3D1560]"
                    />
                    <span>
                      {t(
                        "我已阅读并同意 FrontMind 根据隐私政策处理我提交的信息，并仅将其用于回复本次业务咨询。",
                        "I have read and agree that FrontMind may process the information I submit according to the privacy policy, solely for responding to this enquiry.",
                      )}
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#3D1560] text-white text-sm font-bold shadow-[0_18px_38px_rgba(61,21,96,0.18)] hover:bg-[#2D1050] transition-colors"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    <Send size={16} />
                    {t("提交咨询", "Submit Enquiry")}
                  </button>
                </form>
              </div>
            </div>

            {/* Contact Info */}
            <div
              ref={revealInfo.ref}
              className={`lg:col-span-5 reveal ${revealInfo.isVisible ? "visible" : ""}`}
            >
              <div className="space-y-6">
                {/* Quick Contact */}
                <div className="fm-card p-6">
                  <h3 className="text-lg font-bold text-[#1A1A2E] mb-5" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {t("联系信息", "Contact Information")}
                  </h3>
                  <div className="space-y-4">
                    {[
                      { icon: <Mail size={18} />, label: t("邮箱", "Email"), value: "contact@frontmind.net" },
                      { icon: <Phone size={18} />, label: t("电话", "Phone"), value: "+86 755-8888-8888" },
                      { icon: <MapPin size={18} />, label: t("地址", "Address"), value: t("深圳市龙岗区港中深", "CUHK-Shenzhen, Longgang, Shenzhen") },
                      { icon: <Clock size={18} />, label: t("工作时间", "Hours"), value: t("周一至周五 9:00-18:00", "Mon-Fri, 9:00 AM - 6:00 PM (CST)") },
                    ].map((item, i) => (
                      <div key={i} className="fm-card-soft flex items-start gap-3 p-4">
                        <div className="fm-icon-panel w-9 h-9 flex items-center justify-center text-[#3D1560] shrink-0">
                          {item.icon}
                        </div>
                        <div>
                          <div className="text-xs text-[#9CA3AF] mb-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.label}</div>
                          <div className="text-sm font-medium text-[#1A1A2E]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What to Expect */}
                <div className="fm-card p-6">
                  <h3 className="text-lg font-bold text-[#1A1A2E] mb-5" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {t("适合讨论的议题", "Topics We Can Discuss")}
                  </h3>
                  <div className="space-y-4">
                    {[
                      { step: "01", text: t("AI 如何理解企业、产品、能力边界与可信证据", "How AI understands the enterprise, products, capability boundaries, and proof") },
                      { step: "02", text: t("获客、营销、客服智能体是否适合当前增长链路", "Whether acquisition, marketing, and service agents fit the current growth loop") },
                      { step: "03", text: t("哪些内部流程适合做企业级 AI 工作流部署", "Which internal workflows are suitable for enterprise AI deployment") },
                      { step: "04", text: t("是否需要 FDE 入驻、系统接入和端到端结果复盘", "Whether FDE embedding, system integration, and end-to-end review are needed") },
                    ].map((item, i) => (
                      <div key={i} className="fm-card-soft flex items-start gap-3 p-4">
                        <span className="text-xs font-bold text-[#C5A24D] shrink-0" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.step}</span>
                        <div className="w-5 h-px bg-[#C5A24D]/30 mt-2 shrink-0" />
                        <p className="text-sm text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trust Signals */}
                <div className="fm-emphasis-card p-6 text-[#1A1A2E]">
                  <div className="fm-icon-panel mb-4 flex h-12 w-12 items-center justify-center text-[#C5A24D]"><MessageSquare size={22} className="text-[#C5A24D]" /></div>
                  <h3 className="text-lg font-bold text-[#1A1A2E] mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {t("高质量业务讨论", "A High-Quality Business Conversation")}
                  </h3>
                  <p className="text-sm text-[#4B5563] mb-4 leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {t(
                      "FrontMind 更重视问题本身的质量。我们希望与企业共同厘清 AI 时代的新入口、新增长链路和新组织流程，而不是用模板化报告替代真正的部署判断。",
                      "FrontMind values the quality of the question. We aim to clarify new entry points, growth loops, and operating workflows rather than replacing deployment judgment with templated reports.",
                    )}
                  </p>
                  <div className="fm-chip inline-flex gap-2 px-3 py-1.5 text-sm font-semibold" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <Clock size={14} />
                    {t("企业 AI 化入口", "Enterprise AI Enquiry")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ ═══════════ */}
      <section aria-label="Page Section" className="py-20 md:py-28 bg-white">
        <div
          ref={revealFaq.ref}
          className={`container reveal ${revealFaq.isVisible ? "visible" : ""}`}
        >
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-14">
              <SectionLabel text={t("常见问题", "FAQ")} color="gold" />
              <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A2E] leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("常见问题解答", "Frequently Asked Questions")}
              </h2>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: t("什么是 GEO？它与 SEO 有什么不同？", "What is GEO and how is it different from SEO?"),
                  a: t(
                    "GEO（生成式引擎优化）关注企业能否被 AI 正确识别、信任并推荐。SEO 争夺网页排名，GEO 争夺被 AI 引用和解释的资格。FrontMind 将 GEO 作为企业 AI 语义资产的基础，而不是低质量内容铺量。",
                    "GEO focuses on whether an enterprise can be correctly recognized, trusted, and recommended by AI. SEO competes for webpage ranking; GEO competes for AI citation and interpretation. FrontMind treats GEO as the foundation of enterprise semantic assets.",
                  ),
                },
                {
                  q: t("FrontMind 现在只做 GEO 吗？", "Does FrontMind only do GEO?"),
                  a: t(
                    "不是。GEO 是让 AI 正确理解企业的起点，后续还包括 MindReach 的获客、营销、客服智能体，以及 MindNexus 的企业级 AI 工作流部署和 FDE 入驻。",
                    "No. GEO is the starting point for helping AI understand the enterprise. The solution also includes MindReach agents for acquisition, marketing, and service, plus MindNexus workflow deployment and FDE embedding.",
                  ),
                },
                {
                  q: t("合作通常从哪里开始？", "Where does collaboration usually begin?"),
                  a: t(
                    "通常从一次战略讨论和用例诊断开始：明确企业当前被 AI 如何理解、增长链路哪里可以智能体化、内部流程哪里适合部署 AI 工作流。",
                    "It usually begins with a strategic conversation and use-case diagnosis: how AI currently understands the enterprise, where agents can improve the growth loop, and which internal workflows are ready for AI deployment.",
                  ),
                },
                {
                  q: t("FDE 入驻具体解决什么问题？", "What does FDE embedding solve?"),
                  a: t(
                    "FDE 解决业务与技术之间的落地鸿沟。驻派团队会参与场景定义、系统接入、知识整理、流程上线、监测复盘，而不是只交付一份建议报告。",
                    "FDE embedding closes the gap between business and technology. The embedded team supports scenario definition, system integration, knowledge organization, workflow launch, monitoring, and review rather than only delivering a report.",
                  ),
                },
                {
                  q: t("企业员工已经会用 AI，还需要这类方案吗？", "If employees already use AI, is this still needed?"),
                  a: t(
                    "需要。个人会用 AI 不等于企业能提效。企业 AI 化需要统一语义资产、明确业务流程、接入数据与系统，并持续监测结果，这正是 FrontMind 三段方案要解决的问题。",
                    "Yes. Individual AI use does not mean enterprise productivity improves. Enterprise AI transformation requires shared semantic assets, workflow redesign, data and system integration, and continuous result monitoring.",
                  ),
                },
              ].map((faq, i) => (
                <details key={i} className="fm-card group overflow-hidden">
                  <summary className="flex items-center justify-between px-6 py-5 cursor-pointer list-none transition-colors" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <span className="text-sm font-semibold text-[#1A1A2E] pr-4">{faq.q}</span>
                    <span className="text-[#3D1560] text-lg shrink-0 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="px-6 pb-5">
                    <p className="text-sm text-[#6B7280] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {includeChrome && <Footer />}
    </div>
  );
}
