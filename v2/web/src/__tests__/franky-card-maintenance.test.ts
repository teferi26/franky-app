// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/origin-checkout", () => ({
  secretMatches: (actual: string, expected?: string) =>
    !!expected && actual === expected,
}));
vi.mock("@/lib/supabase-admin", () => ({ createAdminSupabase: mocks.admin }));
import { GET } from "@/app/api/cron/franky-card/route";
const path =
  "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.jpg";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "local-test");
  mocks.from.mockReturnValue({ remove: mocks.remove });
  mocks.admin.mockReturnValue({
    rpc: mocks.rpc,
    storage: { from: mocks.from },
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "service_cleanup_franky_card"
        ? {
            expired_requests_deleted: 1,
            expired_credentials_deleted: 2,
            expired_quotes_deleted: 3,
            storage_candidates: [{ bucket: "card-media", path }],
          }
        : { claimed: true, claim_id: "30000000-0000-4000-8000-000000000001" },
    error: null,
  }));
});
const request = (authorized = true) =>
  new Request("https://franky.es/api/cron/franky-card", {
    headers: authorized ? { authorization: "Bearer local-test" } : {},
  });
describe("Franky Card storage cleanup", () => {
  it("requires the cron secret before using elevated credentials", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("removes a file only after its object-shaped atomic claim succeeds", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "service_claim_franky_card_storage",
      { p_bucket: "card-media", p_path: path },
    );
    expect(mocks.remove).toHaveBeenCalledWith([path]);
    expect(await response.json()).toEqual({
      expiredRequests: 1,
      expiredCredentials: 2,
      expiredQuotes: 3,
      filesRemoved: 1,
      failures: 0,
    });
  });
  it("preserves a photo that has been adopted since candidate selection", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { storage_candidates: [{ bucket: "card-media", path }] },
      })
      .mockResolvedValueOnce({ data: { claimed: false } });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not accept a malformed claim or unapproved bucket", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          storage_candidates: [
            { bucket: "avatars", path },
            { bucket: "card-media", path },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { claimed: true, claim_id: null } });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("keeps storage failures visible for retry instead of claiming erasure", async () => {
    mocks.remove.mockResolvedValue({ error: { message: "temporary failure" } });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect((await response.json()).filesRemoved).toBe(0);
  });
});
