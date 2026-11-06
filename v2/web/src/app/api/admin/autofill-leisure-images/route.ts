import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type Spot = {
  id: string;
  name: string | null;
  city: string | null;
  category: string | null;
  image_url?: string | null;
};

/** Wikimedia Commons category search keywords per spot category. */
const CATEGORY_COMMONS: Record<string, string> = {
  discoteca: "nightclub interior",
  bar: "cocktail bar Spain",
  pub: "pub interior",
  restaurante: "restaurant interior Spain",
  cafeteria: "coffee shop Spain",
  parque: "park Spain",
  museo: "museum Spain",
  teatro: "theater Spain",
  cine: "cinema Spain",
  biblioteca: "library Spain",
  deportivo: "gymnasium Spain",
  playa: "beach Spain",
  montaña: "mountain Spain",
  centro_comercial: "shopping mall Spain",
  escape_room: "escape room",
  bowling: "bowling alley",
  karaoke: "karaoke bar",
  galeria: "art gallery Spain",
  cultural: "cathedral Spain",
  default: "Spain landmark",
};

/** Hosts we now distrust (past runs saved placeholders or blocked by CSP). */
const BAD_HOST_SUBSTR = ["loremflickr.com", "source.unsplash.com"];

/** Known Wikimedia/Loremflickr default placeholders. */
const PLACEHOLDER_SUBSTR = [
  "defaultImage",
  "no_image",
  "no-image",
  "placeholder",
];

function isImageBytes(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true; // GIF
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true; // WEBP
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true; // ftyp
  return false;
}

/** Check if the URL is reachable, returns real bytes of a non-placeholder image. */
async function validateAndNormalize(url: string): Promise<string | null> {
  try {
    if (PLACEHOLDER_SUBSTR.some((s) => url.toLowerCase().includes(s))) return null;
    if (BAD_HOST_SUBSTR.some((s) => url.includes(s))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (FrankyBot/1.0; +https://franky.es)",
        accept: "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const len = Number(r.headers.get("content-length") || 0);
    if (len > 0 && len < 4000) return null;
    if (!r.body) return null;
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 32 * 1024;
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try { await reader.cancel(); } catch {}
    if (total < 3000) return null;
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    if (!isImageBytes(merged)) return null;
    if (PLACEHOLDER_SUBSTR.some((s) => r.url.toLowerCase().includes(s))) return null;
    if (BAD_HOST_SUBSTR.some((s) => r.url.includes(s))) return null;
    return r.url;
  } catch {
    return null;
  }
}

/** Lightweight HEAD check for Wikimedia CDN URLs.
 * Wikimedia refuses arbitrary thumbnail sizes with HTTP 400 + text/html
 * ("Use thumbnail steps listed on https://w.wiki/GHai"). The browser then
 * blocks the image response with ERR_BLOCKED_BY_ORB. We must ensure the exact
 * URL returns 200 + image/* before storing it. */
async function headIsImage(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (FrankyBot/1.0; +https://franky.es)",
        accept: "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!r.ok) return false;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

/** Try Wikipedia REST API summary for a title → returns hero image URL or null. */
async function tryWikipediaSummary(lang: string, title: string): Promise<string | null> {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "FrankyBot/1.0 (https://franky.es)", accept: "application/json" },
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    const img = j?.originalimage?.source || j?.thumbnail?.source;
    if (typeof img !== "string") return null;
    if (!img.startsWith("https://upload.wikimedia.org/")) return null;
    if (/\.(svg|pdf|ogg|wav|webm)(\?|$)/i.test(img)) return null;
    // Confirm the exact CDN URL returns 200 + image/*. Wikimedia refuses
    // arbitrary thumbnail sizes with HTTP 400 text/html; if we stored those
    // the browser would block them (ERR_BLOCKED_BY_ORB).
    if (!(await headIsImage(img))) return null;
    return img;
  } catch {
    return null;
  }
}

/** Wikimedia Commons search → free topical image. Validates CDN reachability. */
async function tryCommonsSearch(query: string): Promise<string | null> {
  try {
    const api =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
      `&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(query)}` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=1200`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(api, {
      signal: ctrl.signal,
      headers: { "user-agent": "FrankyBot/1.0 (https://franky.es)", accept: "application/json" },
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j?.query?.pages;
    if (!pages) return null;
    const vals = Object.values(pages) as Array<{ imageinfo?: Array<{ thumburl?: string; url?: string }> }>;
    for (const p of vals) {
      const info = p.imageinfo?.[0];
      const src = info?.thumburl || info?.url;
      if (!src) continue;
      if (!src.startsWith("https://upload.wikimedia.org/")) continue;
      if (/\.(svg|pdf|ogg|wav|webm)(\?|$)/i.test(src)) continue;
      if (!(await headIsImage(src))) continue;
      return src;
    }
    return null;
  } catch {
    return null;
  }
}

/** Picsum always works, non-topical but real image. */
async function tryPicsum(seed: string): Promise<string | null> {
  return validateAndNormalize(`https://picsum.photos/seed/${encodeURIComponent(seed)}/1080/720.jpg`);
}

async function findImageFor(spot: Spot, trace?: string[]): Promise<string | null> {
  const name = (spot.name || "").trim();
  const city = (spot.city || "").trim();
  const cat = (spot.category || "").toLowerCase();
  const seed = spot.id.replace(/-/g, "").slice(0, 10);

  const log = (s: string) => { if (trace) trace.push(s); };

  // 1) Wikipedia ES by name
  if (name) {
    const w1 = await tryWikipediaSummary("es", name);
    log(`wiki:es:${name} => ${w1 ? "OK" : "null"}`);
    if (w1) return w1;
    // 2) Wikipedia EN by name
    const w2 = await tryWikipediaSummary("en", name);
    log(`wiki:en:${name} => ${w2 ? "OK" : "null"}`);
    if (w2) return w2;
    // 3) Commons search by "name city"
    const q1 = await tryCommonsSearch(`${name} ${city}`.trim());
    log(`commons:${name} ${city} => ${q1 ? "OK" : "null"}`);
    if (q1) return q1;
    // 4) Commons search by name alone
    const q2 = await tryCommonsSearch(name);
    log(`commons:${name} => ${q2 ? "OK" : "null"}`);
    if (q2) return q2;
  }

  // 5) Commons search by category + city
  const keywords = CATEGORY_COMMONS[cat] || CATEGORY_COMMONS.default;
  if (city) {
    const q3 = await tryCommonsSearch(`${keywords} ${city}`);
    log(`commons:${keywords} ${city} => ${q3 ? "OK" : "null"}`);
    if (q3) return q3;
  }
  const q4 = await tryCommonsSearch(keywords);
  log(`commons:${keywords} => ${q4 ? "OK" : "null"}`);
  if (q4) return q4;

  // 6) Picsum as absolute last resort
  const p = await tryPicsum(seed);
  log(`picsum => ${p ? "OK" : "null"}`);
  return p;
}

async function runPool<T, R>(
  items: T[],
  worker: (it: T, idx: number) => Promise<R>,
  concurrency = 6,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await worker(items[idx], idx); }
      catch (e) { results[idx] = { error: (e as Error)?.message || String(e) } as unknown as R; }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  const identity = await requireAdminRequest(req);
  if (identity instanceof NextResponse) return identity;

  let batch = 40;
  let mode: "missing" | "broken" = "missing";
  let debug: { name?: string; city?: string; category?: string } | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.batch === "number" && body.batch > 0 && body.batch <= 200) batch = body.batch;
    if (body?.mode === "broken") mode = "broken";
    if (body?.debug && typeof body.debug === "object") debug = body.debug;
  } catch {}

  if (debug) {
    const trace: string[] = [];
    const testSpot: Spot = {
      id: "00000000-0000-0000-0000-000000000000",
      name: debug.name || null,
      city: debug.city || null,
      category: debug.category || null,
    };
    const url = await findImageFor(testSpot, trace);
    return adminJson({ debug: true, url, trace });
  }

  const admin = createAdminSupabase();

  let remainingBefore: number | null = null;
  if (mode === "missing") {
    const { count } = await admin
      .from("leisure_spots")
      .select("id", { count: "exact", head: true })
      .or("image_url.is.null,image_url.eq.");
    remainingBefore = count ?? null;
  }

  let q = admin.from("leisure_spots").select("id, name, city, category, image_url");
  if (mode === "missing") {
    q = q.or("image_url.is.null,image_url.eq.");
  } else {
    // broken mode: prioritize rows with URLs on known-bad hosts, placeholder keywords,
    // or non-topical fallback (picsum) that we want to replace with Wikipedia images.
    q = q.or(
      "image_url.ilike.%loremflickr%," +
      "image_url.ilike.%source.unsplash%," +
      "image_url.ilike.%defaultImage%," +
      "image_url.ilike.%placeholder%," +
      "image_url.ilike.%upload.wikimedia.org%," +
      "image_url.ilike.%picsum.photos%",
    );
  }
  const { data: spots, error } = await q.order("updated_at", { ascending: true }).limit(batch);

  if (error) return adminJson({ error: error.message }, { status: 500 });
  if (!spots || spots.length === 0) {
    return adminJson({ processed: 0, updated: 0, failed: [], remaining: 0, done: true, mode });
  }

  const resolved = await runPool(
    spots as Spot[],
    async (spot) => {
      if (mode === "broken" && spot.image_url) {
        // Aggressive: if URL is on a bad host, placeholder, or non-topical picsum fallback,
        // don't even re-check — force regeneration.
        const bad =
          BAD_HOST_SUBSTR.some((s) => spot.image_url!.includes(s)) ||
          PLACEHOLDER_SUBSTR.some((s) => spot.image_url!.toLowerCase().includes(s)) ||
          spot.image_url.includes("picsum.photos");
        if (!bad) {
          // For upload.wikimedia.org URLs only a HEAD check is needed; arbitrary
          // thumbnail sizes are rejected with 400 text/html (ORB blocks those).
          if (spot.image_url.includes("upload.wikimedia.org")) {
            const ok = await headIsImage(spot.image_url);
            if (ok) return { spot, url: null, keep: true };
          } else {
            const ok = await validateAndNormalize(spot.image_url);
            if (ok) return { spot, url: null, keep: true };
          }
        }
      }
      const url = await findImageFor(spot);
      return { spot, url, keep: false };
    },
    4,
  );

  let updated = 0;
  let skipped = 0;
  const failed: Array<{ id: string; name: string | null; error: string }> = [];

  await Promise.all(
    resolved.map(async (r) => {
      const rr = r as { spot: Spot; url: string | null; keep?: boolean };
      if (rr.keep) { skipped++; return; }
      if (!rr.url) {
        failed.push({ id: rr.spot.id, name: rr.spot.name, error: "no valid image" });
        return;
      }
      // If the only option we found is another picsum and the row already had a picsum,
      // keep the existing one to avoid churn and rate-limit loops.
      if (
        mode === "broken" &&
        rr.url.includes("picsum.photos") &&
        rr.spot.image_url &&
        rr.spot.image_url.includes("picsum.photos")
      ) {
        // bump updated_at so it falls out of the ASC queue next batch
        await admin
          .from("leisure_spots")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", rr.spot.id);
        skipped++;
        return;
      }
      const { error: upErr } = await admin
        .from("leisure_spots")
        .update({ image_url: rr.url, updated_at: new Date().toISOString() })
        .eq("id", rr.spot.id);
      if (upErr) failed.push({ id: rr.spot.id, name: rr.spot.name, error: upErr.message });
      else updated++;
    }),
  );

  let remaining: number | null = null;
  if (mode === "missing" && remainingBefore !== null) {
    remaining = Math.max(0, remainingBefore - updated);
  }

  return adminJson({
    mode,
    processed: spots.length,
    updated,
    skipped,
    failed,
    remaining,
    done: mode === "missing" ? (remaining === 0 && spots.length < batch) : (spots.length < batch),
  });
}
