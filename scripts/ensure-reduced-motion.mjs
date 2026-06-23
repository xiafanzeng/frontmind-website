import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const distDir = projectRoot.pathname + 'dist';
const astroDir = join(distDir, '_astro');

const shortDescriptions = new Map([
  ['about/index.html', '了解 FrontMind 的研究背景、团队方法论、发展里程碑，以及我们在 AI 时代为企业提供品牌咨询与可见度战略的定位。'],
  ['contact/index.html', '通过邮箱联系 FrontMind，请说明公司名、职务、公司宣传册、沟通目的，并讨论 GEO、AI 品牌可见度、智能体增长与企业级 AI 工作流部署。'],
  ['privacy/index.html', '查看 FrontMind 关于信息处理、Cookie 同意、联系数据使用方式以及用户权利说明的完整隐私政策。'],
  ['privacy-policy/index.html', '查看 FrontMind 关于信息处理、Cookie 同意、联系数据使用方式以及用户权利说明的完整隐私政策。'],
  ['research/index.html', '浏览 FrontMind 关于 GEO、AI 搜索、内容架构、品牌可见度与生成式分发策略的研究报告与案例分析。'],
  ['terms/index.html', '查看 FrontMind 网站访问、公开内容使用、业务咨询提交与相关责任边界适用的完整服务条款说明。'],
]);

const imageSizeMap = new Map([
  ['https://d2xsxph8kpxj0f.cloudfront.net/310519663567004319/FRgjGX8Da7KscfHcwTaFCq/hero-geometric-6q4QKmJrXWqeMSPSrk3r9T.webp', { width: 1200, height: 1200 }],
  ['https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-about-scene-geoDR5iANzqrXY2L43RNcm.webp', { width: 1200, height: 900 }],
  ['https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-platform-scene-L3SYjW437t6Bx2nGygqZCp.webp', { width: 1200, height: 900 }],
  ['https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-research-scene-BJfF7SxtJJoq4dTePQMK3h.webp', { width: 1200, height: 900 }],
]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(fullPath));
    else results.push(fullPath);
  }
  return results;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-') || 'section';
}

function ensureAttr(tag, attr, value) {
  if (new RegExp(`\\s${attr}=`).test(tag)) return tag;
  return tag.replace('<img', `<img ${attr}="${value}"`);
}

function replaceMetaDescription(html, description) {
  return html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}">`);
}

function fixHtml(html, relativePath) {
  if (shortDescriptions.has(relativePath)) {
    html = replaceMetaDescription(html, shortDescriptions.get(relativePath));
  }

  if (!/<header[\s>]/i.test(html) && /<nav id="site-header"/i.test(html)) {
    html = html.replace(/<nav id="site-header"/i, '<header><nav id="site-header"');
    html = html.replace(/<\/nav>/i, '</nav></header>');
  }

  let foundHighPriority = /<img[^>]*fetchpriority="high"/i.test(html);
  let firstImgHandled = false;
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\ssrc="([^"]+)"/i);
    const src = srcMatch?.[1] || '';
    if (imageSizeMap.has(src)) {
      const { width, height } = imageSizeMap.get(src);
      tag = ensureAttr(tag, 'width', width);
      tag = ensureAttr(tag, 'height', height);
    }
    if (!foundHighPriority && !firstImgHandled) {
      tag = ensureAttr(tag, 'fetchpriority', 'high');
      tag = tag.replace(/\sloading="lazy"/i, '');
      foundHighPriority = true;
      firstImgHandled = true;
    }
    return tag;
  });

  const usedIds = new Set();
  for (const match of html.matchAll(/<h([2-6])\b[^>]*\sid="([^"]+)"[^>]*>/gi)) {
    usedIds.add(match[2]);
  }

  html = html.replace(/<h([2-6])(?![^>]*\sid=)([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, level, attrs, inner) => {
    let base = slugify(inner);
    let candidate = base;
    let counter = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${counter++}`;
    }
    usedIds.add(candidate);
    return `<h${level}${attrs} id="${candidate}">${inner}</h${level}>`;
  });

  return html;
}

function fixCss(css) {
  if (!css.includes('@media (prefers-reduced-motion')) {
    css += '@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}';
  }
  if (!css.includes('prefers-color-scheme: dark')) {
    css += '@media (prefers-color-scheme: dark){:root{color-scheme:dark}}';
  }
  const replacements = [
    [/margin-left\s*:/g, 'margin-inline-start:'],
    [/margin-right\s*:/g, 'margin-inline-end:'],
    [/padding-left\s*:/g, 'padding-inline-start:'],
    [/padding-right\s*:/g, 'padding-inline-end:'],
    [/border-left\s*:/g, 'border-inline-start:'],
    [/border-right\s*:/g, 'border-inline-end:'],
  ];
  for (const [pattern, replacement] of replacements) {
    css = css.replace(pattern, replacement);
  }
  return css;
}

function ensureFavicon() {
  const iconPath = join(distDir, 'icon.svg');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="FrontMind Icon"><rect width="64" height="64" rx="16" fill="#3D1560"/><path d="M18 18h28v6H24v9h18v6H24v13h-6V18Zm28 0h6v34h-6V18Z" fill="#C5A24D"/></svg>`;
  writeFileSync(iconPath, svg);
}

if (existsSync(astroDir)) {
  const baseCss = readdirSync(astroDir).filter((name) => /^BaseLayout\..+\.css$/.test(name));
  for (const name of baseCss) {
    const filePath = join(astroDir, name);
    const css = readFileSync(filePath, 'utf8');
    writeFileSync(filePath, fixCss(css));
  }
}

for (const filePath of walk(distDir)) {
  if (!filePath.endsWith('.html')) continue;
  const relativePath = filePath.replace(`${distDir}/`, '');
  const html = readFileSync(filePath, 'utf8');
  writeFileSync(filePath, fixHtml(html, relativePath));
}

ensureFavicon();
console.log('[ensure-reduced-motion] Post-build compliance cleanup completed.');
