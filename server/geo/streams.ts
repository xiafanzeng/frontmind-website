import { Transform } from "node:stream";

export class GeoByteLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response exceeds the ${maxBytes}-byte limit`);
    this.name = "GeoByteLimitError";
  }
}

export function assertResponseLengthWithinLimit(
  response: Response,
  maxBytes: number,
) {
  const header = response.headers.get("content-length");
  if (!header) return;
  const declared = Number(header);
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
    throw new GeoByteLimitError(maxBytes);
  }
}

export async function readResponseBufferLimited(
  response: Response,
  maxBytes: number,
) {
  assertResponseLengthWithinLimit(response, maxBytes);
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new GeoByteLimitError(maxBytes);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

export function createByteLimitTransform(maxBytes: number) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += Buffer.byteLength(chunk);
      if (received > maxBytes) {
        callback(new GeoByteLimitError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
}
