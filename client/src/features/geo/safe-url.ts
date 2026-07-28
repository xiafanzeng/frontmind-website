const NON_PUBLIC_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
] as const;

function normalizedHostname(url: URL) {
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function isIpLiteral(hostname: string) {
  return hostname.includes(":") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

export function safePublicAppUrl(
  value: string | undefined,
  options: { allowLocalDevelopment?: boolean } = {},
) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const hostname = normalizedHostname(url);
    if (!hostname || url.username || url.password) return undefined;
    if (isLoopbackHost(hostname)) {
      return options.allowLocalDevelopment && url.protocol === "http:"
        ? url.toString()
        : undefined;
    }
    if (
      url.protocol !== "https:" ||
      isIpLiteral(hostname) ||
      !hostname.includes(".") ||
      NON_PUBLIC_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
      )
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}
