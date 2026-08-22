export const GEO_SERVICE_MONTHLY_PRICE_FEN = {
  reputation: 200_000,
  product_scenario: 150_000,
  competitor_comparison: 200_000,
} as const;

export type GeoPricedServiceCategory =
  keyof typeof GEO_SERVICE_MONTHLY_PRICE_FEN;

export function geoServiceMonthlyPriceFen(
  category: GeoPricedServiceCategory,
  edition: "domestic" | "overseas" = "domestic",
) {
  const basePrice = GEO_SERVICE_MONTHLY_PRICE_FEN[category];
  return edition === "overseas" ? basePrice * 2 : basePrice;
}
