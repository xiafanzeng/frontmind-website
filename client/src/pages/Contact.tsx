/* Style Note: Corporate Editorial Precision — contact page should feel concise, high-trust, and email-first. */
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import {
  ArrowRight,
  FileText,
  Mail,
  ShieldCheck,
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
    "FrontMind 合作沟通｜请替换为公司名",
    "FrontMind Collaboration Inquiry | Replace with Company Name",
  );
  const mailBody = t(
    [
      "公司名称：",
      "您的姓名与职务：",
      "公司官网：",
      "公司宣传册/介绍材料：请附上文件或提供可访问链接",
      "沟通目的：请简要说明希望讨论的问题，例如 GEO、AI 品牌可见度、智能体增长、企业级 AI 工作流部署或 FDE 入驻",
      "当前情况：请说明目前的 AI 使用、营销增长或内部流程部署状态",
      "希望的下一步：例如初步诊断、方案沟通、管理层会议或项目评估",
    ].join("\n"),
    [
      "Company name:",
      "Your name and title:",
      "Company website:",
      "Company brochure / introduction material: attach a file or provide an accessible link",
      "Purpose of communication: briefly describe the topic, such as GEO, AI brand visibility, agentic growth, enterprise AI workflow deployment, or FDE embedding",
      "Current situation: describe current AI usage, marketing growth, or internal workflow deployment status",
      "Preferred next step: initial diagnosis, solution discussion, leadership meeting, or project assessment",
    ].join("\n"),
  );
  const mailtoHref = (email: string) =>
    `mailto:${email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
  const briefingItems = [
    t("公司名与官网", "Company name and website"),
    t("您的姓名与职务", "Your name and title"),
    t("公司宣传册、介绍材料或可访问链接", "Company brochure, introduction material, or accessible link"),
    t("本次沟通目的与希望解决的问题", "Purpose of communication and problem to solve"),
    t("当前 AI 使用、营销增长或流程部署状态", "Current AI usage, growth, or workflow deployment status"),
  ];
  const templateLines = t(
    [
      "邮件标题：FrontMind 合作沟通｜公司名",
      "",
      "您好，FrontMind 团队：",
      "",
      "我们是【公司名】，官网为【官网链接】。我是【姓名】，担任【职务】。",
      "",
      "附件/链接中包含我们的公司宣传册或介绍材料：【宣传册链接或附件说明】。",
      "",
      "本次希望沟通的目的：",
      "1. 【例如：希望提升品牌在 ChatGPT、Perplexity、Google AI 等生成式答案中的可见度】",
      "2. 【例如：希望评估企业内部 AI 工作流或智能体部署机会】",
      "3. 【例如：希望了解 GEO、MindPromise、MindReach、MindNexus 或 FDE 入驻合作方式】",
      "",
      "目前我们的情况是：【简要说明当前 AI 使用、营销增长、客服/销售/运营流程等状态】。",
      "",
      "希望下一步可以安排【初步诊断 / 方案沟通 / 管理层会议 / 项目评估】。",
      "",
      "谢谢。",
    ],
    [
      "Subject: FrontMind Collaboration Inquiry | Company Name",
      "",
      "Hello FrontMind team,",
      "",
      "We are [company name], and our website is [website link]. My name is [name], and I serve as [title].",
      "",
      "Our company brochure or introduction material is attached or available here: [link or attachment note].",
      "",
      "The purpose of this conversation is:",
      "1. [For example: improving brand visibility in ChatGPT, Perplexity, Google AI, and other generative answer environments]",
      "2. [For example: evaluating enterprise AI workflows or agent deployment opportunities]",
      "3. [For example: understanding GEO, MindPromise, MindReach, MindNexus, or FDE collaboration models]",
      "",
      "Our current situation is: [briefly describe current AI usage, growth, customer service, sales, or operations workflow status].",
      "",
      "For the next step, we would like to arrange [initial diagnosis / solution discussion / leadership meeting / project assessment].",
      "",
      "Thank you.",
    ],
  );

  usePageMeta({
    title: t("联系 FrontMind", "Contact FrontMind"),
    description: t(
      "通过邮箱联系 FrontMind，请说明公司名、职务、公司宣传册、沟通目的，并讨论 GEO、AI 品牌可见度、智能体增长、企业级 AI 工作流部署与 FDE 入驻。",
      "Contact FrontMind by email with your company name, title, brochure, and purpose to discuss GEO, AI brand visibility, agentic growth, enterprise AI workflow deployment, and FDE embedding.",
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
        `请直接发送邮件至 ${CONTACT_EMAILS[0]} 或 ${CONTACT_EMAILS[1]}，并说明公司名、您的职务、公司宣传册或介绍材料、沟通目的与希望安排的下一步。`,
        `Please email ${CONTACT_EMAILS[0]} or ${CONTACT_EMAILS[1]} with your company name, title, company brochure or introduction material, purpose of communication, and preferred next step.`,
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
                <>通过邮箱联系<br />FrontMind</>,
                <>Contact FrontMind<br />by Email</>,
              )}
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "如果您希望讨论 GEO、AI 品牌可见度、智能体增长或企业级 AI 工作流部署，请通过以下两个邮箱联系。",
                "For GEO, AI brand visibility, agentic growth, or enterprise AI workflow deployment, please contact us through the two email addresses below.",
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
              <SectionLabel text={t("邮箱联系", "Email Contacts")} color="purple" />
              <h2 className="mb-4 text-3xl font-bold leading-tight text-[#1A1A2E] md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("只通过邮箱接收联系", "Email-Only Contact")}
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t(
                  "当前不再开放网页表单。请直接发送邮件，并在邮件中说明公司名、您的职务、公司宣传册或介绍材料、沟通目的和希望安排的下一步。",
                  "The website form is no longer used. Please email directly with your company name, title, company brochure or introduction material, purpose of communication, and preferred next step.",
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
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#3D1560]/10 text-[#3D1560]">
                  <ShieldCheck size={20} />
                </div>
                <p className="text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {t(
                    "建议把公司宣传册作为附件发送，或提供公开可访问链接。邮件信息越完整，团队越容易判断是否适合安排初步诊断、方案沟通或管理层会议。",
                    "Please attach the company brochure or provide a publicly accessible link. The more complete the message, the easier it is for the team to assess whether an initial diagnosis, solution discussion, or leadership meeting is appropriate.",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="fm-card p-5 md:p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#C5A24D]/15 text-[#8A6F20]">
                <FileText size={20} />
              </div>
              <h3 className="mb-4 text-xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("邮件中请包含", "Please Include")}
              </h3>
              <ul className="space-y-3">
                {briefingItems.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3D1560]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="fm-emphasis-card p-5 md:p-6">
              <h3 className="mb-4 text-xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("邮件模板参考", "Email Template")}
              </h3>
              <pre className="whitespace-pre-wrap rounded-md border border-[#E5E7EB] bg-white p-4 text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {templateLines.join("\n")}
              </pre>
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
