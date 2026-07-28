export type VisitorCountry = {
  country: string;
  iso: string;
  reads: number;
  latitude: number;
  longitude: number;
};

export type VisitorCountryMetadata = Omit<VisitorCountry, "reads">;

/**
 * Display metadata only. Visit counts must always come from the production
 * server store; keeping a count baseline in the browser would turn an API
 * outage into fabricated "live" statistics.
 */
export const visitorCountryCatalog: VisitorCountryMetadata[] = [
  {
    country: "Mainland China",
    iso: "cn",
    latitude: 35.8617,
    longitude: 104.1954,
  },
  {
    country: "Hong Kong, China",
    iso: "hk",
    latitude: 22.3193,
    longitude: 114.1694,
  },
  {
    country: "United States",
    iso: "us",
    latitude: 39.8283,
    longitude: -98.5795,
  },
  {
    country: "Singapore",
    iso: "sg",
    latitude: 1.3521,
    longitude: 103.8198,
  },
  {
    country: "Taiwan",
    iso: "tw",
    latitude: 23.6978,
    longitude: 120.9605,
  },
  { country: "Japan", iso: "jp", latitude: 36.2048, longitude: 138.2529 },
  {
    country: "South Korea",
    iso: "kr",
    latitude: 35.9078,
    longitude: 127.7669,
  },
  { country: "Germany", iso: "de", latitude: 51.1657, longitude: 10.4515 },
  {
    country: "United Kingdom",
    iso: "gb",
    latitude: 55.3781,
    longitude: -3.436,
  },
  {
    country: "Canada",
    iso: "ca",
    latitude: 56.1304,
    longitude: -106.3468,
  },
  {
    country: "Australia",
    iso: "au",
    latitude: -25.2744,
    longitude: 133.7751,
  },
  { country: "Malaysia", iso: "my", latitude: 4.2105, longitude: 101.9758 },
  { country: "Vietnam", iso: "vn", latitude: 14.0583, longitude: 108.2772 },
  { country: "India", iso: "in", latitude: 20.5937, longitude: 78.9629 },
  { country: "France", iso: "fr", latitude: 46.2276, longitude: 2.2137 },
  { country: "Thailand", iso: "th", latitude: 15.87, longitude: 100.9925 },
  {
    country: "United Arab Emirates",
    iso: "ae",
    latitude: 23.4241,
    longitude: 53.8478,
  },
  {
    country: "Indonesia",
    iso: "id",
    latitude: -0.7893,
    longitude: 113.9213,
  },
  {
    country: "Netherlands",
    iso: "nl",
    latitude: 52.1326,
    longitude: 5.2913,
  },
  { country: "Italy", iso: "it", latitude: 41.8719, longitude: 12.5674 },
  { country: "Spain", iso: "es", latitude: 40.4637, longitude: -3.7492 },
  {
    country: "Switzerland",
    iso: "ch",
    latitude: 46.8182,
    longitude: 8.2275,
  },
  {
    country: "New Zealand",
    iso: "nz",
    latitude: -40.9006,
    longitude: 174.886,
  },
  { country: "Brazil", iso: "br", latitude: -14.235, longitude: -51.9253 },
  { country: "Sweden", iso: "se", latitude: 60.1282, longitude: 18.6435 },
  {
    country: "Philippines",
    iso: "ph",
    latitude: 12.8797,
    longitude: 121.774,
  },
  { country: "Russia", iso: "ru", latitude: 61.524, longitude: 105.3188 },
  {
    country: "Saudi Arabia",
    iso: "sa",
    latitude: 23.8859,
    longitude: 45.0792,
  },
  { country: "Türkiye", iso: "tr", latitude: 38.9637, longitude: 35.2433 },
  { country: "Belgium", iso: "be", latitude: 50.5039, longitude: 4.4699 },
  { country: "Portugal", iso: "pt", latitude: 39.3999, longitude: -8.2245 },
  { country: "Israel", iso: "il", latitude: 31.0461, longitude: 34.8516 },
  { country: "Qatar", iso: "qa", latitude: 25.3548, longitude: 51.1839 },
  { country: "Ireland", iso: "ie", latitude: 53.4129, longitude: -8.2439 },
  {
    country: "Bangladesh",
    iso: "bd",
    latitude: 23.685,
    longitude: 90.3563,
  },
  { country: "Pakistan", iso: "pk", latitude: 30.3753, longitude: 69.3451 },
  { country: "Sri Lanka", iso: "lk", latitude: 7.8731, longitude: 80.7718 },
  { country: "Egypt", iso: "eg", latitude: 26.8206, longitude: 30.8025 },
  { country: "Finland", iso: "fi", latitude: 61.9241, longitude: 25.7482 },
  { country: "Norway", iso: "no", latitude: 60.472, longitude: 8.4689 },
  { country: "Austria", iso: "at", latitude: 47.5162, longitude: 14.5501 },
  { country: "Luxembourg", iso: "lu", latitude: 49.8153, longitude: 6.1296 },
  { country: "Morocco", iso: "ma", latitude: 31.7917, longitude: -7.0926 },
  { country: "Nepal", iso: "np", latitude: 28.3949, longitude: 84.124 },
  { country: "Nigeria", iso: "ng", latitude: 9.082, longitude: 8.6753 },
  { country: "Chile", iso: "cl", latitude: -35.6751, longitude: -71.543 },
  { country: "Romania", iso: "ro", latitude: 45.9432, longitude: 24.9668 },
  { country: "Ukraine", iso: "ua", latitude: 48.3794, longitude: 31.1656 },
  { country: "Poland", iso: "pl", latitude: 51.9194, longitude: 19.1451 },
  { country: "Mexico", iso: "mx", latitude: 23.6345, longitude: -102.5528 },
  {
    country: "South Africa",
    iso: "za",
    latitude: -30.5595,
    longitude: 22.9375,
  },
  { country: "Other locations", iso: "other", latitude: 0, longitude: 0 },
  { country: "Unknown", iso: "unknown", latitude: 0, longitude: 0 },
];
