import { describe, it, expect } from "vitest";
import { parseCardCredential } from "../../../shared/franky-card";
describe("Card codes shared across web, native and Wallet", () => {
  const token = "0123456789abcdef".repeat(4);
  it("accepts the existing web/Wallet locator and native v1 QR", () => {
    expect(parseCardCredential(token)).toBe(token);
    expect(parseCardCredential("  franky:card:v1:" + token + "  ")).toBe(token);
  });
  it.each([
    "franky:card:v2:" + token,
    "https://franky.es/" + token,
    token + "x",
    token.slice(1),
    "",
    "franky:card:v1:franky:card:v1:" + token,
  ])("refuses malformed or unsupported codes: %s", (value) => {
    expect(parseCardCredential(value)).toBeNull();
  });
});
