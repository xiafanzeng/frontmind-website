import About from '../../client/src/pages/About';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroAboutEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroAboutEntry({ lang = 'zh', includeChrome = true }: AstroAboutEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <About includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
