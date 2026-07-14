/* Style Note: Corporate Editorial Precision — maintain refined navigation rhythm, restrained interaction, and a premium advisory brand tone. */
import { useState, useEffect, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Globe, ChevronDown } from "lucide-react";
import { useLang } from "@/contexts/LanguageContext";
import { primaryNavLinks, productIntroLinks } from "../../../shared/siteNavigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isValidAgentAccessCode } from "@/data/agentAccessCodes";

const FRONTMIND_LOGO_IMG = "/brand/frontmind-logo.svg";
const AGENT_CONSOLE_URL = import.meta.env.VITE_AGENT_CONSOLE_URL || "https://agent.frontmind.net/";
const CLIENT_PORTAL_URL = import.meta.env.VITE_CLIENT_PORTAL_URL || "/contact?entry=client";

type PortalTarget = {
  href: string;
  label: string;
};

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<PortalTarget | null>(null);
  const [portalCode, setPortalCode] = useState("");
  const [portalError, setPortalError] = useState("");
  const [location] = useLocation();
  const { lang, toggleLang, t } = useLang();

  const productLinks = productIntroLinks.map((link) => ({
    href: link.href,
    label: t(link.label.zh, link.label.en),
    description: link.description ? t(link.description.zh, link.description.en) : "",
  }));

  const navLinks = primaryNavLinks.map((link) => ({
    href: link.href,
    label: t(link.label.zh, link.label.en),
  }));

  const productActive = productLinks.some((link) => location === link.href || location === `/products${link.href}`);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const openProtectedPortal = (target: PortalTarget) => {
    setPortalTarget(target);
    setPortalCode("");
    setPortalError("");
    setMobileOpen(false);
  };

  const closeProtectedPortal = () => {
    setPortalTarget(null);
    setPortalCode("");
    setPortalError("");
  };

  const handlePortalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (portalTarget && isValidAgentAccessCode(portalCode)) {
      window.location.assign(portalTarget.href);
      closeProtectedPortal();
      return;
    }

    setPortalError(t("访问权限代号不正确，请重新输入。", "Invalid access permission code. Please try again."));
  };

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
        <Link href="/" className="flex h-12 items-center no-underline" aria-label="FrontMind Home">
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
              <ChevronDown size={14} className="text-[#3D1560] transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="invisible absolute left-0 top-full w-[360px] translate-y-3 border border-[#E5E7EB] bg-white p-3 opacity-0 shadow-sm transition-all duration-200 group-hover:visible group-hover:translate-y-2 group-hover:opacity-100">
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 no-underline transition-colors hover:bg-[#FAFAFA]"
                >
                  <span className="block text-sm font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                    {link.label}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
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
            href={AGENT_CONSOLE_URL}
            className="ml-3 px-5 py-2 text-sm font-semibold border-2 border-[#3D1560] text-[#3D1560] rounded-md hover:bg-[#3D1560] hover:text-white transition-all duration-300 no-underline"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {t("智能体入口", "Agent Portal")}
          </a>
          <button
            type="button"
            onClick={() =>
              openProtectedPortal({
                href: CLIENT_PORTAL_URL,
                label: t("客户入口", "Client Portal"),
              })
            }
            className="ml-2 px-5 py-2 text-sm font-semibold border-2 border-[#E11D48] text-[#E11D48] rounded-md hover:bg-[#E11D48] hover:text-white transition-all duration-300 no-underline"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
            aria-haspopup="dialog"
          >
            {t("客户入口", "Client Portal")}
          </button>
        </div>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden p-2 text-[#3D1560] hover:bg-[#3D1560]/5 rounded-md transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`lg:hidden transition-all duration-300 ease-in-out ${
          mobileOpen ? "max-h-[calc(100vh-80px)] overflow-y-auto opacity-100" : "max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <div className="bg-white border-t border-[#e5e7eb] shadow-lg">
          <div className="container py-4 flex flex-col gap-1">
            <Link
              href="/"
              className={`rounded-md px-4 py-3 text-sm font-medium no-underline transition-colors ${
                location === "/" ? "bg-[#3D1560]/5 text-[#3D1560]" : "text-[#6B7280] hover:text-[#3D1560]"
              }`}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("首页", "Home")}
            </Link>

            <div className="px-4 pb-1 pt-1 text-xs font-bold uppercase tracking-[0.22em] text-[#C5A24D]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t("产品介绍", "Products")}
            </div>
            {productLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-4 py-3 text-sm font-medium no-underline transition-colors ${
                  location === link.href ? "bg-[#3D1560]/5 text-[#3D1560]" : "text-[#6B7280] hover:text-[#3D1560]"
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
              href={AGENT_CONSOLE_URL}
              className="mt-2 px-4 py-3 text-sm font-semibold border-2 border-[#3D1560] text-[#3D1560] rounded-md text-center no-underline"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("智能体入口", "Agent Portal")}
            </a>
            <button
              type="button"
              onClick={() =>
                openProtectedPortal({
                  href: CLIENT_PORTAL_URL,
                  label: t("客户入口", "Client Portal"),
                })
              }
              className="mt-2 px-4 py-3 text-sm font-semibold border-2 border-[#E11D48] text-[#E11D48] rounded-md text-center no-underline"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
              aria-haspopup="dialog"
            >
              {t("客户入口", "Client Portal")}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(portalTarget)} onOpenChange={(open) => !open && closeProtectedPortal()}>
        <DialogContent className="border-[#E5E7EB] bg-white text-[#1A1A2E] sm:max-w-md">
          <form onSubmit={handlePortalSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t("访问权限代号验证", "Access Permission Code Required")}
              </DialogTitle>
              <DialogDescription className="text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {portalTarget
                  ? t(
                      `请输入访问权限代号以进入${portalTarget.label}。`,
                      `Enter the access permission code to continue to ${portalTarget.label}.`,
                    )
                  : t("请输入访问权限代号。", "Enter the access permission code.")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label
                htmlFor="frontmind-client-code"
                className="block text-sm font-semibold text-[#1A1A2E]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t("访问权限代号", "Access Permission Code")}
              </label>
              <Input
                id="frontmind-client-code"
                type="password"
                value={portalCode}
                onChange={(event) => {
                  setPortalCode(event.target.value);
                  if (portalError) setPortalError("");
                }}
                autoComplete="off"
                autoFocus
                placeholder={t("请输入访问权限代号", "Enter access permission code")}
                aria-invalid={Boolean(portalError)}
                aria-describedby={portalError ? "frontmind-client-code-error" : undefined}
                className="h-11 border-[#D1D5DB] bg-white text-[#1A1A2E] focus-visible:border-[#3D1560] focus-visible:ring-[#3D1560]/20"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              />
              {portalError && (
                <p
                  id="frontmind-client-code-error"
                  role="alert"
                  className="text-sm font-medium text-[#E11D48]"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {portalError}
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-md border border-[#D1D5DB] px-4 py-2 text-sm font-semibold text-[#4B5563] transition-colors hover:bg-[#F9FAFB]"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {t("取消", "Cancel")}
                </button>
              </DialogClose>
              <button
                type="submit"
                className="rounded-md bg-[#3D1560] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2D1050]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t("进入", "Continue")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
