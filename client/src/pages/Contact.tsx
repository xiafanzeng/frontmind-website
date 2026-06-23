/* Style Note: Corporate Editorial Precision — contact page should feel concise, high-trust, and email-first. */
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import {
  ArrowRight,
  Building2,
  FileText,
  Mail,
  MessageSquareText,
} from "lucide-react";

const CTA_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663574964680/kqDR6C992NM8WoGVvcwuPU/frontmind-cta-scene-XSQHkwEMYtwgJ8WUCXEzzY.webp";

const CONTACT_EMAILS = [
  "fanzengxia@link.cuhk.edu.cn",
  "litongxin@cuhk.edu.cn",
];

type ContactProps = {
  includeChrome?: boolean;
};

export default function Contact({ includeChrome = true }: ContactProps) {
  const revealHero = useReveal();
  const revealContact = useReveal();
  const revealFaq = useReveal();
  const { t, lang } = useLang();
  const mailSubject = t(
    "FrontMind 商务沟通｜公司名称",
    "FrontMind Business Conversation | Company Name",
  );
  const mailBody = t(
    [
      "公司名称：",
      "您的姓名与职务：",
      "公司官网：",
      "公司介绍材料：",
      "希望讨论的方向：",
      "当前业务背景：",
      "期待的下一步：",
    ].join("\n"),
    [
      "Company name:",
      "Your name and title:",
      "Company website:",
      "Company introduction material:",
      "Topic you would like to discuss:",
      "Current business context:",
      "Preferred next step:",
    ].join("\n"),
  );
  const mailtoHref = (email: string) =>
    `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
  const briefingItems = [
    {
      icon: <Building2 size={18} />,
      title: t("公司背景", "Company Context"),
      desc: t("公司名称、官网、所在行业，以及可公开分享的介绍材料。", "Company name, website, industry, and shareable introduction material."),
    },
    {
      icon: <FileText size={18} />,
      title: t("沟通身份", "Your Role"),
      desc: t("您的姓名、职务，以及在本次项目或决策中的角色。", "Your name, title, and role in the project or decision process."),
    },
    {
      icon: <MessageSquareText size={18} />,
      title: t("讨论目标", "Conversation Goal"),
      desc: t("希望讨论 GEO、AI 品牌可见度、智能体增长、企业级 AI 工作流或 FDE 入驻中的哪一类问题。", "The topic you would like to discuss: GEO, AI brand visibility, agentic growth, enterprise AI workflows, or FDE embedding."),
    },
  ];
  const sampleLetterLines = t(
    [
      "邮件标题：FrontMind 商务沟通｜公司名称",
      "",
      "您好，FrontMind 团队：",
      "",
      "我们来自公司名称，官网为公司官网。我是姓名，负责相关职能。",
      "",
      "随信附上公司介绍材料，供团队了解业务背景。",
      "",
      "本次希望重点讨论：品牌在生成式答案中的可见度、智能体增长机会，或企业内部 AI 工作流部署。",
      "",
      "如方向匹配，期待安排一次初步沟通。",
      "",
      "谢谢。",
    ],
    [
      "Subject: FrontMind Business Conversation | Company Name",
      "",
      "Hello FrontMind team,",
      "",
      "We are from Company Name. Our website is Company Website. My name is Name, and I lead the relevant function.",
      "",
      "I have attached our company introduction material for your reference.",
      "",
      "We would like to discuss brand visibility in generative answers, agentic growth opportunities, or enterprise AI workflow deployment.",
      "",
      "If the direction is aligned, we would appreciate an initial conversation.",
      "",
      "Thank you.",
    ],
  );

  usePageMeta({
    title: t("联系 FrontMind", "Contact FrontMind"),
    description: t(
      "联系 FrontMind，讨论 GEO、AI 品牌可见度、智能体增长、企业级 AI 工作流部署与 FDE 入驻。",
      "Contact FrontMind to discuss GEO, AI brand visibility, agentic growth, enterprise AI workflow deployment, and FDE embedding.",
    ),
    lang,
    schemaType: "ContactPage",
  });

  const faqItems = [
    {
      q: t("FrontMind 超前智能是什么？", "What is FrontMind?"),
      a: t(
        "FrontMind 超前智能是一家面向 AI 原生时代的企业级 AI 咨询与战略部署公司，核心服务包括 GEO 生成式引擎优化、AI 品牌可见度建设、智能体增长系统和企业级 AI 工作流部署。",
        "FrontMind is an enterprise AI consulting and strategic deployment company for the AI-native era, covering GEO, AI brand visibility, agentic growth systems, and enterprise AI workflow deployment.",
      ),
    },
    {
      q: t("FrontMind 与传统 SEO 代理商有什么不同？", "How is FrontMind different from a traditional SEO agency?"),
      a: t(
        "传统 SEO 主要争夺搜索结果排名；FrontMind 关注企业是否能在 ChatGPT、Perplexity、Google AI、Claude 等答案环境中被正确理解、引用、推荐和执行。我们处理的是语义资产、可信证据、AI 可抓取性和业务流程落地，而不是低质量内容铺量。",
        "Traditional SEO focuses on search rankings. FrontMind focuses on whether an enterprise is correctly understood, cited, recommended, and acted on by answer environments such as ChatGPT, Perplexity, Google AI, and Claude.",
      ),
    },
    {
      q: t("什么是 GEO？它与 SEO 有什么不同？", "What is GEO and how is it different from SEO?"),
      a: t(
        "GEO（生成式引擎优化）关注企业在生成式 AI 回答中的可见度、可信度和被引用概率。SEO 解决网页是否被排名，GEO 进一步解决 AI 是否理解企业事实、能力边界、证据链和推荐理由。",
        "GEO focuses on visibility, trust, and citation probability in generative AI answers. SEO addresses web ranking; GEO addresses whether AI understands enterprise facts, capability boundaries, evidence chains, and recommendation reasons.",
      ),
    },
    {
      q: t("MindPromise、MindReach、MindNexus 分别解决什么问题？", "What do MindPromise, MindReach, and MindNexus solve?"),
      a: t(
        "MindPromise 智诺让 AI 正确理解企业，构建品牌语义、权威内容、AI 引用一致性与信任证据体系。MindReach 智达基于这套企业理解，支持获客、营销和客服智能体识别高意向线索。MindNexus 智汇把 AI 工作流、系统协同和 FDE 支持嵌入企业运营。",
        "MindPromise helps AI understand the enterprise through semantic assets and trustworthy proof. MindReach supports acquisition, marketing, and service agents. MindNexus embeds AI workflows, system coordination, and FDE support into enterprise operations.",
      ),
    },
    {
      q: t("合作通常从哪里开始？", "Where does collaboration usually begin?"),
      a: t(
        "通常从 AI 感知审计和用例诊断开始：先判断企业在 AI 搜索、智能问答、行业推荐和竞品比较中如何被描述，再确定哪些语义资产、增长链路或内部流程最值得优先重构。",
        "Collaboration usually begins with AI perception auditing and use-case diagnosis: how the enterprise is described in AI search, Q&A, industry recommendation, and competitor comparison, then which semantic assets or workflows should be rebuilt first.",
      ),
    },
    {
      q: t("FrontMind 会交付什么？", "What does FrontMind deliver?"),
      a: t(
        "交付内容会按项目目标确定，通常包括 AI 可见度与误读诊断、品牌语义资产重构、权威信源与内容体系建议、智能体流程设计、企业知识与系统接入方案，以及上线后的监测与复盘机制。",
        "Deliverables depend on the project goal and may include AI visibility audits, semantic asset reconstruction, authority-source strategy, agent workflow design, enterprise knowledge and system integration plans, and post-launch monitoring.",
      ),
    },
    {
      q: t("FDE 入驻具体解决什么问题？", "What does FDE embedding solve?"),
      a: t(
        "FDE 入驻解决业务与技术之间的落地鸿沟。驻派团队会参与场景定义、知识整理、系统接入、流程上线、监测复盘和下一轮优化，让 AI 能力进入真实业务流程。",
        "FDE embedding closes the gap between business and technology. The embedded team supports scenario definition, knowledge organization, system integration, workflow launch, monitoring, and iteration.",
      ),
    },
    {
      q: t("企业员工已经会用 AI，还需要这类方案吗？", "If employees already use AI, is this still needed?"),
      a: t(
        "需要。个人会用 AI 不等于企业具备 AI 原生业务系统。企业 AI 化需要统一语义资产、明确流程边界、接入数据与系统、建立权限和复盘机制，并持续监测结果。",
        "Yes. Individual AI use does not equal an AI-native business system. Enterprise AI transformation requires shared semantic assets, workflow boundaries, data and system access, governance, and continuous monitoring.",
      ),
    },
    {
      q: t("FrontMind 的科研背景体现在哪里？", "Where does FrontMind's research background show up?"),
      a: t(
        "FrontMind 孵化于香港中文大学（深圳）数据科学学院 AI 智能决策实验室相关创新生态，方法论长期关注自然语言处理、多智能体系统、模型偏好监测、GEO 评测和企业级流程部署。",
        "FrontMind grew from the CUHK-Shenzhen School of Data Science AI decision-making lab ecosystem. Its methodology draws on NLP, multi-agent systems, model preference monitoring, GEO evaluation, and enterprise workflow deployment.",
      ),
    },
    {
      q: t("适合哪些企业联系 FrontMind？", "Who should contact FrontMind?"),
      a: t(
        "适合正在经历客户入口迁移、增长链路迁移或组织流程迁移的企业，尤其是希望在 AI 搜索和智能问答中被准确理解，同时把智能体能力接入真实业务流程的高信任行业团队。",
        "FrontMind is suited to enterprises facing migration in customer entry points, growth loops, or operating workflows, especially high-trust teams that need accurate AI visibility and real workflow deployment.",
      ),
    },
    {
      q: t("如何联系？", "How can we get in touch?"),
      a: t(
        `请发送邮件至 ${CONTACT_EMAILS[0]} 或 ${CONTACT_EMAILS[1]}。来信中可包含公司背景、您的职务、介绍材料和希望讨论的方向。`,
        `Please email ${CONTACT_EMAILS[0]} or ${CONTACT_EMAILS[1]}. You may include company context, your title, introduction material, and the topic you would like to discuss.`,
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {includeChrome && <Navbar />}

      <section aria-label="Contact Hero" className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-20">
        <div className="absolute inset-0 bg-cover bg-center opacity-10" style={{ backgroundImage: `url(${CTA_IMG})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#f5f5f7] via-[#f5f5f7]/95 to-[#f5f5f7]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: "linear-gradient(#3D1560 1px, transparent 1px), linear-gradient(90deg, #3D1560 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div
          ref={revealHero.ref}
          className={`container relative z-10 reveal ${revealHero.isVisible ? "visible" : ""}`}
        >
          <div className="max-w-3xl">
            <SectionLabel text={t("联系我们", "Contact Us")} color="purple" />
            <h1 className="mb-6 text-4xl font-bold leading-tight text-[#1A1A2E] md:text-5xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t(
                <>与 FrontMind<br />开启一次业务讨论</>,
                <>Start a Business Conversation<br />with FrontMind</>,
              )}
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "如果您的企业正在思考 AI 搜索可见度、智能体增长或内部流程 AI 化，欢迎将业务背景与合作方向发送给我们。FrontMind 团队会基于材料判断适合的交流方式。",
                "If your organization is exploring AI search visibility, agentic growth, or enterprise AI workflows, share your business context and collaboration direction with us. The FrontMind team will review the material and suggest an appropriate next step.",
              )}
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Email Contacts" className="py-14 md:py-20">
        <div
          ref={revealContact.ref}
          className={`container reveal ${revealContact.isVisible ? "visible" : ""}`}
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionLabel text={t("商务联系", "Business Contact")} color="purple" />
              <h2 className="mb-4 text-3xl font-bold leading-tight text-[#1A1A2E] md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("请将合作方向发送至以下邮箱", "Share Your Collaboration Direction")}
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t(
                  "来信可简要说明公司背景、您的职务、公司介绍材料与希望讨论的重点。我们更重视问题本身的质量，也会以此判断后续是否适合安排初步沟通、专题诊断或方案讨论。",
                  "Your note may briefly include company context, your role, introduction material, and the topic you would like to discuss. We value the quality of the question and use it to determine whether an initial conversation, diagnosis, or solution discussion is appropriate.",
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {CONTACT_EMAILS.map((email) => (
                <a
                  key={email}
                  href={mailtoHref(email)}
                  className="fm-card group flex items-center justify-between gap-4 p-5 no-underline md:p-6"
                >
                  <span className="flex min-w-0 items-center gap-4">
                    <span className="fm-icon-panel flex h-11 w-11 shrink-0 items-center justify-center text-[#3D1560]">
                      <Mail size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-all text-base font-bold text-[#1A1A2E] md:text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        {email}
                      </span>
                    </span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-[#3D1560] transition-transform group-hover:translate-x-1" />
                </a>
              ))}

              <div className="fm-emphasis-card p-5 md:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C5A24D]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {t("FrontMind Advisory", "FrontMind Advisory")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {t(
                    "我们通常从业务目标、AI 对企业的当前理解、增长链路和内部流程四个角度阅读材料，再判断最适合的合作入口。",
                    "We typically review material through four lenses: business goals, how AI currently understands the organization, growth loops, and internal workflows.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {briefingItems.map((item) => (
              <div key={String(item.title)} className="fm-card p-5 md:p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center border border-[#E5E7EB] bg-white text-[#3D1560]">
                  {item.icon}
                </div>
                <h3 className="mb-2 text-lg font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="fm-card p-5 md:p-6">
              <h3 className="mb-4 text-xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("来信建议", "Suggested Context")}
              </h3>
              <ul className="space-y-3">
                {briefingItems.map((item) => (
                  <li key={String(item.title)} className="flex gap-3 text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3D1560]" />
                    <span>{item.title}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="fm-emphasis-card p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {t("来信示例", "Sample Note")}
                </h3>
                <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-[#C5A24D] md:inline" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {t("Reference", "Reference")}
                </span>
              </div>
              <div className="border-l-2 border-[#C5A24D] bg-white px-5 py-4">
                {sampleLetterLines.map((line, index) => (
                  <p
                    key={`${line}-${index}`}
                    className={`${line ? "mb-2" : "mb-3"} text-sm leading-relaxed text-[#4B5563] last:mb-0`}
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {line || "\u00A0"}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="FAQ" className="bg-white py-20 md:py-28">
        <div
          ref={revealFaq.ref}
          className={`container reveal ${revealFaq.isVisible ? "visible" : ""}`}
        >
          <div className="mx-auto max-w-4xl">
            <div className="mb-14 text-center">
              <SectionLabel text={t("常见问题", "FAQ")} color="gold" />
              <h2 className="text-3xl font-bold leading-tight text-[#1A1A2E] md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("常见问题解答", "Frequently Asked Questions")}
              </h2>
            </div>

            <div className="space-y-4">
              {faqItems.map((faq) => (
                <details key={String(faq.q)} className="fm-card group overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 transition-colors" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <span className="pr-4 text-sm font-semibold text-[#1A1A2E]">{faq.q}</span>
                    <span className="shrink-0 text-lg text-[#3D1560] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="px-6 pb-5">
                    <p className="text-sm leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{faq.a}</p>
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
