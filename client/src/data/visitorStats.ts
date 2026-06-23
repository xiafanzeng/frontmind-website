export type VisitorCountry = {
  country: string;
  iso: string;
  reads: number;
  latitude: number;
  longitude: number;
};

export const visitorStatsSummary = {
  totalReads: 1407,
  countryCount: 53,
};

export const visitorCountries: VisitorCountry[] = [
  { country: "China", iso: "cn", reads: 930, latitude: 35.8617, longitude: 104.1954 },
  { country: "Hong Kong, China", iso: "hk", reads: 112, latitude: 22.3193, longitude: 114.1694 },
  { country: "United States", iso: "us", reads: 48, latitude: 39.8283, longitude: -98.5795 },
  { country: "Singapore", iso: "sg", reads: 38, latitude: 1.3521, longitude: 103.8198 },
  { country: "Taiwan", iso: "tw", reads: 36, latitude: 23.6978, longitude: 120.9605 },
  { country: "Japan", iso: "jp", reads: 28, latitude: 36.2048, longitude: 138.2529 },
  { country: "South Korea", iso: "kr", reads: 24, latitude: 35.9078, longitude: 127.7669 },
  { country: "Germany", iso: "de", reads: 18, latitude: 51.1657, longitude: 10.4515 },
  { country: "United Kingdom", iso: "gb", reads: 15, latitude: 55.3781, longitude: -3.436 },
  { country: "Canada", iso: "ca", reads: 13, latitude: 56.1304, longitude: -106.3468 },
  { country: "Australia", iso: "au", reads: 12, latitude: -25.2744, longitude: 133.7751 },
  { country: "Malaysia", iso: "my", reads: 11, latitude: 4.2105, longitude: 101.9758 },
  { country: "Vietnam", iso: "vn", reads: 10, latitude: 14.0583, longitude: 108.2772 },
  { country: "India", iso: "in", reads: 9, latitude: 20.5937, longitude: 78.9629 },
  { country: "France", iso: "fr", reads: 8, latitude: 46.2276, longitude: 2.2137 },
  { country: "Thailand", iso: "th", reads: 8, latitude: 15.87, longitude: 100.9925 },
  { country: "United Arab Emirates", iso: "ae", reads: 6, latitude: 23.4241, longitude: 53.8478 },
  { country: "Indonesia", iso: "id", reads: 6, latitude: -0.7893, longitude: 113.9213 },
  { country: "Netherlands", iso: "nl", reads: 5, latitude: 52.1326, longitude: 5.2913 },
  { country: "Italy", iso: "it", reads: 5, latitude: 41.8719, longitude: 12.5674 },
  { country: "Spain", iso: "es", reads: 4, latitude: 40.4637, longitude: -3.7492 },
  { country: "Switzerland", iso: "ch", reads: 4, latitude: 46.8182, longitude: 8.2275 },
  { country: "New Zealand", iso: "nz", reads: 4, latitude: -40.9006, longitude: 174.886 },
  { country: "Brazil", iso: "br", reads: 3, latitude: -14.235, longitude: -51.9253 },
  { country: "Sweden", iso: "se", reads: 3, latitude: 60.1282, longitude: 18.6435 },
  { country: "Philippines", iso: "ph", reads: 3, latitude: 12.8797, longitude: 121.774 },
  { country: "Russia", iso: "ru", reads: 3, latitude: 61.524, longitude: 105.3188 },
  { country: "Saudi Arabia", iso: "sa", reads: 3, latitude: 23.8859, longitude: 45.0792 },
  { country: "Türkiye", iso: "tr", reads: 2, latitude: 38.9637, longitude: 35.2433 },
  { country: "Belgium", iso: "be", reads: 2, latitude: 50.5039, longitude: 4.4699 },
  { country: "Portugal", iso: "pt", reads: 2, latitude: 39.3999, longitude: -8.2245 },
  { country: "Israel", iso: "il", reads: 2, latitude: 31.0461, longitude: 34.8516 },
  { country: "Qatar", iso: "qa", reads: 2, latitude: 25.3548, longitude: 51.1839 },
  { country: "Ireland", iso: "ie", reads: 2, latitude: 53.4129, longitude: -8.2439 },
  { country: "Bangladesh", iso: "bd", reads: 2, latitude: 23.685, longitude: 90.3563 },
  { country: "Pakistan", iso: "pk", reads: 2, latitude: 30.3753, longitude: 69.3451 },
  { country: "Sri Lanka", iso: "lk", reads: 2, latitude: 7.8731, longitude: 80.7718 },
  { country: "Egypt", iso: "eg", reads: 1, latitude: 26.8206, longitude: 30.8025 },
  { country: "Finland", iso: "fi", reads: 1, latitude: 61.9241, longitude: 25.7482 },
  { country: "Norway", iso: "no", reads: 1, latitude: 60.472, longitude: 8.4689 },
  { country: "Austria", iso: "at", reads: 1, latitude: 47.5162, longitude: 14.5501 },
  { country: "Luxembourg", iso: "lu", reads: 1, latitude: 49.8153, longitude: 6.1296 },
  { country: "Morocco", iso: "ma", reads: 1, latitude: 31.7917, longitude: -7.0926 },
  { country: "Nepal", iso: "np", reads: 1, latitude: 28.3949, longitude: 84.124 },
  { country: "Nigeria", iso: "ng", reads: 1, latitude: 9.082, longitude: 8.6753 },
  { country: "Chile", iso: "cl", reads: 1, latitude: -35.6751, longitude: -71.543 },
  { country: "Romania", iso: "ro", reads: 1, latitude: 45.9432, longitude: 24.9668 },
  { country: "Ukraine", iso: "ua", reads: 1, latitude: 48.3794, longitude: 31.1656 },
  { country: "Poland", iso: "pl", reads: 1, latitude: 51.9194, longitude: 19.1451 },
  { country: "Mexico", iso: "mx", reads: 1, latitude: 23.6345, longitude: -102.5528 },
  { country: "South Africa", iso: "za", reads: 1, latitude: -30.5595, longitude: 22.9375 },
  { country: "Other locations", iso: "other", reads: 5, latitude: 0, longitude: 0 },
  { country: "Unknown", iso: "unknown", reads: 1, latitude: 0, longitude: 0 },
];
