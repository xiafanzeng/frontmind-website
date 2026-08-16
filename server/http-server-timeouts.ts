import type { Server } from "node:http";

export const WEBSITE_HEADERS_TIMEOUT_MS = 60_000;
export const WEBSITE_KEEP_ALIVE_TIMEOUT_MS = 5_000;

export function configureWebsiteHttpServer(server: Server) {
  // Node's requestTimeout is a fixed wall-clock budget for the whole request.
  // Large uploads instead use the GEO route's byte-progress idle watchdog and
  // bounded post-body confirmation wait, so a healthy slow transfer is never
  // terminated merely because it crossed Node's default five-minute total.
  server.requestTimeout = 0;
  server.headersTimeout = WEBSITE_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = WEBSITE_KEEP_ALIVE_TIMEOUT_MS;
  return server;
}
