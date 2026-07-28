import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { installBaseSecurityHeaders } from "./security";

let server: Server | undefined;

afterEach(
  () =>
    new Promise<void>((resolve, reject) => {
      if (!server) return resolve();
      server.close((error) => (error ? reject(error) : resolve()));
      server = undefined;
    }),
);

describe("base HTTP security headers", () => {
  it("removes framework disclosure and protects API and static responses", async () => {
    const app = express();
    installBaseSecurityHeaders(app);
    app.get("/asset.txt", (_req, res) => res.type("text").send("ok"));
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/asset.txt`);

    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});
