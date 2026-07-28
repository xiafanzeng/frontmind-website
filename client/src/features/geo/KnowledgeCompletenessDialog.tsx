import {
  CheckCircle2,
  CircleAlert,
  Database,
  FileSearch,
  Globe2,
  Image as ImageIcon,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  GeoKnowledgeAcquisitionCount,
  GeoKnowledgeCompleteness,
} from "./types";

type KnowledgeCompletenessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  completeness?: GeoKnowledgeCompleteness;
  companyName?: string;
};

function percentage(value?: GeoKnowledgeAcquisitionCount): number | undefined {
  if (!value || value.total <= 0) return undefined;
  return Math.round(
    (Math.min(value.completed, value.total) / value.total) * 100,
  );
}

function formatEvaluatedAt(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function KnowledgeCompletenessDetails({
  completeness,
}: {
  completeness?: GeoKnowledgeCompleteness;
}) {
  if (!completeness) {
    return (
      <div className="geo-completeness-unavailable" role="status">
        <CircleAlert size={20} />
        <div>
          <strong>本次归档尚未生成结构化完整度数据</strong>
          <p>
            知识库仍可正常查看和下载；完整度明细会在采集范围、叶节点状态和缺口清单完成结构化校验后显示。
          </p>
        </div>
      </div>
    );
  }

  const { counts } = completeness;
  const sufficientlySourced = Math.min(
    counts.applicableLeaves,
    counts.verifiedFirstParty +
      counts.verifiedAuthoritative +
      counts.supportedThirdParty,
  );
  const strictlyVerified = Math.min(
    counts.applicableLeaves,
    counts.verifiedFirstParty + counts.verifiedAuthoritative,
  );
  const handledLeaves = Math.min(
    counts.totalLeaves,
    counts.verifiedFirstParty +
      counts.verifiedAuthoritative +
      counts.supportedThirdParty +
      counts.inferred +
      counts.needsVerification +
      counts.notApplicable,
  );
  const acquisition = [
    {
      key: "official-pages",
      label: "官网页面",
      value: completeness.acquisition.officialPages,
      icon: Globe2,
    },
    {
      key: "web-queries",
      label: "全网查询矩阵",
      value: completeness.acquisition.webQueries,
      icon: FileSearch,
    },
    {
      key: "images",
      label: "图像素材",
      value: completeness.acquisition.images,
      icon: ImageIcon,
    },
    {
      key: "documents",
      label: "关联文档",
      value: completeness.acquisition.documents,
      icon: Database,
    },
  ].filter(
    (item): item is typeof item & { value: GeoKnowledgeAcquisitionCount } =>
      Boolean(item.value),
  );
  const evaluatedAt = formatEvaluatedAt(completeness.evaluatedAt);
  const scoreAngle = Math.min(100, Math.max(0, completeness.score)) * 3.6;

  return (
    <div className="geo-completeness-details">
      <section className="geo-completeness-score-card">
        <div
          className="geo-completeness-score"
          style={{
            background: `conic-gradient(#5b2a86 0deg ${scoreAngle}deg, #e8dfee ${scoreAngle}deg 360deg)`,
          }}
        >
          <strong>{completeness.score}%</strong>
          <span>证据完整度</span>
        </div>
        <div>
          <span>{completeness.label}</span>
          <h3>
            {sufficientlySourced} / {counts.applicableLeaves}{" "}
            个适用知识节点已充分取证
          </h3>
          <p>{completeness.basis}</p>
          <small>
            严格核验（第一方 + 权威记录）{strictlyVerified} /{" "}
            {counts.applicableLeaves}
          </small>
          {evaluatedAt && <small>评估快照 · {evaluatedAt}</small>}
        </div>
      </section>

      <section className="geo-completeness-ledger" aria-label="完整度计算明细">
        <article>
          <span>构建遍历</span>
          <strong>
            {handledLeaves} / {counts.totalLeaves}
          </strong>
          <small>已写入或说明不适用</small>
        </article>
        <article>
          <span>一方直接证据</span>
          <strong>{counts.verifiedFirstParty}</strong>
          <small>官网、上传资料与官方文件</small>
        </article>
        <article>
          <span>权威记录</span>
          <strong>{counts.verifiedAuthoritative}</strong>
          <small>监管、认证、专利等来源</small>
        </article>
        <article>
          <span>第三方支持</span>
          <strong>{counts.supportedThirdParty}</strong>
          <small>已标注出处的可信第三方</small>
        </article>
        <article className={counts.inferred > 0 ? "is-warning" : ""}>
          <span>推断节点</span>
          <strong>{counts.inferred}</strong>
          <small>有依据但不是已确认企业事实</small>
        </article>
        <article className={counts.needsVerification > 0 ? "is-warning" : ""}>
          <span>待核验</span>
          <strong>{counts.needsVerification}</strong>
          <small>计入分母，不计入严格核验</small>
        </article>
      </section>

      {acquisition.length > 0 && (
        <section className="geo-completeness-section">
          <header>
            <span>采集覆盖</span>
            <small>完成数 / 本次已发现或计划数</small>
          </header>
          <div className="geo-completeness-acquisition">
            {acquisition.map(({ key, label, value, icon: Icon }) => {
              const score = percentage(value) ?? 0;
              return (
                <article key={key}>
                  <Icon size={16} />
                  <div>
                    <span>{label}</span>
                    <strong>
                      {value.completed} / {value.total}
                    </strong>
                  </div>
                  <em>{score}%</em>
                  <div className="geo-completeness-track" aria-hidden="true">
                    <span style={{ width: `${score}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="geo-completeness-section">
        <header>
          <span>当前缺口</span>
          <small>{completeness.gaps.length} 项</small>
        </header>
        {completeness.gaps.length > 0 ? (
          <ul className="geo-completeness-gaps">
            {completeness.gaps.map((gap, index) => (
              <li key={`${gap}-${index}`}>
                <CircleAlert size={14} />
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="geo-completeness-no-gaps">
            <CheckCircle2 size={16} />
            本次结构化检查未记录未解决缺口
          </div>
        )}
      </section>

      <aside className="geo-completeness-caveat">
        <ShieldCheck size={17} />
        <p>{completeness.caveat}</p>
      </aside>
    </div>
  );
}

export function KnowledgeCompletenessDialog({
  open,
  onOpenChange,
  completeness,
  companyName,
}: KnowledgeCompletenessDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="geo-dialog geo-completeness-dialog"
        overlayClassName="geo-dialog-overlay"
      >
        <DialogHeader>
          <span className="geo-dialog-mark">
            <ShieldCheck size={19} />
          </span>
          <DialogTitle className="geo-dialog-title">完整度评估</DialogTitle>
          <DialogDescription className="geo-dialog-description">
            {companyName
              ? `${companyName} 本次知识库采集与核验快照`
              : "本次知识库采集与核验快照"}
          </DialogDescription>
        </DialogHeader>
        <KnowledgeCompletenessDetails completeness={completeness} />
      </DialogContent>
    </Dialog>
  );
}
