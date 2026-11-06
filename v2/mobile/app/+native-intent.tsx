import { createNativeIntentHandler, resolveIncomingLink } from '../src/lib/native-links';
import { supabase } from '../src/lib/supabase';

// Expo Router invokes this for incoming native URLs, both warm and cold starts.
// Only public catalog IDs are read; a failed lookup falls back to its real list.
export const redirectSystemPath = createNativeIntentHandler((path) => {
  return resolveIncomingLink(path, async (table, slug) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const { data, error } = await supabase.from(table).select('id').eq('slug', slug)
        .abortSignal(controller.signal).maybeSingle();
      if (error) return null;
      return data?.id ?? null;
    } finally { clearTimeout(timeout); }
  });
});
