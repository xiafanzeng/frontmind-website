import Platform from '../../client/src/pages/Platform';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroPlatformEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
};

export default function AstroPlatformEntry({ lang = 'zh', includeChrome = true }: AstroPlatformEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Platform includeChrome={includeChrome} />
    </LanguageProvider>
  );
}
