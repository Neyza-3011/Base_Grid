import { describe, expect, it } from "vitest";
import { validateSignatureBase64 } from "./validation";

function pngDataUrl(width: number, height: number): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return "data:image/png;base64," + bytes.toString("base64");
}

function jpegDataUrl(width: number, height: number): string {
  const bytes = Buffer.from([
    0xff, 0xd8,             // SOI
    0xff, 0xc0,             // Baseline SOF
    0x00, 0x0b,             // Segment length: 11 bytes including the length field
    0x08,                   // Precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00, // One component
  ]);
  return "data:image/jpeg;base64," + bytes.toString("base64");
}

describe("signature image dimension validation", () => {
  it("accepts PNG and JPEG signatures within the pixel limits", () => {
    expect(validateSignatureBase64(pngDataUrl(2048, 2048)).valid).toBe(true);
    expect(validateSignatureBase64(jpegDataUrl(1600, 1200)).valid).toBe(true);
  });

  it("rejects PNG images whose dimensions exceed the limit", () => {
    const result = validateSignatureBase64(pngDataUrl(3000, 1000));
    expect(result.valid).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("dimensioni");
  });

  it("rejects JPEG images whose dimensions exceed the limit", () => {
    const result = validateSignatureBase64(jpegDataUrl(3000, 1000));
    expect(result.valid).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("dimensioni");
  });

  it("rejects truncated or dimensionless image headers", () => {
    const invalidPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
    const invalidJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    expect(validateSignatureBase64("data:image/png;base64," + invalidPng).valid).toBe(false);
    expect(validateSignatureBase64("data:image/jpeg;base64," + invalidJpeg).valid).toBe(false);
  });
});
