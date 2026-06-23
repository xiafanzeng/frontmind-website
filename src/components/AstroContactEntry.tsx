import Contact from '../../client/src/pages/Contact';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroContactEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroContactEntry({ lang = 'zh', includeChrome = true }: AstroContactEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Contact includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
