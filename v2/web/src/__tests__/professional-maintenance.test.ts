// @vitest-environment node
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/origin-checkout", () => ({
  secretMatches: (a: string, b?: string) => !!b && a === b,
}));
vi.mock("@/lib/supabase-admin", () => ({ createAdminSupabase: mocks.admin }));
import { GET } from "@/app/api/cron/professional/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "synthetic");
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "service_professional_expire_waitlist"
        ? { offers_expired: 2, sessions_processed: 1 }
        : { delivered: 3, cancelled: 1 },
    error: null,
  }));
});
const request = (authorized = true) =>
  new Request("https://franky.es/api/cron/professional?demo=malicious", {
    headers: authorized ? { authorization: "Bearer synthetic" } : {},
  });
it("requires scheduler credentials before accessing the service client", async () => {
  expect((await GET(request(false))).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("processes expiry before delivery and cannot accept a caller-supplied cohort", async () => {
  const result = await GET(request());
  expect(result.status).toBe(200);
  expect(mocks.rpc.mock.calls).toEqual([
    [
      "service_professional_expire_waitlist",
      { p_limit: 50, p_demo_cohort_id: null },
    ],
    [
      "service_professional_deliver_notices",
      { p_limit: 100, p_demo_cohort_id: null },
    ],
  ]);
  expect(await result.json()).toEqual({
    offersExpired: 2,
    sessionsProcessed: 1,
    noticesDelivered: 3,
    noticesCancelled: 1,
    channel: "in_app",
  });
  expect(result.headers.get("cache-control")).toBe("no-store");
});
it("fails visibly without delivering potentially stale notices if expiry fails", async () => {
  mocks.rpc.mockResolvedValueOnce({
    error: { message: "internal private SQL details" },
  });
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(await result.json())).not.toContain("SQL");
});
it("records completed expiry but exposes a delivery failure for retry", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: { offers_expired: 2 } })
    .mockResolvedValueOnce({ error: { message: "network" } });
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect((await result.json()).offersExpired).toBe(2);
});
it("returns a retryable failure on a network rejection", async () => {
  mocks.rpc.mockRejectedValueOnce(Error("network"));
  expect((await GET(request())).status).toBe(503);
});
