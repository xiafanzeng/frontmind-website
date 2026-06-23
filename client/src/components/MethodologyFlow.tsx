import { useEffect, useRef, useState } from "react";

interface MethodologyFlowProps {
  lang?: string;
}

export default function MethodologyFlow({ lang = "zh" }: MethodologyFlowProps) {
  const t = (zh: string, en: string) => (lang === "en" ? en : zh);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [activePhase, setActivePhase] = useState(-1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const timers: NodeJS.Timeout[] = [];
    timers.push(setTimeout(() => setActivePhase(0), 300));
    timers.push(setTimeout(() => setActivePhase(1), 900));
    timers.push(setTimeout(() => setActivePhase(2), 1500));
    return () => timers.forEach(clearTimeout);
  }, [isVisible]);

  const phases = [
    {
      num: "01",
      title: t("理解", "Understand"),
      product: "MindPromise",
      subtitle: t("让品牌进入 AI 的正确认知", "Build correct AI perception of your brand"),
      description: t(
        "围绕品牌事实、语境与行业标准，构建可被 AI 理解、引用与调用的语义资产。",
        "Build semantic assets around brand facts, context, and industry standards that AI can understand, cite, and invoke."
      ),
      icon: (
        <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
          <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
          <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <circle cx="24" cy="24" r="4" fill="currentColor" />
          <path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <path d="M10 10l6 6M32 32l6 6M10 38l6-6M32 16l6-6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
        </svg>
      ),
      gradient: "from-[#3D1560] to-[#6B21A8]",
      lightBg: "bg-purple-50",
      borderColor: "border-[#3D1560]/20",
      tags: [
        t("AI 感知审计", "AI Perception Audit"),
        t("语义资产构建", "Semantic Asset Building"),
        t("权威信源监测", "Authority Source Monitoring"),
      ],
    },
    {
      num: "02",
      title: t("增长", "Grow"),
      product: "MindReach",
      subtitle: t("把信任连接为可持续增长", "Convert trust into sustainable growth"),
      description: t(
        "以智能体连接内容、洞察与线索，让真实需求高效转化为可衡量的增长结果。",
        "Connect content, insights, and leads through agents to efficiently convert real demand into measurable growth."
      ),
      icon: (
        <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
          <path d="M8 36L16 28L24 32L32 18L40 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M32 12H40V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="28" r="3" fill="currentColor" opacity="0.3" />
          <circle cx="24" cy="32" r="3" fill="currentColor" opacity="0.3" />
          <circle cx="32" cy="18" r="3" fill="currentColor" opacity="0.3" />
          <circle cx="40" cy="12" r="3" fill="currentColor" opacity="0.5" />
        </svg>
      ),
      gradient: "from-[#4C1D95] to-[#7C3AED]",
      lightBg: "bg-violet-50",
      borderColor: "border-[#4C1D95]/20",
      tags: [
        t("智能获客", "Intelligent Acquisition"),
        t("意向识别", "Intent Recognition"),
        t("线索沉淀", "Lead Capture"),
      ],
    },
    {
      num: "03",
      title: t("嵌入", "Embed"),
      product: "MindNexus",
      subtitle: t("让 AI 能力进入组织与业务流程", "Embed AI into organizational workflows"),
      description: t(
        "通过 FDE 前沿部署工程师入驻企业，推动知识、流程与系统协同演进，沉淀企业级智能体能力。",
        "Deploy FDE engineers to drive knowledge, process, and system co-evolution, building enterprise-grade agent capabilities."
      ),
      icon: (
        <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
          <rect x="14" y="14" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <rect x="18" y="18" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
          <rect x="22" y="22" width="4" height="4" rx="1" fill="currentColor" />
          <path d="M24 8v6M24 34v6M8 24h6M34 24h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="24" cy="8" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="24" cy="40" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="8" cy="24" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="40" cy="24" r="2" fill="currentColor" opacity="0.4" />
        </svg>
      ),
      gradient: "from-[#5B21B6] to-[#8B5CF6]",
      lightBg: "bg-indigo-50",
      borderColor: "border-[#5B21B6]/20",
      tags: [
        t("FDE 入驻", "FDE Deployment"),
        t("系统协同", "System Orchestration"),
        t("能力沉淀", "Capability Building"),
      ],
    },
  ];

  return (
    <div ref={containerRef} className="w-full">


      {/* 三阶段卡片 + 连接线 */}
      <div className="relative">
        {/* 连接线 - 桌面端，位于卡片垂直中间 */}
        <div
          className={`hidden md:block absolute left-0 right-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none transition-all duration-700 delay-[600ms] ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* 线条贯穿整个卡片区域 */}
          <div className="relative h-[2px] mx-[2%]">
            <div className="absolute inset-0 bg-slate-200 rounded-full" />
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#3D1560] via-[#6B21A8] to-[#8B5CF6] rounded-full transition-all duration-[2000ms] ease-out"
              style={{ width: isVisible ? "100%" : "0%" }}
            />
            {/* 箭头节点 - 在卡片右边缘处（卡片结束的地方） */}
            {/* 3列等宽+gap-8布局：每列约占31.5%，gap约占2.4% */}
            {/* 第一张卡片右边缘 ≈ 32.3%，第二张卡片右边缘 ≈ 65.6% */}
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`absolute transition-all duration-500 ${
                  activePhase > i ? "opacity-100 scale-100" : "opacity-0 scale-50"
                }`}
                style={{ left: i === 0 ? `calc(33.33% - 1rem)` : `calc(66.67% + 0.5rem)`, top: "50%", transform: "translate(-50%, -50%)", transitionDelay: `${(i + 1) * 600}ms` }}
              >
                <div className="w-8 h-8 rounded-full bg-white border-2 border-[#3D1560] flex items-center justify-center shadow-md">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#3D1560]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative z-10">
          {phases.map((phase, index) => (
            <div
              key={phase.num}
              className={`group relative transition-all duration-700 ease-out ${
                activePhase >= index
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: `${index * 300}ms` }}
            >
              {/* 卡片主体 */}
              <div
                className={`relative overflow-hidden rounded-2xl border ${phase.borderColor} bg-white p-6 md:p-8 h-full flex flex-col
                  transition-all duration-300 hover:shadow-xl hover:border-[#3D1560]/40 hover:-translate-y-1`}
              >
                {/* 顶部渐变条 */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${phase.gradient}`} />

                {/* 编号和图标 */}
                <div className="flex items-center justify-between mb-5">
                  <div className={`flex items-center gap-3`}>
                    <span className={`text-3xl font-black bg-gradient-to-br ${phase.gradient} bg-clip-text text-transparent`}>
                      {phase.num}
                    </span>
                    <span className="text-lg font-bold text-slate-800">{phase.title}</span>
                  </div>
                  <div className={`text-[#3D1560] opacity-60 group-hover:opacity-100 transition-opacity`}>
                    {phase.icon}
                  </div>
                </div>

                  {/* 副标题 */}
                <h4 className="text-base font-bold text-slate-900 mb-3 leading-snug">
                  {phase.subtitle}
                </h4>

                {/* 描述 */}
                <p className="text-sm text-slate-500 leading-relaxed mb-5 flex-1">
                  {phase.description}
                </p>

                {/* 标签 */}
                <div className="flex flex-wrap gap-2 mt-auto">
                  {phase.tags.map((tag, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${phase.lightBg} text-slate-700
                        transition-all duration-300 group-hover:bg-[#3D1560]/10`}
                    >
                      <span className="w-1 h-1 rounded-full bg-[#3D1560]/50" />
                      {tag}
                    </span>
                  ))}
                </div>

                {/* 悬停时的微光效果 */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#3D1560]/5 rounded-full blur-3xl" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
