import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { createAccountStorage } from './account-storage';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { courseAdmission } from './university-catalogue';

// Todos los tipos de catálogo que la web guarda (favorites_target_type_check).
export type FavType = 'accommodation' | 'leisure_spot' | 'event' | 'career' | 'university' | 'scholarship';
export const FAV_TYPES: FavType[] = ['accommodation', 'leisure_spot', 'event', 'career', 'university', 'scholarship'];

export type FavItem = { type: FavType; id: string; title: string; subtitle: string; image: string | null; savedAt: number };

// Ownerless legacy keys are deliberately preserved but never imported.
const CACHE_KEY = 'franky.favs.v3';
const PASSED_KEY = 'franky.passed.v2';
const MAX_CACHE_CHARACTERS = 500_000;
const account = createAccountStorage(AsyncStorage, { capture: captureSessionIdentity, current: isCurrentSessionIdentity });

function validItem(value: unknown): value is FavItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as FavItem;
  return FAV_TYPES.includes(item.type) && typeof item.id === 'string' && !!item.id &&
    typeof item.title === 'string' && typeof item.subtitle === 'string' &&
    (item.image === null || typeof item.image === 'string') && Number.isFinite(item.savedAt);
}
async function readCache(owner: SessionIdentity): Promise<FavItem[]> {
  const raw = await account.get(owner, CACHE_KEY);
  if (!raw || raw.length > MAX_CACHE_CHARACTERS) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(validItem) ? value : [];
  } catch { return []; }
}
async function writeCache(owner: SessionIdentity, list: FavItem[]) {
  const raw = JSON.stringify(list);
  if (raw.length > MAX_CACHE_CHARACTERS) await account.remove(owner, CACHE_KEY);
  else await account.set(owner, CACHE_KEY, raw);
}
// A storage failure must not turn a confirmed server write into a false failure.
async function updateCache(owner: SessionIdentity, change: (items: FavItem[]) => FavItem[]) {
  try { await writeCache(owner, change(await readCache(owner))); }
  catch {
    account.check(owner);
    try { await account.remove(owner, CACHE_KEY); } catch { account.check(owner); }
  }
}
export async function getCachedFavs(owner = captureSessionIdentity()): Promise<FavItem[]> {
  if (!owner) return [];
  return account.mutate(owner, async () => {
    try { return await readCache(owner); } catch { account.check(owner); return []; }
  });
}

// ── Enriquecimiento por tipo ──
// Filas crudas de cada catálogo (solo las columnas que se pintan). Las tablas
// y columnas son las de las migraciones 001 (universities, careers,
// scholarships, accommodations, events, leisure_spots).
type Row = Record<string, unknown> & { id: string };

const SOURCES: Record<FavType, { table: string; columns: string; toItem: (r: Row) => Omit<FavItem, 'type' | 'id' | 'savedAt'> }> = {
  accommodation: {
    table: 'accommodations', columns: 'id, title, city, price, images',
    toItem: (r) => ({
      title: String(r.title ?? 'Piso'),
      subtitle: [r.price != null ? `${Number(r.price)} €/mes` : null, r.city].filter(Boolean).join(' · '),
      image: Array.isArray(r.images) && r.images[0] ? String(r.images[0]) : null,
    }),
  },
  leisure_spot: {
    table: 'leisure_spots', columns: 'id, name, city, category, image_url',
    toItem: (r) => ({
      title: String(r.name ?? 'Sitio'),
      subtitle: [r.category, r.city].filter(Boolean).join(' · '),
      image: r.image_url ? String(r.image_url) : null,
    }),
  },
  event: {
    table: 'events', columns: 'id, title, city, price, start_date, image_url',
    toItem: (r) => ({
      title: String(r.title ?? 'Evento'),
      subtitle: [
        r.price == null || Number(r.price) === 0 ? 'Gratis' : `${Number(r.price)} €`,
        r.city,
        typeof r.start_date === 'string' ? new Date(r.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : null,
      ].filter(Boolean).join(' · '),
      image: r.image_url ? String(r.image_url) : null,
    }),
  },
  career: {
    table: 'careers', columns: 'id, name, branch, cut_off_score, cut_off_year, admission_without_cutoff, universities(name, short_name)',
    toItem: (r) => {
      // El embed llega como objeto o como array según la relación; se
      // normaliza la forma, nunca el valor.
      const uniRaw = r.universities as { name?: string; short_name?: string | null } | { name?: string; short_name?: string | null }[] | null;
      const uni = Array.isArray(uniRaw) ? uniRaw[0] : uniRaw;
      const admission = courseAdmission({ id: r.id, name: String(r.name ?? ''), cut_off_score: r.cut_off_score as number | null, cut_off_year: r.cut_off_year as number | null, admission_without_cutoff: r.admission_without_cutoff as boolean | null });
      return {
        title: String(r.name ?? 'Carrera'),
        subtitle: [
          uni?.short_name || uni?.name || null,
          admission.score !== null ? `Nota ${admission.label} · ${admission.period}` : `${admission.label} · ${admission.period}`,
        ].filter(Boolean).join(' · '),
        image: null,
      };
    },
  },
  university: {
    table: 'universities', columns: 'id, name, short_name, city, logo_url, image_url',
    toItem: (r) => ({
      title: String(r.name ?? 'Universidad'),
      subtitle: [r.short_name, r.city].filter(Boolean).join(' · '),
      image: (r.logo_url || r.image_url) ? String(r.logo_url || r.image_url) : null,
    }),
  },
  scholarship: {
    table: 'scholarships', columns: 'id, name, provider, deadline',
    toItem: (r) => ({
      title: String(r.name ?? 'Beca'),
      subtitle: [
        r.provider,
        typeof r.deadline === 'string' ? `Cierra ${new Date(r.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : null,
      ].filter(Boolean).join(' · '),
      image: null,
    }),
  },
};

function isFavType(t: string): t is FavType {
  return (FAV_TYPES as string[]).includes(t);
}

/** A failed catalogue enrichment is an error, never an empty replacement. */
export async function getFavs(owner = captureSessionIdentity()): Promise<FavItem[]> {
  if (!owner) return [];
  return account.mutate(owner, () => withOwnedRequest(owner, async (request) => {
    type FavoriteRow = { target_type: string; target_id: string; created_at: string };
    const favs: FavoriteRow[] = [];
    // Stable pagination avoids silently treating the API row limit as the full list.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await request.query(supabase.from('favorites')
        .select('target_type, target_id, created_at').eq('user_id', owner.userId)
        .in('target_type', FAV_TYPES).order('created_at', { ascending: false })
        .order('target_type').order('target_id').range(offset, offset + 499));
      request.check();
      if (error) throw error;
      const rows = (data ?? []) as FavoriteRow[];
      favs.push(...rows);
      if (rows.length < 500) break;
    }
    const idsByType = new Map<FavType, string[]>();
    for (const f of favs) {
      if (!isFavType(f.target_type)) continue;
      const list = idsByType.get(f.target_type) ?? [];
      list.push(f.target_id);
      idsByType.set(f.target_type, list);
    }
    const detailsByKey = new Map<string, Omit<FavItem, 'type' | 'id' | 'savedAt'>>();
    await Promise.all([...idsByType.entries()].map(async ([type, ids]) => {
      const src = SOURCES[type];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await request.query(supabase.from(src.table)
          .select(src.columns).in('id', ids.slice(offset, offset + 100)));
        request.check();
        if (error) throw error;
        for (const row of ((data ?? []) as unknown as Row[])) detailsByKey.set(`${type}:${row.id}`, src.toItem(row));
      }
    }));
    const items: FavItem[] = [];
    for (const f of favs) {
      if (!isFavType(f.target_type)) continue;
      const detail = detailsByKey.get(`${f.target_type}:${f.target_id}`);
      if (detail) items.push({ type: f.target_type, id: f.target_id, ...detail, savedAt: Date.parse(f.created_at) || Date.now() });
    }
    try { await writeCache(owner, items); } catch { request.check(); }
    return items;
  }));
}

export async function getFavIds(type: FavType, owner = captureSessionIdentity()): Promise<Set<string>> {
  return new Set((await getFavs(owner)).filter(item => item.type === type).map(item => item.id));
}

/** Only confirmed writes update this account's cache. Capture owner before dialogs. */
export async function addFav(item: Omit<FavItem, 'savedAt'>, owner = captureSessionIdentity()): Promise<{ ok: boolean; alreadySaved?: boolean }> {
  if (!owner || !validItem({ ...item, savedAt: Date.now() })) return { ok: false };
  try {
    return await account.mutate(owner, () => withOwnedRequest(owner, async (request) => {
      const { data, error } = await request.query(supabase.from('favorites').upsert(
        { user_id: owner.userId, target_type: item.type, target_id: item.id },
        { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true },
      ).select('target_id'));
      request.check();
      if (error) return { ok: false };
      await updateCache(owner, items => items.some(f => f.type === item.type && f.id === item.id)
        ? items : [{ ...item, savedAt: Date.now() }, ...items]);
      return { ok: true, alreadySaved: !data?.length };
    }));
  } catch { return { ok: false }; }
}

export async function removeFav(type: FavType, id: string, owner = captureSessionIdentity()): Promise<{ ok: boolean }> {
  if (!owner) return { ok: false };
  try {
    return await account.mutate(owner, () => withOwnedRequest(owner, async (request) => {
      const { error } = await request.query(supabase.from('favorites').delete()
        .match({ user_id: owner.userId, target_type: type, target_id: id }));
      request.check();
      if (error) return { ok: false };
      await updateCache(owner, items => items.filter(f => !(f.type === type && f.id === id)));
      return { ok: true };
    }));
  } catch { return { ok: false }; }
}

// Local navigation choices are private to their account as well.
async function readPassed(type: FavType, owner: SessionIdentity): Promise<string[]> {
  const raw = await account.get(owner, `${PASSED_KEY}.${type}`);
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : [];
  } catch { return []; }
}
export async function getPassed(type: FavType, owner = captureSessionIdentity()): Promise<string[]> {
  if (!owner) return [];
  return account.mutate(owner, () => readPassed(type, owner));
}
export async function addPassed(type: FavType, id: string, owner = captureSessionIdentity()) {
  if (!owner) return;
  return account.mutate(owner, async () => {
    const list = await readPassed(type, owner);
    if (!list.includes(id)) await account.set(owner, `${PASSED_KEY}.${type}`, JSON.stringify([...list, id].slice(-500)));
  });
}
export async function clearPassed(type: FavType, owner = captureSessionIdentity()) {
  if (!owner) return;
  return account.mutate(owner, () => account.remove(owner, `${PASSED_KEY}.${type}`));
}
export async function removeLastPassed(type: FavType, owner = captureSessionIdentity(), expectedId?: string): Promise<string | null> {
  if (!owner) return null;
  return account.mutate(owner, async () => {
    const list = await readPassed(type, owner);
    if (!list.length) return null;
    if (expectedId && list[list.length - 1] !== expectedId) throw new Error('discard_changed');
    await account.set(owner, `${PASSED_KEY}.${type}`, JSON.stringify(list.slice(0, -1)));
    return list[list.length - 1];
  });
}
