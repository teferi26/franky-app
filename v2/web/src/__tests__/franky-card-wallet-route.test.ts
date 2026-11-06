// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  apple: vi.fn(),
  google: vi.fn(),
  availability: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  table: vi.fn(),
}));
vi.mock("@/lib/franky-card-api", () => ({
  cardRequest: state.auth,
  CARD_PRIVATE_HEADERS: { "Cache-Control": "private, no-store" },
  cardFailure: (message: string, status = 400) =>
    NextResponse.json({ error: message }, { status }),
}));
vi.mock("@/lib/franky-card-wallet", () => ({
  buildAppleCard: state.apple,
  buildGoogleCard: state.google,
  cardWalletAvailability: state.availability,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabase: () => ({
    from: state.table,
    storage: {
      from: () => ({ upload: state.upload, createSignedUrl: state.sign }),
    },
  }),
}));
import { POST } from "@/app/api/card/wallet/route";
const holder = "10000000-0000-4000-8000-000000000001",
  token = "b".repeat(64);
const personal = {
  enabled: true,
  demo: false,
  profile: { full_name: "Prueba", photo_path: holder + "/private.jpg" },
};
const request = (platform = "apple") =>
  new NextRequest("https://franky.es/api/card/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  state.availability.mockReturnValue({ appleWallet: true, googleWallet: true });
  state.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_franky_card" ? personal : { token, kind: "wallet" },
    error: null,
  }));
  state.auth.mockResolvedValue({
    user: { id: holder },
    client: {
      rpc: state.rpc,
      storage: { from: () => ({ download: state.download }) },
    },
  });
  state.download.mockResolvedValue({
    data: new Blob(["fixture"]),
    error: null,
  });
  state.apple.mockResolvedValue(Buffer.from("fixture"));
  state.google.mockResolvedValue("https://pay.google.com/gp/v/save/example");
  state.upload.mockResolvedValue({ error: null });
  state.sign.mockResolvedValue({
    data: { signedUrl: "https://fixture.supabase.co/signed" },
    error: null,
  });
  state.eq.mockReturnValue({ eq: state.eq });
  state.update.mockReturnValue({ eq: state.eq });
  state.table.mockReturnValue({ update: state.update });
});
describe("Franky Card Wallet issuance boundaries", () => {
  it("does not send demo data to an external wallet", async () => {
    state.rpc.mockResolvedValue({
      data: { ...personal, demo: true },
      error: null,
    });
    expect((await POST(request())).status).toBe(409);
    expect(state.apple).not.toHaveBeenCalled();
    expect(state.google).not.toHaveBeenCalled();
  });
  it("keeps provider availability separate from possession of a card", async () => {
    state.availability.mockReturnValue({
      appleWallet: false,
      googleWallet: false,
    });
    expect((await POST(request())).status).toBe(503);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("retires only the newly issued lookup after a signing failure", async () => {
    state.apple.mockRejectedValue(new Error("signing unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(state.table).toHaveBeenCalledWith("franky_card_credentials");
    expect(state.eq.mock.calls).toEqual([
      ["user_id", holder],
      ["kind", "wallet"],
      ["token_hash", createHash("sha256").update(token).digest("hex")],
    ]);
    expect(state.update).toHaveBeenCalledTimes(1);
  });
  it("also retires the new lookup if the private photo cannot be downloaded", async () => {
    state.download.mockResolvedValue({
      data: null,
      error: { message: "offline" },
    });
    expect((await POST(request())).status).toBe(503);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.apple).not.toHaveBeenCalled();
  });
  it("keeps existing passes when the explicit wallet limit is reached", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: personal })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "card_wallet_limit" },
      });
    expect((await POST(request())).status).toBe(409);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.apple).not.toHaveBeenCalled();
  });
  it("returns a short private download link after successful Apple issuance", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(state.sign).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp("^" + holder + "/")),
      120,
      { download: "Franky.pkpass" },
    );
    expect(state.update).not.toHaveBeenCalled();
  });
  it("never uploads a Google pass or photo to public storage", async () => {
    expect((await POST(request("google"))).status).toBe(200);
    expect(state.download).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.google).toHaveBeenCalledWith(
      holder,
      personal,
      expect.objectContaining({ token }),
    );
  });
});
