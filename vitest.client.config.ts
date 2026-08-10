import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { releaseProfile } from "./config/release-profile.mjs";

export default defineConfig({
  define: {
    __FRONTMIND_SITE_URL__: JSON.stringify(releaseProfile.siteUrl),
    __FRONTMIND_CLIENT_PORTAL_URL__: JSON.stringify(
      releaseProfile.clientPortalUrl,
    ),
    __FRONTMIND_ROBOTS_DIRECTIVE__: JSON.stringify(
      releaseProfile.robotsDirective,
    ),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: [
      "client/src/features/geo/**/*.test.{ts,tsx}",
      "client/src/data/geoCommunity/**/*.test.ts",
    ],
  },
});
