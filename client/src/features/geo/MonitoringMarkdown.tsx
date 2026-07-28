import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function safePublicHttpUrl(value?: string): string | undefined {
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
    return url.toString();
  } catch {
    return undefined;
  }
}

const MARKDOWN_COMPONENTS: Components = {
  a({ href, children, title }) {
    const safeHref = safePublicHttpUrl(href);
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
    const safeSrc = safePublicHttpUrl(src);
    const label = alt?.trim() || "远程图片";
    if (!safeSrc) return <span>{label}（图片地址已拦截）</span>;
    return (
      <span>
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
};

export function MonitoringMarkdown({ markdown }: { markdown?: string }) {
  const content = markdown?.trim();
  if (!content) {
    return <p className="geo-answer-empty">本轮没有返回可展示的文字。</p>;
  }

  return (
    <div className="geo-answer-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
        skipHtml
        urlTransform={(url) => safePublicHttpUrl(url) ?? ""}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
