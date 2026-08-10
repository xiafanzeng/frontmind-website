import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = process.cwd();
const SOURCE_ROOTS = [
  "client/src",
  "client/public",
  "server",
  "shared",
  "scripts",
  "src",
];
const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

type SourceFile = { file: string; source: string };

function productionSourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  const visit = (relativePath: string) => {
    const absolutePath = path.join(REPOSITORY_ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) return;
    const entry = fs.statSync(absolutePath);
    if (entry.isDirectory()) {
      if (
        relativePath.includes("node_modules") ||
        relativePath.includes("scripts/fixtures")
      ) {
        return;
      }
      for (const child of fs.readdirSync(absolutePath)) {
        visit(path.join(relativePath, child));
      }
      return;
    }
    if (
      !SOURCE_EXTENSIONS.has(path.extname(relativePath)) ||
      /\.(?:browser\.)?test\.[^.]+$/.test(relativePath) ||
      relativePath.includes("client/src/data/geoCommunity/communityPostsCn.")
    ) {
      return;
    }
    files.push({
      file: relativePath.split(path.sep).join("/"),
      source: fs.readFileSync(absolutePath, "utf8"),
    });
  };

  for (const root of SOURCE_ROOTS) visit(root);
  return files;
}

const files = productionSourceFiles();

const RESERVED_TARGETS = new Set(["_blank", "_self", "_parent", "_top"]);
const RUNTIME_SAFE_SPREAD_BOUNDARIES = new Map([
  [
    "client/src/components/SafeLink.tsx",
    { spread: "rest", target: "safeTarget", rel: "safeRel" },
  ],
  [
    "client/src/components/ui/pagination.tsx",
    { spread: "props", target: "safeTarget", rel: "safeRel" },
  ],
]);
const JAVASCRIPT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

type LinkPolicyFindings = {
  unsafeLinks: string[];
  namedTargets: string[];
  dynamicTargets: string[];
  spreadAnchors: string[];
  runtimeSafeSpreadExceptions: string[];
};

function emptyLinkPolicyFindings(): LinkPolicyFindings {
  return {
    unsafeLinks: [],
    namedTargets: [],
    dynamicTargets: [],
    spreadAnchors: [],
    runtimeSafeSpreadExceptions: [],
  };
}

function mergeLinkPolicyFindings(
  target: LinkPolicyFindings,
  source: LinkPolicyFindings,
) {
  for (const key of Object.keys(target) as Array<keyof LinkPolicyFindings>) {
    target[key].push(...source[key]);
  }
}

function scriptKindFor(file: string) {
  const extension = path.extname(file);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.TS;
}

function jsxAttributeName(
  attribute: ts.JsxAttribute,
  sourceFile: ts.SourceFile,
) {
  return attribute.name.getText(sourceFile);
}

function jsxLiteralAttributeValue(attribute: ts.JsxAttribute) {
  const initializer = attribute.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) {
    return undefined;
  }
  if (
    ts.isStringLiteral(initializer.expression) ||
    ts.isNoSubstitutionTemplateLiteral(initializer.expression)
  ) {
    return initializer.expression.text;
  }
  return undefined;
}

function jsxIdentifierAttributeValue(attribute: ts.JsxAttribute) {
  const initializer = attribute.initializer;
  if (
    !initializer ||
    !ts.isJsxExpression(initializer) ||
    !initializer.expression ||
    !ts.isIdentifier(initializer.expression)
  ) {
    return undefined;
  }
  return initializer.expression.text;
}

function describeJsxNode(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
) {
  const line =
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;
  const text = node.getText(sourceFile).replace(/\s+/g, " ");
  return `${file}:${line}: ${text.slice(0, 500)}`;
}

function isRuntimeSafeSpreadBoundary(
  file: string,
  sourceFile: ts.SourceFile,
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
) {
  const boundary = RUNTIME_SAFE_SPREAD_BOUNDARIES.get(file);
  if (!boundary || node.tagName.getText(sourceFile) !== "a") return false;
  const properties = Array.from(node.attributes.properties);
  const spreads = properties.filter(ts.isJsxSpreadAttribute);
  const targets = properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      jsxAttributeName(property, sourceFile) === "target",
  );
  const rels = properties.filter(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      jsxAttributeName(property, sourceFile) === "rel",
  );
  if (spreads.length !== 1 || targets.length !== 1 || rels.length !== 1) {
    return false;
  }
  const spread = spreads[0];
  const target = targets[0];
  const rel = rels[0];
  if (
    !ts.isIdentifier(spread.expression) ||
    spread.expression.text !== boundary.spread ||
    jsxIdentifierAttributeValue(target) !== boundary.target ||
    jsxIdentifierAttributeValue(rel) !== boundary.rel
  ) {
    return false;
  }
  const spreadIndex = properties.indexOf(spread);
  return (
    properties.indexOf(target) > spreadIndex &&
    properties.indexOf(rel) > spreadIndex
  );
}

function analyzeJsxLinkPolicy(file: string, source: string) {
  const findings = emptyLinkPolicyFindings();
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(file),
  );

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === "a" || tagName === "Link") {
        const description = describeJsxNode(file, sourceFile, node);
        if (isRuntimeSafeSpreadBoundary(file, sourceFile, node)) {
          findings.runtimeSafeSpreadExceptions.push(file);
        } else {
          const attributes = Array.from(node.attributes.properties);
          const spreads = attributes.filter(ts.isJsxSpreadAttribute);
          if (spreads.length > 0) findings.spreadAnchors.push(description);
          const targetAttributes = attributes.filter(
            (property): property is ts.JsxAttribute =>
              ts.isJsxAttribute(property) &&
              jsxAttributeName(property, sourceFile) === "target",
          );
          const relAttributes = attributes.filter(
            (property): property is ts.JsxAttribute =>
              ts.isJsxAttribute(property) &&
              jsxAttributeName(property, sourceFile) === "rel",
          );
          let hasBlankTarget = false;
          for (const targetAttribute of targetAttributes) {
            const target = jsxLiteralAttributeValue(targetAttribute);
            if (!target) {
              findings.dynamicTargets.push(description);
            } else if (!RESERVED_TARGETS.has(target)) {
              findings.namedTargets.push(`${description} [target=${target}]`);
            } else if (target === "_blank") {
              hasBlankTarget = true;
            }
          }
          if (hasBlankTarget) {
            const rel = relAttributes.length
              ? jsxLiteralAttributeValue(relAttributes.at(-1)!)
              : undefined;
            const relTokens = new Set((rel ?? "").toLowerCase().split(/\s+/));
            if (!relTokens.has("noopener") || !relTokens.has("noreferrer")) {
              findings.unsafeLinks.push(description);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function scanMarkupLinkOpeningTags(source: string) {
  const tags: Array<{ index: number; tag: string }> = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== "<") continue;
    const tagName = source.startsWith("<Link", start)
      ? "Link"
      : source.startsWith("<a", start)
        ? "a"
        : undefined;
    if (!tagName) continue;
    const boundary = source[start + tagName.length + 1];
    if (boundary && !/[\s/>]/.test(boundary)) continue;

    let quote: "'" | '"' | "`" | undefined;
    let escaped = false;
    let braceDepth = 0;
    for (
      let cursor = start + tagName.length + 1;
      cursor < source.length;
      cursor += 1
    ) {
      const character = source[cursor];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      } else if (character === "{") {
        braceDepth += 1;
      } else if (character === "}" && braceDepth > 0) {
        braceDepth -= 1;
      } else if (character === ">" && braceDepth === 0) {
        tags.push({ index: start, tag: source.slice(start, cursor + 1) });
        start = cursor;
        break;
      }
    }
  }
  return tags;
}

function analyzeMarkupLinkPolicy(file: string, source: string) {
  const findings = emptyLinkPolicyFindings();
  const targetPattern =
    /\btarget\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/i;
  const relPattern =
    /\brel\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*["']([^"']+)["']\s*\})/i;
  for (const { index, tag } of scanMarkupLinkOpeningTags(source)) {
    const line = source.slice(0, index).split("\n").length;
    const description = `${file}:${line}: ${tag.replace(/\s+/g, " ")}`;
    if (/\{\s*\.\.\./.test(tag)) findings.spreadAnchors.push(description);
    if (!/\btarget\s*=/.test(tag)) continue;
    const targetMatch = tag.match(targetPattern);
    const target = targetMatch?.[1] ?? targetMatch?.[2] ?? targetMatch?.[3];
    if (!target) {
      findings.dynamicTargets.push(description);
    } else if (!RESERVED_TARGETS.has(target)) {
      findings.namedTargets.push(`${description} [target=${target}]`);
    } else if (target === "_blank") {
      const relMatch = tag.match(relPattern);
      const rel = relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3] ?? "";
      const relTokens = new Set(rel.toLowerCase().split(/\s+/));
      if (!relTokens.has("noopener") || !relTokens.has("noreferrer")) {
        findings.unsafeLinks.push(description);
      }
    }
  }
  return findings;
}

describe("Website link governance", () => {
  it("keeps every literal new-tab template link isolated", () => {
    const findings = emptyLinkPolicyFindings();
    for (const { file, source } of files) {
      mergeLinkPolicyFindings(
        findings,
        JAVASCRIPT_EXTENSIONS.has(path.extname(file))
          ? analyzeJsxLinkPolicy(file, source)
          : analyzeMarkupLinkPolicy(file, source),
      );
    }

    expect(findings.runtimeSafeSpreadExceptions.sort()).toEqual(
      Array.from(RUNTIME_SAFE_SPREAD_BOUNDARIES.keys()).sort(),
    );
    expect(findings.spreadAnchors).toEqual([]);
    expect(findings.dynamicTargets).toEqual([]);
    expect(findings.namedTargets).toEqual([]);
    expect(findings.unsafeLinks).toEqual([]);
  });

  it("detects target and spread attributes after an arrow callback", () => {
    const findings = analyzeJsxLinkPolicy(
      "link-policy-fixture.tsx",
      '<a onClick={() => void 0} {...props} target="Dev订单证据">证据</a>',
    );

    expect(findings.spreadAnchors).toHaveLength(1);
    expect(findings.namedTargets).toHaveLength(1);
    expect(findings.namedTargets[0]).toContain("target=Dev订单证据");
  });

  it("does not truncate Astro attributes at expression operators", () => {
    const findings = analyzeMarkupLinkPolicy(
      "link-policy-fixture.astro",
      '<a on:click={() => value > 0} {...props} target="Dev订单证据">证据</a>',
    );

    expect(findings.spreadAnchors).toHaveLength(1);
    expect(findings.namedTargets).toHaveLength(1);
    expect(findings.namedTargets[0]).toContain("target=Dev订单证据");
  });

  it("forbids browser tab-group APIs", () => {
    const offenders = files
      .filter(({ source }) =>
        [
          /\bchrome\s*\.\s*(?:tabs|tabGroups)\b/,
          /\bchrome\s*\[\s*["'](?:tabs|tabGroups)["']\s*\]/,
          /\bbrowser\s*\.\s*tabs\b/,
        ].some((pattern) => pattern.test(source)),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("allowlists only the ZPAY pre-opened checkout window", () => {
    const openCalls = files.flatMap(({ file, source }) =>
      Array.from(source.matchAll(/\bwindow\s*\.\s*open\s*\(/g), (match) => ({
        file,
        context: source.slice(
          Math.max(0, (match.index ?? 0) - 400),
          (match.index ?? 0) + 400,
        ),
      })),
    );
    const targetAssignments = files.flatMap(({ file, source }) =>
      Array.from(
        source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*target\s*=\s*([^;\n]+)/g),
        (match) => ({
          file,
          receiver: match[1],
          value: match[2].trim(),
        }),
      ),
    );

    expect(openCalls).toHaveLength(1);
    expect(openCalls[0]?.file).toBe(
      "client/src/features/geo/GeoBuildExperience.tsx",
    );
    expect(openCalls[0]?.context).toContain("frontmind-zpay-");
    expect(openCalls[0]?.context).toMatch(
      /window\s*\.\s*open\s*\(\s*""\s*,\s*target\s*,/,
    );
    expect(targetAssignments).toEqual([
      {
        file: "client/src/features/geo/GeoBuildExperience.tsx",
        receiver: "form",
        value: "target",
      },
    ]);
  });
});
