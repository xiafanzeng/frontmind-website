import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type {
  BrokerFile,
  BrokerMonitorRun,
  BrokerTask,
  GeoMonitorPlatformId,
  GeoPresalesBroker,
} from "../server/geo/broker";
import type {
  GeoProjectOrder,
  GeoProjectOrderRegistry,
} from "../server/geo/provisioning";
import type {
  GeoPaymentCheckout,
  GeoPaymentCheckoutInput,
  GeoPaymentGateway,
  GeoPaymentReceipt,
  GeoPaymentStatus,
  GeoPaymentVerificationInput,
  GeoServicePaymentCheckoutInput,
  GeoServicePaymentVerificationInput,
} from "../server/geo/payment";
import { createGeoRouter } from "../server/geo/router";
import {
  GeoQuestionSetSchema,
  PRODUCT_QA_INTENTS,
  type GeoQuestion,
} from "../server/geo/schemas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const staticRoot = path.join(projectRoot, "dist", "public");
const candidatePath = path.resolve(
  process.argv[2] ||
    path.join(os.homedir(), "Downloads", "website-lead-candidate-v1.zip"),
);
const companyName =
  process.env.ACCEPTANCE_COMPANY?.trim() ||
  process.argv[3]?.trim() ||
  "本地验收企业";
const port = Number(process.env.PORT || 8888);
const realMonitorResultPath =
  process.env.ACCEPTANCE_REAL_MONITOR_RESULT?.trim() || "";
const realAssessmentResultPath =
  process.env.ACCEPTANCE_REAL_ASSESSMENT_RESULT?.trim() || "";
const realForecastResultPath =
  process.env.ACCEPTANCE_REAL_FORECAST_RESULT?.trim() || "";
const realApiEvidenceEnabled = Boolean(
  realMonitorResultPath && realAssessmentResultPath,
);
const realForecastEvidenceEnabled = Boolean(realForecastResultPath);

if (!fs.existsSync(candidatePath)) {
  throw new Error(`候选 ZIP 不存在：${candidatePath}`);
}
if (!fs.existsSync(path.join(staticRoot, "index.html"))) {
  throw new Error("缺少 dist/public，请先运行 pnpm build");
}

const candidateBytes = fs.readFileSync(candidatePath);
const candidateSha256 = crypto
  .createHash("sha256")
  .update(candidateBytes)
  .digest("hex");

function readSnapshot(pathname: string, label: string) {
  if (!pathname || !fs.existsSync(pathname)) {
    throw new Error(`${label}不存在：${pathname || "未配置"}`);
  }
  return JSON.parse(fs.readFileSync(pathname, "utf8")) as Record<
    string,
    unknown
  >;
}

function loadRealMonitorRun(): BrokerMonitorRun {
  const payload = readSnapshot(realMonitorResultPath, "真实监控结果");
  const run =
    payload.run && typeof payload.run === "object"
      ? (payload.run as Record<string, unknown>)
      : payload;
  if (
    run.status !== "completed" ||
    !Array.isArray(run.records) ||
    run.records.length !== 5
  ) {
    throw new Error("真实监控结果必须包含 5 条已完成回答");
  }
  return run as BrokerMonitorRun;
}

function loadRealAssessmentTask(): BrokerTask {
  const task = readSnapshot(realAssessmentResultPath, "真实评估结果");
  if (String(task.status || "").toLowerCase() !== "completed") {
    throw new Error("真实评估任务尚未完成");
  }
  return task as BrokerTask;
}

function loadRealForecastTask(): BrokerTask {
  const task = readSnapshot(realForecastResultPath, "真实优化预测结果");
  if (String(task.status || "").toLowerCase() !== "completed") {
    throw new Error("真实优化预测任务尚未完成");
  }
  return task as BrokerTask;
}

function buildLocalQuestionSet() {
  const reputationQuestions = [
    {
      question: `${companyName}的企业背景和团队能力有哪些公开依据？`,
      rationale:
        "帮助客户核验企业来源、研究背景与团队经验，补足建立初始信任所需的权威事实。",
      evidenceRefs: ["01_company_overview/overview.md", "02_team/overview.md"],
    },
    {
      question: `${companyName}的技术与项目交付能力是否可靠，能够用哪些事实验证？`,
      rationale:
        "对应客户在采购前对技术实力和落地可靠性的判断，可用能力说明与交付路径形成证据回答。",
      evidenceRefs: ["04_technology/overview.md", "07_service/overview.md"],
    },
    {
      question: `${companyName}如何说明企业项目中的数据安全、合规要求与服务边界？`,
      rationale:
        "聚焦企业客户对数据、权限和合规风险的核验，便于把公开边界与待确认事项清楚区分。",
      evidenceRefs: ["04_technology/overview.md", "07_service/overview.md"],
    },
    {
      question: `${companyName}有哪些公开荣誉、行业认可或客户信任依据可以参考？`,
      rationale:
        "覆盖客户验证外部认可和可信背书的需求，适合沉淀可追溯的荣誉与公开证明。",
      evidenceRefs: ["08_competitive_advantages/overview.md"],
    },
    {
      question: `${companyName}的持续服务和项目支持口碑应该从哪些方面判断？`,
      rationale:
        "回应客户对长期合作、响应机制和持续支持的顾虑，引导以服务范围和交付约定进行判断。",
      evidenceRefs: ["07_service/overview.md"],
    },
  ];

  const productDefinitions = [
    {
      offeringAnchor: realApiEvidenceEnabled ? companyName : "MindPromise 智诺",
      question: realApiEvidenceEnabled
        ? `${companyName}是一家什么公司，主要提供哪些产品和服务？`
        : `${companyName}的 MindPromise 智诺是什么，主要解决哪些品牌认知问题？`,
      rationale: realApiEvidenceEnabled
        ? "使用已完成的真实 API 回答，验证企业知识库对照、事实核验与评分链路。"
        : "帮助客户理解品牌认知治理产品的定位、输入和交付价值，适合承接产品定义类搜索。",
    },
    {
      offeringAnchor: "MindReach 智达",
      question: `${companyName}的 MindReach 智达如何连接内容、意向识别与线索沉淀？`,
      rationale:
        "聚焦增长智能体的工作机制，让客户判断其能力是否覆盖从触达到线索运营的关键环节。",
    },
    {
      offeringAnchor: "MindNexus 智汇",
      question: `${companyName}的 MindNexus 智汇适合哪些企业级 AI 工作流场景？`,
      rationale:
        "对应企业在流程嵌入和系统协同上的场景适配判断，突出适用对象与业务环境。",
    },
    {
      offeringAnchor: "FDE 入驻服务",
      question: `${companyName}的 FDE 入驻服务通常如何推进系统协同与项目交付？`,
      rationale:
        "回答客户对实施方式、协作角色和落地步骤的关注，属于部署与交付决策问题。",
    },
    {
      offeringAnchor: "持续优化支持",
      question: `${companyName}的持续优化支持包含哪些服务边界和需要确认的事项？`,
      rationale:
        "帮助客户在合作前确认支持范围、项目约定和未公开条件，降低持续服务预期错配。",
    },
  ];

  const industryQuestions = [
    {
      question: "企业 AI 化增长服务商有哪些推荐？",
      rationale:
        "覆盖企业在建立初始供应商名单时的品类发现需求，为品牌进入候选集合创造机会。",
    },
    {
      question: "品牌 AI 认知与 GEO 知识基建领域有哪些服务商值得推荐？",
      rationale:
        "聚焦品牌认知治理这一细分品类，承接客户寻找专业知识基建服务商的推荐意图。",
    },
    {
      question: "需要智能获客与线索沉淀时，哪些企业 AI 服务商值得选择？",
      rationale:
        "从增长场景出发筛选服务商，帮助客户比较能否覆盖意向识别、触达和线索运营。",
    },
    {
      question: "企业级 AI 工作流部署方案怎么选，头部服务商有哪些？",
      rationale:
        "覆盖工作流部署领域的选型和头部厂商发现需求，适合形成有明确维度的候选清单。",
    },
    {
      question: "提供 FDE 入驻和系统协同服务的企业 AI 公司有哪些推荐？",
      rationale:
        "围绕 FDE 与系统协同这一交付模式发现供应商，连接工程落地型客户的采购意图。",
    },
  ];

  const comparisonQuestions = [
    {
      question: `${companyName}与传统单点工具在核心能力和交付物上有什么区别？`,
      rationale:
        "帮助客户比较完整服务与单点工具的能力边界，明确事实治理、执行与交付物差异。",
    },
    {
      question: `${companyName}与纯内容代运营相比，分别适合哪些企业需求？`,
      rationale:
        "从客户需求和适用场景比较两类方案，避免把知识治理与单纯内容生产混为一谈。",
    },
    {
      question: `${companyName}与通用 AI 平台相比，在系统部署和流程嵌入上有什么差异？`,
      rationale:
        "聚焦部署方式和组织流程连接，帮助客户判断平台采购与项目型服务的取舍。",
    },
    {
      question: `企业自建 AI 团队与选择${companyName}的 FDE 入驻服务应如何取舍？`,
      rationale:
        "围绕资源投入、协作模式和落地效率形成自建与外部部署服务之间的决策比较。",
    },
    {
      question: `${companyName}与同类企业 AI 咨询服务相比，持续支持边界有什么不同？`,
      rationale:
        "比较长期支持、项目边界和持续运营方式，回应客户对合作深度与后续服务的顾虑。",
    },
  ];

  const questions: GeoQuestion[] = [
    ...reputationQuestions.map((item, index) => ({
      id: `reputation-${String(index + 1).padStart(2, "0")}`,
      category: "reputation" as const,
      ...item,
      selectable: true,
    })),
    ...productDefinitions.map((item, index) => ({
      id: `product-scenario-${String(index + 1).padStart(2, "0")}`,
      category: "product_scenario" as const,
      ...item,
      enterpriseAnchor: companyName,
      qaIntent: PRODUCT_QA_INTENTS[index],
      evidenceRefs: [
        index < 3
          ? "03_products/overview.md"
          : index === 3
            ? "04_technology/overview.md"
            : "07_service/overview.md",
      ],
      selectable: true,
    })),
    ...industryQuestions.map((item, index) => ({
      id: `industry-ranking-${String(index + 1).padStart(2, "0")}`,
      category: "industry_ranking" as const,
      ...item,
      evidenceRefs: ["06_industries/overview.md"],
      selectable: false,
    })),
    ...comparisonQuestions.map((item, index) => ({
      id: `competitor-comparison-${String(index + 1).padStart(2, "0")}`,
      category: "competitor_comparison" as const,
      ...item,
      evidenceRefs: [
        index < 2
          ? "08_competitive_advantages/overview.md"
          : "07_service/overview.md",
      ],
      selectable: true,
    })),
  ];

  return GeoQuestionSetSchema.parse({ questions });
}

class LocalAcceptanceBroker implements GeoPresalesBroker {
  private nextFile = 1;
  private nextMonitorRun = 1;
  private readonly uploads = new Map<string, Buffer>();
  private readonly filenames = new Map<string, string>();
  private readonly tasks = new Map<string, BrokerTask>();
  private readonly idempotentTasks = new Map<string, BrokerTask>();
  private readonly taskReads = new Map<string, number>();
  private readonly monitorRuns = new Map<string, BrokerMonitorRun>();
  private readonly idempotentMonitorRuns = new Map<string, BrokerMonitorRun>();

  readonly metrics = {
    taskCreateCount: 0,
    knowledgeTaskCreateCount: 0,
    questionTaskCreateCount: 0,
    customQuestionClassifierTaskCount: 0,
    assessmentTaskCreateCount: 0,
    forecastTaskCreateCount: 0,
    candidateDownloadCount: 0,
    finalUploadCount: 0,
    finalReadbackCount: 0,
    deletedFileCount: 0,
    monitorRunCreateCount: 0,
    monitorResultReadCount: 0,
  };

  latestFinalFileId?: string;

  async getStatus() {
    return {
      ok: true,
      credentialConfigured: true,
      monitorCredentialConfigured: true,
      publicUrlConfigured: true,
    };
  }

  async createFile(input: {
    filename: string;
    mimeType?: string;
    sizeBytes: number;
  }): Promise<BrokerFile> {
    const id = `local-file-${this.nextFile++}`;
    this.filenames.set(id, input.filename);
    return {
      id,
      filename: input.filename,
      status: "pending",
      proxy_upload_ticket: `local-ticket-${id}`,
    };
  }

  async uploadFile(fileId: string, body: Buffer) {
    this.uploads.set(fileId, Buffer.from(body));
    if (
      this.filenames.get(fileId)?.endsWith("_website_lead_knowledge_base.zip")
    ) {
      this.latestFinalFileId = fileId;
      this.metrics.finalUploadCount += 1;
    }
    return { status: "uploaded" };
  }

  async createTask(input: {
    projectId?: string;
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
  }): Promise<BrokerTask> {
    const existing = this.idempotentTasks.get(input.idempotencyKey);
    if (existing) return existing;
    this.metrics.taskCreateCount += 1;
    const isCustomQuestionClassifierTask = input.prompt.includes(
      "geo-custom-question-classifier.skill.zip",
    );
    if (isCustomQuestionClassifierTask) {
      this.metrics.customQuestionClassifierTaskCount += 1;
      const question = promptJsonString(input.prompt, "question");
      const enterpriseRelated = question
        .normalize("NFKC")
        .toLocaleLowerCase("zh-CN")
        .includes(companyName.normalize("NFKC").toLocaleLowerCase("zh-CN"));
      const category = /(?:对比|相比|比较|区别|差异|vs)/i.test(question)
        ? "competitor_comparison"
        : /(?:优势|实力|可信|口碑|评价|声誉|质量|安全|资质|客户|案例)/i.test(
              question,
            )
          ? "reputation"
          : "product_scenario";
      const output = enterpriseRelated
        ? {
            decision: "accept",
            category,
            enterpriseRelated: true,
            reasonCode: "accepted",
            reason: `问题明确指向${companyName}，并可由企业知识库证据进行验证。`,
            enterpriseAnchor: companyName,
            offeringAnchor: null,
            evidenceRefs: ["01_company_overview/overview.md"],
          }
        : {
            decision: "reject",
            category: "unrelated",
            enterpriseRelated: false,
            reasonCode: "enterprise_unrelated",
            reason: `问题没有明确指向${companyName}或知识库中的具体产品与服务。`,
            enterpriseAnchor: null,
            offeringAnchor: null,
            evidenceRefs: [],
          };
      const task: BrokerTask = {
        id: `custom-question-classifier-local-acceptance-${this.metrics.customQuestionClassifierTaskCount}`,
        status: "completed",
        progress: 1,
        completed_at: new Date().toISOString(),
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(output) }],
          },
        ],
      };
      this.tasks.set(String(task.id), task);
      this.idempotentTasks.set(input.idempotencyKey, task);
      return task;
    }
    const isQuestionTask = input.prompt.includes(
      "geo-question-recommender.skill.zip",
    );
    if (isQuestionTask) {
      this.metrics.questionTaskCreateCount += 1;
      const questions = buildLocalQuestionSet().questions;
      const task: BrokerTask = {
        id: `question-local-acceptance-${this.metrics.questionTaskCreateCount}`,
        status: "completed",
        progress: 1,
        completed_at: "2026-07-31T04:00:01.000Z",
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify({ questions }) }],
          },
        ],
      };
      this.tasks.set(String(task.id), task);
      this.idempotentTasks.set(input.idempotencyKey, task);
      return task;
    }
    const isAssessmentTask = input.prompt.includes(
      "geo-current-state-evaluator.skill.zip",
    );
    if (isAssessmentTask && realApiEvidenceEnabled) {
      this.metrics.assessmentTaskCreateCount += 1;
      const task = loadRealAssessmentTask();
      const taskId = String(task.id || task.task_id || "");
      if (!taskId) throw new Error("真实评估结果缺少任务 ID");
      this.tasks.set(taskId, task);
      this.idempotentTasks.set(input.idempotencyKey, task);
      return task;
    }
    const isForecastTask = input.prompt.includes(
      "geo-optimization-outcome-forecaster.skill.zip",
    );
    if (isForecastTask && realForecastEvidenceEnabled) {
      this.metrics.forecastTaskCreateCount += 1;
      const task = loadRealForecastTask();
      const taskId = String(task.id || task.task_id || "");
      if (!taskId) throw new Error("真实优化预测结果缺少任务 ID");
      this.tasks.set(taskId, task);
      this.idempotentTasks.set(input.idempotencyKey, task);
      return task;
    }
    this.metrics.knowledgeTaskCreateCount += 1;
    const task: BrokerTask = {
      id: "kb-local-acceptance-1",
      status: "running",
      progress: 0.8,
      output: [],
    };
    this.tasks.set(String(task.id), task);
    this.idempotentTasks.set(input.idempotencyKey, task);
    return task;
  }

  private completeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`未知本地任务：${taskId}`);
    if (taskId !== "kb-local-acceptance-1" || task.status === "completed") {
      return task;
    }
    const reads = (this.taskReads.get(taskId) || 0) + 1;
    this.taskReads.set(taskId, reads);
    if (reads >= 1) {
      Object.assign(task, {
        status: "completed",
        progress: 1,
        completed_at: "2026-07-31T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-local-acceptance",
                filename: "website-lead-candidate-v1.zip",
              },
            ],
          },
        ],
      });
    }
    return task;
  }

  async getTask(taskId: string) {
    return this.completeTask(taskId);
  }

  async getTaskResult(taskId: string) {
    return this.completeTask(taskId);
  }

  async deleteFile(fileId: string) {
    this.metrics.deletedFileCount += 1;
    this.uploads.delete(fileId);
    this.filenames.delete(fileId);
  }

  async downloadFile(fileId: string) {
    let bytes: Buffer;
    let filename: string;
    if (fileId === "candidate-local-acceptance") {
      this.metrics.candidateDownloadCount += 1;
      bytes = candidateBytes;
      filename = "website-lead-candidate-v1.zip";
    } else {
      const uploaded = this.uploads.get(fileId);
      if (!uploaded) throw new Error(`本地文件不存在：${fileId}`);
      if (fileId === this.latestFinalFileId) {
        this.metrics.finalReadbackCount += 1;
      }
      bytes = uploaded;
      filename = this.filenames.get(fileId) || `${fileId}.zip`;
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.length),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  }

  async downloadTaskOutput(_taskId: string, _url: string, _filename?: string) {
    return this.downloadFile("candidate-local-acceptance");
  }

  async createMonitorRun(input: {
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }): Promise<BrokerMonitorRun> {
    const existing = this.idempotentMonitorRuns.get(input.idempotencyKey);
    if (existing) return existing;
    if (realApiEvidenceEnabled) {
      const run = loadRealMonitorRun();
      if (
        run.question !== input.question ||
        JSON.stringify(run.platforms) !== JSON.stringify(input.platforms)
      ) {
        throw new Error("本地选择的问题或平台与真实 API 验收样本不一致");
      }
      this.metrics.monitorRunCreateCount += 1;
      this.monitorRuns.set(run.runId, run);
      this.idempotentMonitorRuns.set(input.idempotencyKey, run);
      return run;
    }
    const run: BrokerMonitorRun = {
      runId: `local-monitor-${this.nextMonitorRun++}`,
      status: "submitted",
      question: input.question,
      platforms: input.platforms,
      repeatPerPlatform: 5,
      expectedItems: input.platforms.length * 5,
      completedItems: 0,
      failedItems: 0,
      submittedAt: new Date().toISOString(),
    };
    this.metrics.monitorRunCreateCount += 1;
    this.monitorRuns.set(run.runId, run);
    this.idempotentMonitorRuns.set(input.idempotencyKey, run);
    return run;
  }

  async getMonitorRun(runId: string): Promise<BrokerMonitorRun> {
    return this.completedMonitorRun(runId);
  }

  async getMonitorResult(runId: string): Promise<BrokerMonitorRun> {
    this.metrics.monitorResultReadCount += 1;
    return this.completedMonitorRun(runId);
  }

  async deleteMonitorRun(runId: string) {
    this.monitorRuns.delete(runId);
  }

  private completedMonitorRun(runId: string): BrokerMonitorRun {
    const run = this.monitorRuns.get(runId);
    if (!run) throw new Error(`本地监控任务不存在：${runId}`);
    if (
      run.status === "completed" &&
      Array.isArray(run.records) &&
      run.records.length > 0
    ) {
      return run;
    }
    const records = run.platforms.flatMap((platform) =>
      Array.from({ length: 5 }, (_, index) => ({
        recordId: `${run.runId}-${platform}-${index + 1}`,
        platform,
        runIndex: index + 1,
        status: "completed" as const,
        answerText:
          `本地验收回答（${platform} 第 ${index + 1} 次）：针对“${run.question}”，` +
          "当前企业知识库已被成功读取，系统能够返回与该问题关联的企业背景、产品能力、服务场景和公开证据。此回答用于验证提问、采集、回传与页面展示链路。",
        media: [],
        citations: [
          {
            title: "超前智能企业知识库",
            url: "https://frontmind.net/",
          },
        ],
        references: [
          {
            title: "本地知识库验收来源",
            url: "https://frontmind.net/about/",
          },
        ],
        completedAt: new Date().toISOString(),
      })),
    );
    const completed: BrokerMonitorRun = {
      ...run,
      status: "completed",
      completedItems: records.length,
      failedItems: 0,
      records,
    };
    this.monitorRuns.set(runId, completed);
    return completed;
  }

  status() {
    const finalBytes = this.latestFinalFileId
      ? this.uploads.get(this.latestFinalFileId)
      : undefined;
    return {
      case: companyName,
      candidatePath,
      candidateBytes: candidateBytes.length,
      candidateSha256,
      finalFileId: this.latestFinalFileId,
      finalBytes: finalBytes?.length,
      finalSha256: finalBytes
        ? crypto.createHash("sha256").update(finalBytes).digest("hex")
        : undefined,
      evidenceMode:
        realApiEvidenceEnabled && realForecastEvidenceEnabled
          ? "real-api"
          : realApiEvidenceEnabled
            ? "real-api-without-forecast"
            : "simulated",
      realMonitorResultPath: realApiEvidenceEnabled
        ? realMonitorResultPath
        : undefined,
      realAssessmentResultPath: realApiEvidenceEnabled
        ? realAssessmentResultPath
        : undefined,
      realForecastResultPath: realForecastEvidenceEnabled
        ? realForecastResultPath
        : undefined,
      retainedTaskCount: this.tasks.size,
      retainedTaskIds: [...this.tasks.keys()].sort(),
      ...this.metrics,
    };
  }
}

function promptJsonString(prompt: string, key: string) {
  const match = prompt.match(
    new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`),
  );
  if (!match) return "";
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return "";
  }
}

class LocalPaymentGateway implements GeoPaymentGateway {
  private nextOrder = 1;
  private readonly receipts = new Map<string, GeoPaymentReceipt>();

  async createCheckout(
    input: GeoPaymentCheckoutInput,
  ): Promise<GeoPaymentCheckout> {
    return this.createPaidCheckout(input.expectedAmountFen, input.method);
  }

  async createServiceCheckout(
    input: GeoServicePaymentCheckoutInput,
  ): Promise<GeoPaymentCheckout> {
    return this.createPaidCheckout(input.expectedAmountFen, input.method);
  }

  async getStatus(
    input: GeoPaymentVerificationInput,
  ): Promise<GeoPaymentStatus> {
    return this.paidStatus(input.authorization, input.expectedAmountFen);
  }

  async getServiceStatus(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentStatus> {
    return this.paidStatus(input.authorization, input.expectedAmountFen);
  }

  async verify(input: GeoPaymentVerificationInput): Promise<GeoPaymentReceipt> {
    return this.verifiedReceipt(input.authorization, input.expectedAmountFen);
  }

  async verifyService(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentReceipt> {
    return this.verifiedReceipt(input.authorization, input.expectedAmountFen);
  }

  async verifyCallback(): Promise<GeoPaymentStatus> {
    const receipt = [...this.receipts.values()].at(-1);
    if (!receipt) {
      return {
        status: "pending",
        orderId: "889100000000",
        amountFen: 0,
      };
    }
    return {
      status: "paid",
      ...receipt,
    };
  }

  private createPaidCheckout(
    amountFen: number,
    method: GeoPaymentCheckoutInput["method"],
  ): GeoPaymentCheckout {
    const orderId = `8891${String(this.nextOrder++).padStart(8, "0")}`;
    const authorization = `local-payment-${orderId}`;
    const paidAt = new Date().toISOString();
    const tradeNo = `LOCAL-${orderId}`;
    this.receipts.set(authorization, {
      orderId,
      tradeNo,
      amountFen,
      paidAt,
    });
    const localPaymentUrl = `http://127.0.0.1:${port}/__acceptance__/paid`;
    return {
      authorization,
      orderId,
      amountFen,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      fields: {
        pid: "frontmind-local-acceptance",
        type: method,
        out_trade_no: orderId,
        notify_url: localPaymentUrl,
        return_url: localPaymentUrl,
        name: "FrontMind 本地 GEO 回答链路验收",
        money: (amountFen / 100).toFixed(2),
        param: "frontmind-local-acceptance",
        sign: "frontmind-local-acceptance-signature",
        sign_type: "MD5",
      },
    };
  }

  private paidStatus(
    authorization: string,
    expectedAmountFen: number,
  ): GeoPaymentStatus {
    const receipt = this.verifiedReceipt(authorization, expectedAmountFen);
    return {
      status: "paid",
      ...receipt,
      message: "本地验收付款已模拟完成，不会产生真实扣款。",
    };
  }

  private verifiedReceipt(
    authorization: string,
    expectedAmountFen: number,
  ): GeoPaymentReceipt {
    const receipt = this.receipts.get(authorization);
    if (!receipt || receipt.amountFen !== expectedAmountFen) {
      throw new Error("本地验收付款凭证不匹配");
    }
    return receipt;
  }
}

class LocalProjectOrderRegistry implements GeoProjectOrderRegistry {
  private readonly orders = new Map<string, GeoProjectOrder>();

  async assertReady() {}

  async upsert(order: GeoProjectOrder) {
    this.orders.set(order.orderId, order);
    return order;
  }

  async commitIntent(_intentOrderId: string, order: GeoProjectOrder) {
    return this.upsert(order);
  }

  async findByProject(projectId: string) {
    const orders = [...this.orders.values()].filter(
      (order) => order.projectId === projectId,
    );
    return {
      schemaVersion: 1 as const,
      projectId,
      blockDeletion: orders.some(
        (order) =>
          !["fulfilled", "terminal_failed", "closed"].includes(order.state),
      ),
      orders,
    };
  }
}

const broker = new LocalAcceptanceBroker();
const app = express();
app.disable("x-powered-by");
app.get("/__acceptance__/status", (_req, res) => res.json(broker.status()));
app.post(
  "/__acceptance__/paid",
  express.urlencoded({ extended: false }),
  (_req, res) => {
    res
      .type("html")
      .send(
        '<!doctype html><meta charset="utf-8"><title>本地验收付款完成</title><body style="font-family:system-ui;padding:40px"><h1>本地验收付款已模拟完成</h1><p>不会产生真实扣款，可关闭此窗口并返回看板查看回答。</p></body>',
      );
  },
);
const paymentGateway = new LocalPaymentGateway();
app.use(
  "/api/geo",
  createGeoRouter({
    broker,
    paymentGateway,
    paymentVerifier: paymentGateway,
    projectOrderRegistry: new LocalProjectOrderRegistry(),
    env: {
      NODE_ENV: "development",
      FRONTMIND_GEO_INVITE_CODE: "frontmind666",
      FRONTMIND_GEO_SESSION_SECRET:
        "frontmind-local-acceptance-session-secret-2026",
      FRONTMIND_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
    },
  }),
);
app.use(express.static(staticRoot));
app.get("*", (_req, res) => res.sendFile(path.join(staticRoot, "index.html")));

app.listen(port, "127.0.0.1", () => {
  console.log(
    JSON.stringify({
      status: "LOCAL_ACCEPTANCE_READY",
      url: `http://127.0.0.1:${port}/`,
      inviteCode: "frontmind666",
      candidateSha256,
    }),
  );
});
