import { describe, expect, it } from "vitest";
import { GeoByteLimitError, readResponseBufferLimited } from "./streams";

describe("bounded response readers", () => {
  it("stops an unbounded stream before buffering beyond the hard limit", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(8));
          controller.enqueue(new Uint8Array(8));
          controller.close();
        },
      }),
    );
    await expect(
      readResponseBufferLimited(response, 10),
    ).rejects.toBeInstanceOf(GeoByteLimitError);
  });

  it("rejects an oversized declared response before reading its body", async () => {
    const response = new Response("small", {
      headers: { "content-length": "999" },
    });
    await expect(
      readResponseBufferLimited(response, 10),
    ).rejects.toBeInstanceOf(GeoByteLimitError);
  });
});
