import { SafeMarkdown } from "./SafeMarkdown";

export function MonitoringMarkdown({ markdown }: { markdown?: string }) {
  return (
    <SafeMarkdown
      markdown={markdown}
      className="geo-answer-markdown"
      empty={<p className="geo-answer-empty">本轮没有返回可展示的文字。</p>}
    />
  );
}
