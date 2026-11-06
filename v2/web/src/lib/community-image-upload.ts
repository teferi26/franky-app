import type { SupabaseClient } from '@supabase/supabase-js';
import { prepareImageForUpload } from './image-upload';
import { assertSafeImageUpload } from './upload-validate';
import { uploadPrivateSocialMedia } from './social-media-client';

/** Covers stay private until their community revision is approved. */
export async function uploadCommunityImage(supabase: SupabaseClient, userId: string, file: File): Promise<{ url: string }> {
  const assertOwner = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || user.id !== userId) throw new Error('La sesión ha cambiado. Vuelve a iniciar sesión.');
  };
  await assertOwner();
  const prepared = await prepareImageForUpload(file, { maxDimension: 1440 });
  if (!prepared.ok) throw new Error(prepared.message);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(prepared.contentType)) {
    throw new Error('Elige una foto JPG, PNG o WebP para la comunidad. No se admiten GIF ni vídeos.');
  }
  const upload = new File([prepared.blob], `foto.${prepared.ext}`, { type: prepared.contentType });
  let verified: Awaited<ReturnType<typeof assertSafeImageUpload>>;
  try {
    verified = await assertSafeImageUpload(upload, { maxBytes: 5 * 1024 * 1024, allowed: ['jpg', 'png', 'webp'] });
  } catch {
    throw new Error('La foto no es válida o supera los 5 MB. Elige otra imagen.');
  }
  await assertOwner();
  const { url } = await uploadPrivateSocialMedia(supabase, userId, prepared.blob, verified.mime);
  await assertOwner();
  return { url };
}
