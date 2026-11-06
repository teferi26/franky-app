// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { HTML, JPEG, PNG, WEBP, uploadRequest } from './upload-fixtures';

const upload = vi.fn();
const getPublicUrl = vi.fn((p: string) => ({ data: { publicUrl: `https://cdn.test/content-images/${p}` } }));

vi.mock('@/lib/admin-request', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAdminRequest: vi.fn(async () => ({ supabase: {}, user: { id: 'admin', email: null } })),
    adminJson: (data: unknown, init: ResponseInit = {}) => NextResponse.json(data, init),
  };
});
vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabase: vi.fn(() => ({
    storage: {
      listBuckets: vi.fn(async () => ({ data: [{ id: 'content-images' }] })),
      createBucket: vi.fn(),
      from: vi.fn(() => ({ upload, getPublicUrl })),
    },
  })),
}));

const { POST } = await import('@/app/api/admin/upload-image/route');
const URL_ = 'https://franky.es/api/admin/upload-image';
const req = (bytes: Uint8Array<ArrayBuffer>, name: string, type: string) =>
  uploadRequest(URL_, bytes, name, type, { folder: 'noticias' }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ error: null });
});

describe('POST /api/admin/upload-image deriva extensión y MIME del contenido', () => {
  it('rechaza un HTML declarado como image/jpeg', async () => {
    const res = await POST(req(HTML, 'foto.jpg', 'image/jpeg'));
    expect(res.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ['jpg', 'image/jpeg', JPEG],
    ['png', 'image/png', PNG],
    ['webp', 'image/webp', WEBP],
  ] as const)('acepta un %s real aunque el nombre y el Content-Type mientan', async (ext, mime, bytes) => {
    const res = await POST(req(bytes, 'payload.html', 'image/png'));
    expect(res.status).toBe(200);
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^noticias\/[0-9a-f-]+\.(?:jpg|png|webp)$/);
    expect(path.endsWith(`.${ext}`)).toBe(true);
    expect(opts).toMatchObject({ contentType: mime, upsert: false });
    expect((await res.json()).path).toBe(path);
  });
});
