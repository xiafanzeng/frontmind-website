import type { AnchorHTMLAttributes, PropsWithChildren } from "react";

type SafeLinkProps = PropsWithChildren<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }
>;

export function Link({ href, children, ...rest }: SafeLinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
