import Research from '../../client/src/pages/Research';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroResearchEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroResearchEntry({ lang = 'zh', includeChrome = true }: AstroResearchEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Research includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
