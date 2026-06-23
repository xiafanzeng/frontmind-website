export type BilingualText = {
  zh: string;
  en: string;
};

export type NavLinkItem = {
  href: string;
  label: BilingualText;
  description?: BilingualText;
};

export type FooterLinkSection = {
  title: BilingualText;
  links: NavLinkItem[];
};

export const productIntroLinks: NavLinkItem[] = [
  {
    href: "/mindpromise",
    label: { zh: "MindPromise 智诺", en: "MindPromise" },
    description: {
      zh: "让 AI 正确理解企业",
      en: "Enterprise understanding for AI",
    },
  },
  {
    href: "/mindreach",
    label: { zh: "MindReach 智达", en: "MindReach" },
    description: {
      zh: "让 AI 主动增长业务",
      en: "Agentic growth system",
    },
  },
  {
    href: "/mindnexus",
    label: { zh: "MindNexus 智汇", en: "MindNexus" },
    description: {
      zh: "企业级 AI 工作流部署与 FDE 入驻",
      en: "Enterprise AI workflow and FDE deployment",
    },
  },
];

export const productServiceLinks: NavLinkItem[] = [
  ...productIntroLinks,
  {
    href: "/solutions",
    label: { zh: "解决方案", en: "Solutions" },
    description: {
      zh: "理解、增长、嵌入三段 AI 化路径",
      en: "Understand, grow, and embed AI transformation path",
    },
  },
  {
    href: "/platform",
    label: { zh: "AI 化路径", en: "AI Transformation Path" },
    description: {
      zh: "从外部理解到内部重构",
      en: "From external understanding to internal reconstruction",
    },
  },
];

export const primaryNavLinks: NavLinkItem[] = [
  { href: "/research", label: { zh: "研究与社区", en: "Research & Community" } },
  { href: "/about", label: { zh: "关于我们", en: "About" } },
];

export const footerLinkSections: FooterLinkSection[] = [
  {
    title: { zh: "产品介绍", en: "PRODUCTS" },
    links: [
      { href: "/mindpromise", label: { zh: "MindPromise 智诺", en: "MindPromise" } },
      { href: "/mindreach", label: { zh: "MindReach 智达", en: "MindReach" } },
      { href: "/mindnexus", label: { zh: "MindNexus 智汇", en: "MindNexus" } },
    ],
  },
  {
    title: { zh: "公司", en: "COMPANY" },
    links: [
      { href: "/about", label: { zh: "关于 FrontMind", en: "About FrontMind" } },
      { href: "/research", label: { zh: "研究与社区", en: "Research & Community" } },
      { href: "/privacy", label: { zh: "隐私政策", en: "Privacy Policy" } },
      { href: "/terms", label: { zh: "服务条款", en: "Terms of Service" } },
    ],
  },
];

export const legalNavLinks: NavLinkItem[] = [
  { href: "/privacy", label: { zh: "隐私政策", en: "Privacy Policy" } },
  { href: "/terms", label: { zh: "服务条款", en: "Terms of Service" } },
];
