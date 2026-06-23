import Home from '../../client/src/pages/Home';
import { LanguageProvider, type Lang } from '../../client/src/contexts/LanguageContext';

type AstroHomeEntryProps = {
  lang?: Lang;
  includeChrome?: boolean;
  includeHero?: boolean;
  includeStats?: boolean;
  includeCoreSolutions?: boolean;
  includeWhyGeo?: boolean;
  includeHowItWorks?: boolean;
  includeIndustries?: boolean;
  includeGeoVsSeo?: boolean;
  includeAwards?: boolean;
  includeCta?: boolean;
};

export default function AstroHomeEntry({ lang = 'zh', includeChrome = true, includeHero = true, includeStats = true, includeCoreSolutions = true, includeWhyGeo = true, includeHowItWorks = true, includeIndustries = true, includeGeoVsSeo = true, includeAwards = true, includeCta = true }: AstroHomeEntryProps) {
  return (
    <LanguageProvider initialLang={lang}>
      <Home includeChrome={includeChrome} includeHero={includeHero} includeStats={includeStats} includeCoreSolutions={includeCoreSolutions} includeWhyGeo={includeWhyGeo} includeHowItWorks={includeHowItWorks} includeIndustries={includeIndustries} includeGeoVsSeo={includeGeoVsSeo} includeAwards={includeAwards} includeCta={includeCta} />
    </LanguageProvider>
  );
}
