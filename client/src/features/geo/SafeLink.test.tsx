import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Link as SafeLink } from "@/components/SafeLink";

describe("SafeLink", () => {
  it("fails closed when an untyped caller passes a named target", () => {
    const unsafeProps = {
      target: "reusable-evidence-window",
      rel: "opener nofollow",
    } as any;
    const html = renderToStaticMarkup(
      <SafeLink href="/research" {...unsafeProps}>
        研究
      </SafeLink>,
    );

    expect(html).not.toContain("reusable-evidence-window");
    expect(html).not.toContain("opener");
    expect(html).not.toContain("target=");
    expect(html).toContain('rel="nofollow"');
  });

  it("forces noopener and noreferrer for a blank target", () => {
    const html = renderToStaticMarkup(
      <SafeLink
        href="https://research.example.org"
        target="_blank"
        rel="nofollow opener noreferrer"
      >
        研究
      </SafeLink>,
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toMatch(/(?:^|\s)opener(?:\s|$)/);
  });

  it("limits the typed target API to self or blank", () => {
    const accepted: ComponentProps<typeof SafeLink> = {
      href: "/research",
      target: "_self",
    };
    const rejected: ComponentProps<typeof SafeLink> = {
      href: "/research",
      // @ts-expect-error Named browsing contexts are intentionally forbidden.
      target: "research-window",
    };

    expect(accepted.target).toBe("_self");
    expect(rejected.target).toBe("research-window");
  });
});
