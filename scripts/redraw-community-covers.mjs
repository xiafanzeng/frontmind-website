import { createRequire } from "node:module";
import { mkdir, rm, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const sourceRequire = createRequire(
  "/Users/fanzengxia/Documents/Codex/2026-05-21/https-thegeocommunity-com-community-submissions-plugin/package.json",
);
const { chromium } = sourceRequire("playwright");

const root = process.cwd();
const clientOut = join(root, "client/public/geo-community/images/generated-cn");
const publicOut = join(root, "public/geo-community/images/generated-cn");
const tempDir = join(root, "work/generated-cover-redraws");

const cwebp = "/opt/homebrew/bin/cwebp";

const covers = [
  {
    file: "how-to-find-ai-referral-traffic-ga4-cn.webp",
    width: 1734,
    height: 907,
    html: ga4Cover,
  },
  {
    file: "deepseek-v4-hybrid-attention-cn.webp",
    width: 2752,
    height: 1536,
    html: deepseekCover,
  },
  {
    file: "dual-encoders-dimensions-banner-cn.webp",
    width: 2752,
    height: 1536,
    html: dualEncoderCover,
  },
  {
    file: "featgeo-banner-cn.webp",
    width: 2752,
    height: 1536,
    html: featGeoCover,
  },
  {
    file: "geo-resources-2026-cn.webp",
    width: 2752,
    height: 1536,
    html: geoResourcesCover,
  },
  {
    file: "geo-roadmap-seo-professionals-cn.webp",
    width: 2752,
    height: 1536,
    html: geoRoadmapCover,
  },
];

await mkdir(clientOut, { recursive: true });
await mkdir(publicOut, { recursive: true });
await mkdir(tempDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const cover of covers) {
  const page = await browser.newPage({
    viewport: { width: cover.width, height: cover.height },
    deviceScaleFactor: 1,
  });
  await page.setContent(documentHtml(cover.width, cover.height, cover.html()), {
    waitUntil: "networkidle",
  });
  const png = join(tempDir, cover.file.replace(/\.webp$/, ".png"));
  const webp = join(clientOut, cover.file);
  await page.screenshot({ path: png, fullPage: false });
  const result = spawnSync(cwebp, ["-quiet", "-q", "92", png, "-o", webp], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`cwebp failed for ${cover.file}`);
  }
  await copyFile(webp, join(publicOut, cover.file));
  await page.close();
}
await browser.close();
await rm(tempDir, { recursive: true, force: true });

function documentHtml(width, height, body) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
      body {
        font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        color: #172033;
        background: #fff;
      }
      .canvas {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background:
          radial-gradient(circle at 50% 48%, rgba(126, 167, 236, 0.12), transparent 38%),
          radial-gradient(circle at 82% 72%, rgba(142, 104, 225, 0.1), transparent 24%),
          linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      }
      .url {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 34px;
        text-align: center;
        color: #616a76;
        font-size: 34px;
        letter-spacing: 0;
      }
      .soft-card {
        background: rgba(255, 255, 255, 0.88);
        border: 2px solid #dce5f1;
        border-radius: 18px;
        box-shadow: 0 22px 60px rgba(88, 123, 176, 0.12);
      }
      .muted { color: #6a7280; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function dottedGrid(cols, rows, x, y, gap, size, color = "#9ebfe9", opacity = 0.72) {
  let html = "";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      html += `<span style="position:absolute;left:${x + col * gap}px;top:${y + row * gap}px;width:${size}px;height:${size}px;border-radius:999px;background:${color};opacity:${opacity};"></span>`;
    }
  }
  return html;
}

function token(x, y, color = "blue", size = 58) {
  const isPurple = color === "purple";
  const isGreen = color === "green";
  const fill = isPurple ? "#d8c0ee" : isGreen ? "#9edccb" : "#a9c2ed";
  const stroke = isPurple ? "#8963ca" : isGreen ? "#409f89" : "#5c82c5";
  return `<span style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:12px;background:${fill};border:3px solid ${stroke};box-shadow:0 14px 28px rgba(62,91,146,.12);"></span>`;
}

function ga4Cover() {
  const sourceRows = ["chatgpt.com / referral", "perplexity.ai / referral", "gemini.google.com / referral", "copilot.microsoft.com / referral"];
  return `<div class="canvas">
    ${dottedGrid(4, 3, 42, 42, 25, 7, "#9aaec8", 0.55)}
    ${dottedGrid(6, 4, 1540, 776, 23, 7, "#9aaec8", 0.55)}

    <div class="soft-card" style="position:absolute;left:80px;top:118px;width:324px;height:320px;padding:24px;">
      <div style="font-weight:800;font-size:20px;margin-bottom:22px;">流量获取</div>
      <svg width="260" height="96" viewBox="0 0 260 96">
        <line x1="0" y1="24" x2="260" y2="24" stroke="#e5eaf2" stroke-width="2"/>
        <line x1="0" y1="64" x2="260" y2="64" stroke="#e5eaf2" stroke-width="2"/>
        <path d="M12 76 C42 70, 52 58, 74 58 S112 62, 130 40 S158 48, 178 28 S212 34, 252 4" fill="none" stroke="#3789ea" stroke-width="4"/>
        <circle cx="12" cy="76" r="5" fill="#fff" stroke="#3789ea" stroke-width="4"/>
        <circle cx="74" cy="58" r="5" fill="#fff" stroke="#3789ea" stroke-width="4"/>
        <circle cx="130" cy="40" r="5" fill="#fff" stroke="#3789ea" stroke-width="4"/>
        <circle cx="178" cy="28" r="5" fill="#fff" stroke="#3789ea" stroke-width="4"/>
        <circle cx="252" cy="4" r="5" fill="#fff" stroke="#3789ea" stroke-width="4"/>
      </svg>
      <svg width="270" height="116" viewBox="0 0 270 116" style="margin-top:12px">
        <circle cx="62" cy="58" r="46" fill="none" stroke="#5aa1f3" stroke-width="26" stroke-dasharray="90 210"/>
        <circle cx="62" cy="58" r="46" fill="none" stroke="#58c99d" stroke-width="26" stroke-dasharray="75 225" stroke-dashoffset="-90"/>
        <circle cx="62" cy="58" r="46" fill="none" stroke="#9a79e8" stroke-width="26" stroke-dasharray="70 230" stroke-dashoffset="-165"/>
        <circle cx="62" cy="58" r="46" fill="none" stroke="#bed6fb" stroke-width="26" stroke-dasharray="65 235" stroke-dashoffset="-235"/>
        <circle cx="162" cy="32" r="8" fill="#5aa1f3"/>
        <line x1="188" y1="32" x2="248" y2="32" stroke="#d8dee8" stroke-width="8" stroke-linecap="round"/>
        <circle cx="162" cy="62" r="8" fill="#58c99d"/>
        <line x1="188" y1="62" x2="228" y2="62" stroke="#d8dee8" stroke-width="8" stroke-linecap="round"/>
        <circle cx="162" cy="92" r="8" fill="#9a79e8"/>
        <line x1="188" y1="92" x2="250" y2="92" stroke="#d8dee8" stroke-width="8" stroke-linecap="round"/>
      </svg>
    </div>

    <h1 style="position:absolute;left:455px;top:196px;width:850px;margin:0;text-align:center;font-size:94px;line-height:1.16;font-weight:900;color:#07132b;letter-spacing:0;">
      如何在 GA4 中<br/>找到 AI 推荐流量
    </h1>

    <svg style="position:absolute;left:0;top:0;width:1734px;height:907px;pointer-events:none;" viewBox="0 0 1734 907">
      <defs>
        <marker id="arrowBlue" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
          <path d="M2,2 L10,6 L2,10 Z" fill="#388bf0"/>
        </marker>
        <marker id="arrowGray" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto" markerUnits="strokeWidth">
          <path d="M2,2 L10,6 L2,10 Z" fill="#9fb0c8"/>
        </marker>
      </defs>
      <path d="M0 540 C165 535 250 538 376 602 C535 685 646 714 836 679 C907 666 958 665 986 678" fill="none" stroke="#4d94f4" stroke-width="2.2" marker-end="url(#arrowBlue)"/>
      <path d="M0 635 C164 560 330 586 482 638 C641 691 740 704 902 676" fill="none" stroke="#54c99f" stroke-width="2"/>
      <path d="M0 774 C108 686 247 662 375 675 C514 689 640 716 820 688" fill="none" stroke="#9a79e8" stroke-width="2" stroke-dasharray="8 9"/>
      <path d="M35 907 C136 777 282 720 458 745 C608 767 726 786 877 710" fill="none" stroke="#8963f2" stroke-width="2"/>
      <path d="M1315 112 C1400 166 1510 240 1652 240 C1664 240 1660 310 1660 375" fill="none" stroke="#9fb0c8" stroke-width="2.4" stroke-dasharray="9 12" marker-end="url(#arrowGray)"/>
    </svg>

    <div style="position:absolute;left:62px;top:500px;width:74px;height:74px;border-radius:50%;border:2px solid #90dfc6;background:#f7fffc;color:#14a47a;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:26px;">GPT</div>
    <div style="position:absolute;left:118px;top:575px;width:74px;height:74px;border-radius:50%;border:2px solid #7fb5ff;background:#f8fbff;color:#2c80e8;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;">PX</div>
    <div style="position:absolute;left:188px;top:648px;width:78px;height:78px;border-radius:50%;border:2px solid #a48af0;background:#fff;color:#8060e9;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;">AI</div>
    <div style="position:absolute;left:255px;top:722px;width:70px;height:70px;border-radius:50%;border:2px solid #9679ef;background:#fff;color:#754fde;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;">Co</div>

    <div style="position:absolute;left:1376px;top:54px;width:250px;height:250px;">
      <svg width="250" height="250" viewBox="0 0 250 250">
        <circle cx="125" cy="125" r="72" fill="#fff" stroke="#cdd8ef" stroke-width="3" stroke-dasharray="8 7"/>
        <circle cx="125" cy="125" r="58" fill="#fff" stroke="#e2e8f5" stroke-width="2"/>
        <text x="125" y="143" text-anchor="middle" font-size="58" font-weight="900" fill="#744bd8">AI</text>
        <line x1="125" y1="52" x2="125" y2="8" stroke="#b6c4da" stroke-width="2"/>
        <line x1="186" y1="83" x2="230" y2="58" stroke="#b6c4da" stroke-width="2"/>
        <line x1="187" y1="166" x2="232" y2="196" stroke="#b6c4da" stroke-width="2"/>
        <line x1="64" y1="84" x2="21" y2="58" stroke="#b6c4da" stroke-width="2"/>
        <line x1="65" y1="167" x2="18" y2="198" stroke="#b6c4da" stroke-width="2"/>
        <circle cx="125" cy="8" r="11" fill="#d8eaff" stroke="#7bb2f6" stroke-width="2"/>
        <circle cx="230" cy="58" r="15" fill="#a98cf0" stroke="#8261dd" stroke-width="2"/>
        <circle cx="20" cy="58" r="15" fill="#8ec2ff" stroke="#2d84ec" stroke-width="2"/>
        <circle cx="18" cy="198" r="11" fill="#94dfc4" stroke="#4eb696" stroke-width="2"/>
        <circle cx="232" cy="196" r="12" fill="#b6d4ff" stroke="#6fa9f3" stroke-width="2"/>
      </svg>
    </div>

    <div class="soft-card" style="position:absolute;left:1373px;top:412px;width:320px;height:270px;overflow:hidden;">
      <div style="height:60px;padding:18px 24px;font-weight:800;font-size:17px;">会话来源 / 媒介</div>
      ${sourceRows
        .map(
          (row, index) =>
            `<div style="height:52px;padding:15px 24px 0 64px;border-top:1px solid #e3e8f2;font-size:16px;position:relative;background:${index === 0 ? "#eee9ff" : "rgba(255,255,255,.76)"};">
              ${index === 0 ? '<span style="position:absolute;left:26px;top:15px;color:#7957db;font-size:23px;">✦</span>' : ""}
              ${row}
            </div>`,
        )
        .join("")}
    </div>

    <svg style="position:absolute;left:1060px;top:590px;width:300px;height:220px;" viewBox="0 0 300 220">
      <rect x="34" y="122" width="36" height="70" rx="5" fill="#d9ecff"/>
      <rect x="86" y="72" width="36" height="120" rx="5" fill="#9fcaf6"/>
      <rect x="140" y="32" width="36" height="160" rx="5" fill="#8fddc8"/>
      <rect x="194" y="-18" width="36" height="210" rx="5" fill="#9e7be5"/>
      <circle cx="242" cy="168" r="47" fill="#d9eaff"/>
      <path d="M242 168 L242 121 A47 47 0 0 1 284 190 Z" fill="#69a6f1"/>
      <line x1="0" y1="196" x2="282" y2="196" stroke="#d4dce8" stroke-width="2"/>
    </svg>

    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}

function deepseekCover() {
  const leftGrid = dottedGrid(25, 17, 132, 614, 16, 10, "#7ea4dc", 0.72);
  let rowOne = "";
  let rowTwo = "";
  let rowThree = "";
  for (let i = 0; i < 12; i += 1) rowOne += token(1190 + i * 74, 694, [3, 6, 9].includes(i) ? "purple" : "blue", 56);
  for (let i = 0; i < 9; i += 1) rowTwo += token(1370 + i * 74, 826, [2, 6].includes(i) ? "purple" : "blue", 56);
  for (let i = 0; i < 14; i += 1) rowThree += token(1190 + i * 74, 1006, i >= 4 && i <= 9 ? "green" : "blue", 56);
  let topCompressed = "";
  for (let i = 0; i < 4; i += 1) topCompressed += token(1694 + i * 82, 510, "purple", 58);

  return `<div class="canvas">
    <h1 style="position:absolute;left:0;right:0;top:126px;margin:0;text-align:center;font-size:92px;line-height:1.05;font-weight:900;color:#202939;letter-spacing:0;">DeepSeek V4 混合注意力</h1>
    <div style="position:absolute;left:0;right:0;top:300px;text-align:center;font-size:62px;color:#676f79;">100 万 token · 9.62 GB · 推理成本降低 6×</div>

    ${leftGrid}
    <svg style="position:absolute;left:0;top:0;width:2752px;height:1536px;" viewBox="0 0 2752 1536">
      <defs>
        <marker id="arrow" markerWidth="18" markerHeight="18" refX="14" refY="9" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M3,3 L15,9 L3,15 Z" fill="#8e98a7"/>
        </marker>
      </defs>
      <path d="M600 640 C650 704 676 720 720 720" fill="none" stroke="#a5afbc" stroke-width="3" stroke-dasharray="4 7"/>
      <line x1="694" y1="864" x2="1008" y2="864" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <line x1="1116" y1="486" x2="1116" y2="1100" stroke="#c4cad4" stroke-width="3"/>
      <path d="M1370 538 C1370 492 1398 480 1432 480 L1690 480" fill="none" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <path d="M1568 558 C1568 520 1594 510 1628 510 L1690 510" fill="none" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <line x1="1894" y1="564" x2="1894" y2="670" stroke="#9aa3af" stroke-width="4" marker-end="url(#arrow)"/>
      <line x1="1190" y1="860" x2="1285" y2="860" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <path d="M2090 538 C2230 536 2240 710 2320 758" fill="none" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <path d="M2085 724 C2188 720 2236 730 2320 758" fill="none" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
      <path d="M2078 1034 C2200 1032 2248 906 2320 796" fill="none" stroke="#8e98a7" stroke-width="4" marker-end="url(#arrow)"/>
    </svg>

    ${token(652, 722, "blue", 88)}
    ${token(760, 722, "blue", 88)}
    ${token(868, 722, "blue", 88)}
    ${token(976, 722, "blue", 88)}
    <div style="position:absolute;left:788px;top:648px;font-size:40px;font-weight:700;">128:1</div>

    ${topCompressed}
    ${rowOne}
    ${rowTwo}
    <div style="position:absolute;left:1478px;top:984px;width:460px;height:92px;border:4px solid #4fae99;background:rgba(143,220,200,.18);border-radius:18px;"></div>
    ${rowThree}

    <div style="position:absolute;left:2410px;top:760px;width:84px;height:84px;border-radius:50%;background:#172033;box-shadow:0 20px 40px rgba(23,32,51,.2);"></div>
    <div style="position:absolute;left:2525px;top:748px;font-size:44px;line-height:1.2;font-weight:900;color:#202939;">混合<br/>输出</div>

    <div style="position:absolute;left:340px;top:1168px;width:520px;text-align:center;font-size:48px;line-height:1.25;font-weight:900;color:#202939;">重压缩注意力</div>
    <div style="position:absolute;left:1350px;top:1168px;width:780px;text-align:center;font-size:48px;line-height:1.25;font-weight:900;color:#202939;">压缩稀疏注意力<br/>+ 闪电索引器</div>
    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}

function seededDots(count, cx, cy, radius) {
  let seed = 4_642_512;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  let html = "";
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const size = 11 + rand() * 10;
    const opacity = 0.36 + rand() * 0.38;
    html += `<span style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:999px;background:#83b6e9;opacity:${opacity};"></span>`;
  }
  return html;
}

function dualEncoderCover() {
  let matrix = "";
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      matrix += token(1855 + col * 72, 524 + row * 74, "purple", 50);
    }
  }
  return `<div class="canvas">
    <h1 style="position:absolute;left:250px;right:250px;top:92px;margin:0;text-align:center;font-size:82px;line-height:1.28;font-weight:900;color:#202939;letter-spacing:0;">
      双编码器排序百万文档<br/>需要 464,000 维，自回归 LLM 只需 512 维
    </h1>

    <div style="position:absolute;left:330px;top:390px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,#eaf4ff 0%,rgba(234,244,255,.82) 50%,transparent 71%);"></div>
    ${seededDots(960, 710, 770, 370)}

    <svg style="position:absolute;left:0;top:0;width:2752px;height:1536px;" viewBox="0 0 2752 1536">
      <defs>
        <marker id="arrow" markerWidth="26" markerHeight="26" refX="21" refY="13" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M4,4 L22,13 L4,22 Z" fill="#7c838c"/>
        </marker>
      </defs>
      <line x1="1280" y1="760" x2="1715" y2="760" stroke="#7c838c" stroke-width="5" marker-end="url(#arrow)"/>
    </svg>

    ${matrix}

    <div style="position:absolute;left:430px;top:1210px;width:620px;text-align:center;font-size:72px;line-height:1;font-weight:900;color:#202939;">464,000 维</div>
    <div style="position:absolute;left:1790px;top:1210px;width:520px;text-align:center;font-size:72px;line-height:1;font-weight:900;color:#202939;">512 维</div>
    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}

function oldTacticTile(x, y, label, icon) {
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:176px;height:176px;border-radius:12px;background:#eef3fb;border:1px solid #e2e8f3;box-shadow:0 12px 24px rgba(105,132,170,.08);display:flex;align-items:center;justify-content:center;flex-direction:column;color:#7b8798;">
    <div style="position:absolute;left:26px;top:26px;width:124px;height:124px;border-top:8px solid rgba(160,171,190,.38);transform:rotate(45deg);"></div>
    <div style="font-size:48px;line-height:1;z-index:1;">${icon}</div>
    <div style="margin-top:12px;font-size:20px;font-weight:800;text-align:center;line-height:1.1;z-index:1;">${label}</div>
    <div style="position:absolute;right:12px;bottom:8px;color:#9b83d9;font-size:46px;font-weight:900;">×</div>
  </div>`;
}

function featureNode(x, y, label, icon, color = "#8bb7e8", size = 210) {
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;border:5px solid ${color};background:rgba(247,251,255,.82);box-shadow:0 18px 50px rgba(109,154,210,.14);display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;">
    <div style="font-size:${Math.round(size * 0.22)}px;line-height:1;">${icon}</div>
    <div style="margin-top:12px;font-size:${Math.round(size * 0.09)}px;line-height:1.15;font-weight:900;color:#243147;">${label}</div>
  </div>`;
}

function featGeoCover() {
  const tiles = [
    ["指南针", "✧"],
    ["关键词", "#"],
    ["外链", "🔗"],
    ["问答页", "?"],
    ["速度", "⏱"],
    ["浅层输出", "OUT"],
    ["扩音", "📣"],
    ["移动端", "▯"],
    ["404", "404"],
  ];
  const tileHtml = tiles
    .map(([label, icon], index) => {
      if (index < 4) return oldTacticTile(82 + index * 204, 578, label, icon);
      return oldTacticTile(82 + (index - 4) * 168, 784, label, icon);
    })
    .join("");

  return `<div class="canvas">
    ${tileHtml}
    <h1 style="position:absolute;left:930px;top:548px;width:850px;margin:0;text-align:left;font-size:67px;line-height:1.17;font-weight:500;color:#1d2740;letter-spacing:0;">
      <span style="display:inline-block;border:4px solid #8cc9f0;border-radius:10px;background:#eef8ff;padding:0 12px;font-weight:900;">FeatGEO：</span>
      原始 9 种 GEO 策略<br/>为何在现代 AI 引擎上失效
    </h1>
    <div style="position:absolute;left:960px;top:796px;width:720px;font-size:38px;line-height:1.3;color:#596878;">新的优化方向正在转向特征级信号、实体信任与实时上下文。</div>

    <svg style="position:absolute;left:0;top:0;width:2752px;height:1536px;" viewBox="0 0 2752 1536">
      <defs>
        <marker id="arrowFeat" markerWidth="28" markerHeight="28" refX="22" refY="14" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M4,4 L24,14 L4,24 Z" fill="#8bb3e7"/>
        </marker>
      </defs>
      <path d="M842 872 C1140 960 1620 980 1938 842" fill="none" stroke="#9bbde8" stroke-width="7" marker-end="url(#arrowFeat)"/>
      <path d="M2050 410 C2098 552 2080 680 2050 793" fill="none" stroke="#94badf" stroke-width="4"/>
      <path d="M1998 895 C1932 1018 1846 1126 1770 1208" fill="none" stroke="#9fb4e8" stroke-width="4"/>
      <path d="M2188 858 C2350 852 2448 756 2516 666" fill="none" stroke="#9de0e6" stroke-width="4"/>
      <path d="M2198 928 C2374 960 2414 1100 2384 1240" fill="none" stroke="#9de0e6" stroke-width="4"/>
      <path d="M2055 920 C2068 1045 2130 1148 2190 1238" fill="none" stroke="#94badf" stroke-width="4"/>
    </svg>

    ${featureNode(1940, 656, "AI 特征", "AI", "#79b9f2", 230)}
    ${featureNode(1952, 264, "内容智能", "▣", "#a8b4ec", 238)}
    ${featureNode(2260, 402, "知识图谱", "◎", "#9edfe5", 230)}
    ${featureNode(2354, 678, "对话发现", "↗", "#a9b3eb", 230)}
    ${featureNode(2285, 1008, "自适应 UX", "▤", "#94cbe8", 222)}
    ${featureNode(1988, 1094, "实时信号", "↟", "#a2d7f0", 214)}
    ${featureNode(1806, 1015, "实体信任", "✓", "#afa7e8", 214)}

    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}

function geoResourcesCover() {
  return `<div class="canvas">
    <svg style="position:absolute;left:-130px;top:190px;width:820px;height:1040px;" viewBox="0 0 820 1040">
      <g stroke="#c9d1dd" stroke-width="6" fill="none">
        <path d="M120 70 C240 150 278 270 360 330 S560 388 628 470"/>
        <path d="M92 548 C230 468 345 502 510 610"/>
        <path d="M250 810 C370 704 494 706 642 612"/>
        <path d="M350 330 C312 492 350 620 430 762"/>
        <path d="M552 160 C445 292 390 390 348 548"/>
      </g>
      <circle cx="120" cy="70" r="58" fill="#a6bfe4"/>
      <circle cx="360" cy="330" r="90" fill="#9fb8de"/>
      <circle cx="92" cy="548" r="56" fill="#a7cde0"/>
      <circle cx="430" cy="762" r="74" fill="#b8aee1"/>
      <circle cx="642" cy="612" r="64" fill="#a8d5c7"/>
      <polygon points="552,98 622,138 622,218 552,258 482,218 482,138" fill="#c9bee8"/>
      <polygon points="320,690 390,730 390,810 320,850 250,810 250,730" fill="#c8bbe6"/>
    </svg>

    <h1 style="position:absolute;left:740px;right:600px;top:160px;margin:0;text-align:center;font-size:82px;line-height:1.12;font-weight:900;color:#08234b;">
      生成式引擎优化（GEO）
    </h1>
    <div style="position:absolute;left:720px;right:600px;top:390px;text-align:center;font-size:56px;font-weight:800;color:#5c9f9c;">2026 资源、课程与教程精选</div>

    <div style="position:absolute;left:1010px;top:632px;width:560px;height:185px;border-radius:22px;background:linear-gradient(135deg,#cfe4fb,#eaf3ff);box-shadow:0 24px 60px rgba(100,139,194,.18);padding:46px;">
      <div style="width:280px;height:18px;border-radius:999px;background:#68b4ad;"></div>
      <div style="width:460px;height:18px;border-radius:999px;background:#fff;margin-top:34px;"></div>
      <div style="width:320px;height:18px;border-radius:999px;background:#fff;margin-top:24px;"></div>
    </div>
    <div style="position:absolute;left:1160px;top:850px;width:610px;height:210px;border-radius:22px;background:linear-gradient(135deg,#bce0d4,#a7d5ca);box-shadow:0 24px 60px rgba(100,139,194,.18);padding:48px;">
      <div style="width:280px;height:18px;border-radius:999px;background:#5aa6a5;"></div>
      <div style="width:500px;height:18px;border-radius:999px;background:#fff;margin-top:34px;"></div>
      <div style="width:160px;height:18px;border-radius:999px;background:#fff;margin-top:24px;"></div>
      <div style="width:310px;height:18px;border-radius:999px;background:#fff;margin-top:24px;"></div>
    </div>
    <div style="position:absolute;left:1010px;top:1096px;width:560px;height:185px;border-radius:22px;background:linear-gradient(135deg,#d6cef0,#bfb4e4);box-shadow:0 24px 60px rgba(100,139,194,.18);padding:46px;">
      <div style="width:280px;height:18px;border-radius:999px;background:#68b4ad;"></div>
      <div style="width:460px;height:18px;border-radius:999px;background:#fff;margin-top:34px;"></div>
      <div style="width:320px;height:18px;border-radius:999px;background:#fff;margin-top:24px;"></div>
    </div>

    <svg style="position:absolute;left:1880px;top:600px;width:640px;height:640px;" viewBox="0 0 640 640">
      <circle cx="260" cy="260" r="205" fill="#dff0ff" stroke="#9fb9df" stroke-width="26"/>
      <circle cx="260" cy="260" r="152" fill="#f7fcff"/>
      <path d="M160 260 A100 100 0 0 1 260 160" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round"/>
      <rect x="424" y="414" width="120" height="260" rx="45" transform="rotate(-45 424 414)" fill="#9fb9df"/>
      <rect x="476" y="456" width="105" height="238" rx="40" transform="rotate(-45 476 456)" fill="#a8d8d1"/>
      <text x="322" y="252" text-anchor="middle" font-size="42" font-weight="900" fill="#8a9ddd">✦</text>
      <text x="405" y="320" text-anchor="middle" font-size="30" font-weight="900" fill="#8fcfc4">✦</text>
    </svg>

    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}

function roadmapStep(x, y, label, icon, color) {
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:230px;text-align:center;">
    <div style="width:176px;height:176px;margin:0 auto;border-radius:50%;border:20px solid ${color};background:#fff;box-shadow:0 28px 60px ${color}55;display:flex;align-items:center;justify-content:center;color:${color};font-size:66px;font-weight:900;">${icon}</div>
    <div style="margin-top:44px;font-size:33px;line-height:1.25;color:#172033;">${label}</div>
  </div>`;
}

function geoRoadmapCover() {
  return `<div class="canvas">
    <h1 style="position:absolute;left:0;right:0;top:185px;margin:0;text-align:center;font-size:126px;line-height:1;font-weight:900;color:#172033;">如何学习 GEO</h1>
    <div style="position:absolute;left:0;right:0;top:380px;text-align:center;font-size:70px;color:#5a8790;">面向 SEO 从业者的分步路线图</div>
    <div style="position:absolute;left:1324px;top:576px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,#cfeeea,transparent 70%);display:flex;align-items:center;justify-content:center;color:#75c8c4;font-size:88px;font-weight:900;transform:rotate(-45deg);">↗</div>
    <svg style="position:absolute;left:0;top:0;width:2752px;height:1536px;" viewBox="0 0 2752 1536">
      <path d="M690 904 H1010" stroke="#87b2df" stroke-width="9" stroke-linecap="round" stroke-dasharray="22 28"/>
      <path d="M1240 904 H1545" stroke="#76c4bf" stroke-width="9" stroke-linecap="round" stroke-dasharray="22 28"/>
      <path d="M1784 904 H2096" stroke="#8fcf99" stroke-width="9" stroke-linecap="round" stroke-dasharray="22 28"/>
    </svg>
    ${roadmapStep(410, 794, "1. 理解 GEO<br/>基础与意图", "⌕", "#8aaeea")}
    ${roadmapStep(960, 770, "2. 优化富结果<br/>与实体搜索", "◎", "#69c4c2")}
    ${roadmapStep(1515, 748, "3. 用好知识图谱<br/>与结构化数据", "▥", "#62c391")}
    ${roadmapStep(2078, 724, "4. 掌握 AI 驱动<br/>搜索与体验", "AI", "#b47bcf")}
    <div class="url">www.thegeocommunity.com</div>
  </div>`;
}
