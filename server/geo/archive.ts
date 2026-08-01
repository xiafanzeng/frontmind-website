import { createHash } from "node:crypto";
import { isIP } from "node:net";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { z } from "zod";

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_COUNT = 2500;
const MAX_DECLARED_UNCOMPRESSED_BYTES = 300 * 1024 * 1024;
const WEBSITE_LEAD_MAX_DECLARED_UNCOMPRESSED_BYTES = 220 * 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 12 * 1024 * 1024;
const MAX_SINGLE_TEXT_BYTES = 2 * 1024 * 1024;
const WEBSITE_LEAD_MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_COMPLETENESS_BYTES = 64 * 1024;
const MAX_CHECKSUM_MANIFEST_BYTES = 256 * 1024;
const MAX_PACKAGE_MANIFEST_BYTES = 512 * 1024;
const MAX_PUBLIC_SOURCE_URL_CHARACTERS = 4_000;
const MAX_ACQUISITION_COUNT = 10_000_000;
const MAX_COMPLETENESS_GAPS = 200;
const MAX_COMPRESSION_RATIO = 250;
const WEBSITE_LEAD_MAX_COMPRESSION_RATIO = 200;
const MAX_SECTION_MARKDOWN_CHARS = 180_000;
const MAX_SOURCES = 500;
const MAX_ASSETS = 240;
const MAX_SINGLE_ASSET_PREVIEW_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_ASSET_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_RASTER_DECODE_PIXELS = 40_000_000;
const MIN_KNOWLEDGE_LEAVES = 8;
const WEBSITE_LEAD_MAX_KNOWLEDGE_LEAVES = 56;
const WEBSITE_LEAD_MAX_FILES = 150;
const WEBSITE_LEAD_MAX_IMAGES = 48;
const WEBSITE_LEAD_MAX_DOCUMENTS = 22;
const WEBSITE_LEAD_MAX_NARRATIVE_CHARACTERS = 18_000;
const WEBSITE_LEAD_MIN_EVIDENCE_LEAF_CHARACTERS = 120;
const WEBSITE_LEAD_V2_MAX_NARRATIVE_CHARACTERS = 40_000;
const WEBSITE_LEAD_V2_MIN_GAP_CHARACTERS = 40;
const WEBSITE_LEAD_V2_MIN_SUPPORTED_OVERVIEW_CHARACTERS = 120;
const WEBSITE_LEAD_V2_MIN_SUPPORTED_LEAF_CHARACTERS = 60;
const WEBSITE_LEAD_MAX_OFFICIAL_PAGES = 120;
const WEBSITE_LEAD_MAX_WEB_QUERIES = 12;
const WEBSITE_LEAD_ALLOWED_EXTENSIONS = new Set([
  ".avif",
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".sha256",
  ".webp",
  ".xls",
  ".xlsx",
]);
const WEBSITE_LEAD_CONTENT_PREFIXES = [
  "01_company_overview/",
  "02_team/",
  "03_products/",
  "04_technology/",
  "05_manufacturing/",
  "06_industries/",
  "07_service/",
  "08_competitive_advantages/",
] as const;
const REQUIRED_ROOT_MARKDOWN_FILES = [
  "README.md",
  "00_knowledge_tree.md",
  "00_crawl_coverage_report.md",
  "00_web_intelligence_report.md",
  "00_source_index.md",
] as const;
const LEGACY_REQUIRED_ROOT_MARKDOWN_FILES = [
  "README.md",
  "00_knowledge_tree.md",
  "VALIDATION.md",
] as const;
const LEGACY_REQUIRED_REPORT_FILES = [
  "reports/01_full_web_intelligence_report.md",
  "reports/02_official_site_crawl_coverage.md",
  "reports/03_first_party_image_inventory.md",
  "reports/04_third_party_reference_asset_inventory.md",
  "reports/05_unresolved_verification_gaps.md",
  "references/source_index.md",
] as const;

const CUSTOMER_NARRATIVE_LEAKAGE_RULES = [
  {
    label: "过程性或批量填充表达",
    pattern:
      /补充说明|第\s*[一二三四五六七八九十百\d]+\s*个内容节点|本轮整理结果/i,
  },
  {
    label: "任务或采集过程",
    pattern:
      /本轮|本次(?:采集|任务|构建|处理|检索|核验)|本包|本知识库|抽取失败|采集失败|已核验|证据不足|未形成.{0,16}核验/i,
  },
  {
    label: "客户或采购建议",
    pattern:
      /(?:客户|采购方|读者|使用方|合作方).{0,12}(?:应|需|建议|可将)|仍应|采购(?:或|与)?合规审查|合规审查|正式尽调|不能仅凭|不宜(?:直接)?(?:转换|认定|视为)?|不能外推/i,
  },
  {
    label: "企业主张解释或模型推理",
    pattern:
      /这些内容属于企业自我定义|企业自我定义|对客户而言|可将其落实为|说明组织意图与品牌取向/i,
  },
] as const;

export function customerFacingNarrativeViolation(value: string) {
  const normalized = value.normalize("NFKC");
  return CUSTOMER_NARRATIVE_LEAKAGE_RULES.find(({ pattern }) =>
    pattern.test(normalized),
  )?.label;
}

const PackageEvidenceStatusSchema = z.enum([
  "verified_first_party",
  "verified_authoritative",
  "supported_third_party",
  "inferred",
  "needs_verification",
  "not_applicable",
]);

const PackageBranchIdSchema = z.enum([
  "01_company_overview",
  "02_team",
  "03_products",
  "04_technology",
  "05_manufacturing",
  "06_industries",
  "07_service",
  "08_competitive_advantages",
]);

const PackageAssetTypeSchema = z.enum([
  "brand_identity",
  "product_ui",
  "product_diagram",
  "case_photo",
  "team_photo",
  "environment_photo",
  "certificate_badge",
  "document_figure",
  "other",
]);

const PackageAssetDisplayRoleSchema = z.enum(["hero", "inline", "badge"]);
const PackageAssetSourceKindSchema = z.enum([
  "official_web",
  "official_document",
  "user_upload",
]);

const PackageDocumentSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    path: z.string().trim().min(1).max(600),
    kind: z.enum([
      "overview",
      "leaf",
      "evidence",
      "report",
      "index",
      "tree",
      "source_index",
      "readme",
    ]),
    title: z.string().trim().min(1).max(300),
    branchId: PackageBranchIdSchema.optional(),
    order: z.number().int().min(0).max(10_000).optional(),
    evidenceStatus: PackageEvidenceStatusSchema.optional(),
    sourceIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
      )
      .min(1)
      .max(64)
      .optional(),
    assetIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
      )
      .max(MAX_ASSETS)
      .optional(),
    customerVisible: z.boolean(),
  })
  .strict();

const PackageDocumentV2Schema = PackageDocumentSchema.extend({
  evidenceCharacters: z.number().int().min(0).max(300_000).optional(),
  dynamicMinimumCharacters: z.number().int().min(0).max(5_000).optional(),
  evidenceDocumentIds: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    )
    .max(128)
    .optional(),
  productFamilyIds: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    )
    .max(120)
    .optional(),
}).strict();

const PackageAssetSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
    path: z.string().trim().min(1).max(600),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.enum([
      "image/avif",
      "image/webp",
      "image/png",
      "image/jpeg",
      "image/gif",
    ]),
    bytes: z.number().int().min(1).max(MAX_SINGLE_ASSET_PREVIEW_BYTES),
    width: z.number().int().min(1).max(100_000),
    height: z.number().int().min(1).max(100_000),
    caption: z.string().trim().min(1).max(500),
    alt: z.string().trim().min(1).max(500).optional(),
    branchId: PackageBranchIdSchema,
    documentIds: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
      )
      .min(1)
      .max(64),
    sourcePageUrl: z
      .string()
      .max(MAX_PUBLIC_SOURCE_URL_CHARACTERS)
      .url()
      .refine((value) => Boolean(publicHttpUrl(value)), {
        message: "sourcePageUrl must be a public, credential-free HTTP(S) URL",
      })
      .optional(),
    sourceAssetUrl: z
      .string()
      .max(MAX_PUBLIC_SOURCE_URL_CHARACTERS)
      .url()
      .refine((value) => Boolean(publicHttpUrl(value)), {
        message: "sourceAssetUrl must be a public, credential-free HTTP(S) URL",
      })
      .optional(),
    sourceDocumentPath: z.string().trim().min(1).max(600).optional(),
    sourceKind: PackageAssetSourceKindSchema.optional(),
    ownership: z.enum(["first_party", "third_party", "unknown"]),
  })
  .strict();

const PackageAssetV2Schema = PackageAssetSchema.extend({
  assetType: PackageAssetTypeSchema,
  displayRole: PackageAssetDisplayRoleSchema,
}).strict();

const WebsiteLeadPackageManifestV1InputSchema = z
  .object({
    schemaVersion: z.literal(1),
    profile: z.literal("website-lead-v1"),
    documents: z
      .array(PackageDocumentSchema)
      .min(MIN_KNOWLEDGE_LEAVES)
      .max(WEBSITE_LEAD_MAX_FILES),
    assets: z.array(PackageAssetSchema).max(MAX_ASSETS),
    counts: z
      .object({
        totalFiles: z.number().int().min(1).max(MAX_ENTRY_COUNT),
        customerVisibleCharacters: z
          .number()
          .int()
          .min(0)
          .max(MAX_SECTION_MARKDOWN_CHARS),
        evidenceCharacters: z.number().int().min(0).max(300_000),
        packagedImages: z.number().int().min(0).max(MAX_ASSETS),
      })
      .strict(),
    imageSelection: z
      .object({
        eligibleFirstPartyImages: z.number().int().min(0).max(MAX_ASSETS),
        shortfallReason: z.string().trim().min(8).max(1_000).optional(),
      })
      .strict(),
  })
  .strict();

const WebsiteDisplayBranchIdSchema = z.enum([
  "company-identity",
  "team",
  "products-services",
  "core-capabilities",
  "customers-industries",
  "cooperation",
  "why-frontmind",
]);

const WebsiteContentAvailabilitySchema = z.enum([
  "complete",
  "limited_evidence",
  "needs_verification",
]);

const WebsiteLeadPackageManifestV2InputSchema = z
  .object({
    schemaVersion: z.literal(2),
    profile: z.literal("website-lead-v1"),
    documents: z
      .array(PackageDocumentV2Schema)
      .min(MIN_KNOWLEDGE_LEAVES + 7)
      .max(WEBSITE_LEAD_MAX_FILES),
    assets: z.array(PackageAssetV2Schema).max(MAX_ASSETS),
    counts: z
      .object({
        totalFiles: z.number().int().min(1).max(MAX_ENTRY_COUNT),
        customerVisibleCharacters: z
          .number()
          .int()
          .min(0)
          .max(WEBSITE_LEAD_V2_MAX_NARRATIVE_CHARACTERS),
        evidenceCharacters: z.number().int().min(0).max(300_000),
        packagedImages: z.number().int().min(0).max(MAX_ASSETS),
      })
      .strict(),
    branchEvidence: z
      .array(
        z
          .object({
            branchId: WebsiteDisplayBranchIdSchema,
            overviewDocumentId: z
              .string()
              .trim()
              .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
            contentStatus: WebsiteContentAvailabilitySchema,
            deduplicatedEvidenceCharacters: z
              .number()
              .int()
              .min(0)
              .max(300_000),
            dynamicOverviewMinimum: z.number().int().min(0).max(5_000),
            checkedSourceCount: z.number().int().min(0).max(10_000),
          })
          .strict(),
      )
      .length(7),
    imageSelection: z
      .object({
        status: z.enum(["target_met", "source_limited", "budget_limited"]),
        discoveredCandidateImages: z.number().int().min(0).max(10_000_000),
        inspectedCandidateImages: z.number().int().min(0).max(10_000_000),
        eligibleFirstPartyImages: z.number().int().min(0).max(MAX_ASSETS),
        rejectedCandidateImages: z.number().int().min(0).max(10_000_000),
        scannedSourcePages: z.number().int().nonnegative().max(10_000),
        discoveryMethods: z
          .array(
            z.enum([
              "img",
              "srcset_or_lazy",
              "picture",
              "css_background",
              "open_graph",
              "gallery",
              "official_document",
            ]),
          )
          .max(7),
        candidates: z
          .array(
            z
              .object({
                url: z
                  .string()
                  .max(MAX_PUBLIC_SOURCE_URL_CHARACTERS)
                  .url()
                  .refine((value) => Boolean(publicHttpUrl(value)), {
                    message:
                      "candidate URL must be a public, credential-free HTTP(S) URL",
                  })
                  .optional(),
                sourcePageUrl: z
                  .string()
                  .max(MAX_PUBLIC_SOURCE_URL_CHARACTERS)
                  .url()
                  .refine((value) => Boolean(publicHttpUrl(value)), {
                    message:
                      "candidate sourcePageUrl must be a public, credential-free HTTP(S) URL",
                  })
                  .optional(),
                sourceDocumentPath: z
                  .string()
                  .trim()
                  .min(1)
                  .max(600)
                  .optional(),
                sourceKind: PackageAssetSourceKindSchema.optional(),
                method: z.enum([
                  "img",
                  "srcset_or_lazy",
                  "picture",
                  "css_background",
                  "open_graph",
                  "gallery",
                  "official_document",
                ]),
                status: z.enum(["eligible", "rejected", "uninspected"]),
                assetId: z
                  .string()
                  .trim()
                  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/)
                  .optional(),
                rejectionReason: z.string().trim().min(8).max(500).optional(),
              })
              .strict(),
          )
          .max(1_000),
        productFamilies: z
          .array(
            z
              .object({
                id: z
                  .string()
                  .trim()
                  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
                name: z.string().trim().min(1).max(300),
                officialVisualFound: z.boolean(),
                checkedSources: z.number().int().min(0).max(10_000),
                assetIds: z
                  .array(
                    z
                      .string()
                      .trim()
                      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/),
                  )
                  .max(48),
                gapReason: z.string().trim().min(8).max(1_000).optional(),
              })
              .strict(),
          )
          .max(120),
        shortfallReason: z.string().trim().min(8).max(1_000).optional(),
      })
      .strict(),
  })
  .strict();

export const WebsiteLeadPackageManifestV3InputSchema =
  WebsiteLeadPackageManifestV2InputSchema.extend({
    schemaVersion: z.literal(3),
  }).strict();

const WebsiteLeadPackageManifestInputSchema = z.discriminatedUnion(
  "schemaVersion",
  [
    WebsiteLeadPackageManifestV1InputSchema,
    WebsiteLeadPackageManifestV2InputSchema,
    WebsiteLeadPackageManifestV3InputSchema,
  ],
);

const KnowledgeBaseEvaluatedAtSchema = z
  .union([
    z.string().datetime({ offset: true }),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }, "evaluatedAt must be a real calendar date"),
  ])
  .transform((value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value,
  );

const KnowledgeBaseCompletenessCountsInputSchema = z
  .object({
    totalLeaves: z
      .number()
      .int()
      .min(MIN_KNOWLEDGE_LEAVES)
      .max(MAX_ENTRY_COUNT),
    verifiedFirstParty: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    verifiedAuthoritative: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    supportedThirdParty: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    inferred: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    needsVerification: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    notApplicable: z.number().int().min(0).max(MAX_ENTRY_COUNT),
  })
  .strict()
  .superRefine((counts, context) => {
    const classifiedLeaves =
      counts.verifiedFirstParty +
      counts.verifiedAuthoritative +
      counts.supportedThirdParty +
      counts.inferred +
      counts.needsVerification +
      counts.notApplicable;
    if (classifiedLeaves !== counts.totalLeaves) {
      context.addIssue({
        code: "custom",
        path: ["totalLeaves"],
        message: "evidence status counts must sum to totalLeaves",
      });
    }
    if (counts.notApplicable >= counts.totalLeaves) {
      context.addIssue({
        code: "custom",
        path: ["notApplicable"],
        message: "at least one leaf must be applicable",
      });
    }
    if (
      counts.verifiedFirstParty +
        counts.verifiedAuthoritative +
        counts.supportedThirdParty ===
      0
    ) {
      context.addIssue({
        code: "custom",
        path: ["verifiedFirstParty"],
        message:
          "at least one leaf must have evidence-backed first-party, authoritative, or supported-third-party status",
      });
    }
  });

const KnowledgeBaseAcquisitionInputSchema = z
  .object({
    completed: z.number().int().min(0).max(MAX_ACQUISITION_COUNT),
    total: z.number().int().min(0).max(MAX_ACQUISITION_COUNT),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.completed > value.total) {
      context.addIssue({
        code: "custom",
        path: ["completed"],
        message: "completed acquisition count cannot exceed total",
      });
    }
  });

export const KnowledgeBaseCompletenessInputSchema = z
  .object({
    counts: KnowledgeBaseCompletenessCountsInputSchema,
    acquisition: z
      .object({
        officialPages: KnowledgeBaseAcquisitionInputSchema.optional(),
        images: KnowledgeBaseAcquisitionInputSchema.optional(),
        documents: KnowledgeBaseAcquisitionInputSchema.optional(),
        webQueries: KnowledgeBaseAcquisitionInputSchema.optional(),
      })
      .strict(),
    gaps: z.array(z.string().trim().min(1).max(500)).max(MAX_COMPLETENESS_GAPS),
    evaluatedAt: KnowledgeBaseEvaluatedAtSchema,
  })
  .strict();

const LegacyLeafEvidenceStatusSchema = z.enum([
  "first_party_claim",
  "verified",
  "needs_verification",
  "not_applicable",
]);

const LegacyKnowledgeBaseCompletenessInputSchema = z
  .object({
    companyName: z.string().trim().min(1).max(200),
    officialWebsite: z
      .string()
      .url()
      .refine(
        (value) => {
          const url = publicHttpUrl(value);
          return Boolean(url && new URL(url).protocol === "https:");
        },
        {
          message:
            "officialWebsite must be a public, credential-free HTTPS URL",
        },
      ),
    buildDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "buildDate must be YYYY-MM-DD")
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      }, "buildDate must be a real calendar date"),
    total_leaf_nodes: z
      .number()
      .int()
      .min(MIN_KNOWLEDGE_LEAVES)
      .max(MAX_ENTRY_COUNT),
    completed_leaf_nodes: z
      .number()
      .int()
      .min(MIN_KNOWLEDGE_LEAVES)
      .max(MAX_ENTRY_COUNT),
    needs_verification_nodes: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    not_applicable_nodes: z.number().int().min(0).max(MAX_ENTRY_COUNT),
    evidence_status_counts: z
      .object({
        first_party_claim: z.number().int().min(0).max(MAX_ENTRY_COUNT),
        verified: z.number().int().min(0).max(MAX_ENTRY_COUNT),
        needs_verification: z.number().int().min(0).max(MAX_ENTRY_COUNT),
        not_applicable: z.number().int().min(0).max(MAX_ENTRY_COUNT),
      })
      .strict(),
    completion_gate_passed: z.literal(true),
    leaves: z
      .array(
        z
          .object({
            node_id: z.string().trim().min(1).max(80),
            title: z.string().trim().min(1).max(300),
            path: z.string().trim().min(1).max(600),
            evidence_status: LegacyLeafEvidenceStatusSchema,
            source_ids: z
              .array(
                z
                  .string()
                  .trim()
                  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/),
              )
              .min(1)
              .max(32),
            has_markdown_content: z.literal(true),
            not_applicable_reasoned: z.boolean(),
          })
          .strict()
          .superRefine((leaf, context) => {
            if (
              leaf.not_applicable_reasoned !==
              (leaf.evidence_status === "not_applicable")
            ) {
              context.addIssue({
                code: "custom",
                path: ["not_applicable_reasoned"],
                message:
                  "not_applicable_reasoned must match not_applicable status",
              });
            }
          }),
      )
      .min(MIN_KNOWLEDGE_LEAVES)
      .max(MAX_ENTRY_COUNT),
    required_reports: z
      .array(z.string().trim().min(1).max(600))
      .length(LEGACY_REQUIRED_REPORT_FILES.length),
    validation_note: z.string().trim().min(1).max(2_000),
    package_constraints: z
      .object({
        no_html_deliverable: z.literal(true),
        no_interactive_research_webpage: z.literal(true),
        raw_evidence_scope: z.string().trim().min(1).max(2_000),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const statusCount =
      value.evidence_status_counts.first_party_claim +
      value.evidence_status_counts.verified +
      value.evidence_status_counts.needs_verification +
      value.evidence_status_counts.not_applicable;
    if (
      value.completed_leaf_nodes !== value.total_leaf_nodes ||
      value.leaves.length !== value.total_leaf_nodes ||
      statusCount !== value.total_leaf_nodes
    ) {
      context.addIssue({
        code: "custom",
        path: ["total_leaf_nodes"],
        message:
          "legacy leaf totals must be complete and internally consistent",
      });
    }
    const actualStatusCounts = {
      first_party_claim: 0,
      verified: 0,
      needs_verification: 0,
      not_applicable: 0,
    };
    for (const leaf of value.leaves) {
      actualStatusCounts[leaf.evidence_status] += 1;
    }
    for (const status of LegacyLeafEvidenceStatusSchema.options) {
      if (actualStatusCounts[status] !== value.evidence_status_counts[status]) {
        context.addIssue({
          code: "custom",
          path: ["evidence_status_counts", status],
          message: `legacy ${status} count does not match leaves`,
        });
      }
    }
    if (
      value.needs_verification_nodes !==
        value.evidence_status_counts.needs_verification ||
      value.not_applicable_nodes !== value.evidence_status_counts.not_applicable
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence_status_counts"],
        message: "legacy summary counts do not match evidence status counts",
      });
    }
    if (value.not_applicable_nodes >= value.total_leaf_nodes) {
      context.addIssue({
        code: "custom",
        path: ["not_applicable_nodes"],
        message: "at least one legacy leaf must be applicable",
      });
    }
    if (
      new Set(value.leaves.map((leaf) => leaf.node_id)).size !==
      value.leaves.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["leaves"],
        message: "legacy leaf node IDs must be unique",
      });
    }
    value.leaves.forEach((leaf, index) => {
      if (
        new Set(leaf.source_ids.map((sourceId) => sourceId.toUpperCase()))
          .size !== leaf.source_ids.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["leaves", index, "source_ids"],
          message: "legacy leaf source IDs must be unique",
        });
      }
    });
  });

type KnowledgeBaseCompletenessAcquisition = {
  officialPages?: { completed: number; total: number };
  images?: { completed: number; total: number };
  documents?: { completed: number; total: number };
  webQueries?: { completed: number; total: number };
};

export type KnowledgeBaseCompleteness = {
  score: number;
  label: string;
  basis: string;
  counts: {
    totalLeaves: number;
    applicableLeaves: number;
    verifiedFirstParty: number;
    verifiedAuthoritative: number;
    supportedThirdParty: number;
    inferred: number;
    needsVerification: number;
    notApplicable: number;
  };
  acquisition: KnowledgeBaseCompletenessAcquisition;
  gaps: string[];
  evaluatedAt?: string;
  caveat: string;
};

export type WebsiteLeadPackageManifest = z.infer<
  typeof WebsiteLeadPackageManifestInputSchema
>;
type WebsiteLeadPackageDocumentV2 = z.infer<typeof PackageDocumentV2Schema>;

export type KnowledgeBaseSectionLeaf = {
  id: string;
  title: string;
  markdown: string;
  status: "verified" | "inferred" | "needs_verification" | "not_applicable";
  assetIds: string[];
};

export type KnowledgeBaseValidationCategory =
  | "structure"
  | "media"
  | "content"
  | "unsafe";

export class KnowledgeBaseArchiveValidationError extends Error {
  readonly category: KnowledgeBaseValidationCategory;

  constructor(
    category: KnowledgeBaseValidationCategory,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "KnowledgeBaseArchiveValidationError";
    this.category = category;
  }
}

export type KnowledgeBaseManifest = {
  companyName: string;
  summary: string;
  generatedAt: string;
  reportMarkdown: string;
  packageManifestSha256?: string;
  archiveContractVersion?: 1 | 2 | 3;
  completeness?: KnowledgeBaseCompleteness;
  metrics: Array<{
    key: string;
    label: string;
    value: string | number;
    detail?: string;
  }>;
  sections: Array<{
    id: string;
    title: string;
    summary?: string;
    markdown: string;
    overviewMarkdown?: string;
    overviewDocumentId?: string;
    overviewAssetIds?: string[];
    assetIds?: string[];
    leaves?: KnowledgeBaseSectionLeaf[];
    evidenceCount: number;
    status: "verified" | "inferred" | "needs_verification" | "not_applicable";
    contentAvailability?:
      | "complete"
      | "limited_evidence"
      | "needs_verification";
  }>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    domain?: string;
    type: string;
    capturedAt?: string;
  }>;
  assets: Array<{
    id: string;
    name: string;
    sectionId?: string;
    type: string;
    source: string;
    zipPath: string;
    caption?: string;
    alt?: string;
    sha256?: string;
    mimeType?: string;
    bytes?: number;
    width?: number;
    height?: number;
    assetType?: z.infer<typeof PackageAssetTypeSchema>;
    displayRole?: z.infer<typeof PackageAssetDisplayRoleSchema>;
    documentIds?: string[];
    sourcePageUrl?: string;
    sourceAssetUrl?: string;
    ownership?: "first_party" | "third_party" | "unknown";
  }>;
  /** Server-only allowlist used to bind downstream evidence references. */
  evidencePaths: string[];
};

export type KnowledgeBaseAssetPreview = {
  id: string;
  bytes: Buffer;
  contentType: string;
  filename: string;
};

type BranchDefinition = {
  id: string;
  title: string;
  prefixes: readonly string[];
};

const canonicalBranchDefinitions: readonly BranchDefinition[] = [
  {
    id: "company-identity",
    title: "企业与品牌",
    prefixes: ["01_company_overview/"],
  },
  { id: "team", title: "团队与组织", prefixes: ["02_team/"] },
  { id: "products-services", title: "产品与服务", prefixes: ["03_products/"] },
  {
    id: "core-capabilities",
    title: "技术与交付",
    prefixes: ["04_technology/", "05_manufacturing/"],
  },
  {
    id: "customers-industries",
    title: "客户与行业",
    prefixes: ["06_industries/"],
  },
  {
    id: "cooperation",
    title: "服务与合作",
    prefixes: ["07_service/"],
  },
  {
    id: "why-frontmind",
    title: "可信优势",
    prefixes: ["08_competitive_advantages/"],
  },
] as const;

type LegacyCompletenessInput = z.infer<
  typeof LegacyKnowledgeBaseCompletenessInputSchema
>;
type LegacyLeafInput = LegacyCompletenessInput["leaves"][number];
type LegacyLeafEvidenceStatus = z.infer<typeof LegacyLeafEvidenceStatusSchema>;
type SourceEvidenceClass = "first_party" | "authoritative" | "third_party";
type LegacySourceRecord = {
  id: string;
  title: string;
  type: string;
  evidenceClass: SourceEvidenceClass;
  url?: string;
  rawReference?: string;
};

type ParsedKnowledgeBaseContract =
  | {
      kind: "canonical";
      completeness: KnowledgeBaseCompleteness;
      branches: readonly BranchDefinition[];
    }
  | {
      kind: "legacy-base";
      completeness: KnowledgeBaseCompleteness;
      branches: readonly BranchDefinition[];
      companyName: string;
      leavesByPath: Map<string, LegacyLeafInput>;
      sourceClasses: Map<string, SourceEvidenceClass>;
      sources: KnowledgeBaseManifest["sources"];
    };

export async function parseKnowledgeBaseArchive(
  input: Buffer,
  options: {
    companyName: string;
    generatedAt?: string;
    validationProfile?: "website-lead-v1";
    maxActualUncompressedBytes?: number;
  },
): Promise<KnowledgeBaseManifest> {
  try {
    return await parseKnowledgeBaseArchiveInternal(input, options);
  } catch (error) {
    if (error instanceof KnowledgeBaseArchiveValidationError) throw error;
    const normalized =
      error instanceof Error
        ? error
        : new Error("Knowledge-base archive validation failed");
    throw new KnowledgeBaseArchiveValidationError(
      classifyKnowledgeBaseValidationError(normalized.message),
      normalized.message,
      { cause: normalized },
    );
  }
}

async function parseKnowledgeBaseArchiveInternal(
  input: Buffer,
  options: {
    companyName: string;
    generatedAt?: string;
    /**
     * Apply the current website lead-generation package budgets. Omit this
     * for historical archives so previously accepted deliveries remain
     * readable under the broader safety-only parser limits.
     */
    validationProfile?: "website-lead-v1";
    /**
     * Optional deployment-side tightening for the streamed legacy checksum
     * pass. Values can only lower, never raise, the global safety ceiling.
     */
    maxActualUncompressedBytes?: number;
  },
): Promise<KnowledgeBaseManifest> {
  if (!input.length || input.length > MAX_ARCHIVE_BYTES) {
    throw new Error(
      "Knowledge-base archive is empty or exceeds the compressed size limit",
    );
  }

  const zip = await JSZip.loadAsync(input, {
    checkCRC32: false,
    createFolders: false,
  });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRY_COUNT)
    throw new Error("Knowledge-base archive contains too many files");
  const declaredUncompressedBytes = entries.reduce(
    (total, entry) => total + declaredEntrySize(entry),
    0,
  );
  if (declaredUncompressedBytes > MAX_DECLARED_UNCOMPRESSED_BYTES) {
    throw new Error(
      "Knowledge-base archive exceeds the uncompressed size limit",
    );
  }
  if (
    options.validationProfile === "website-lead-v1" &&
    declaredUncompressedBytes > WEBSITE_LEAD_MAX_DECLARED_UNCOMPRESSED_BYTES
  ) {
    throw new Error(
      "New website knowledge-base archive exceeds the 220 MB uncompressed size limit",
    );
  }
  for (const entry of entries) {
    const uncompressed = declaredEntrySize(entry);
    const compressed = declaredCompressedEntrySize(entry);
    if (
      uncompressed > 1024 * 1024 &&
      compressed > 0 &&
      uncompressed / compressed >
        (options.validationProfile === "website-lead-v1"
          ? WEBSITE_LEAD_MAX_COMPRESSION_RATIO
          : MAX_COMPRESSION_RATIO)
    ) {
      throw new Error("Knowledge-base archive has an unsafe compression ratio");
    }
  }

  const normalizedEntries = entries.map((entry) => ({
    entry,
    path: normalizeZipPath(
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string })
        .unsafeOriginalName || entry.name,
    ),
  }));
  const commonRoot = findCommonRoot(normalizedEntries.map((item) => item.path));
  const files = normalizedEntries
    .filter(({ entry }) => !entry.dir)
    .map(({ entry, path: entryPath }) => ({
      entry,
      path: stripRoot(entryPath, commonRoot),
    }))
    .filter(({ path: entryPath }) => Boolean(entryPath));
  const normalizedFileKeys = files.map((file) =>
    file.path.normalize("NFKC").toLowerCase(),
  );
  if (
    new Set(
      options.validationProfile === "website-lead-v1"
        ? normalizedFileKeys
        : files.map((file) => file.path),
    ).size !== files.length
  ) {
    throw new Error("Knowledge-base archive contains duplicate file paths");
  }
  if (options.validationProfile === "website-lead-v1") {
    for (const file of files) {
      const extension = path.posix.extname(file.path).toLowerCase();
      if (!WEBSITE_LEAD_ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error(
          `New website knowledge-base archive contains an unsupported file type: ${file.path}`,
        );
      }
      const permissions =
        typeof file.entry.unixPermissions === "number"
          ? file.entry.unixPermissions
          : Number.parseInt(String(file.entry.unixPermissions || ""), 8);
      if (
        Number.isFinite(permissions) &&
        (permissions & 0o170000) === 0o120000
      ) {
        throw new Error(
          `New website knowledge-base archive contains a symbolic link: ${file.path}`,
        );
      }
      if (
        ![".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(
          extension,
        ) &&
        declaredEntrySize(file.entry) > WEBSITE_LEAD_MAX_DOCUMENT_BYTES
      ) {
        throw new Error(
          `New website knowledge-base archive contains an oversized document: ${file.path}`,
        );
      }
    }
  }

  const markdownFiles = new Map<string, string>();
  let totalTextBytes = 0;
  for (const file of files) {
    if (!file.path.toLowerCase().endsWith(".md")) continue;
    if (declaredEntrySize(file.entry) > MAX_SINGLE_TEXT_BYTES) {
      throw new Error("Knowledge-base archive contains an oversized text file");
    }
    const bytes = await readZipEntryLimited(file.entry, MAX_SINGLE_TEXT_BYTES);
    totalTextBytes += bytes.byteLength;
    if (totalTextBytes > MAX_TOTAL_TEXT_BYTES)
      throw new Error("Knowledge-base archive text exceeds limit");
    markdownFiles.set(
      file.path,
      new TextDecoder("utf-8", { fatal: false }).decode(bytes),
    );
  }
  const contract = await parseKnowledgeBaseCompleteness(
    files,
    markdownFiles,
    normalizedActualByteLimit(options.maxActualUncompressedBytes),
  );
  const packageContract =
    options.validationProfile === "website-lead-v1"
      ? await parseWebsiteLeadPackageManifest(files)
      : undefined;
  const packageManifest = packageContract?.manifest;
  const completeness = contract.completeness;
  const branchDefinitions = contract.branches;

  const requiredMarkdownFiles =
    contract.kind === "canonical"
      ? REQUIRED_ROOT_MARKDOWN_FILES
      : [
          ...LEGACY_REQUIRED_ROOT_MARKDOWN_FILES,
          ...LEGACY_REQUIRED_REPORT_FILES,
        ];
  for (const filename of requiredMarkdownFiles) {
    const content = markdownFiles.get(filename);
    if (!content || content.trim().length < 8) {
      throw new Error(
        `Knowledge-base archive is missing required document ${filename}`,
      );
    }
  }
  if (!packageManifest || packageManifest.schemaVersion === 1) {
    validatePackagedLeafInventory(markdownFiles, contract);
  }
  if (options.validationProfile === "website-lead-v1") {
    await validateWebsiteLeadPackageBudgets(
      files,
      markdownFiles,
      contract,
      packageManifest!,
    );
  }
  for (const branch of branchDefinitions) {
    const branchHasContent = Array.from(markdownFiles.entries()).some(
      ([filename, content]) =>
        branch.prefixes.some((prefix) => filename.startsWith(prefix)) &&
        content.trim().length >= 8,
    );
    if (!branchHasContent) {
      throw new Error(
        `Knowledge-base archive is missing content for branch ${branch.title}`,
      );
    }
  }
  const readme = markdownFiles.get("README.md") || "";
  const knowledgeTree = markdownFiles.get("00_knowledge_tree.md") || "";
  const crawlReport =
    markdownFiles.get(
      contract.kind === "canonical"
        ? "00_crawl_coverage_report.md"
        : "reports/02_official_site_crawl_coverage.md",
    ) || "";
  const webReport =
    markdownFiles.get(
      contract.kind === "canonical"
        ? "00_web_intelligence_report.md"
        : "reports/01_full_web_intelligence_report.md",
    ) || "";
  const sourceIndex =
    markdownFiles.get(
      contract.kind === "canonical"
        ? "00_source_index.md"
        : "references/source_index.md",
    ) || "";
  const assetInventory =
    contract.kind === "legacy-base"
      ? [
          markdownFiles.get("reports/03_first_party_image_inventory.md"),
          markdownFiles.get(
            "reports/04_third_party_reference_asset_inventory.md",
          ),
        ]
          .filter(Boolean)
          .join("\n\n")
      : findByBasename(markdownFiles, "asset_inventory.md") ||
        findByBasename(markdownFiles, "reference_asset_inventory.md") ||
        "";
  if (contract.kind === "legacy-base" && uniqueUrls(sourceIndex).length === 0) {
    throw new Error(
      "Legacy knowledge-base source index contains no public source URL",
    );
  }

  const sections = branchDefinitions.map((branch) => {
    const branchEvidence =
      packageManifest && packageManifest.schemaVersion !== 1
        ? packageManifest.branchEvidence.find(
            (entry) => entry.branchId === branch.id,
          )
        : undefined;
    const branchDocuments = packageManifest
      ? packageManifest.documents
          .filter(
            (document) =>
              document.customerVisible &&
              document.branchId &&
              branch.prefixes.includes(`${document.branchId}/`),
          )
          .sort(
            (left, right) =>
              (left.order ?? Number.MAX_SAFE_INTEGER) -
                (right.order ?? Number.MAX_SAFE_INTEGER) ||
              left.path.localeCompare(right.path),
          )
      : undefined;
    const branchFiles = branchDocuments
      ? branchDocuments.map(
          (document) =>
            [
              document.path,
              customerDisplayMarkdown(markdownFiles.get(document.path) || ""),
            ] as const,
        )
      : Array.from(markdownFiles.entries()).filter(([filename]) =>
          branch.prefixes.some((prefix) => filename.startsWith(prefix)),
        );
    const markdown = branchFiles
      .map(([filename, content]) => {
        const publicMarkdown = stripLeadingMarkdownFrontmatter(content).trim();
        return `## ${
          titleFromMarkdown(publicMarkdown) || humanizeFilename(filename)
        }\n\n${publicMarkdown}`;
      })
      .join("\n\n---\n\n")
      .slice(0, MAX_SECTION_MARKDOWN_CHARS);
    const evidenceCount = uniqueUrls(markdown).length;
    const leafStatuses = branchDocuments
      ? branchDocuments.map((document) =>
          publicLeafEvidenceStatus(document.evidenceStatus),
        )
      : branchFiles.map(([filename, content]) =>
          publicLeafEvidenceStatus(
            canonicalStatusForPackagedLeaf(filename, content, contract),
          ),
        );
    const overviewDocument = branchDocuments?.find(
      (document) => document.kind === "overview",
    );
    const overviewMarkdown = overviewDocument
      ? customerDisplayMarkdown(markdownFiles.get(overviewDocument.path) || "")
      : undefined;
    const overviewAssetIds = overviewDocument?.assetIds || [];
    const leaves = branchDocuments
      ?.filter((document) => document.kind === "leaf")
      .map((document) => ({
        id: document.id,
        title: document.title,
        markdown: customerDisplayMarkdown(
          markdownFiles.get(document.path) || "",
        ),
        status: publicLeafEvidenceStatus(document.evidenceStatus),
        assetIds: document.assetIds || [],
      }));
    const assetIds = branchDocuments
      ? Array.from(
          new Set(
            branchDocuments.flatMap((document) => document.assetIds || []),
          ),
        )
      : undefined;
    return {
      id: branch.id,
      title: branch.title,
      summary:
        firstUsefulParagraph(overviewMarkdown || markdown) ||
        "暂无可展示摘要。",
      markdown:
        markdown ||
        `# ${branch.title}\n\n该分支未发现可写入内容，详见未核验缺口。`,
      ...(overviewMarkdown
        ? {
            overviewMarkdown,
            overviewDocumentId: overviewDocument?.id,
            overviewAssetIds,
          }
        : {}),
      ...(assetIds ? { assetIds } : {}),
      ...(leaves ? { leaves } : {}),
      evidenceCount,
      status: aggregateEvidenceStatus(leafStatuses),
      ...(branchEvidence
        ? { contentAvailability: branchEvidence.contentStatus }
        : {}),
    };
  });

  const sourceText = [sourceIndex, crawlReport, webReport].join("\n");
  const sources =
    contract.kind === "legacy-base"
      ? contract.sources
      : uniqueUrls(sourceText)
          .slice(0, MAX_SOURCES)
          .map((url, index) => {
            let domain = "";
            try {
              domain = new URL(url).hostname;
            } catch {
              // Keep the URL without a derived domain.
            }
            return {
              id: `source-${String(index + 1).padStart(3, "0")}`,
              title: sourceTitleNearUrl(sourceText, url) || domain || url,
              url,
              domain: domain || undefined,
              type: sourceType(url, sourceText),
              capturedAt: dateNearUrl(sourceText, url),
            };
          });

  const assets = packageManifest
    ? packageManifest.assets.map((asset) => ({
        id: asset.id,
        name: path.posix.basename(asset.path),
        sectionId: asset.branchId
          ? sectionIdForPackageBranchId(asset.branchId)
          : sectionIdForAssetPath(asset.path, branchDefinitions),
        type: "图片",
        source:
          asset.ownership === "first_party"
            ? "企业官网或企业资料"
            : asset.ownership === "third_party"
              ? "第三方参考素材（权属待核验）"
              : "权属待核验素材",
        zipPath: asset.path,
        caption: asset.caption,
        ...(asset.alt ? { alt: asset.alt } : {}),
        sha256: asset.sha256,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        ...("assetType" in asset ? { assetType: asset.assetType } : {}),
        ...("displayRole" in asset ? { displayRole: asset.displayRole } : {}),
        documentIds: asset.documentIds,
        ...(asset.sourcePageUrl ? { sourcePageUrl: asset.sourcePageUrl } : {}),
        ...(asset.sourceAssetUrl
          ? { sourceAssetUrl: asset.sourceAssetUrl }
          : {}),
        ownership: asset.ownership,
      }))
    : files
        .filter((file) => isAssetPath(file.path))
        .slice(0, MAX_ASSETS)
        .map((file, index) => ({
          id: `asset-${String(index + 1).padStart(3, "0")}`,
          name: path.posix.basename(file.path),
          sectionId: sectionIdForAssetPath(file.path, branchDefinitions),
          type: assetType(file.path),
          source: file.path.includes("10_reference_assets/")
            ? "第三方参考素材（权属待核验）"
            : "企业官网或企业资料",
          zipPath: file.path,
        }));

  const reportMarkdown = [
    readme && `# 知识库总览\n\n${readme.trim()}`,
    knowledgeTree && `# 知识树\n\n${knowledgeTree.trim()}`,
    crawlReport && `# 官网抓取覆盖报告\n\n${crawlReport.trim()}`,
    webReport && `# 全网企业情报报告\n\n${webReport.trim()}`,
    sourceIndex && `# 来源索引\n\n${sourceIndex.trim()}`,
    assetInventory && `# 素材索引\n\n${assetInventory.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 500_000);

  const contentMarkdownCount =
    contract.kind === "legacy-base"
      ? contract.leavesByPath.size
      : Array.from(markdownFiles.keys()).filter(
          (filename) => !path.posix.basename(filename).startsWith("00_"),
        ).length;
  const crawledPages = metricFromReport(crawlReport, [
    /(?:发现|discovered)[^\n|]{0,20}(?:页面|pages?)[^\d]{0,12}([\d,]+)/i,
    /(?:页面|pages?)[^\n|]{0,20}(?:发现|discovered)[^\d]{0,12}([\d,]+)/i,
    /静态发现并解析的官网\s*URL[^\d\n]{0,20}([\d,]+)/i,
  ]);
  const downloadedImages = metricFromReport(crawlReport, [
    /(?:成功下载|downloaded)[^\n|]{0,20}(?:图片|images?)[^\d]{0,12}([\d,]+)/i,
    /(?:图片|images?)[^\n|]{0,20}(?:成功下载|downloaded)[^\d]{0,12}([\d,]+)/i,
    /第一方图片资源[^\d\n]{0,20}([\d,]+)/i,
  ]);

  return {
    companyName:
      (contract.kind === "legacy-base" ? contract.companyName : "") ||
      archiveCompanyName(commonRoot, readme) ||
      options.companyName,
    summary:
      firstUsefulParagraph(readme) || "摘要暂不可用，请查看知识树与来源索引。",
    generatedAt: options.generatedAt || new Date().toISOString(),
    reportMarkdown:
      reportMarkdown || "# 企业知识库\n\n完整内容已收录在知识库 ZIP 中。",
    ...(packageContract
      ? {
          packageManifestSha256: packageContract.sha256,
          archiveContractVersion: packageContract.manifest.schemaVersion,
        }
      : {}),
    ...(completeness ? { completeness } : {}),
    metrics: [
      {
        key: "branches",
        label: "知识分支",
        value: 7,
        detail: "自适应七分支企业知识树",
      },
      {
        key: "nodes",
        label: "知识文档",
        value: contentMarkdownCount,
        detail: "ZIP 内结构化 Markdown",
      },
      ...(completeness
        ? [
            {
              key: "completeness",
              label: "知识库完整度",
              value: `${completeness.score}%`,
              detail: "本次一次性抓取后的适用叶子证据覆盖",
            },
          ]
        : []),
      {
        key: "sources",
        label: "证据来源",
        value: sources.length,
        detail: "从来源索引与覆盖报告提取",
      },
      {
        key: "assets",
        label: "企业素材",
        value: assets.length,
        detail: "官网素材与第三方参考分区",
      },
      {
        key: "pages",
        label: "发现页面",
        value: crawledPages ?? "见报告",
        detail: "官网递归抓取覆盖",
      },
      {
        key: "images",
        label: "下载图片",
        value:
          packageManifest?.counts.packagedImages ??
          downloadedImages ??
          assets.length,
        detail: "按原始文件与资产清单统计",
      },
    ],
    sections,
    sources,
    assets,
    evidencePaths: files.map((file) => file.path),
  };
}

async function parseWebsiteLeadPackageManifest(
  files: Array<{ entry: JSZip.JSZipObject; path: string }>,
): Promise<{ manifest: WebsiteLeadPackageManifest; sha256: string }> {
  const file = files.find(
    ({ path: entryPath }) => entryPath === "00_package_manifest.json",
  );
  if (!file) {
    throw new Error(
      "New website knowledge-base archive is missing required 00_package_manifest.json",
    );
  }
  if (declaredEntrySize(file.entry) > MAX_PACKAGE_MANIFEST_BYTES) {
    throw new Error("Knowledge-base package manifest exceeds size limit");
  }
  try {
    const bytes = await readZipEntryLimited(
      file.entry,
      MAX_PACKAGE_MANIFEST_BYTES,
    );
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = WebsiteLeadPackageManifestInputSchema.parse(
      JSON.parse(text),
    );
    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      manifest: {
        ...parsed,
        documents: parsed.documents.map((document) => ({
          ...document,
          path: normalizeZipPath(document.path),
        })),
        assets: parsed.assets.map((asset) => ({
          ...asset,
          path: normalizeZipPath(asset.path),
        })),
      } as WebsiteLeadPackageManifest,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /Unsafe path|Path traversal/i.test(error.message)
    ) {
      throw error;
    }
    const detail =
      error instanceof z.ZodError
        ? `${error.issues[0]?.path.join(".") || "root"}: ${
            error.issues[0]?.message || "invalid value"
          }`
        : error instanceof Error
          ? error.message
          : "unknown validation error";
    throw new Error(
      `Knowledge-base package manifest is invalid: ${detail || "unknown validation error"}`,
    );
  }
}

async function parseKnowledgeBaseCompleteness(
  files: Array<{ entry: JSZip.JSZipObject; path: string }>,
  markdownFiles: Map<string, string>,
  maxActualUncompressedBytes: number,
): Promise<ParsedKnowledgeBaseContract> {
  const file = files.find(({ path: entryPath }) => {
    return entryPath === "00_completeness.json";
  });
  if (!file) {
    throw new Error(
      "Knowledge-base archive is missing required 00_completeness.json",
    );
  }
  if (declaredEntrySize(file.entry) > MAX_COMPLETENESS_BYTES) {
    throw new Error("Knowledge-base completeness manifest exceeds size limit");
  }

  try {
    const bytes = await readZipEntryLimited(file.entry, MAX_COMPLETENESS_BYTES);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const input: unknown = JSON.parse(text);
    const canonical = KnowledgeBaseCompletenessInputSchema.safeParse(input);
    if (canonical.success) {
      const { counts, acquisition, gaps, evaluatedAt } = canonical.data;
      return {
        kind: "canonical",
        completeness: buildKnowledgeBaseCompleteness(
          counts,
          acquisition,
          gaps,
          evaluatedAt,
        ),
        branches: canonicalBranchDefinitions,
      };
    }

    const legacy = LegacyKnowledgeBaseCompletenessInputSchema.safeParse(input);
    if (!legacy.success) {
      throw new Error(
        `Knowledge-base completeness manifest is invalid: ${
          canonical.error.issues[0]?.message ||
          legacy.error.issues[0]?.message ||
          "unknown validation error"
        }`,
      );
    }
    const legacyInput = legacy.data;
    validateLegacyRequiredReports(legacyInput.required_reports);
    if (files.some(({ path: entryPath }) => /\.html?$/i.test(entryPath))) {
      throw new Error(
        "Legacy knowledge-base archive violates its no-HTML package constraint",
      );
    }
    const branches = legacyBranchDefinitions(legacyInput.leaves);
    const sourceIndex = markdownFiles.get("references/source_index.md") || "";
    const sourceRecords = parseLegacySourceRecords(sourceIndex);
    const sourceClasses = new Map(
      Array.from(sourceRecords.entries(), ([sourceId, record]) => [
        sourceId,
        record.evidenceClass,
      ]),
    );
    validateLegacySourceReferences(legacyInput, sourceRecords, files);
    await validateLegacyChecksumManifest(files, maxActualUncompressedBytes);

    const leavesByPath = new Map<string, LegacyLeafInput>();
    const counts = {
      totalLeaves: legacyInput.total_leaf_nodes,
      verifiedFirstParty: 0,
      verifiedAuthoritative: 0,
      supportedThirdParty: 0,
      inferred: 0,
      needsVerification: 0,
      notApplicable: 0,
    };
    for (const leaf of legacyInput.leaves) {
      const normalizedPath = normalizeZipPath(leaf.path);
      if (leavesByPath.has(normalizedPath)) {
        throw new Error(
          "Legacy knowledge-base completeness contains duplicate leaf paths",
        );
      }
      leavesByPath.set(normalizedPath, leaf);
      const canonicalStatus = canonicalLegacyEvidenceStatus(
        leaf,
        sourceClasses,
      );
      if (canonicalStatus === "verified_first_party") {
        counts.verifiedFirstParty += 1;
      } else if (canonicalStatus === "verified_authoritative") {
        counts.verifiedAuthoritative += 1;
      } else if (canonicalStatus === "supported_third_party") {
        counts.supportedThirdParty += 1;
      } else if (canonicalStatus === "needs_verification") {
        counts.needsVerification += 1;
      } else if (canonicalStatus === "not_applicable") {
        counts.notApplicable += 1;
      }
    }
    return {
      kind: "legacy-base",
      completeness: buildKnowledgeBaseCompleteness(
        counts,
        {},
        legacyInput.leaves
          .filter((leaf) => leaf.evidence_status === "needs_verification")
          .map((leaf) => leaf.title),
      ),
      branches,
      companyName: legacyInput.companyName,
      leavesByPath,
      sourceClasses,
      sources: Array.from(sourceRecords.values())
        .filter(
          (
            record,
          ): record is LegacySourceRecord & {
            url: string;
          } => Boolean(record.url),
        )
        .slice(0, MAX_SOURCES)
        .map((record) => ({
          id: `source-${record.id.toLowerCase()}`,
          title: record.title,
          url: record.url,
          domain: new URL(record.url).hostname,
          type: record.type,
        })),
    };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Knowledge-base completeness manifest is invalid");
  }
}

function buildKnowledgeBaseCompleteness(
  counts: {
    totalLeaves: number;
    verifiedFirstParty: number;
    verifiedAuthoritative: number;
    supportedThirdParty: number;
    inferred: number;
    needsVerification: number;
    notApplicable: number;
  },
  acquisition: KnowledgeBaseCompletenessAcquisition,
  gaps: string[],
  evaluatedAt?: string,
): KnowledgeBaseCompleteness {
  const applicableLeaves = counts.totalLeaves - counts.notApplicable;
  const supportedLeaves =
    counts.verifiedFirstParty +
    counts.verifiedAuthoritative +
    counts.supportedThirdParty;
  const score = Math.round((supportedLeaves / applicableLeaves) * 100);
  return {
    score,
    label: "当前知识库证据完整度",
    basis:
      "已取得一方、权威或可溯源第三方证据的适用叶子节点数 ÷ 适用叶子节点总数",
    counts: {
      ...counts,
      applicableLeaves,
    },
    acquisition,
    gaps: Array.from(new Set(gaps)),
    ...(evaluatedAt ? { evaluatedAt } : {}),
    caveat:
      "该比例仅反映本次一次性抓取后知识库叶子的证据覆盖，不代表整个互联网的信息已被穷尽，也不表示持续迭代进度。",
  };
}

function validateLegacyRequiredReports(requiredReports: string[]) {
  const normalized = requiredReports.map((entryPath) =>
    normalizeZipPath(entryPath),
  );
  if (
    new Set(normalized).size !== LEGACY_REQUIRED_REPORT_FILES.length ||
    LEGACY_REQUIRED_REPORT_FILES.some(
      (requiredPath) => !normalized.includes(requiredPath),
    )
  ) {
    throw new Error(
      "Legacy knowledge-base required_reports does not match the supported Base contract",
    );
  }
}

function legacyBranchDefinitions(
  leaves: LegacyLeafInput[],
): readonly BranchDefinition[] {
  const directoryByIndex = new Map<string, string>();
  for (const leaf of leaves) {
    const normalizedPath = normalizeZipPath(leaf.path);
    const match = normalizedPath.match(
      /^knowledge\/(0[1-7])_([^/]+)\/[^/]+\.md$/,
    );
    if (!match?.[1] || !match[2]) {
      throw new Error(
        "Legacy knowledge-base leaves must use seven numbered knowledge directories",
      );
    }
    const directory = `knowledge/${match[1]}_${match[2]}`;
    const previous = directoryByIndex.get(match[1]);
    if (previous && previous !== directory) {
      throw new Error(
        `Legacy knowledge-base branch ${match[1]} has conflicting directories`,
      );
    }
    directoryByIndex.set(match[1], directory);
  }
  const expectedIndexes = Array.from(
    { length: 7 },
    (_, index) => `0${index + 1}`,
  );
  if (
    directoryByIndex.size !== expectedIndexes.length ||
    expectedIndexes.some((index) => !directoryByIndex.has(index))
  ) {
    throw new Error(
      "Legacy knowledge-base archive must contain exactly seven user-view branches",
    );
  }
  return expectedIndexes.map((index) => {
    const directory = directoryByIndex.get(index)!;
    const rawTitle = directory.slice(`knowledge/${index}_`.length);
    const title = rawTitle.replace(/[_-]+/g, " ").trim();
    if (!title) {
      throw new Error(
        `Legacy knowledge-base branch ${index} has no usable title`,
      );
    }
    return {
      id: `knowledge-branch-${index}`,
      title,
      prefixes: [`${directory}/`],
    };
  });
}

function parseLegacySourceRecords(markdown: string) {
  const records = new Map<string, LegacySourceRecord>();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 4) continue;
    const sourceId = cells[0]
      ?.replace(/<a\s+id="[^"]+"><\/a>/gi, "")
      .trim()
      .toUpperCase();
    if (
      !sourceId ||
      sourceId === "ID" ||
      !/^[A-Z][A-Z0-9_-]{0,31}$/.test(sourceId)
    ) {
      continue;
    }
    if (records.has(sourceId)) {
      throw new Error(
        `Legacy knowledge-base source index contains duplicate ID ${sourceId}`,
      );
    }
    const sourceType = cells[1] || "";
    const title = cells[2] || "";
    const locator = cells[3] || "";
    if (!sourceType || !title || !locator) {
      throw new Error(
        `Legacy knowledge-base source ${sourceId} has an incomplete index row`,
      );
    }
    const evidenceClass: SourceEvidenceClass =
      /(?:第一方官网|本次采集元数据|first.party|crawl metadata)/i.test(
        sourceType,
      )
        ? "first_party"
        : /(?:独立官方机构|平台官方文档|政府|监管|认证|专利|authoritative|independent official|official documentation)/i.test(
              sourceType,
            )
          ? "authoritative"
          : "third_party";
    const url = uniqueUrls(locator)[0];
    let normalizedUrl: string | undefined;
    if (url) {
      const parsedUrl = new URL(url);
      if (
        !["http:", "https:"].includes(parsedUrl.protocol) ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        throw new Error(
          `Legacy knowledge-base source ${sourceId} has an unsafe URL`,
        );
      }
      normalizedUrl = parsedUrl.toString();
    }
    const rawReference = locator.match(/\]\((\.\.\/raw\/[^)\s]+)\)/)?.[1];
    if (!normalizedUrl && !rawReference) {
      throw new Error(
        `Legacy knowledge-base source ${sourceId} has no auditable locator`,
      );
    }
    records.set(sourceId, {
      id: sourceId,
      title,
      type: sourceType,
      evidenceClass,
      ...(normalizedUrl ? { url: normalizedUrl } : {}),
      ...(rawReference ? { rawReference } : {}),
    });
  }
  if (records.size === 0) {
    throw new Error(
      "Legacy knowledge-base source index contains no structured source rows",
    );
  }
  return records;
}

function validateLegacySourceReferences(
  input: LegacyCompletenessInput,
  sourceRecords: Map<string, LegacySourceRecord>,
  files: Array<{ entry: JSZip.JSZipObject; path: string }>,
) {
  const filePaths = new Set(files.map((file) => file.path));
  for (const leaf of input.leaves) {
    for (const sourceId of leaf.source_ids) {
      if (!sourceRecords.has(sourceId.toUpperCase())) {
        throw new Error(
          `Legacy knowledge-base leaf ${leaf.path} references unknown source ID ${sourceId}`,
        );
      }
    }
  }
  const publicSources = Array.from(sourceRecords.values()).filter(
    (record) => record.url,
  );
  const officialOrigin = new URL(input.officialWebsite).origin;
  for (const record of Array.from(sourceRecords.values())) {
    if (
      record.evidenceClass === "first_party" &&
      record.url &&
      new URL(record.url).origin !== officialOrigin
    ) {
      throw new Error(
        `Legacy knowledge-base first-party source ${record.id} does not match the declared official website`,
      );
    }
  }
  if (
    !publicSources.some(
      (record) => record.url && new URL(record.url).origin === officialOrigin,
    )
  ) {
    throw new Error(
      "Legacy knowledge-base source index does not include the declared official website",
    );
  }
  const rawReferences = Array.from(sourceRecords.values())
    .map((record) => record.rawReference)
    .filter((value): value is string => Boolean(value));
  if (rawReferences.length === 0) {
    throw new Error(
      "Legacy knowledge-base source index contains no packaged raw evidence references",
    );
  }
  for (const relativeReference of rawReferences) {
    const resolved = normalizeZipPath(
      path.posix.join("references", relativeReference),
    );
    if (!filePaths.has(resolved)) {
      throw new Error(
        `Legacy knowledge-base raw evidence reference is missing: ${resolved}`,
      );
    }
  }
}

function canonicalLegacyEvidenceStatus(
  leaf: LegacyLeafInput,
  sourceClasses: Map<string, SourceEvidenceClass>,
): LeafEvidenceStatus {
  if (leaf.evidence_status === "needs_verification") {
    return "needs_verification";
  }
  if (leaf.evidence_status === "not_applicable") return "not_applicable";
  const classes = leaf.source_ids.map((sourceId) => {
    const evidenceClass = sourceClasses.get(sourceId.toUpperCase());
    if (!evidenceClass) {
      throw new Error(
        `Legacy knowledge-base leaf ${leaf.path} has an unclassified source`,
      );
    }
    return evidenceClass;
  });
  if (leaf.evidence_status === "first_party_claim") {
    if (!classes.includes("first_party")) {
      throw new Error(
        `Legacy knowledge-base first-party claim ${leaf.path} has no first-party source`,
      );
    }
    return "verified_first_party";
  }
  if (classes.includes("authoritative")) return "verified_authoritative";
  if (classes.every((value) => value === "first_party")) {
    return "verified_first_party";
  }
  return "supported_third_party";
}

async function validateLegacyChecksumManifest(
  files: Array<{ entry: JSZip.JSZipObject; path: string }>,
  maxActualUncompressedBytes: number,
) {
  const filesByPath = new Map(files.map((file) => [file.path, file.entry]));
  const manifestEntry = filesByPath.get("MANIFEST.sha256");
  if (!manifestEntry) {
    throw new Error("Legacy knowledge-base archive is missing MANIFEST.sha256");
  }
  if (declaredEntrySize(manifestEntry) > MAX_CHECKSUM_MANIFEST_BYTES) {
    throw new Error(
      "Legacy knowledge-base checksum manifest exceeds size limit",
    );
  }
  const bytes = await readZipEntryLimited(
    manifestEntry,
    MAX_CHECKSUM_MANIFEST_BYTES,
  );
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const expectedHashes = new Map<string, string>();
  for (const line of text.trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64}) {2}(.+)$/i);
    if (!match?.[1] || !match[2]) {
      throw new Error(
        "Legacy knowledge-base checksum manifest has an invalid line",
      );
    }
    const entryPath = normalizeZipPath(match[2]);
    if (
      entryPath === "MANIFEST.sha256" ||
      entryPath === "VALIDATION.md" ||
      expectedHashes.has(entryPath)
    ) {
      throw new Error(
        "Legacy knowledge-base checksum manifest contains an invalid or duplicate path",
      );
    }
    expectedHashes.set(entryPath, match[1].toLowerCase());
  }
  const payloadPaths = files
    .map((file) => file.path)
    .filter(
      (entryPath) =>
        entryPath !== "MANIFEST.sha256" && entryPath !== "VALIDATION.md",
    );
  if (
    expectedHashes.size !== payloadPaths.length ||
    payloadPaths.some((entryPath) => !expectedHashes.has(entryPath))
  ) {
    throw new Error(
      "Legacy knowledge-base checksum manifest does not cover every payload file",
    );
  }
  const payloadPathSet = new Set(payloadPaths);
  let actualUncompressedBytes = 0;
  for (const { entry, path: entryPath } of files) {
    const remainingBytes = maxActualUncompressedBytes - actualUncompressedBytes;
    const measured = await sha256ZipEntry(entry, remainingBytes);
    actualUncompressedBytes += measured.byteLength;
    if (
      payloadPathSet.has(entryPath) &&
      measured.digest !== expectedHashes.get(entryPath)
    ) {
      throw new Error(
        `Legacy knowledge-base checksum mismatch for ${entryPath}`,
      );
    }
  }
}

function sha256ZipEntry(entry: JSZip.JSZipObject, maxBytes: number) {
  return new Promise<{ digest: string; byteLength: number }>(
    (resolve, reject) => {
      const hash = createHash("sha256");
      const stream = entry.nodeStream("nodebuffer");
      let received = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        stream.removeAllListeners();
        if ("destroy" in stream && typeof stream.destroy === "function") {
          stream.destroy();
        }
        reject(error);
      };
      stream.on("data", (value: Buffer | Uint8Array | string) => {
        if (settled) return;
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        if (received + chunk.byteLength > maxBytes) {
          fail(
            new Error(
              "Legacy knowledge-base actual uncompressed bytes exceed the safety limit",
            ),
          );
          return;
        }
        received += chunk.byteLength;
        hash.update(chunk);
      });
      stream.once("error", (error) =>
        fail(error instanceof Error ? error : new Error(String(error))),
      );
      stream.once("end", () => {
        if (settled) return;
        settled = true;
        resolve({ digest: hash.digest("hex"), byteLength: received });
      });
    },
  );
}

export async function extractKnowledgeBaseAssetPreviews(
  input: Buffer,
  manifest: KnowledgeBaseManifest,
): Promise<Map<string, KnowledgeBaseAssetPreview>> {
  if (!input.length || input.length > MAX_ARCHIVE_BYTES) {
    throw new Error(
      "Knowledge-base archive is empty or exceeds the compressed size limit",
    );
  }

  const zip = await JSZip.loadAsync(input, {
    checkCRC32: false,
    createFolders: false,
  });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRY_COUNT)
    throw new Error("Knowledge-base archive contains too many files");

  const normalizedEntries = entries.map((entry) => ({
    entry,
    path: normalizeZipPath(
      (entry as JSZip.JSZipObject & { unsafeOriginalName?: string })
        .unsafeOriginalName || entry.name,
    ),
  }));
  const commonRoot = findCommonRoot(normalizedEntries.map((item) => item.path));
  const entriesByPath = new Map(
    normalizedEntries
      .filter(({ entry }) => !entry.dir)
      .map(
        ({ entry, path: entryPath }) =>
          [stripRoot(entryPath, commonRoot), entry] as const,
      ),
  );

  const previews = new Map<string, KnowledgeBaseAssetPreview>();
  let totalBytes = 0;
  for (const asset of manifest.assets) {
    const contentType = rasterAssetContentType(asset.zipPath);
    if (!contentType) continue;
    const entry = entriesByPath.get(asset.zipPath);
    if (!entry) continue;
    const declaredBytes = declaredEntrySize(entry);
    if (
      declaredBytes > MAX_SINGLE_ASSET_PREVIEW_BYTES ||
      totalBytes + declaredBytes > MAX_TOTAL_ASSET_PREVIEW_BYTES
    ) {
      continue;
    }
    const bytes = await readZipEntryLimited(
      entry,
      MAX_SINGLE_ASSET_PREVIEW_BYTES,
    );
    if (!(await decodedRasterImageDimensions(bytes, contentType))) continue;
    if (totalBytes + bytes.byteLength > MAX_TOTAL_ASSET_PREVIEW_BYTES) break;
    totalBytes += bytes.byteLength;
    previews.set(asset.id, {
      id: asset.id,
      bytes,
      contentType,
      filename: asset.name,
    });
  }
  return previews;
}

type LeafEvidenceStatus =
  | "verified_first_party"
  | "verified_authoritative"
  | "supported_third_party"
  | "inferred"
  | "needs_verification"
  | "not_applicable";

function validatePackagedLeafInventory(
  markdownFiles: Map<string, string>,
  contract: ParsedKnowledgeBaseContract,
) {
  const completeness = contract.completeness;
  const leaves = Array.from(markdownFiles.entries()).filter(([filename]) =>
    contract.branches.some((branch) =>
      branch.prefixes.some((prefix) => filename.startsWith(prefix)),
    ),
  );
  if (leaves.length !== completeness.counts.totalLeaves) {
    throw new Error(
      "Knowledge-base packaged leaf count does not match 00_completeness.json",
    );
  }
  if (contract.kind === "legacy-base") {
    const packagedPaths = new Set(leaves.map(([filename]) => filename));
    if (
      contract.leavesByPath.size !== packagedPaths.size ||
      Array.from(contract.leavesByPath.keys()).some(
        (filename) => !packagedPaths.has(filename),
      )
    ) {
      throw new Error(
        "Legacy knowledge-base declared leaf paths do not match packaged leaves",
      );
    }
  }

  const actual: Record<LeafEvidenceStatus, number> = {
    verified_first_party: 0,
    verified_authoritative: 0,
    supported_third_party: 0,
    inferred: 0,
    needs_verification: 0,
    not_applicable: 0,
  };
  for (const [filename, markdown] of leaves) {
    if (markdown.trim().length < 8) {
      throw new Error(`Knowledge-base leaf ${filename} has no usable content`);
    }
    if (
      contract.kind === "legacy-base" &&
      stripLeadingMarkdownFrontmatter(markdown).trim().length < 8
    ) {
      throw new Error(
        `Legacy knowledge-base leaf ${filename} has no public content after frontmatter`,
      );
    }
    const status = canonicalStatusForPackagedLeaf(filename, markdown, contract);
    if (!status) {
      throw new Error(
        `Knowledge-base leaf ${filename} is missing an explicit evidence status`,
      );
    }
    actual[status] += 1;
  }

  const expected: Record<LeafEvidenceStatus, number> = {
    verified_first_party: completeness.counts.verifiedFirstParty,
    verified_authoritative: completeness.counts.verifiedAuthoritative,
    supported_third_party: completeness.counts.supportedThirdParty,
    inferred: completeness.counts.inferred,
    needs_verification: completeness.counts.needsVerification,
    not_applicable: completeness.counts.notApplicable,
  };
  for (const status of Object.keys(expected) as LeafEvidenceStatus[]) {
    if (actual[status] !== expected[status]) {
      throw new Error(
        `Knowledge-base leaf status ${status} does not match 00_completeness.json`,
      );
    }
  }
}

function websiteLeadV2OverviewMinimum(
  evidenceCharacters: number,
  branchId: z.infer<typeof WebsiteDisplayBranchIdSchema>,
) {
  if (evidenceCharacters === 0) return WEBSITE_LEAD_V2_MIN_GAP_CHARACTERS;
  const targetFloor = branchId === "products-services" ? 3_000 : 1_500;
  return Math.min(
    targetFloor,
    Math.max(
      WEBSITE_LEAD_V2_MIN_SUPPORTED_OVERVIEW_CHARACTERS,
      Math.ceil(evidenceCharacters * 0.25),
    ),
  );
}

function websiteLeadV2LeafMinimum(evidenceCharacters: number) {
  if (evidenceCharacters === 0) return WEBSITE_LEAD_V2_MIN_GAP_CHARACTERS;
  return Math.min(
    200,
    Math.max(
      WEBSITE_LEAD_V2_MIN_SUPPORTED_LEAF_CHARACTERS,
      Math.ceil(evidenceCharacters * 0.2),
    ),
  );
}

async function validateWebsiteLeadPackageBudgets(
  files: Array<{ entry: JSZip.JSZipObject; path: string }>,
  markdownFiles: Map<string, string>,
  contract: ParsedKnowledgeBaseContract,
  packageManifest: WebsiteLeadPackageManifest,
) {
  if (contract.kind !== "canonical") {
    throw new Error(
      "New website knowledge-base builds must use the canonical archive contract",
    );
  }
  if (files.length > WEBSITE_LEAD_MAX_FILES) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_FILES} files`,
    );
  }
  if (
    contract.completeness.counts.totalLeaves > WEBSITE_LEAD_MAX_KNOWLEDGE_LEAVES
  ) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_KNOWLEDGE_LEAVES} content leaves`,
    );
  }
  for (const prefix of WEBSITE_LEAD_CONTENT_PREFIXES) {
    const hasLeaf = Array.from(markdownFiles.entries()).some(
      ([filename, markdown]) =>
        filename.startsWith(prefix) && markdown.trim().length >= 8,
    );
    if (!hasLeaf) {
      throw new Error(
        `New website knowledge-base archive is missing a leaf under ${prefix}`,
      );
    }
  }
  if (files.some(({ path: entryPath }) => /\.html?$/i.test(entryPath))) {
    throw new Error(
      "New website knowledge-base archive must not package per-page HTML",
    );
  }

  const filesByPath = new Map(files.map((file) => [file.path, file.entry]));
  if (packageManifest.counts.totalFiles !== files.length) {
    throw new Error(
      "New website knowledge-base package manifest totalFiles does not match the ZIP",
    );
  }

  const documentIds = new Set<string>();
  const documentPaths = new Set<string>();
  for (const document of packageManifest.documents) {
    const normalizedDocumentPath = document.path
      .normalize("NFKC")
      .toLowerCase();
    if (
      documentIds.has(document.id) ||
      documentPaths.has(normalizedDocumentPath)
    ) {
      throw new Error(
        "New website knowledge-base package manifest contains duplicate document IDs or paths",
      );
    }
    documentIds.add(document.id);
    documentPaths.add(normalizedDocumentPath);
    if (!document.path.toLowerCase().endsWith(".md")) {
      throw new Error(
        `New website knowledge-base document ${document.path} is not Markdown`,
      );
    }
    if (!markdownFiles.has(document.path)) {
      throw new Error(
        `New website knowledge-base document ${document.path} is missing from the ZIP`,
      );
    }
  }
  if (
    documentPaths.size !== markdownFiles.size ||
    Array.from(markdownFiles.keys()).some(
      (entryPath) =>
        !documentPaths.has(entryPath.normalize("NFKC").toLowerCase()),
    )
  ) {
    throw new Error(
      "New website knowledge-base package manifest must inventory every Markdown document exactly once",
    );
  }
  const manifestDocumentsById = new Map(
    packageManifest.documents.map((document) => [document.id, document]),
  );
  const evidenceDocuments =
    packageManifest.schemaVersion !== 1
      ? packageManifest.documents.filter(
          (document) =>
            document.kind === "evidence" && !document.customerVisible,
        )
      : [];
  const evidenceCharactersById = new Map(
    evidenceDocuments.map((document) => [
      document.id,
      evidenceDocumentCharacterCount(markdownFiles.get(document.path) || ""),
    ]),
  );
  const evidenceContentHashes = new Map<string, string>();
  for (const document of evidenceDocuments) {
    const hash = normalizedEvidenceDocumentHash(
      markdownFiles.get(document.path) || "",
    );
    const duplicateDocumentId = evidenceContentHashes.get(hash);
    if (duplicateDocumentId) {
      throw new Error(
        `New website knowledge-base evidence documents ${duplicateDocumentId} and ${document.id} duplicate the same normalized content`,
      );
    }
    evidenceContentHashes.set(hash, document.id);
  }

  const contentPaths = new Set(
    Array.from(markdownFiles.keys()).filter((filename) =>
      WEBSITE_LEAD_CONTENT_PREFIXES.some((prefix) =>
        filename.startsWith(prefix),
      ),
    ),
  );
  const customerVisibleDocuments = packageManifest.documents.filter(
    (document) => document.customerVisible,
  );
  if (
    customerVisibleDocuments.length !== contentPaths.size ||
    customerVisibleDocuments.some(
      (document) => !contentPaths.has(document.path),
    ) ||
    packageManifest.documents.some(
      (document) =>
        contentPaths.has(document.path) && !document.customerVisible,
    )
  ) {
    throw new Error(
      "New website knowledge-base customer-visible documents must exactly match the 01–08 content leaves",
    );
  }
  const leafDocuments = customerVisibleDocuments.filter(
    (document) => document.kind === "leaf",
  );
  const overviewDocuments = customerVisibleDocuments.filter(
    (document) => document.kind === "overview",
  );
  if (packageManifest.schemaVersion !== 1) {
    if (
      leafDocuments.length < MIN_KNOWLEDGE_LEAVES ||
      leafDocuments.length > WEBSITE_LEAD_MAX_KNOWLEDGE_LEAVES
    ) {
      throw new Error(
        `New website knowledge-base must contain ${MIN_KNOWLEDGE_LEAVES}–${WEBSITE_LEAD_MAX_KNOWLEDGE_LEAVES} true leaf documents in addition to its overviews`,
      );
    }
    if (contract.completeness.counts.totalLeaves !== leafDocuments.length) {
      throw new Error(
        "New website knowledge-base completeness totalLeaves must count leaf documents only",
      );
    }
    for (const prefix of WEBSITE_LEAD_CONTENT_PREFIXES) {
      if (!leafDocuments.some((document) => document.path.startsWith(prefix))) {
        throw new Error(
          `New website knowledge-base archive is missing a true leaf under ${prefix}`,
        );
      }
    }
    const referencedEvidenceDocumentIds = new Set<string>();
    for (const document of customerVisibleDocuments) {
      const v2Document = document as WebsiteLeadPackageDocumentV2;
      const evidenceDocumentIds = v2Document.evidenceDocumentIds;
      if (
        !Array.isArray(evidenceDocumentIds) ||
        new Set(evidenceDocumentIds).size !== evidenceDocumentIds.length
      ) {
        throw new Error(
          `New website knowledge-base document ${document.path} must declare unique evidenceDocumentIds`,
        );
      }
      const actualEvidenceCharacters = evidenceDocumentIds.reduce(
        (total, evidenceDocumentId) => {
          const evidenceDocument =
            manifestDocumentsById.get(evidenceDocumentId);
          if (
            !evidenceDocument ||
            evidenceDocument.kind !== "evidence" ||
            evidenceDocument.customerVisible ||
            (packageManifest.schemaVersion !== 3
              ? evidenceDocument.branchId !== document.branchId
              : Boolean(evidenceDocument.branchId) &&
                evidenceDocument.branchId !== document.branchId) ||
            !evidenceCharactersById.has(evidenceDocumentId) ||
            !(document.sourceIds || []).some((sourceId) =>
              (evidenceDocument.sourceIds || []).includes(sourceId),
            )
          ) {
            throw new Error(
              `New website knowledge-base document ${document.path} references an invalid evidence document`,
            );
          }
          referencedEvidenceDocumentIds.add(evidenceDocumentId);
          return total + evidenceCharactersById.get(evidenceDocumentId)!;
        },
        0,
      );
      if (v2Document.evidenceCharacters !== actualEvidenceCharacters) {
        throw new Error(
          `New website knowledge-base document ${document.path} evidenceCharacters does not match its linked evidence documents`,
        );
      }
    }
    if (
      evidenceDocuments.some(
        (document) => !referencedEvidenceDocumentIds.has(document.id),
      )
    ) {
      throw new Error(
        "New website knowledge-base contains unlinked evidence documents",
      );
    }
  }

  const overviewCounts = new Map(
    canonicalBranchDefinitions.map((branch) => [branch.id, 0]),
  );
  const duplicateNarratives = new Map<string, string[]>();
  const duplicateTemplateParagraphs = new Map<string, string[]>();
  const narrativeSamples: Array<{ path: string; text: string }> = [];
  for (const document of customerVisibleDocuments) {
    const directory = document.path.split("/")[0];
    if (
      !document.branchId ||
      directory !== document.branchId ||
      !["overview", "leaf"].includes(document.kind) ||
      !document.evidenceStatus
    ) {
      throw new Error(
        `New website knowledge-base customer-visible document ${document.path} has invalid branch, kind, or evidence status metadata`,
      );
    }
    const markdown = markdownFiles.get(document.path) || "";
    const actualStatus = explicitLeafEvidenceStatus(markdown);
    if (actualStatus !== document.evidenceStatus) {
      throw new Error(
        `New website knowledge-base document ${document.path} evidence status does not match its Markdown`,
      );
    }
    const publicBranchId = sectionIdForPackageBranchId(document.branchId);
    if (!publicBranchId) {
      throw new Error(
        `New website knowledge-base document ${document.path} has an unknown branch`,
      );
    }
    if (document.kind === "overview") {
      overviewCounts.set(
        publicBranchId,
        (overviewCounts.get(publicBranchId) || 0) + 1,
      );
    }

    const narrativeText = narrativeTextForLeaf(markdown);
    if (meaningfulCharacterCount(narrativeText) >= 80) {
      narrativeSamples.push({ path: document.path, text: narrativeText });
    }
    if (
      !["needs_verification", "not_applicable"].includes(
        document.evidenceStatus,
      ) &&
      !(document.sourceIds || []).length
    ) {
      throw new Error(
        `New website knowledge-base evidence-bearing document ${document.path} has no source IDs`,
      );
    }
    if (packageManifest.schemaVersion === 1) {
      if (
        !["needs_verification", "not_applicable"].includes(
          document.evidenceStatus,
        ) &&
        meaningfulCharacterCount(narrativeText) <
          WEBSITE_LEAD_MIN_EVIDENCE_LEAF_CHARACTERS
      ) {
        throw new Error(
          `New website knowledge-base evidence-bearing document ${document.path} has fewer than ${WEBSITE_LEAD_MIN_EVIDENCE_LEAF_CHARACTERS} customer-visible characters`,
        );
      }
    } else if (document.kind === "leaf") {
      const v2Document = document as WebsiteLeadPackageDocumentV2;
      const evidenceCharacters = v2Document.evidenceCharacters;
      const declaredMinimum = v2Document.dynamicMinimumCharacters;
      if (
        evidenceCharacters === undefined ||
        declaredMinimum === undefined ||
        declaredMinimum !==
          (packageManifest.schemaVersion === 3
            ? 8
            : websiteLeadV2LeafMinimum(evidenceCharacters))
      ) {
        throw new Error(
          `New website knowledge-base leaf ${document.path} has an invalid evidence-adaptive minimum`,
        );
      }
      if (
        !["needs_verification", "not_applicable"].includes(
          document.evidenceStatus,
        ) &&
        evidenceCharacters === 0
      ) {
        throw new Error(
          `New website knowledge-base evidence-bearing leaf ${document.path} declares no supporting evidence`,
        );
      }
      if (meaningfulCharacterCount(narrativeText) < declaredMinimum) {
        throw new Error(
          `New website knowledge-base leaf ${document.path} is thinner than its evidence-adaptive minimum`,
        );
      }
    }
    if (
      /(?:第一方(?:原始)?快照|第一方页面摘录|原始快照|页面摘录)/i.test(
        narrativeText,
      )
    ) {
      throw new Error(
        `New website knowledge-base document ${document.path} uses a raw snapshot or page excerpt as customer-visible narrative`,
      );
    }
    const narrativeViolation = customerFacingNarrativeViolation(narrativeText);
    if (narrativeViolation) {
      throw new Error(
        `New website knowledge-base document ${document.path} contains customer-facing audit language or internal reasoning: ${narrativeViolation}`,
      );
    }
    const fingerprint = narrativeText
      .replace(/\d+/g, "#")
      .replace(/\s+/g, "")
      .trim();
    if (
      meaningfulCharacterCount(narrativeText) >=
      WEBSITE_LEAD_MIN_EVIDENCE_LEAF_CHARACTERS
    ) {
      const duplicates = duplicateNarratives.get(fingerprint) || [];
      duplicates.push(document.path);
      duplicateNarratives.set(fingerprint, duplicates);
    }
    for (const templateFingerprint of Array.from(
      narrativeTemplateFingerprints(narrativeText),
    )) {
      const duplicates =
        duplicateTemplateParagraphs.get(templateFingerprint) || [];
      duplicates.push(document.path);
      duplicateTemplateParagraphs.set(templateFingerprint, duplicates);
    }
  }
  for (const branch of canonicalBranchDefinitions) {
    if (overviewCounts.get(branch.id) !== 1) {
      throw new Error(
        `New website knowledge-base branch ${branch.title} must declare exactly one customer-visible overview document`,
      );
    }
  }
  if (
    packageManifest.schemaVersion !== 1 &&
    overviewDocuments.length !== canonicalBranchDefinitions.length
  ) {
    throw new Error(
      "New website knowledge-base must contain seven overviews in addition to its true leaves",
    );
  }
  if (packageManifest.schemaVersion !== 1) {
    const branchEvidenceIds = new Set(
      packageManifest.branchEvidence.map((entry) => entry.branchId),
    );
    if (
      branchEvidenceIds.size !== canonicalBranchDefinitions.length ||
      canonicalBranchDefinitions.some(
        (branch) =>
          !branchEvidenceIds.has(
            branch.id as z.infer<typeof WebsiteDisplayBranchIdSchema>,
          ),
      )
    ) {
      throw new Error(
        "New website knowledge-base branchEvidence must cover every display branch exactly once",
      );
    }
    const overviewById = new Map(
      overviewDocuments.map((document) => [document.id, document]),
    );
    for (const evidence of packageManifest.branchEvidence) {
      const overview = overviewById.get(evidence.overviewDocumentId);
      if (
        !overview ||
        !overview.branchId ||
        sectionIdForPackageBranchId(overview.branchId) !== evidence.branchId
      ) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} references an invalid overview`,
        );
      }
      const linkedEvidenceIds = new Set(
        customerVisibleDocuments
          .filter(
            (document) =>
              Boolean(document.branchId) &&
              sectionIdForPackageBranchId(document.branchId!) ===
                evidence.branchId,
          )
          .flatMap(
            (document) =>
              (document as WebsiteLeadPackageDocumentV2).evidenceDocumentIds ||
              [],
          ),
      );
      const actualBranchEvidenceCharacters = Array.from(
        linkedEvidenceIds,
      ).reduce(
        (total, evidenceDocumentId) =>
          total + (evidenceCharactersById.get(evidenceDocumentId) || 0),
        0,
      );
      if (
        evidence.deduplicatedEvidenceCharacters !==
        actualBranchEvidenceCharacters
      ) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} evidence count does not match linked evidence documents`,
        );
      }
      const expectedMinimum =
        packageManifest.schemaVersion === 3
          ? 0
          : websiteLeadV2OverviewMinimum(
              actualBranchEvidenceCharacters,
              evidence.branchId,
            );
      const declaredOverviewMinimum = (overview as WebsiteLeadPackageDocumentV2)
        .dynamicMinimumCharacters;
      if (
        evidence.dynamicOverviewMinimum !== expectedMinimum ||
        declaredOverviewMinimum !== expectedMinimum
      ) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} has an invalid evidence-adaptive overview minimum`,
        );
      }
      if (
        evidence.contentStatus === "needs_verification" &&
        evidence.deduplicatedEvidenceCharacters !== 0
      ) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} cannot discard available evidence as needs_verification`,
        );
      }
      if (
        evidence.contentStatus !== "needs_verification" &&
        evidence.deduplicatedEvidenceCharacters === 0
      ) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} cannot claim supported content without evidence`,
        );
      }
      const overviewCharacters = meaningfulCharacterCount(
        narrativeTextForLeaf(markdownFiles.get(overview.path) || ""),
      );
      if (overviewCharacters < expectedMinimum) {
        throw new Error(
          `New website knowledge-base branch ${evidence.branchId} overview is thinner than its evidence-adaptive minimum`,
        );
      }
    }
    const actualStatusCounts = {
      verifiedFirstParty: 0,
      verifiedAuthoritative: 0,
      supportedThirdParty: 0,
      inferred: 0,
      needsVerification: 0,
      notApplicable: 0,
    };
    const statusKey = {
      verified_first_party: "verifiedFirstParty",
      verified_authoritative: "verifiedAuthoritative",
      supported_third_party: "supportedThirdParty",
      inferred: "inferred",
      needs_verification: "needsVerification",
      not_applicable: "notApplicable",
    } as const;
    for (const leaf of leafDocuments) {
      actualStatusCounts[statusKey[leaf.evidenceStatus!]] += 1;
    }
    for (const key of Object.keys(actualStatusCounts) as Array<
      keyof typeof actualStatusCounts
    >) {
      if (contract.completeness.counts[key] !== actualStatusCounts[key]) {
        throw new Error(
          `New website knowledge-base leaf status ${key} does not match 00_completeness.json`,
        );
      }
    }
  }
  const repeatedNarrative = Array.from(duplicateNarratives.values()).find(
    (paths) => paths.length >= 3,
  );
  if (repeatedNarrative) {
    throw new Error(
      `New website knowledge-base repeats the same customer-visible narrative across ${repeatedNarrative.length} documents`,
    );
  }
  const repeatedTemplateParagraph = Array.from(
    duplicateTemplateParagraphs.values(),
  ).find((paths) => paths.length >= 3);
  if (repeatedTemplateParagraph) {
    throw new Error(
      `New website knowledge-base repeats the same formal template paragraph across ${repeatedTemplateParagraph.length} documents`,
    );
  }
  for (let leftIndex = 0; leftIndex < narrativeSamples.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < narrativeSamples.length;
      rightIndex += 1
    ) {
      const left = narrativeSamples[leftIndex]!;
      const right = narrativeSamples[rightIndex]!;
      if (normalizedNarrativeSimilarity(left.text, right.text) >= 0.82) {
        throw new Error(
          `New website knowledge-base documents ${left.path} and ${right.path} repeat substantially similar customer-visible content`,
        );
      }
    }
  }

  const packageAssetIds = new Set<string>();
  const packageAssetPaths = new Set<string>();
  for (const asset of packageManifest.assets) {
    const normalizedAssetPath = asset.path.normalize("NFKC").toLowerCase();
    if (
      packageAssetIds.has(asset.id) ||
      packageAssetPaths.has(normalizedAssetPath)
    ) {
      throw new Error(
        "New website knowledge-base package manifest contains duplicate asset IDs or paths",
      );
    }
    packageAssetIds.add(asset.id);
    packageAssetPaths.add(normalizedAssetPath);
  }

  const imagePaths = files
    .map(({ path: entryPath }) => entryPath)
    .filter((entryPath) => isImagePath(entryPath));
  const unsupportedImage = imagePaths.find(
    (entryPath) => !rasterAssetContentType(entryPath),
  );
  if (unsupportedImage) {
    throw new Error(
      `New website knowledge-base image ${unsupportedImage} must be converted to AVIF, WebP, PNG, JPEG, or GIF`,
    );
  }
  const imageCount = imagePaths.length;
  if (imageCount > WEBSITE_LEAD_MAX_IMAGES) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_IMAGES} downloaded images`,
    );
  }
  if (
    packageAssetPaths.size !== imageCount ||
    imagePaths.some(
      (entryPath) =>
        !packageAssetPaths.has(entryPath.normalize("NFKC").toLowerCase()),
    )
  ) {
    throw new Error(
      "New website knowledge-base package manifest must inventory every packaged image exactly once",
    );
  }
  if (
    packageManifest.counts.packagedImages !== imageCount ||
    packageManifest.assets.length !== imageCount
  ) {
    throw new Error(
      "New website knowledge-base packagedImages count does not match the actual image files",
    );
  }
  const crawlReport = markdownFiles.get("00_crawl_coverage_report.md") || "";
  const reportedDownloadedImages = metricFromReport(crawlReport, [
    /(?:成功下载|已下载|已保存|保存并打包|downloaded|packaged|saved)[^\n|]{0,30}(?:图片|图像|images?|assets?)[^\d]{0,12}([\d,]+)/i,
    /(?:图片|图像|images?|assets?)[^\n|]{0,30}(?:成功下载|已下载|已保存|保存并打包|downloaded|packaged|saved)[^\d]{0,12}([\d,]+)/i,
    /第一方图片资源[^\d\n|]{0,20}([\d,]+)/i,
  ]);
  if (
    reportedDownloadedImages !== undefined &&
    reportedDownloadedImages !== imageCount
  ) {
    throw new Error(
      "New website knowledge-base crawl report saved-image count does not match the actual packaged image files",
    );
  }
  if (packageManifest.schemaVersion !== 1) {
    const reportedDiscoveredImages = metricFromReport(crawlReport, [
      /(?:发现|discovered)[^\n|]{0,30}(?:图片|图像|images?|assets?)[^\d]{0,12}([\d,]+)/i,
      /(?:图片|图像|images?|assets?)[^\n|]{0,30}(?:发现|discovered)[^\d]{0,12}([\d,]+)/i,
    ]);
    if (
      reportedDiscoveredImages === undefined ||
      reportedDiscoveredImages !==
        packageManifest.imageSelection.discoveredCandidateImages
    ) {
      throw new Error(
        "New website knowledge-base crawl report discovered-image count does not match the candidate ledger",
      );
    }
  }

  const documentsById = new Map(
    packageManifest.documents.map((document) => [document.id, document]),
  );
  const assetsById = new Map(
    packageManifest.assets.map((asset) => [asset.id, asset]),
  );
  if (
    new Set(packageManifest.assets.map((asset) => asset.sha256)).size !==
    packageManifest.assets.length
  ) {
    throw new Error(
      "New website knowledge-base packaged images must be deduplicated by SHA-256",
    );
  }
  for (const document of packageManifest.documents) {
    for (const assetId of document.assetIds || []) {
      const asset = assetsById.get(assetId);
      if (!asset || !asset.documentIds.includes(document.id)) {
        throw new Error(
          `New website knowledge-base document ${document.path} references an unlinked asset ${assetId}`,
        );
      }
    }
  }
  for (const asset of packageManifest.assets) {
    if (!asset.sourcePageUrl && !asset.sourceDocumentPath) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} has no traceable source page or uploaded document`,
      );
    }
    if (asset.sourceKind === "official_web" && !asset.sourcePageUrl) {
      throw new Error(
        `New website knowledge-base web asset ${asset.path} has no public source page`,
      );
    }
    if (
      ["official_document", "user_upload"].includes(asset.sourceKind || "") &&
      (!asset.sourceDocumentPath || !filesByPath.has(asset.sourceDocumentPath))
    ) {
      throw new Error(
        `New website knowledge-base document asset ${asset.path} has no packaged source document`,
      );
    }
    if (asset.ownership !== "first_party") {
      throw new Error(
        `New website knowledge-base packaged image ${asset.path} must be a first-party asset; third-party references remain URL-only`,
      );
    }
    for (const documentId of asset.documentIds) {
      const document = documentsById.get(documentId);
      if (
        !document ||
        !document.customerVisible ||
        !(document.assetIds || []).includes(asset.id)
      ) {
        throw new Error(
          `New website knowledge-base asset ${asset.path} references an unknown or unlinked customer document`,
        );
      }
    }
    if (
      asset.branchId &&
      !asset.documentIds.some(
        (documentId) =>
          documentsById.get(documentId)?.branchId === asset.branchId,
      )
    ) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} is not linked to a document in its declared branch`,
      );
    }
    const entry = filesByPath.get(asset.path);
    if (!entry) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} is missing from the ZIP`,
      );
    }
    const expectedMimeType = rasterAssetContentType(asset.path);
    if (!expectedMimeType || expectedMimeType !== asset.mimeType) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} MIME type does not match its extension`,
      );
    }
    const bytes = await readZipEntryLimited(
      entry,
      MAX_SINGLE_ASSET_PREVIEW_BYTES,
    );
    const dimensions = await decodedRasterImageDimensions(
      bytes,
      asset.mimeType,
    );
    if (!dimensions) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} does not contain a valid ${asset.mimeType} image`,
      );
    }
    if (
      asset.width !== dimensions.width ||
      asset.height !== dimensions.height
    ) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} dimensions do not match the package manifest`,
      );
    }
    if (packageManifest.schemaVersion !== 1) {
      const v2Asset = asset as z.infer<typeof PackageAssetV2Schema>;
      const isBadgeType = ["brand_identity", "certificate_badge"].includes(
        v2Asset.assetType,
      );
      if (
        (v2Asset.displayRole === "badge" && !isBadgeType) ||
        (v2Asset.assetType === "certificate_badge" &&
          v2Asset.displayRole !== "badge")
      ) {
        throw new Error(
          `New website knowledge-base asset ${asset.path} has an invalid assetType/displayRole combination`,
        );
      }
      const semanticLabel =
        `${v2Asset.path} ${v2Asset.caption} ${v2Asset.alt || ""}`.normalize(
          "NFKC",
        );
      if (
        ["product_ui", "product_diagram", "case_photo"].includes(
          v2Asset.assetType,
        ) &&
        /(?:sprite|icon(?:s|font)?|favicon|logo[\s_-]*(?:wall|sheet|grid|collage)|装饰|背景图|图标集|标志墙|logo墙)/i.test(
          semanticLabel,
        )
      ) {
        throw new Error(
          `New website knowledge-base asset ${asset.path} is decorative or composite media masquerading as a product visual`,
        );
      }
      if (
        packageManifest.schemaVersion === 3 &&
        (dimensions.alphaCoverage < 0.15 ||
          (!isBadgeType && dimensions.entropy < 0.5))
      ) {
        throw new Error(
          `New website knowledge-base asset ${asset.path} has insufficient visible content density`,
        );
      }
      const meetsMinimum =
        v2Asset.displayRole === "hero"
          ? dimensions.width >= 1_200 && dimensions.height >= 600
          : v2Asset.displayRole === "badge"
            ? dimensions.width >= 256 && dimensions.height >= 256
            : dimensions.width >= 800 && dimensions.height >= 450;
      if (!meetsMinimum) {
        throw new Error(
          `New website knowledge-base asset ${asset.path} does not meet the ${v2Asset.displayRole} image quality minimum`,
        );
      }
    }
    if (bytes.byteLength !== asset.bytes) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} byte count does not match the package manifest`,
      );
    }
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
      throw new Error(
        `New website knowledge-base asset ${asset.path} SHA-256 does not match the package manifest`,
      );
    }
  }

  const documentCount = files.filter(({ path: entryPath }) =>
    isDocumentPath(entryPath),
  ).length;
  if (documentCount > WEBSITE_LEAD_MAX_DOCUMENTS) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_DOCUMENTS} packaged documents`,
    );
  }

  const acquisition = contract.completeness.acquisition;
  if (
    (acquisition.officialPages?.completed ?? 0) >
    WEBSITE_LEAD_MAX_OFFICIAL_PAGES
  ) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_OFFICIAL_PAGES} successfully parsed official pages`,
    );
  }
  if ((acquisition.images?.completed ?? 0) > WEBSITE_LEAD_MAX_IMAGES) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_IMAGES} validated image downloads`,
    );
  }
  if (
    acquisition.images?.completed === undefined ||
    acquisition.images.completed !== imageCount
  ) {
    throw new Error(
      "New website knowledge-base acquisition.images.completed does not match the actual packaged image count",
    );
  }
  const eligibleFirstPartyImages =
    packageManifest.imageSelection.eligibleFirstPartyImages;
  if (packageManifest.schemaVersion === 1) {
    if (acquisition.images.total < eligibleFirstPartyImages) {
      throw new Error(
        "New website knowledge-base eligible first-party image count exceeds the discovered image total",
      );
    }
    if (
      imageCount !== Math.min(eligibleFirstPartyImages, WEBSITE_LEAD_MAX_IMAGES)
    ) {
      throw new Error(
        "New website knowledge-base must package each eligible image up to the image ceiling",
      );
    }
  } else {
    const selection = packageManifest.imageSelection;
    if (
      acquisition.officialPages?.completed === undefined ||
      selection.scannedSourcePages !== acquisition.officialPages.completed
    ) {
      throw new Error(
        "New website knowledge-base image scan must cover every successfully parsed official page",
      );
    }
    const candidateKeys = new Set(
      selection.candidates.map(
        (candidate) =>
          candidate.url ||
          `${candidate.sourceDocumentPath || "unknown"}:${candidate.assetId || candidate.rejectionReason || candidate.status}`,
      ),
    );
    const eligibleCandidates = selection.candidates.filter(
      (candidate) => candidate.status === "eligible",
    );
    const rejectedCandidates = selection.candidates.filter(
      (candidate) => candidate.status === "rejected",
    );
    const uninspectedCandidates = selection.candidates.filter(
      (candidate) => candidate.status === "uninspected",
    );
    if (
      candidateKeys.size !== selection.candidates.length ||
      selection.discoveredCandidateImages !== selection.candidates.length ||
      selection.inspectedCandidateImages !==
        eligibleCandidates.length + rejectedCandidates.length ||
      selection.eligibleFirstPartyImages !== eligibleCandidates.length ||
      selection.rejectedCandidateImages !== rejectedCandidates.length ||
      selection.discoveredCandidateImages !==
        selection.inspectedCandidateImages + uninspectedCandidates.length ||
      acquisition.images.total !== selection.discoveredCandidateImages
    ) {
      throw new Error(
        "New website knowledge-base image discovery funnel does not match acquisition totals",
      );
    }
    if (
      selection.candidates.some(
        (candidate) =>
          (!candidate.url && !candidate.sourceDocumentPath) ||
          (!candidate.sourcePageUrl && !candidate.sourceDocumentPath) ||
          (candidate.sourceKind === "official_web" &&
            !candidate.sourcePageUrl) ||
          (["official_document", "user_upload"].includes(
            candidate.sourceKind || "",
          ) &&
            (!candidate.sourceDocumentPath ||
              !filesByPath.has(candidate.sourceDocumentPath))),
      )
    ) {
      throw new Error(
        "New website knowledge-base image candidate has no traceable web page or packaged source document",
      );
    }
    if (
      eligibleCandidates.some((candidate) => {
        const asset = candidate.assetId
          ? assetsById.get(candidate.assetId)
          : undefined;
        return (
          !asset ||
          asset.sourceAssetUrl !== candidate.url ||
          asset.sourcePageUrl !== candidate.sourcePageUrl ||
          asset.sourceDocumentPath !== candidate.sourceDocumentPath
        );
      }) ||
      rejectedCandidates.some(
        (candidate) =>
          candidate.assetId !== undefined || !candidate.rejectionReason,
      ) ||
      uninspectedCandidates.some(
        (candidate) =>
          candidate.assetId !== undefined ||
          candidate.rejectionReason !== undefined,
      )
    ) {
      throw new Error(
        "New website knowledge-base image candidate records do not match packaged assets or rejection states",
      );
    }
    if (
      packageManifest.assets.some(
        (asset) =>
          !eligibleCandidates.some(
            (candidate) => candidate.assetId === asset.id,
          ),
      )
    ) {
      throw new Error(
        "New website knowledge-base packaged image is missing from the candidate ledger",
      );
    }
    if (
      new Set(selection.discoveryMethods).size !==
      selection.discoveryMethods.length
    ) {
      throw new Error(
        "New website knowledge-base must not repeat image discovery methods",
      );
    }
    const expectedPackagedImages = Math.min(
      eligibleFirstPartyImages,
      WEBSITE_LEAD_MAX_IMAGES,
    );
    if (imageCount !== expectedPackagedImages) {
      throw new Error(
        "New website knowledge-base omits eligible first-party images from the package",
      );
    }
    if (selection.status === "target_met") {
      if (
        uninspectedCandidates.length > 0 ||
        selection.shortfallReason ||
        !packageManifest.assets.some(
          (asset) =>
            (asset as z.infer<typeof PackageAssetV2Schema>).assetType ===
            "brand_identity",
        )
      ) {
        throw new Error(
          "New website knowledge-base cannot claim complete image coverage without inspected candidates, brand imagery, and zero shortfall",
        );
      }
    } else {
      if (!selection.shortfallReason) {
        throw new Error(
          "New website knowledge-base image shortfall must record a concrete reason",
        );
      }
      if (
        selection.status === "source_limited" &&
        selection.inspectedCandidateImages !==
          selection.discoveredCandidateImages
      ) {
        throw new Error(
          "New website knowledge-base source_limited status requires every discovered candidate to be inspected",
        );
      }
      if (
        selection.status === "budget_limited" &&
        selection.inspectedCandidateImages >=
          selection.discoveredCandidateImages
      ) {
        throw new Error(
          "New website knowledge-base cannot claim budget_limited without uninspected discovered candidates",
        );
      }
    }
    const productLeafFamilyIds = new Set(
      leafDocuments
        .filter((document) => document.branchId === "03_products")
        .flatMap(
          (document) =>
            (document as WebsiteLeadPackageDocumentV2).productFamilyIds || [],
        ),
    );
    if (
      leafDocuments.some(
        (document) =>
          document.branchId !== "03_products" &&
          (document as WebsiteLeadPackageDocumentV2).productFamilyIds !==
            undefined,
      ) ||
      leafDocuments
        .filter((document) => document.branchId === "03_products")
        .some((document) => {
          const productFamilyIds = (document as WebsiteLeadPackageDocumentV2)
            .productFamilyIds;
          return (
            !productFamilyIds?.length ||
            new Set(productFamilyIds).size !== productFamilyIds.length
          );
        })
    ) {
      throw new Error(
        "New website knowledge-base product leaves must declare productFamilyIds",
      );
    }
    const declaredProductFamilyIds = new Set(
      selection.productFamilies.map((family) => family.id),
    );
    if (
      declaredProductFamilyIds.size !== selection.productFamilies.length ||
      declaredProductFamilyIds.size !== productLeafFamilyIds.size ||
      Array.from(productLeafFamilyIds).some(
        (familyId) => !declaredProductFamilyIds.has(familyId),
      )
    ) {
      throw new Error(
        "New website knowledge-base product-family visual coverage does not match the product leaf inventory",
      );
    }
    for (const family of selection.productFamilies) {
      if (family.officialVisualFound) {
        if (
          family.assetIds.length === 0 ||
          family.assetIds.some((assetId) => {
            const asset = assetsById.get(assetId);
            const assetType = (
              asset as z.infer<typeof PackageAssetV2Schema> | undefined
            )?.assetType;
            return (
              !asset ||
              asset.branchId !== "03_products" ||
              !["product_ui", "product_diagram", "case_photo"].includes(
                assetType || "",
              )
            );
          })
        ) {
          throw new Error(
            `New website knowledge-base product family ${family.name} has an official visual but no valid packaged product asset`,
          );
        }
      } else if (family.assetIds.length > 0 || !family.gapReason) {
        throw new Error(
          `New website knowledge-base product family ${family.name} must record a concrete visual gap`,
        );
      }
    }
  }
  // The manifest combines up to ten user uploads with up to twelve linked
  // official documents, so the machine-readable completed count may be 22.
  if ((acquisition.documents?.completed ?? 0) > WEBSITE_LEAD_MAX_DOCUMENTS) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_DOCUMENTS} parsed documents`,
    );
  }
  if (
    (acquisition.webQueries?.completed ?? 0) > WEBSITE_LEAD_MAX_WEB_QUERIES ||
    (acquisition.webQueries?.total ?? 0) > WEBSITE_LEAD_MAX_WEB_QUERIES
  ) {
    throw new Error(
      `New website knowledge-base archive exceeds ${WEBSITE_LEAD_MAX_WEB_QUERIES} public-web queries`,
    );
  }

  const narrativeCharacters = websiteLeadNarrativeCharacters(
    markdownFiles,
    contract,
  );
  const maxNarrativeCharacters =
    packageManifest.schemaVersion !== 1
      ? WEBSITE_LEAD_V2_MAX_NARRATIVE_CHARACTERS
      : WEBSITE_LEAD_MAX_NARRATIVE_CHARACTERS;
  if (narrativeCharacters > maxNarrativeCharacters) {
    throw new Error(
      `New website knowledge-base narrative exceeds ${maxNarrativeCharacters} characters`,
    );
  }
  if (
    packageManifest.counts.customerVisibleCharacters !== narrativeCharacters
  ) {
    throw new Error(
      "New website knowledge-base customerVisibleCharacters does not match the formal narrative",
    );
  }
  const evidenceCharacters = packageEvidenceCharacters(
    packageManifest,
    markdownFiles,
  );
  if (packageManifest.counts.evidenceCharacters !== evidenceCharacters) {
    throw new Error(
      "New website knowledge-base evidenceCharacters does not match the packaged evidence documents",
    );
  }
}

function websiteLeadNarrativeCharacters(
  markdownFiles: Map<string, string>,
  contract: ParsedKnowledgeBaseContract,
) {
  return Array.from(markdownFiles.entries())
    .filter(([filename]) =>
      contract.branches.some((branch) =>
        branch.prefixes.some((prefix) => filename.startsWith(prefix)),
      ),
    )
    .reduce(
      (total, [, markdown]) => total + narrativeCharacterCountForLeaf(markdown),
      0,
    );
}

function narrativeCharacterCountForLeaf(markdown: string) {
  return meaningfulCharacterCount(narrativeTextForLeaf(markdown));
}

function customerDisplayMarkdown(markdown: string) {
  const retainedLines: string[] = [];
  const lines = stripLeadingMarkdownFrontmatter(markdown).split(/\r?\n/);
  let excludedSectionDepth: number | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const depth = heading[1]!.length;
      if (excludedSectionDepth !== undefined && depth <= excludedSectionDepth) {
        excludedSectionDepth = undefined;
      }
      if (
        /(?:原始|证据|引用|参考)?来源|素材清单|展示素材|机器清单|证据状态|状态头|sources?|references?|asset inventory/i.test(
          heading[2] || "",
        )
      ) {
        excludedSectionDepth = depth;
        continue;
      }
    }
    if (excludedSectionDepth !== undefined) continue;
    if (
      /^\s*>\s*.*(?:状态|status)\s*[:：].*(?:来源|source)\s*[:：]/i.test(
        line,
      ) ||
      /^\s*[-*]\s+(?:node_id|path|evidence_status|source_ids|status)\s*[:：]/i.test(
        line,
      )
    ) {
      continue;
    }
    retainedLines.push(line);
  }
  return retainedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function narrativeTextForLeaf(markdown: string) {
  const retainedLines: string[] = [];
  const lines = stripLeadingMarkdownFrontmatter(markdown).split(/\r?\n/);
  let excludedSectionDepth: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const depth = heading[1]!.length;
      if (excludedSectionDepth !== undefined && depth <= excludedSectionDepth) {
        excludedSectionDepth = undefined;
      }
      const title = heading[2] || "";
      if (
        /(?:原始|证据|引用|参考)?来源|素材清单|展示素材|机器清单|证据状态|状态头|sources?|references?|asset inventory/i.test(
          title,
        )
      ) {
        excludedSectionDepth = depth;
      }
      // Headings organize the display but are not narrative copy.
      continue;
    }
    if (excludedSectionDepth !== undefined) continue;
    if (
      /^\s*>\s*.*(?:状态|status)\s*[:：].*(?:来源|source)\s*[:：]/i.test(line)
    ) {
      continue;
    }
    if (
      /^\s*[-*]\s+(?:node_id|path|evidence_status|source_ids|status)\s*[:：]/i.test(
        line,
      )
    ) {
      continue;
    }
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      let tableIndex = index;
      while (
        tableIndex < lines.length &&
        (lines[tableIndex] || "").trim().startsWith("|")
      ) {
        tableLines.push(lines[tableIndex] || "");
        tableIndex += 1;
      }
      index = tableIndex - 1;
      const tableText = tableLines.join("\n");
      if (!/(?:来源|出处|证据链接|source|url)/i.test(tableText)) {
        retainedLines.push(tableText);
      }
      continue;
    }
    retainedLines.push(line);
  }

  const plainText = retainedLines
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)>\]]+/gi, "")
    .replace(/<[^>]+>/g, "");
  return plainText;
}

function meaningfulCharacterCount(value: string) {
  return Array.from(
    value
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

function normalizedNarrativeShingles(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, "")
    .replace(
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
      "",
    );
  const shingles = new Set<string>();
  for (let index = 0; index <= normalized.length - 5; index += 1) {
    shingles.add(normalized.slice(index, index + 5));
  }
  return shingles;
}

function normalizedNarrativeSimilarity(left: string, right: string) {
  const leftShingles = normalizedNarrativeShingles(left);
  const rightShingles = normalizedNarrativeShingles(right);
  if (!leftShingles.size || !rightShingles.size) return 0;
  let intersection = 0;
  leftShingles.forEach((shingle) => {
    if (rightShingles.has(shingle)) intersection += 1;
  });
  return intersection / (leftShingles.size + rightShingles.size - intersection);
}

function narrativeTemplateFingerprints(value: string) {
  return new Set(
    value
      .split(/\n\s*\n/)
      .map((paragraph) =>
        paragraph.replace(/\d+/g, "#").replace(/\s+/g, "").trim(),
      )
      .filter(
        (paragraph) =>
          meaningfulCharacterCount(paragraph) >=
          WEBSITE_LEAD_MIN_EVIDENCE_LEAF_CHARACTERS,
      ),
  );
}

function packageEvidenceCharacters(
  packageManifest: WebsiteLeadPackageManifest,
  markdownFiles: Map<string, string>,
) {
  return packageManifest.documents
    .filter((document) => !document.customerVisible)
    .reduce(
      (total, document) =>
        total +
        evidenceDocumentCharacterCount(markdownFiles.get(document.path) || ""),
      0,
    );
}

function evidenceDocumentCharacterCount(markdown: string) {
  const evidence = stripLeadingMarkdownFrontmatter(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)>\]]+/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s+/gm, "");
  return meaningfulCharacterCount(evidence);
}

function normalizedEvidenceDocumentHash(markdown: string) {
  const normalized = stripLeadingMarkdownFrontmatter(markdown)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)>\]]+/gi, "")
    .replace(/<[^>]+>/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
      "",
    );
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function canonicalStatusForPackagedLeaf(
  filename: string,
  markdown: string,
  contract: ParsedKnowledgeBaseContract,
): LeafEvidenceStatus | undefined {
  if (contract.kind === "canonical") {
    return explicitLeafEvidenceStatus(markdown);
  }
  const declaredLeaf = contract.leavesByPath.get(filename);
  if (!declaredLeaf) return undefined;
  const frontmatterPath = explicitLegacyLeafPath(markdown);
  if (!frontmatterPath || normalizeZipPath(frontmatterPath) !== filename) {
    throw new Error(
      `Legacy knowledge-base leaf ${filename} has a mismatched frontmatter path`,
    );
  }
  const frontmatterStatus = explicitLegacyLeafEvidenceStatus(markdown);
  if (
    !frontmatterStatus ||
    frontmatterStatus !== declaredLeaf.evidence_status
  ) {
    throw new Error(
      `Legacy knowledge-base leaf ${filename} status does not match 00_completeness.json`,
    );
  }
  const frontmatterSourceIds = explicitLegacyLeafSourceIds(markdown);
  const declaredSourceIds = Array.from(
    new Set(declaredLeaf.source_ids.map((sourceId) => sourceId.toUpperCase())),
  ).sort();
  if (
    !frontmatterSourceIds ||
    frontmatterSourceIds.length !== declaredSourceIds.length ||
    frontmatterSourceIds.some(
      (sourceId, index) => sourceId !== declaredSourceIds[index],
    )
  ) {
    throw new Error(
      `Legacy knowledge-base leaf ${filename} source IDs do not match 00_completeness.json`,
    );
  }
  return canonicalLegacyEvidenceStatus(declaredLeaf, contract.sourceClasses);
}

function explicitLeafEvidenceStatus(
  markdown: string,
): LeafEvidenceStatus | undefined {
  const match = markdown
    .slice(0, 1600)
    .match(
      /(?:证据\s*)?(?:状态|status)\s*[:：]\s*(?:\*\*|__)?\s*`?\s*(verified_first_party|verified_authoritative|supported_third_party|inferred|needs_verification|not_applicable)\b/i,
    );
  return match?.[1]?.toLowerCase() as LeafEvidenceStatus | undefined;
}

function explicitLegacyLeafEvidenceStatus(
  markdown: string,
): LegacyLeafEvidenceStatus | undefined {
  const match = markdown
    .slice(0, 1600)
    .match(
      /^evidence_status:\s*["']?(first_party_claim|verified|needs_verification|not_applicable)["']?\s*$/im,
    );
  return match?.[1]?.toLowerCase() as LegacyLeafEvidenceStatus | undefined;
}

function explicitLegacyLeafPath(markdown: string) {
  return markdown
    .slice(0, 1600)
    .match(/^path:\s*["']?([^"'\r\n]+)["']?\s*$/im)?.[1]
    ?.trim();
}

function explicitLegacyLeafSourceIds(markdown: string) {
  const encoded = markdown
    .slice(0, 1600)
    .match(/^source_ids:\s*(\[[^\r\n]*\])\s*$/im)?.[1];
  if (!encoded) return undefined;
  try {
    const sourceIds = z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/),
      )
      .min(1)
      .max(32)
      .parse(JSON.parse(encoded));
    return Array.from(
      new Set(sourceIds.map((sourceId) => sourceId.toUpperCase())),
    ).sort();
  } catch {
    return undefined;
  }
}

function normalizeZipPath(value: string) {
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/i.test(value)
  ) {
    throw new Error("Unsafe path in knowledge-base archive");
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("Path traversal in knowledge-base archive");
  }
  return normalized.replace(/^\.\//, "");
}

function normalizedActualByteLimit(value: number | undefined) {
  if (value === undefined) return MAX_DECLARED_UNCOMPRESSED_BYTES;
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("Actual uncompressed byte limit must be a positive number");
  }
  return Math.min(MAX_DECLARED_UNCOMPRESSED_BYTES, Math.floor(value));
}

function declaredEntrySize(entry: JSZip.JSZipObject) {
  const data = (
    entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: unknown; compressedSize?: unknown };
    }
  )._data;
  const size = Number(data?.uncompressedSize || 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function declaredCompressedEntrySize(entry: JSZip.JSZipObject) {
  const data = (
    entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: unknown; compressedSize?: unknown };
    }
  )._data;
  const size = Number(data?.compressedSize || 0);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

async function readZipEntryLimited(entry: JSZip.JSZipObject, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = entry.nodeStream("nodebuffer");
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      stream.removeAllListeners();
      if ("destroy" in stream && typeof stream.destroy === "function") {
        stream.destroy();
      }
      reject(error);
    };
    stream.on("data", (value: Buffer | Uint8Array | string) => {
      if (settled) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      received += chunk.length;
      if (received > maxBytes) {
        fail(
          new Error("Knowledge-base archive contains an oversized text file"),
        );
        return;
      }
      chunks.push(chunk);
    });
    stream.once("error", (error) =>
      fail(error instanceof Error ? error : new Error(String(error))),
    );
    stream.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, received));
    });
  });
}

function findCommonRoot(paths: string[]) {
  const roots = new Set(
    paths.filter(Boolean).map((value) => value.split("/")[0]),
  );
  return roots.size === 1 && paths.some((value) => value.includes("/"))
    ? Array.from(roots)[0]
    : "";
}

function stripRoot(value: string, root: string) {
  return root && value.startsWith(`${root}/`)
    ? value.slice(root.length + 1)
    : value;
}

function findByBasename(files: Map<string, string>, basename: string) {
  for (const [filename, content] of Array.from(files.entries())) {
    if (path.posix.basename(filename) === basename) return content;
  }
  return "";
}

function titleFromMarkdown(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function archiveCompanyName(commonRoot: string, readme: string) {
  const rootCompanyName =
    commonRoot.match(
      /^(.+?)(?:[\s_-]*(?:knowledge[\s_-]*base|企业知识库|知识库))$/i,
    )?.[1] || "";
  const candidates = [
    rootCompanyName,
    titleFromMarkdown(readme).replace(
      /(?:[\s_-]*(?:GEO[\s_-]*)?(?:企业)?知识库(?:总览)?)$/i,
      "",
    ),
  ];
  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/[_]+/g, " ")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 200);
    if (
      normalized &&
      !/^(?:knowledge[\s_-]*base|企业知识库|知识库)$/i.test(normalized) &&
      !/^https?:\/\//i.test(normalized)
    ) {
      return normalized;
    }
  }
  return "";
}

function humanizeFilename(filename: string) {
  return path.posix.basename(filename, ".md").replace(/[_-]+/g, " ");
}

function stripLeadingMarkdownFrontmatter(markdown: string) {
  return markdown.replace(
    /^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
    "",
  );
}

function firstUsefulParagraph(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((item) =>
      item
        .replace(/^#+\s+.*$/gm, "")
        .replace(/^>\s?/gm, "")
        .trim(),
    )
    .find(
      (item) =>
        item.length >= 18 &&
        !item.startsWith("|") &&
        !item.startsWith("```") &&
        !/^(?:最后更新|last updated|(?:证据\s*)?状态|evidence status)\s*[:：]/i.test(
          item,
        ),
    )
    ?.slice(0, 280);
}

function classifyKnowledgeBaseValidationError(
  message: string,
): KnowledgeBaseValidationCategory {
  if (
    /(?:unsafe|path traversal|compression ratio|actual uncompressed|compressed size limit|uncompressed size limit|checksum mismatch|credential|private-network|private network)/i.test(
      message,
    )
  ) {
    return "unsafe";
  }
  if (
    /(?:image|asset|packagedImages|MIME type|SHA-256|dimensions|shortfall)/i.test(
      message,
    )
  ) {
    return "media";
  }
  if (
    /(?:narrative|evidenceCharacters|evidence-adaptive|evidence-bearing|linked evidence|raw snapshot|page excerpt|customer-facing audit language|internal reasoning|repeats the same|repeated template|formal template|usable content|no evidence-backed leaf)/i.test(
      message,
    )
  ) {
    return "content";
  }
  return "structure";
}

function publicLeafEvidenceStatus(
  status: LeafEvidenceStatus | undefined,
): "verified" | "inferred" | "needs_verification" | "not_applicable" {
  if (status === "not_applicable") return "not_applicable";
  if (status === "needs_verification") return "needs_verification";
  if (status === "inferred") return "inferred";
  return "verified";
}

function aggregateEvidenceStatus(
  statuses: Array<
    "verified" | "inferred" | "needs_verification" | "not_applicable"
  >,
): "verified" | "inferred" | "needs_verification" | "not_applicable" {
  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "not_applicable")
  )
    return "not_applicable";
  if (statuses.includes("needs_verification")) return "needs_verification";
  if (statuses.includes("inferred")) return "inferred";
  return "verified";
}

function publicHttpUrl(value: string) {
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
    const topLevelDomain = labels[labels.length - 1] || "";
    if (
      !hostname ||
      hostname.length > 253 ||
      isIP(hostname) !== 0 ||
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

function uniqueUrls(value: string) {
  const urls = value.match(/https?:\/\/[^\s<>"'`|\])}，。；;]+/gi) || [];
  return Array.from(
    new Set(
      urls
        .map((url) => publicHttpUrl(url.replace(/[.,;:!?]+$/, "")))
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

function sourceTitleNearUrl(text: string, url: string) {
  const index = text.indexOf(url);
  if (index < 0) return "";
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
  return line
    .replace(url, "")
    .replace(/^\s*[-*|\d.)]+\s*/, "")
    .replace(/[|:：\s]+$/, "")
    .trim()
    .slice(0, 120);
}

function sourceType(url: string, context: string) {
  const nearby = context.slice(
    Math.max(0, context.indexOf(url) - 160),
    context.indexOf(url) + url.length + 160,
  );
  if (/官网|official|first.party/i.test(nearby)) return "企业官网";
  if (/专利|认证|registry|patent|certification|权威/i.test(nearby))
    return "权威记录";
  return "公开资料";
}

function dateNearUrl(text: string, url: string) {
  const index = text.indexOf(url);
  const nearby = text.slice(Math.max(0, index - 100), index + url.length + 100);
  return nearby.match(
    /\b20\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/,
  )?.[0];
}

function isAssetPath(filename: string) {
  return /\.(?:avif|webp|png|jpe?g|gif|svg|mp4|mov|webm|pdf|pptx?|docx?|xlsx?)$/i.test(
    filename,
  );
}

function isImagePath(filename: string) {
  return /\.(?:avif|webp|png|jpe?g|gif|svg)$/i.test(filename);
}

function isDocumentPath(filename: string) {
  return /\.(?:pdf|pptx?|docx?|xlsx?)$/i.test(filename);
}

function assetType(filename: string) {
  const extension = path.posix.extname(filename).slice(1).toLowerCase();
  if (["avif", "webp", "png", "jpg", "jpeg", "gif", "svg"].includes(extension))
    return "图片";
  if (["mp4", "mov", "webm"].includes(extension)) return "视频";
  return "文档";
}

function rasterAssetContentType(filename: string) {
  const extension = path.posix.extname(filename).slice(1).toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  return undefined;
}

function isExpectedRasterImage(bytes: Buffer, contentType: string) {
  if (contentType === "image/png")
    return (
      bytes.length >= 24 &&
      bytes
        .subarray(0, 8)
        .equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ) &&
      bytes.subarray(12, 16).toString("ascii") === "IHDR" &&
      bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0
    );
  if (contentType === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9
    );
  if (contentType === "image/gif")
    return (
      bytes.length >= 10 &&
      /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) &&
      bytes.readUInt16LE(6) > 0 &&
      bytes.readUInt16LE(8) > 0
    );
  if (contentType === "image/webp")
    return (
      bytes.length >= 16 &&
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP" &&
      bytes.readUInt32LE(4) + 8 <= bytes.length
    );
  if (contentType === "image/avif")
    return (
      bytes.length >= 16 &&
      bytes.subarray(4, 8).toString() === "ftyp" &&
      /^(?:avif|avis)$/.test(bytes.subarray(8, 12).toString())
    );
  return false;
}

async function decodedRasterImageDimensions(
  bytes: Buffer,
  contentType: string,
) {
  if (!isExpectedRasterImage(bytes, contentType)) return undefined;
  try {
    const options = {
      failOn: "warning" as const,
      limitInputPixels: MAX_RASTER_DECODE_PIXELS,
      pages: 1,
      sequentialRead: true,
    };
    const metadata = await sharp(bytes, options).metadata();
    const height = metadata.pageHeight || metadata.height;
    if (
      metadata.mediaType !== contentType ||
      !metadata.width ||
      !height ||
      metadata.width * height > MAX_RASTER_DECODE_PIXELS
    ) {
      return undefined;
    }
    // stats() traverses decoded pixels, so a valid header with truncated or
    // malformed image data cannot pass only by declaring plausible metadata.
    const stats = await sharp(bytes, options).stats();
    let alphaCoverage = 1;
    if (metadata.hasAlpha) {
      const preview = await sharp(bytes, options)
        .resize({
          width: 64,
          height: 64,
          fit: "inside",
          withoutEnlargement: true,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let visiblePixels = 0;
      for (
        let offset = 3;
        offset < preview.data.length;
        offset += preview.info.channels
      ) {
        if (preview.data[offset]! >= 16) visiblePixels += 1;
      }
      alphaCoverage =
        visiblePixels / Math.max(1, preview.info.width * preview.info.height);
    }
    return {
      width: metadata.width,
      height,
      alphaCoverage,
      entropy: stats.entropy,
    };
  } catch {
    return undefined;
  }
}

function sectionIdForPackageBranchId(
  branchId: z.infer<typeof PackageBranchIdSchema>,
) {
  return canonicalBranchDefinitions.find((branch) =>
    branch.prefixes.includes(`${branchId}/`),
  )?.id;
}

function sectionIdForAssetPath(
  filename: string,
  branchDefinitions: readonly BranchDefinition[],
) {
  const directBranch = branchDefinitions.find((branch) =>
    branch.prefixes.some((prefix) => filename.startsWith(prefix)),
  );
  if (directBranch) return directBranch.id;

  const normalized = filename.toLowerCase();
  const inferred: Array<[string, RegExp]> = [
    ["company-identity", /(?:brand|logo|company|office|企业|品牌|办公)/],
    ["team", /(?:team|founder|expert|staff|团队|创始|专家)/],
    [
      "products-services",
      /(?:product|service|device|solution|产品|服务|设备|方案)/,
    ],
    [
      "core-capabilities",
      /(?:technology|research|patent|lab|技术|科研|专利|实验室)/,
    ],
    [
      "customers-industries",
      /(?:customer|client|case|industry|scene|客户|案例|行业|场景)/,
    ],
    [
      "why-frontmind",
      /(?:award|certificate|advantage|honor|奖项|证书|优势|荣誉)/,
    ],
    [
      "cooperation",
      /(?:cooperation|contact|delivery|support|合作|联系|交付|支持)/,
    ],
  ];
  return inferred.find(([, pattern]) => pattern.test(normalized))?.[0];
}

function metricFromReport(markdown: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = markdown.match(pattern)?.[1];
    if (match) return Number(match.replace(/,/g, ""));
  }
  return undefined;
}
