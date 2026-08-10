import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaginationLink } from "@/components/ui/pagination";

describe("PaginationLink", () => {
  it("fails closed when spread props contain a named target", () => {
    const unsafeProps = {
      target: "reusable-pagination-window",
      rel: "opener nofollow",
    } as any;
    const html = renderToStaticMarkup(
      <PaginationLink href="/research?page=2" {...unsafeProps}>
        下一页
      </PaginationLink>,
    );

    expect(html).not.toContain("reusable-pagination-window");
    expect(html).not.toContain("opener");
    expect(html).not.toContain("target=");
    expect(html).toContain('rel="nofollow"');
  });

  it("isolates a blank pagination target", () => {
    const html = renderToStaticMarkup(
      <PaginationLink
        href="https://research.example.org/page/2"
        target="_blank"
        rel="external opener"
      >
        下一页
      </PaginationLink>,
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer external"');
    expect(html).not.toMatch(/(?:^|\s)opener(?:\s|$)/);
  });

  it("rejects named targets in its public prop type", () => {
    const accepted: ComponentProps<typeof PaginationLink> = {
      href: "/research?page=2",
      target: "_self",
    };
    const rejected: ComponentProps<typeof PaginationLink> = {
      href: "/research?page=2",
      // @ts-expect-error Named browsing contexts are intentionally forbidden.
      target: "pagination-window",
    };

    expect(accepted.target).toBe("_self");
    expect(rejected.target).toBe("pagination-window");
  });
});
