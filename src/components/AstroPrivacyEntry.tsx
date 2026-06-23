import Privacy from '../../client/src/pages/Privacy';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroPrivacyEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroPrivacyEntry({ lang = 'zh', includeChrome = true }: AstroPrivacyEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Privacy includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
