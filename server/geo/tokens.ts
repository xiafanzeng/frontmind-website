import crypto from "node:crypto";

type TokenEnvelope<T> = {
  type: string;
  issuedAt: number;
  expiresAt: number;
  value: T;
};

export class GeoTokenError extends Error {
  constructor(message = "令牌无效或已过期") {
    super(message);
    this.name = "GeoTokenError";
  }
}

export class GeoTokenExpiredError extends GeoTokenError {
  constructor(message = "令牌已过期") {
    super(message);
    this.name = "GeoTokenExpiredError";
  }
}

type GeoTokenOpenOptions = {
  expirationGraceMs?: number;
};

export class GeoTokenCodec {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 16)
      throw new Error(
        "FRONTMIND_GEO_SESSION_SECRET must be at least 16 characters",
      );
    this.key = crypto.createHash("sha256").update(secret, "utf8").digest();
  }

  seal<T>(type: string, value: T, ttlMs: number) {
    const issuedAt = Date.now();
    const envelope: TokenEnvelope<T> = {
      type,
      issuedAt,
      expiresAt: issuedAt + ttlMs,
      value,
    };
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`frontmind-geo:${type}`, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(envelope), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`;
  }

  open<T>(
    token: string,
    expectedType: string,
    options: GeoTokenOpenOptions = {},
  ) {
    try {
      const expirationGraceMs = options.expirationGraceMs ?? 0;
      if (!Number.isSafeInteger(expirationGraceMs) || expirationGraceMs < 0) {
        throw new GeoTokenError();
      }
      const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
        token.split(".");
      if (
        version !== "v1" ||
        !encodedIv ||
        !encodedTag ||
        !encodedCiphertext ||
        extra
      ) {
        throw new GeoTokenError();
      }
      const iv = fromBase64Url(encodedIv);
      const tag = fromBase64Url(encodedTag);
      const ciphertext = fromBase64Url(encodedCiphertext);
      if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0)
        throw new GeoTokenError();

      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(Buffer.from(`frontmind-geo:${expectedType}`, "utf8"));
      decipher.setAuthTag(tag);
      const cleartext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(cleartext) as TokenEnvelope<T>;
      if (parsed.type !== expectedType || !Number.isFinite(parsed.expiresAt)) {
        throw new GeoTokenError();
      }
      if (parsed.expiresAt <= Date.now() - expirationGraceMs) {
        throw new GeoTokenExpiredError();
      }
      return parsed;
    } catch (error) {
      if (error instanceof GeoTokenError) throw error;
      throw new GeoTokenError();
    }
  }
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

export function safeSecretEqual(candidate: string, expected: string) {
  const candidateHash = crypto
    .createHash("sha256")
    .update(candidate, "utf8")
    .digest();
  const expectedHash = crypto
    .createHash("sha256")
    .update(expected, "utf8")
    .digest();
  return crypto.timingSafeEqual(candidateHash, expectedHash);
}

export function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  for (const part of (header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies.set(key, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}
