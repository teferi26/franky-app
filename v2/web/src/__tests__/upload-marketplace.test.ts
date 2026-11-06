// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HTML, JPEG, PNG, WEBP, bytesOf, uploadRequest } from './upload-fixtures';

const upload = vi.fn();
const getPublicUrl = vi.fn((p: string) => ({ data: { publicUrl: `https://cdn.test/stories-media/${p}` } }));
const getUser = vi.fn();

vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/supabase-server', () => ({ createRequestSupabase: vi.fn(async () => ({ auth: { getUser } })) }));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabase: vi.fn(() => ({ storage: { from: vi.fn(() => ({ upload, getPublicUrl })) } })),
}));

const { POST } = await import('@/app/api/marketplace/upload/route');
const URL_ = 'https://franky.es/api/marketplace/upload';
const USER = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER } } });
  upload.mockResolvedValue({ error: null });
});

describe('POST /api/marketplace/upload valida por magic bytes', () => {
  it('rechaza un HTML declarado como image/jpeg y no sube nada', async () => {
    const res = await POST(uploadRequest(URL_, HTML, 'foto.jpg', 'image/jpeg'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_type');
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['jpg', 'image/jpeg', JPEG],
    ['png', 'image/png', PNG],
    ['webp', 'image/webp', WEBP],
  ] as const)('acepta un %s real y usa la extensión y el MIME detectados', async (ext, mime, bytes) => {
    // Content-Type y nombre mentirosos: deben ignorarse en favor del contenido.
    const res = await POST(uploadRequest(URL_, bytes, 'cualquiera.exe', 'text/html'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^[0-9a-f-]+\/market-[0-9a-f-]+\.(?:jpg|png|webp)$/);
    expect(path.startsWith(`${USER}/market-`)).toBe(true);
    expect(path.endsWith(`.${ext}`)).toBe(true);
    expect(opts).toMatchObject({ contentType: mime, upsert: false });
    expect(body.url).toContain(`.${ext}`);
  });

  it('rechaza GIF aunque sea una imagen real (el mercado solo admite JPG/PNG/WebP)', async () => {
    const gif = bytesOf('GIF89a\x01\x00\x01\x00');
    const res = await POST(uploadRequest(URL_, gif, 'a.gif', 'image/gif'));
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('devuelve 413 si supera 5 MB', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(JPEG);
    const res = await POST(uploadRequest(URL_, big, 'a.jpg', 'image/jpeg'));
    expect(res.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it('exige sesión', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(uploadRequest(URL_, JPEG, 'a.jpg', 'image/jpeg'));
    expect(res.status).toBe(401);
    expect(upload).not.toHaveBeenCalled();
  });
});
