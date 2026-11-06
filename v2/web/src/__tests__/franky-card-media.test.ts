// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  userFrom: vi.fn(),
  upload: vi.fn(),
  userSign: vi.fn(),
  remove: vi.fn(),
  admin: vi.fn(),
  adminFrom: vi.fn(),
  adminSign: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  createRequestSupabase: async () => ({
    auth: { getUser: state.getUser },
    rpc: state.rpc,
    storage: { from: state.userFrom },
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({ createAdminSupabase: state.admin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: state.limit }));
import { GET, POST } from "@/app/api/card/media/route";

const holder = "10000000-0000-0000-0000-000000000001";
const other = "10000000-0000-0000-0000-000000000002";
const photo = "20000000-0000-0000-0000-000000000001.jpg";
const operation = "30000000-0000-0000-0000-000000000001";
const ownPath = `${holder}/${photo}`,
  approvedPath = `${other}/${photo}`;
const authorized = () => ({
  actor: "merchant",
  status: "customer_confirmed",
  identity: { photo_path: approvedPath },
  expires_at: new Date(Date.now() + 60000).toISOString(),
});
function operationReply(data: unknown, error: unknown = null) {
  state.rpc.mockImplementation(async (name: string) =>
    name === "account_session_usable"
      ? { data: true, error: null }
      : { data, error },
  );
}
function get(params: Record<string, string>) {
  return GET(
    new NextRequest(
      "https://franky.es/api/card/media?" + new URLSearchParams(params),
    ),
  );
}
function uploadRequest(bytes: Uint8Array, type = "image/jpeg") {
  const form = new FormData();
  form.set(
    "file",
    new File([Uint8Array.from(bytes)], "private-photo.jpg", { type }),
  );
  return new NextRequest("https://franky.es/api/card/media", {
    method: "POST",
    body: form,
  });
}
function expectNoStorage() {
  expect(state.userFrom).not.toHaveBeenCalled();
  expect(state.admin).not.toHaveBeenCalled();
  expect(state.upload).not.toHaveBeenCalled();
  expect(state.adminSign).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  state.getUser.mockResolvedValue({
    data: { user: { id: holder } },
    error: null,
  });
  operationReply(authorized());
  state.limit.mockResolvedValue({ ok: true });
  state.userFrom.mockReturnValue({
    upload: state.upload,
    createSignedUrl: state.userSign,
    remove: state.remove,
  });
  state.upload.mockResolvedValue({ data: { path: ownPath }, error: null });
  state.userSign.mockResolvedValue({
    data: { signedUrl: "https://storage.invalid/own-short-lived" },
    error: null,
  });
  state.remove.mockResolvedValue({ error: null });
  state.admin.mockReturnValue({ storage: { from: state.adminFrom } });
  state.adminFrom.mockReturnValue({ createSignedUrl: state.adminSign });
  state.adminSign.mockResolvedValue({
    data: { signedUrl: "https://storage.invalid/operation-short-lived" },
    error: null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("Unexpected network request in media tests");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("private Card photo authorization", () => {
  it.each([
    approvedPath,
    `${holder}/../${other}/${photo}`,
    `${holder}/unexpected.jpg`,
  ])(
    "does not sign an unauthorized or malformed personal path: %s",
    async (path) => {
      const response = await get({ path });
      expect(response.status).toBe(403);
      expectNoStorage();
    },
  );
  it("signs the holder photo for 120 seconds using the holder session only", async () => {
    const response = await get({ path: ownPath });
    expect(response.status).toBe(200);
    expect(state.userFrom).toHaveBeenCalledWith("card-media");
    expect(state.userSign).toHaveBeenCalledExactlyOnceWith(ownPath, 120);
    expect(state.admin).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      url: "https://storage.invalid/own-short-lived",
      expiresIn: 120,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  });
  it.each([
    [
      "without holder consent",
      () => ({ ...authorized(), status: "pending", identity: null }),
    ],
    ["rejected", () => ({ ...authorized(), status: "rejected" })],
    ["already completed", () => ({ ...authorized(), status: "completed" })],
    [
      "expired",
      () => ({
        ...authorized(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ],
    [
      "customer instead of merchant",
      () => ({ ...authorized(), actor: "customer" }),
    ],
    [
      "without a photo",
      () => ({ ...authorized(), identity: { photo_path: null } }),
    ],
  ] as const)(
    "never uses service credentials for an operation %s",
    async (_name, request) => {
      operationReply(request());
      const response = await get({ operation });
      expect(response.status).toBe(403);
      expectNoStorage();
      expect(state.rpc).toHaveBeenCalledWith("get_franky_card_request", {
        p_request_id: operation,
      });
    },
  );
  it("fails closed when the current membership was revoked or request lookup fails", async () => {
    operationReply(null, { message: "card_forbidden" });
    const response = await get({ operation });
    expect(response.status).toBe(403);
    expectNoStorage();
  });
  it("denies a revoked account session before looking up or signing a photograph", async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    const response = await get({ operation });
    expect(response.status).toBe(403);
    expectNoStorage();
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("account_session_usable");
  });
  it("signs only the path returned by the authorized RPC for 30 seconds, ignoring a caller-supplied path", async () => {
    const response = await get({ operation, path: ownPath });
    expect(response.status).toBe(200);
    expect(state.admin).toHaveBeenCalledTimes(1);
    expect(state.adminFrom).toHaveBeenCalledWith("card-media");
    expect(state.adminSign).toHaveBeenCalledExactlyOnceWith(approvedPath, 30);
    expect(state.userFrom).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      url: "https://storage.invalid/operation-short-lived",
      expiresIn: 30,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects an invalid operation identifier without using elevated storage", async () => {
    const response = await get({ operation: "not-an-operation" });
    expect(response.status).toBe(400);
    expectNoStorage();
    expect(state.rpc).not.toHaveBeenCalledWith(
      "get_franky_card_request",
      expect.anything(),
    );
  });
});

describe("Card photo decoding and private upload", () => {
  it("rejects non-image bytes even when the upload claims to be a JPEG", async () => {
    const response = await POST(
      uploadRequest(new TextEncoder().encode("This is not a JPEG.")),
    );
    expect(response.status).toBe(400);
    expectNoStorage();
  });
  it("rejects a file over three megabytes before using storage", async () => {
    const response = await POST(
      uploadRequest(new Uint8Array(3 * 1024 * 1024 + 1)),
    );
    expect(response.status).toBe(400);
    expectNoStorage();
  });
  it("rejects an oversized declared HTTP body without consuming or storing it", async () => {
    const req = new NextRequest("https://franky.es/api/card/media", {
      method: "POST",
      body: "small",
      headers: {
        "content-type": "multipart/form-data; boundary=fixture",
        "content-length": String(4 * 1024 * 1024),
      },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expectNoStorage();
    expect(req.bodyUsed).toBe(false);
  });
  it("bounds an untrusted streaming body even without a content-length header", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3 * 1024 * 1024 + 64 * 1024 + 1));
      },
      cancel,
    });
    const init = {
      method: "POST",
      body,
      duplex: "half" as const,
      headers: { "content-type": "multipart/form-data; boundary=fixture" },
    };
    const req = new NextRequest("https://franky.es/api/card/media", init);
    const response = await POST(req);
    expect(response.status).toBe(400);
    expectNoStorage();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("enforces the pixel ceiling on a genuinely compressed oversized image", async () => {
    const source = await sharp({
      create: { width: 4097, height: 4096, channels: 3, background: "#753384" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(source.length).toBeLessThan(3 * 1024 * 1024);
    const response = await POST(uploadRequest(source, "image/png"));
    expect(response.status).toBe(400);
    expectNoStorage();
  });
  it("really decodes and re-encodes pixels, strips EXIF, and uploads only to the holder private folder", async () => {
    const source = await sharp({
      create: { width: 32, height: 20, channels: 3, background: "#753384" },
    })
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Artist: "PRIVATE CARD TEST METADATA" } },
      })
      .png()
      .toBuffer();
    expect((await sharp(source).metadata()).exif?.length).toBeGreaterThan(0);
    const response = await POST(uploadRequest(source, "image/png"));
    expect(response.status).toBe(200);
    const [path, output, options] = state.upload.mock.calls[0] as [
      string,
      Buffer,
      Record<string, unknown>,
    ];
    expect(path).toMatch(new RegExp(`^${holder}/[a-f0-9-]{36}\\.jpg$`));
    const decoded = await sharp(output).metadata();
    expect(decoded.format).toBe("jpeg");
    expect(decoded.exif).toBeUndefined();
    expect(decoded.orientation).toBeUndefined();
    expect(decoded.icc).toBeUndefined();
    expect(output.includes(Buffer.from("PRIVATE CARD TEST METADATA"))).toBe(
      false,
    );
    expect(output.equals(source)).toBe(false);
    expect(options).toEqual({
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "0",
    });
    expect(state.userSign).toHaveBeenCalledExactlyOnceWith(path, 120);
    expect(state.admin).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      path,
      url: "https://storage.invalid/own-short-lived",
      expiresIn: 120,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("removes a newly uploaded file if its first private preview cannot be signed", async () => {
    state.userSign.mockResolvedValue({
      data: null,
      error: { message: "signing unavailable" },
    });
    const source = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#753384" },
    })
      .jpeg()
      .toBuffer();
    const response = await POST(uploadRequest(source));
    expect(response.status).toBe(503);
    const path = state.upload.mock.calls[0]?.[0];
    expect(path).toBeTruthy();
    expect(state.remove).toHaveBeenCalledExactlyOnceWith([path]);
    expect(state.admin).not.toHaveBeenCalled();
  });
});
