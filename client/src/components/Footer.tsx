/* Style Note: Corporate Editorial Precision — maintain refined navigation rhythm, restrained interaction, and a premium advisory brand tone. */
import { Link } from "@/components/SafeLink";
import { useLang } from "@/contexts/LanguageContext";
import { footerLinkSections } from "../../../shared/siteNavigation";

const FRONTMIND_LOGO_IMG = "/brand/frontmind-logo.svg";

export default function Footer() {
  const { t } = useLang();

  const footerLinks = footerLinkSections.map((section) => ({
    title: t(section.title.zh, section.title.en),
    links: section.links.map((link) => ({
      href: link.href,
      label: t(link.label.zh, link.label.en),
    })),
  }));

  return (
    <footer className="bg-white border-t border-[#e5e7eb]">
      {/* Gradient accent line */}
      <div className="gradient-line" />
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Main grid: 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-20 items-start">
          {/* Brand Column: Logo on top (aligned with section titles), text below (aligned with links) */}
          <div>
            {/* Logo - same line height as section titles */}
            <div style={{ marginTop: '-8px', marginBottom: '0px' }}>
              <Link href="/" className="inline-flex items-center no-underline" aria-label="FrontMind Home">
                <img
                  src={FRONTMIND_LOGO_IMG}
                  alt="FrontMind"
                  className="h-9 w-auto max-w-[170px] object-contain"
                />
              </Link>
            </div>
            {/* Brand description - starts at same level as first link item */}
            <p className="text-[#4B5563] text-sm leading-relaxed max-w-md mb-0" style={{ fontFamily: "'DM Sans', sans-serif", marginTop: '8px' }}>
              {t(
                "FrontMind 孵化于香港中文大学（深圳）数据科学学院AI智能决策实验室，是一家面向 AI 原生时代的企业级 AI 咨询与战略部署公司。核心团队汇聚港中深、加州理工、清华、纽约大学等名校人才，拥有亚马逊、谷歌、字节跳动等头部大厂深厚技术背景。核心理念是以理解、增长、嵌入三段路径，帮助企业迈向 AI 原生业务系统。",
                "Incubated at CUHK-Shenzhen AI Decision-Making Lab, FrontMind is an enterprise AI consulting and strategic deployment company. Our team brings talent from Caltech, Tsinghua, NYU, and industry leaders from Amazon, Google, and ByteDance. Our core philosophy follows three stages\u2014understand, grow, embed\u2014to help enterprises transition to AI-native business systems.",
              )}
            </p>
          </div>

          {/* Link Columns */}
          {footerLinks.map((section) => (
            <div key={section.title}>
              <h3
                className="text-sm font-bold tracking-wider text-[#3D1560] mb-4"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#4B5563] hover:text-[#3D1560] transition-colors no-underline"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
