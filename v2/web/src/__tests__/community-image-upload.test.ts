import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadCommunityImage } from '@/lib/community-image-upload';
import { prepareImageForUpload } from '@/lib/image-upload';
import { uploadPrivateSocialMedia } from '@/lib/social-media-client';

vi.mock('@/lib/image-upload', () => ({ prepareImageForUpload: vi.fn() }));
vi.mock('@/lib/social-media-client', () => ({ uploadPrivateSocialMedia: vi.fn() }));
const owner = '11111111-1111-4111-8111-111111111111';
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const file = () => new File([png], 'foto.png', { type: 'image/png' });
const setup = () => {
  const getUser = vi.fn().mockResolvedValue({data:{user:{id:owner}},error:null});
  const upload = vi.fn().mockResolvedValue({error:null});
  const getPublicUrl = vi.fn((p:string) => ({data:{publicUrl:`https://example.test/avatars/${p}`}}));
  const from = vi.fn(() => ({upload,getPublicUrl}));
  const client = {auth:{getUser},storage:{from}} as unknown as SupabaseClient;
  return {client,getUser,upload,getPublicUrl,from};
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prepareImageForUpload).mockResolvedValue({ok:true,blob:file(),contentType:'image/png',ext:'png'});
  vi.mocked(uploadPrivateSocialMedia).mockResolvedValue({url:'https://example.test/ugc-approved/reviewed.png',type:'image'});
});
describe('community images remain private until moderation', () => {
  it('uses the private moderation upload, never the public avatars bucket', async () => {
    const {client,from,upload} = setup();
    const result = await uploadCommunityImage(client,owner,file());
    expect(from).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
    expect(uploadPrivateSocialMedia).toHaveBeenCalledWith(client,owner,expect.any(Blob),'image/png');
    expect(result.url).toContain('/ugc-approved/');
  });
  it('rejects a session belonging to a different owner before preparing or uploading', async () => {
    const {client,getUser,upload} = setup();
    getUser.mockResolvedValue({data:{user:{id:'another-user'}},error:null});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('sesión');
    expect(prepareImageForUpload).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects a session change during image conversion', async () => {
    const {client,getUser,upload} = setup();
    getUser.mockResolvedValueOnce({data:{user:{id:owner}},error:null}).mockResolvedValue({data:{user:null},error:null});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('sesión');
    expect(upload).not.toHaveBeenCalled();
  });
  it('does not attach an uploaded URL to a different session', async () => {
    const {client,getUser,getPublicUrl} = setup();
    getUser.mockResolvedValueOnce({data:{user:{id:owner}},error:null}).mockResolvedValueOnce({data:{user:{id:owner}},error:null}).mockResolvedValue({data:{user:null},error:null});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('sesión');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
  it('rejects GIF rather than relabelling it as JPEG', async () => {
    const {client,upload} = setup();
    vi.mocked(prepareImageForUpload).mockResolvedValue({ok:true,blob:new Blob(['GIF89a']),contentType:'image/gif',ext:'gif'});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('GIF');
    expect(upload).not.toHaveBeenCalled();
  });
  it('rejects disguised non-images even if the normalizer falls back', async () => {
    const {client,upload} = setup();
    vi.mocked(prepareImageForUpload).mockResolvedValue({ok:true,blob:new Blob(['<html>invalid</html>']),contentType:'image/png',ext:'png'});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('no es válida');
    expect(upload).not.toHaveBeenCalled();
  });
  it('enforces the actual bucket size limit after conversion', async () => {
    const {client,upload} = setup();
    vi.mocked(prepareImageForUpload).mockResolvedValue({ok:true,blob:new Blob([png,new Uint8Array(5*1024*1024)]),contentType:'image/png',ext:'png'});
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('5 MB');
    expect(upload).not.toHaveBeenCalled();
  });
  it('does not return a URL after a rejected storage operation', async () => {
    const {client,upload,getPublicUrl} = setup();
    vi.mocked(uploadPrivateSocialMedia).mockRejectedValue(new Error('No se pudo subir'));
    await expect(uploadCommunityImage(client,owner,file())).rejects.toThrow('No se pudo subir');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
