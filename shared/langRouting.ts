export type SiteLang = 'zh' | 'en';

export function normalizeSitePath(path: string): string {
  if (!path) return '/';
  if (path === '/en') return '/';
  if (path.startsWith('/en/')) return path.slice(3) || '/';
  return path;
}

export function localizePath(path: string, lang: SiteLang): string {
  const normalized = normalizeSitePath(path);
  if (lang === 'en') {
    return normalized === '/' ? '/en' : `/en${normalized}`;
  }
  return normalized;
}

export function alternateLang(lang: SiteLang): SiteLang {
  return lang === 'zh' ? 'en' : 'zh';
}
