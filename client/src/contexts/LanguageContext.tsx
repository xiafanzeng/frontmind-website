import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Lang = "zh" | "en";

interface LanguageContextType {
  lang: Lang;
  toggleLang: () => void;
  t: <T extends ReactNode>(zh: T, en: T) => T;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
  initialLang?: Lang;
}

export function LanguageProvider({ children, initialLang = "zh" }: LanguageProviderProps) {
  const [lang, setLang] = useState<Lang>(initialLang);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "zh" ? "en" : "zh"));
  }, []);

  const t = useCallback(
    <T extends ReactNode>(zh: T, en: T): T => (lang === "zh" ? zh : en),
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
