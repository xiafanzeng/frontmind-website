import type { AnchorHTMLAttributes, PropsWithChildren } from "react";

export type SafeLinkTarget = "_self" | "_blank";

type SafeLinkProps = PropsWithChildren<
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & {
    href: string;
    target?: SafeLinkTarget;
    rel?: string;
  }
>;

export function safeLinkTarget(value: unknown): SafeLinkTarget | undefined {
  return value === "_self" || value === "_blank" ? value : undefined;
}

export function safeLinkRel(
  target: SafeLinkTarget | undefined,
  value: unknown,
) {
  const extraTokens =
    typeof value === "string"
      ? value
          .split(/\s+/)
          .map((token) => token.trim().toLowerCase())
          .filter(Boolean)
          .filter(
            (token) =>
              token !== "opener" &&
              token !== "noopener" &&
              token !== "noreferrer",
          )
      : [];
  const tokens =
    target === "_blank"
      ? ["noopener", "noreferrer", ...extraTokens]
      : extraTokens;
  const rel = Array.from(new Set(tokens)).join(" ");
  return rel || undefined;
}

export function Link({ href, children, target, rel, ...rest }: SafeLinkProps) {
  const safeTarget = safeLinkTarget(target);
  const safeRel = safeLinkRel(safeTarget, rel);

  return (
    <a href={href} {...rest} target={safeTarget} rel={safeRel}>
      {children}
    </a>
  );
}
