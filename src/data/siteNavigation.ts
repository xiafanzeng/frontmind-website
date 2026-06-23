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
      zh: "品牌语义与 AI 信任系统",
      en: "Brand semantics and AI trust system",
    },
  },
  {
    href: "/mindreach",
    label: { zh: "MindReach 智达", en: "MindReach" },
    description: {
      zh: "智能体增长与主动连接系统",
      en: "Agentic growth and intelligent connection system",
    },
  },
];

export const productServiceLinks: NavLinkItem[] = [
  ...productIntroLinks,
  {
    href: "/solutions",
    label: { zh: "解决方案", en: "Solutions" },
    description: {
      zh: "AI 时代的品牌增长架构",
      en: "Brand growth architecture for the AI era",
    },
  },
  {
    href: "/platform",
    label: { zh: "品牌架构", en: "Brand Architecture" },
    description: {
      zh: "战略、语义、智能体与长期治理",
      en: "Strategy, semantics, agents, and long-term governance",
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
    ],
  },
  {
    title: { zh: "公司", en: "COMPANY" },
    links: [
      { href: "/about", label: { zh: "关于 FrontMind", en: "About FrontMind" } },
      { href: "/research", label: { zh: "研究与社区", en: "Research & Community" } },
      { href: "/contact", label: { zh: "战略对话", en: "Strategic Conversation" } },
      { href: "/privacy-policy", label: { zh: "隐私政策", en: "Privacy Policy" } },
    ],
  },
];

export const legalNavLinks: NavLinkItem[] = [
  { href: "/privacy-policy", label: { zh: "隐私政策", en: "Privacy Policy" } },
  { href: "/terms", label: { zh: "服务条款", en: "Terms of Service" } },
];
