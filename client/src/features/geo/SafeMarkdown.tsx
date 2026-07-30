import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export function safePublicMarkdownUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    const hostname = url.hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    const labels = hostname.split(".");
    const topLevelDomain = labels.at(-1) ?? "";
    if (
      !hostname ||
      hostname.length > 253 ||
      hostname.includes(":") ||
      /^[0-9.]+$/.test(hostname) ||
      labels.length < 2 ||
      labels.some(
        (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
      ) ||
      !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(topLevelDomain) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|corp|localdomain|onion|test|example|invalid|arpa)$/.test(
        hostname,
      )
    ) {
      return undefined;
    }
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

const SAFE_MARKDOWN_COMPONENTS: Components = {
  a({ href, children, title }) {
    const safeHref = safePublicMarkdownUrl(href);
    if (!safeHref) return <span>{children}</span>;
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, title }) {
    const safeSrc = safePublicMarkdownUrl(src);
    const label = alt?.trim() || "远程图片";
    if (!safeSrc) return <span>{label}（图片地址已拦截）</span>;
    return (
      <span className="geo-markdown-remote-image">
        {label}（
        <a
          href={safeSrc}
          target="_blank"
          rel="noopener noreferrer"
          title={title}
        >
          按需打开原图
        </a>
        ）
      </span>
    );
  },
  table({ children, node: _node, ...props }) {
    return (
      <div className="geo-markdown-table-scroll" tabIndex={0}>
        <table {...props}>{children}</table>
      </div>
    );
  },
};

export function SafeMarkdown({
  markdown,
  className = "geo-safe-markdown",
  empty,
}: {
  markdown?: string;
  className?: string;
  empty?: ReactNode;
}) {
  const content = markdown?.trim();
  if (!content) {
    return empty ?? <p className="geo-empty-copy">暂无可展示的正文内容。</p>;
  }

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={SAFE_MARKDOWN_COMPONENTS}
        skipHtml
        urlTransform={(url) => safePublicMarkdownUrl(url) ?? ""}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
