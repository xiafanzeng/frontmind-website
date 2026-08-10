import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";

import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/contexts/LanguageContext";

function renderNavbar(initialLang: "zh" | "en" = "zh") {
  const staticLocation = (): [
    string,
    (path: string, ...args: unknown[]) => void,
  ] => ["/", () => undefined];

  return renderToStaticMarkup(
    <Router hook={staticLocation}>
      <LanguageProvider initialLang={initialLang}>
        <Navbar />
      </LanguageProvider>
    </Router>,
  );
}

describe("website Navbar portal entry", () => {
  it("shows only the purple customer portal linked to the Dashboard login", () => {
    const html = renderNavbar();

    expect(html.match(/>客户入口<\/a>/g)).toHaveLength(2);
    expect(
      html.split(`href="${__FRONTMIND_CLIENT_PORTAL_URL__}"`).length - 1,
    ).toBe(2);
    expect(html).toContain("bg-[#3D1560]");
    expect(html).not.toContain("智能体入口");
    expect(html).not.toContain("访问权限代号");
    expect(html).not.toContain("agent.frontmind.net");
  });

  it("uses the same single portal concept in English", () => {
    const html = renderNavbar("en");

    expect(html.match(/>Client Portal<\/a>/g)).toHaveLength(2);
    expect(html).not.toContain("Agent Portal");
    expect(html).not.toContain("Access Permission Code");
  });
});
