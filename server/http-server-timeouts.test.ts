import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  configureWebsiteHttpServer,
  WEBSITE_HEADERS_TIMEOUT_MS,
  WEBSITE_KEEP_ALIVE_TIMEOUT_MS,
} from "./http-server-timeouts";

describe("configureWebsiteHttpServer", () => {
  it("removes the fixed total request budget while retaining header and idle keep-alive guards", () => {
    const server = configureWebsiteHttpServer(createServer());

    expect(server.requestTimeout).toBe(0);
    expect(server.headersTimeout).toBe(WEBSITE_HEADERS_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBe(WEBSITE_KEEP_ALIVE_TIMEOUT_MS);

    server.close();
  });
});
