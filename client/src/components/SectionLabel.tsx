interface SectionLabelProps {
  text: string;
  color?: "gold" | "purple" | "white";
}

export default function SectionLabel({ text, color = "gold" }: SectionLabelProps) {
  // Use high-contrast colors: purple stays as-is (good contrast), gold replaced with darker variant
  const barColor = color === "white" ? "bg-white" : "bg-[#3D1560]";
  const textColor = color === "white" ? "text-white/80" : color === "gold" ? "text-[#4B5563]" : "text-[#3D1560]";

  return (
    <div className={`flex items-center gap-0 mb-6`}>
      <div className={`w-[3px] h-5 ${barColor} mr-3`} />
      <span
        className={`text-sm font-semibold tracking-wider uppercase ${textColor}`}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {text}
      </span>
    </div>
  );
}
