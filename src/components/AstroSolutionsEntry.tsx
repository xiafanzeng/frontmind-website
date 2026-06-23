import Solutions from '../../client/src/pages/Solutions';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroSolutionsEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroSolutionsEntry({ lang = 'zh', includeChrome = true }: AstroSolutionsEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Solutions includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
