import Terms from '../../client/src/pages/Terms';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroTermsEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroTermsEntry({ lang = 'zh', includeChrome = true }: AstroTermsEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Terms includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
