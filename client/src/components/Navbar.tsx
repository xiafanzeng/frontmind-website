/* Style Note: Corporate Editorial Precision — maintain refined navigation rhythm, restrained interaction, and a premium advisory brand tone. */
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Globe, ChevronDown } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import {
  primaryNavLinks,
  productIntroLinks,
} from "../../../shared/siteNavigation";

const FRONTMIND_LOGO_IMG = "/brand/frontmind-logo.svg";
const CLIENT_PORTAL_URL =
  import.meta.env.VITE_CLIENT_PORTAL_URL ||
  "https://dashboard.frontmind.net/login";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { lang, toggleLang, t } = useLang();

  const productLinks = productIntroLinks.map((link) => ({
    href: link.href,
    label: t(link.label.zh, link.label.en),
    description: link.description
      ? t(link.description.zh, link.description.en)
      : "",
  }));

  const navLinks = primaryNavLinks.map((link) => ({
    href: link.href,
    label: t(link.label.zh, link.label.en),
  }));

  const productActive = productLinks.some(
    (link) => location === link.href || location === `/products${link.href}`,
  );

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  return (
    <nav
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm border-b border-[#E5E7EB]"
          : "bg-transparent"
      }`}
    >
      <div className="container flex items-center justify-between py-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex h-12 items-center no-underline"
          aria-label="FrontMind Home"
        >
          <img
            src={FRONTMIND_LOGO_IMG}
            alt="FrontMind"
            className="h-10 w-auto max-w-[188px] object-contain md:h-11 md:max-w-[210px]"
          />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors no-underline ${
              location === "/"
                ? "text-[#3D1560] bg-[#3D1560]/5"
                : "text-[#6B7280] hover:text-[#3D1560] hover:bg-[#3D1560]/5"
            }`}
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {t("首页", "Home")}
          </Link>

          <div className="group relative">
            <button
              type="button"
              className={`inline-flex items-center gap-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                productActive
                  ? "text-[#3D1560] bg-[#3D1560]/5"
                  : "text-[#6B7280] hover:text-[#3D1560] hover:bg-[#3D1560]/5"
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              aria-haspopup="true"
            >
              {t("产品介绍", "Products")}
              <ChevronDown
                size={14}
                className="text-[#3D1560] transition-transform duration-200 group-hover:rotate-180"
              />
            </button>
            <div className="invisible absolute left-0 top-full w-[360px] translate-y-3 border border-[#E5E7EB] bg-white p-3 opacity-0 shadow-sm transition-all duration-200 group-hover:visible group-hover:translate-y-2 group-hover:opacity-100">
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 no-underline transition-colors hover:bg-[#FAFAFA]"
                >
                  <span
                    className="block text-sm font-bold text-[#1A1A2E]"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {link.label}
                  </span>
                  <span
                    className="mt-1 block text-sm leading-relaxed text-[#4B5563]"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {link.description}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors no-underline ${
                location === link.href
                  ? "text-[#3D1560] bg-[#3D1560]/5"
                  : "text-[#6B7280] hover:text-[#3D1560] hover:bg-[#3D1560]/5"
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {link.label}
            </Link>
          ))}

          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="ml-2 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#6B7280] hover:text-[#3D1560] rounded-md hover:bg-[#3D1560]/5 transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
            title={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            <Globe size={14} />
            <span>{lang === "zh" ? "EN" : "中文"}</span>
          </button>

          <a
            href={CLIENT_PORTAL_URL}
            className="ml-3 rounded-md border-2 border-[#3D1560] bg-[#3D1560] px-5 py-2 text-sm font-semibold text-white no-underline transition-all duration-300 hover:border-[#2D1050] hover:bg-[#2D1050]"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {t("客户入口", "Client Portal")}
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          type="button"
          className="lg:hidden p-2 text-[#3D1560] hover:bg-[#3D1560]/5 rounded-md transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="site-mobile-navigation"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        id="site-mobile-navigation"
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={`lg:hidden transition-all duration-300 ease-in-out ${
          mobileOpen
            ? "max-h-[calc(100vh-80px)] overflow-y-auto opacity-100"
            : "max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <div className="bg-white border-t border-[#e5e7eb] shadow-lg">
          <div className="container py-4 flex flex-col gap-1">
            <Link
              href="/"
              className={`rounded-md px-4 py-3 text-sm font-medium no-underline transition-colors ${
                location === "/"
                  ? "bg-[#3D1560]/5 text-[#3D1560]"
                  : "text-[#6B7280] hover:text-[#3D1560]"
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("首页", "Home")}
            </Link>

            <div
              className="px-4 pb-1 pt-1 text-xs font-bold uppercase tracking-[0.22em] text-[#C5A24D]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("产品介绍", "Products")}
            </div>
            {productLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-4 py-3 text-sm font-medium no-underline transition-colors ${
                  location === link.href
                    ? "bg-[#3D1560]/5 text-[#3D1560]"
                    : "text-[#6B7280] hover:text-[#3D1560]"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {link.label}
              </Link>
            ))}
            <div className="my-2 h-px bg-[#3D1560]/10" />

            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-3 text-sm font-medium rounded-md transition-colors no-underline ${
                  location === link.href
                    ? "text-[#3D1560] bg-[#3D1560]/5"
                    : "text-[#6B7280] hover:text-[#3D1560]"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {link.label}
              </Link>
            ))}

            {/* Mobile Language Toggle */}
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#6B7280] hover:text-[#3D1560] rounded-md transition-colors text-left"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              <Globe size={16} />
              {lang === "zh" ? "Switch to English" : "切换到中文"}
            </button>

            <a
              href={CLIENT_PORTAL_URL}
              className="mt-2 rounded-md border-2 border-[#3D1560] bg-[#3D1560] px-4 py-3 text-center text-sm font-semibold text-white no-underline"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("客户入口", "Client Portal")}
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
}
