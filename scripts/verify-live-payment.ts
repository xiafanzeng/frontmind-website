import { verifyGeoPaymentProviderFromEnv } from "../server/geo/payment";

const result = await verifyGeoPaymentProviderFromEnv({
  ...process.env,
  NODE_ENV: "production",
});

console.log(JSON.stringify(result, null, 2));
