import { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   1. RadarChart — 品牌可见度雷达图动画 (MindPromise)
   ============================================================ */
interface RadarDataPoint {
  label: string;
  value: number;
  beforeValue?: number;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  title?: string;
}

export function RadarChart({ data, title = "BSAS 语义资产审计" }: RadarChartProps) {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const animate = () => {
            start += 1.2;
            setProgress(Math.min(start, 100));
            if (start < 100) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const cx = 150, cy = 150, radius = 74;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;

  const getPoint = (index: number, value: number, prog: number = progress) => {
    const angle = angleStep * index - Math.PI / 2;
    const r = (value / 100) * radius * (prog / 100);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  // “优化后”多边形
  const afterPoints = data.map((d, i) => {
    const p = getPoint(i, d.value);
    return `${p.x},${p.y}`;
  }).join(" ");

  // “优化前”多边形
  const beforePoints = data.map((d, i) => {
    const bv = d.beforeValue ?? Math.round(d.value * 0.4);
    const p = getPoint(i, bv);
    return `${p.x},${p.y}`;
  }).join(" ");

  const gridLevels = [25, 50, 75, 100];

  return (
    <div ref={ref} className="mx-auto w-full max-w-[520px] bg-slate-900 px-4 py-3 md:px-5 md:py-4">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-green-400 text-xs font-mono">{title}</span>
      </div>
      <svg
        viewBox="34 50 232 184"
        className="mx-auto block w-full"
        style={{ maxWidth: "463px" }}
      >
        {/* 网格线 */}
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={data.map((_, i) => {
              const angle = angleStep * i - Math.PI / 2;
              const r = (level / 100) * radius;
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
            }).join(" ")}
            fill="none"
            stroke="#334155"
            strokeWidth="0.4"
          />
        ))}
        {/* 轴线 */}
        {data.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          return (
            <line
              key={i}
              x1={cx} y1={cy}
              x2={cx + radius * Math.cos(angle)}
              y2={cy + radius * Math.sin(angle)}
              stroke="#334155" strokeWidth="0.4"
            />
          );
        })}
        {/* 优化前 - 红色虚线区域 */}
        <polygon
          points={beforePoints}
          fill="rgba(239, 68, 68, 0.18)"
          stroke="#EF4444"
          strokeWidth="1.7"
          strokeDasharray="3.5 2"
          opacity={progress > 20 ? 1 : 0}
        />
        {/* 优化后 - 紫色实线区域 */}
        <polygon
          points={afterPoints}
          fill="rgba(139, 92, 246, 0.2)"
          stroke="#8B5CF6"
          strokeWidth="1.4"
        />
        {/* 优化后的节点 */}
        {data.map((d, i) => {
          const p = getPoint(i, d.value);
          return <circle key={i} cx={p.x} cy={p.y} r="2.7" fill="#8B5CF6" stroke="#fff" strokeWidth="1" />;
        })}
        {/* 优化前的节点 */}
        {progress > 20 && data.map((d, i) => {
          const bv = d.beforeValue ?? Math.round(d.value * 0.4);
          const p = getPoint(i, bv);
          return <circle key={`b-${i}`} cx={p.x} cy={p.y} r="3.3" fill="#EF4444" stroke="#fff" strokeWidth="1" opacity={0.9} />;
        })}
        {/* 维度标签 */}
        {data.map((d, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const labelR = radius + 15;
          const x = cx + labelR * Math.cos(angle);
          const y = cy + labelR * Math.sin(angle);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-slate-300 text-[7px]">
              {d.label}
            </text>
          );
        })}
      </svg>
      {/* 图例 */}
      <div className="mt-1.5 flex items-center justify-center gap-5 text-[11px]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-red-500" style={{ borderTop: '1.5px dashed #EF4444' }} />
          <span className="text-slate-400">优化前</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-purple-500" />
          <span className="text-slate-400">优化后</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   2. ChatFlow — 对话流气泡动画 (MindReach)
   ============================================================ */
interface ChatMessage {
  role: "agent" | "customer" | "system";
  content: string;
  delay?: number;
}

interface ChatFlowProps {
  messages: ChatMessage[];
  title?: string;
}

export function ChatFlow({ messages, title = "智能体对话演示" }: ChatFlowProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let count = 0;
          const showNext = () => {
            count++;
            setVisibleCount(count);
            if (count < messages.length) {
              setTimeout(showNext, messages[count]?.delay || 1200);
            }
          };
          setTimeout(showNext, 600);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [messages.length]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <div ref={ref} className="bg-white border border-slate-200 w-full overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="ml-auto text-xs text-slate-400">模拟演示</span>
      </div>
      <div ref={containerRef} className="p-4 space-y-3 h-[340px] overflow-y-auto">
        {messages.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "agent" ? "justify-start" : msg.role === "customer" ? "justify-end" : "justify-center"}`}
            style={{ animation: "fadeInUp 0.4s ease-out" }}
          >
            {msg.role === "system" ? (
              <div className="text-xs text-slate-400 bg-slate-50 px-3 py-1 border border-slate-100">
                {msg.content}
              </div>
            ) : (
              <div className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "agent"
                  ? "bg-purple-50 text-slate-700 border border-purple-100"
                  : "bg-slate-700 text-white"
              }`}>
                {msg.role === "agent" && (
                  <div className="text-xs text-purple-600 font-medium mb-1">MindReach Agent</div>
                )}
                {msg.content}
              </div>
            )}
          </div>
        ))}
        {visibleCount < messages.length && visibleCount > 0 && (
          <div className="flex justify-start">
            <div className="bg-purple-50 border border-purple-100 px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-purple-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   3. FlowDiagram — 流程图节点连线动画 (MindNexus)
   ============================================================ */
interface FlowNode {
  id: string;
  label: string;
  description?: string;
}

interface FlowDiagramProps {
  nodes: FlowNode[];
  title?: string;
}

export function FlowDiagram({ nodes, title = "部署管线演示" }: FlowDiagramProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let idx = 0;
          const activateNext = () => {
            setActiveIndex(idx);
            idx++;
            if (idx < nodes.length) {
              setTimeout(activateNext, 900);
            }
          };
          setTimeout(activateNext, 400);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [nodes.length]);

  return (
    <div ref={ref} className="bg-slate-900 p-6 w-full">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-green-400 text-xs font-mono">{title}</span>
      </div>
      <div className="relative">
        {nodes.map((node, i) => (
          <div key={node.id} className="flex items-start gap-4 mb-1 last:mb-0">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-mono transition-all duration-500 ${
                i <= activeIndex
                  ? "border-purple-400 bg-purple-500/20 text-purple-300 shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                  : "border-slate-600 bg-slate-800 text-slate-500"
              }`}>
                {i <= activeIndex ? "✓" : i + 1}
              </div>
              {i < nodes.length - 1 && (
                <div className="w-0.5 h-8 relative overflow-hidden">
                  <div className={`absolute inset-0 transition-all duration-700 ${
                    i < activeIndex ? "bg-purple-400" : "bg-slate-700"
                  }`} />
                  {i === activeIndex && (
                    <div className="absolute top-0 left-0 w-full h-full">
                      <div className="w-full h-2 bg-purple-400 rounded-full animate-bounce" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={`flex-1 pb-3 transition-all duration-500 ${
              i <= activeIndex ? "opacity-100 translate-x-0" : "opacity-20 translate-x-3"
            }`}>
              <div className="text-sm font-medium text-slate-200">{node.label}</div>
              {node.description && (
                <div className="text-xs text-slate-400 mt-1">{node.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   4. BeforeAfterSlider — 前后对比滑块 (迁移路径)
   ============================================================ */
interface BeforeAfterSliderProps {
  beforeTitle: string;
  afterTitle: string;
  beforeItems: string[];
  afterItems: string[];
  beforeImage?: string;
  afterImage?: string;
}

export function BeforeAfterSlider({ beforeTitle, afterTitle, beforeItems, afterItems, beforeImage, afterImage }: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current || !isDragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percent);
  }, []);

  const handleMouseDown = () => { isDragging.current = true; };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const handleUp = () => { isDragging.current = false; };

    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [handleMove]);

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl mx-auto border border-slate-200 overflow-hidden select-none cursor-col-resize min-h-[420px]"
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
    >
      {/* Before side */}
      <div
        className="absolute inset-0 bg-red-50/50 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <div className="p-8 md:p-10 h-full flex flex-row items-stretch gap-8">
          <div className="w-1/3 min-w-0 flex flex-col">
            <div className="h-10 flex items-center">
              <span className="text-sm font-semibold text-red-600 uppercase tracking-wider border border-red-200 bg-red-50 px-3 py-1.5 rounded">
                {beforeTitle}
              </span>
            </div>
            <div className="space-y-6 mt-6">
              {beforeItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-red-400 mt-0.5 text-xl shrink-0">✗</span>
                  <span className="text-lg text-slate-700 leading-relaxed whitespace-normal">{item}</span>
                </div>
              ))}
            </div>
          </div>
          {beforeImage && (
            <div className="hidden md:flex w-2/3 shrink-0 rounded-lg overflow-hidden border border-red-200 items-center">
              <img src={beforeImage} alt="Before" className="w-full h-auto object-contain" />
            </div>
          )}
        </div>
      </div>
      {/* After side */}
      <div
        className="absolute inset-0 bg-purple-50/50 overflow-hidden"
        style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
      >
        <div className="p-8 md:p-10 h-full flex flex-row items-stretch gap-8">
          <div className="w-1/3 min-w-0 flex flex-col">
            <div className="h-10 flex items-center">
              <span className="text-sm font-semibold text-purple-700 uppercase tracking-wider border border-purple-200 bg-purple-50 px-3 py-1.5 rounded">
                {afterTitle}
              </span>
            </div>
            <div className="space-y-6 mt-6">
              {afterItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-purple-500 mt-0.5 text-xl shrink-0">✓</span>
                  <span className="text-lg text-slate-700 leading-relaxed whitespace-normal">{item}</span>
                </div>
              ))}
            </div>
          </div>
          {afterImage && (
            <div className="hidden md:flex w-2/3 shrink-0 rounded-lg overflow-hidden border border-purple-200 items-center">
              <img src={afterImage} alt="After" className="w-full h-auto object-contain" />
            </div>
          )}
        </div>
      </div>
      {/* Static height placeholder to ensure container has height */}
      <div className="invisible p-8 md:p-10 flex flex-row items-stretch gap-8">
        <div className="w-1/3 min-w-0 flex flex-col justify-center">
          <div className="text-sm mb-6 px-3 py-1.5">&nbsp;</div>
          <div className="space-y-6">
            {beforeItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xl shrink-0">✗</span>
                <span className="text-lg leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </div>
        {beforeImage && <div className="hidden md:flex w-2/3 shrink-0"><img src={beforeImage} alt="" className="w-full h-auto opacity-0" /></div>}
      </div>
      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-purple-500 z-10"
        style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M5 3L2 8L5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M11 3L14 8L11 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-slate-400 bg-white/80 px-2 py-0.5 border border-slate-200 rounded">
        ← 拖拽对比 →
      </div>
    </div>
  );
}

/* ============================================================
   5. AnimatedTimeline — 时间线滚动动画 (部署路径)
   ============================================================ */
interface TimelineStep {
  number: string;
  title: string;
  description: string;
  details: string[];
}

interface AnimatedTimelineProps {
  steps: TimelineStep[];
}

export function AnimatedTimeline({ steps }: AnimatedTimelineProps) {
  const [activeSteps, setActiveSteps] = useState<number[]>([]);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    stepRefs.current.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSteps((prev) => prev.includes(i) ? prev : [...prev, i]);
          }
        },
        { threshold: 0.4 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [steps.length]);

  return (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
      <div className="space-y-10">
        {steps.map((step, i) => {
          const isActive = activeSteps.includes(i);
          return (
            <div
              key={i}
              ref={(el) => { stepRefs.current[i] = el; }}
              className={`relative pl-16 transition-all duration-700 ${
                isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
              }`}
            >
              <div className={`absolute left-3 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-500 ${
                isActive
                  ? "border-purple-600 bg-purple-600 text-white scale-110"
                  : "border-slate-300 bg-white text-slate-400"
              }`}>
                {step.number}
              </div>
              {isActive && (
                <div className="absolute left-3 w-7 h-7 rounded-full bg-purple-400/30 animate-ping" />
              )}
              <div className={`border p-5 transition-all duration-500 ${
                isActive ? "bg-white border-purple-200 shadow-sm" : "bg-slate-50 border-slate-200"
              }`}>
                <h4 className="text-base font-bold text-slate-800 mb-2">{step.title}</h4>
                <p className="text-sm text-slate-600 mb-3 leading-relaxed">{step.description}</p>
                <div className="flex flex-wrap gap-2">
                  {step.details.map((d, j) => (
                    <span
                      key={j}
                      className={`text-xs px-2.5 py-1 border transition-all duration-300 ${
                        isActive
                          ? "border-purple-200 bg-purple-50 text-purple-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                      style={{ transitionDelay: `${j * 100}ms` }}
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   6. CountUpNumber — 数字滚动计数器 (统计数据)
   ============================================================ */
interface CountUpNumberProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

export function CountUpNumber({ end, duration = 2000, prefix = "", suffix = "", label }: CountUpNumberProps) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCurrent(Math.round(end * eased));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-4xl font-bold text-slate-800 tabular-nums">
        {prefix}{current.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-slate-500 mt-2">{label}</div>
    </div>
  );
}

/* ============================================================
   7. FlipCard — 卡片翻转动画 (行业应用)
   ============================================================ */
interface FlipCardProps {
  front: { icon: string; title: string; description: string };
  back: { details: string[]; cta?: string };
}

export function FlipCard({ front, back }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div
      className="relative w-full h-[200px] cursor-pointer group"
      style={{ perspective: "1000px" }}
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0)" }}
      >
        {/* Front */}
        <div className="absolute inset-0 border border-slate-200 bg-white p-5 flex flex-col justify-center" style={{ backfaceVisibility: "hidden" }}>
          <div className="text-2xl mb-3">{front.icon}</div>
          <h4 className="text-base font-bold text-slate-800 mb-2">{front.title}</h4>
          <p className="text-sm text-slate-500 leading-relaxed">{front.description}</p>
          <div className="absolute bottom-3 right-3 text-[10px] text-slate-500">鼠标放置查看详情</div>
        </div>
        {/* Back */}
        <div className="absolute inset-0 border border-purple-200 bg-purple-50 p-5 flex flex-col justify-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <div className="space-y-2.5">
            {back.details.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="text-purple-500">→</span>
                {d}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ============================================================
   8. AIChat — AI问答面板 (迁移路径演示)
   ============================================================ */
interface AIChatProps {
  platform?: string;
  question: string;
  answer: string;
  brandHighlight?: string;
}

export function AIChat({ platform = "DeepSeek", question, answer, brandHighlight }: AIChatProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [displayedAnswer, setDisplayedAnswer] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          setTimeout(() => setShowAnswer(true), 1000);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!showAnswer) return;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayedAnswer(answer.substring(0, i));
      if (i >= answer.length) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [showAnswer, answer]);

  const highlightBrand = (text: string) => {
    if (!brandHighlight) return text;
    const parts = text.split(brandHighlight);
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <span className="bg-purple-100 text-purple-800 font-semibold px-1">{brandHighlight}</span>
        )}
      </span>
    ));
  };

  return (
    <div ref={ref} className="bg-white border border-slate-200 overflow-hidden w-full">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
        <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5">AI</span>
        <span className="text-sm text-slate-600">{platform}</span>
        <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <div className="bg-purple-600 text-white text-sm px-4 py-2 max-w-[85%]">
            {question}
          </div>
        </div>
        {showAnswer ? (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm px-4 py-3 max-w-[85%] leading-relaxed">
              {highlightBrand(displayedAnswer)}
              {displayedAnswer.length < answer.length && <span className="animate-pulse text-purple-500">|</span>}
            </div>
          </div>
        ) : (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   9. TypewriterCode — 代码打字机 (保留备用)
   ============================================================ */
interface TypewriterCodeProps {
  lines: { text: string; type?: "info" | "warn" | "success" | "comment" | "code" | "highlight" }[];
  speed?: number;
  title?: string;
  loop?: boolean;
}

export function TypewriterCode({ lines, speed = 30, title = "terminal", loop = true }: TypewriterCodeProps) {
  const [displayedLines, setDisplayedLines] = useState<{ text: string; type?: string }[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTyping || currentLineIndex >= lines.length) {
      if (loop && currentLineIndex >= lines.length) {
        const timeout = setTimeout(() => {
          setDisplayedLines([]);
          setCurrentLineIndex(0);
          setCurrentCharIndex(0);
          setIsTyping(true);
        }, 3000);
        return () => clearTimeout(timeout);
      }
      return;
    }
    const currentLine = lines[currentLineIndex];
    if (currentCharIndex < currentLine.text.length) {
      const timeout = setTimeout(() => {
        setDisplayedLines(prev => {
          const newLines = [...prev];
          if (newLines.length <= currentLineIndex) {
            newLines.push({ text: "", type: currentLine.type });
          }
          newLines[currentLineIndex] = { text: currentLine.text.slice(0, currentCharIndex + 1), type: currentLine.type };
          return newLines;
        });
        setCurrentCharIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [currentLineIndex, currentCharIndex, isTyping, lines, speed, loop]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedLines]);

  const getLineColor = (type?: string) => {
    switch (type) {
      case "info": return "text-emerald-400";
      case "warn": return "text-amber-400";
      case "success": return "text-green-300";
      case "comment": return "text-gray-500";
      case "highlight": return "text-purple-300";
      case "code": return "text-cyan-300";
      default: return "text-gray-300";
    }
  };

  return (
    <div className="border border-gray-800 bg-gray-950 overflow-hidden font-mono text-xs sm:text-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        </div>
        <span className="text-gray-500 text-xs ml-2">{title}</span>
      </div>
      <div ref={containerRef} className="p-4 h-48 sm:h-56 overflow-y-auto">
        {displayedLines.map((line, i) => (
          <div key={i} className={`${getLineColor(line.type)} leading-relaxed whitespace-pre-wrap`}>
            {line.text}
          </div>
        ))}
        {isTyping && <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />}
      </div>
    </div>
  );
}


/* ============================================================
   8. BarChart — AI可见度对比柱状图动画（重新设计）
   ============================================================ */
interface BarDataPoint {
  label: string;
  before: number;
  after: number;
}

interface BarChartProps {
  data: BarDataPoint[];
  title?: string;
  unit?: string;
}

export function BarChart({ data, title = "AI可见度提升", unit = "%" }: BarChartProps) {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const animate = () => {
            start += 1.5;
            setProgress(Math.min(start, 100));
            if (start < 100) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-white border border-slate-200 rounded-lg p-5 w-full h-full flex flex-col">
      <div className="text-sm font-bold text-slate-800 mb-5 text-center">{title}</div>
      <div className="space-y-3 flex-1 flex flex-col justify-center">
        {data.map((d, i) => {
          const beforeW = (d.before / 100) * (progress / 100);
          const afterW = (d.after / 100) * (progress / 100);
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 w-16 shrink-0">{d.label}</span>
                <div className="flex-1 ml-3 space-y-1">
                  {/* Before bar - horizontal */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-200 to-blue-300 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${beforeW * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 w-10 text-right font-mono">
                      {progress > 60 ? `${d.before.toFixed(0)}%` : ""}
                    </span>
                  </div>
                  {/* After bar - horizontal */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${afterW * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-orange-600 w-10 text-right font-mono font-bold">
                      {progress > 60 ? `${d.after.toFixed(0)}%` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="mt-5 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-2.5 bg-gradient-to-r from-blue-200 to-blue-300 rounded-full" />
          <span className="text-slate-500">优化前</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-2.5 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full" />
          <span className="text-slate-500">优化后</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   9. CircleRank — 品牌排名提升卡片动画（重新设计）
   ============================================================ */
interface RankDataPoint {
  label: string;
  before: number;
  after: number;
}

interface CircleRankProps {
  data: RankDataPoint[];
  title?: string;
  maxRank?: number;
}

export function CircleRank({ data, title = "品牌排名提升", maxRank = 12 }: CircleRankProps) {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let start = 0;
          const animate = () => {
            start += 1.5;
            setProgress(Math.min(start, 100));
            if (start < 100) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-white border border-slate-200 rounded-lg p-5 w-full h-full flex flex-col">
      <div className="text-sm font-bold text-slate-800 mb-5 text-center">{title}</div>
      <div className="space-y-3 flex-1 flex flex-col justify-center">
        {data.map((d, i) => {
          const improvement = d.before - d.after;
          const improvePct = (improvement / d.before) * 100;
          const animatedBefore = progress > 60 ? d.before : 0;
          const animatedAfter = progress > 60 ? d.after : 0;
          // 排名越小越好，用进度条表示提升幅度
          const barWidth = (improvement / d.before) * 100 * (progress / 100);
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-700 w-16 shrink-0">{d.label}</span>
              <div className="flex-1 flex items-center gap-2">
                {/* 从 before 到 after 的箭头效果 */}
                <span className="text-xs text-slate-400 font-mono w-6 text-right">
                  {progress > 60 ? animatedBefore.toFixed(1) : "-"}
                </span>
                <div className="flex-1 relative">
                  <div className="h-6 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-md flex items-center justify-end pr-2 transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(barWidth, 100)}%` }}
                    >
                      {progress > 70 && barWidth > 30 && (
                        <span className="text-[10px] text-white font-bold">↑{improvePct.toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm text-emerald-600 font-bold font-mono w-6">
                  {progress > 60 ? animatedAfter.toFixed(1) : "-"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {/* 说明 */}
      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
        <span>排名数字越小越好</span>
        <span>·</span>
        <div className="flex items-center gap-1">
          <div className="w-6 h-2 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" />
          <span>提升幅度</span>
        </div>
      </div>
    </div>
  );
}
