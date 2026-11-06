"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, MapPin, Euro, GraduationCap, MessageCircle, Loader2,
  AlertCircle, Heart, ChevronLeft, ChevronRight, Home, MoreVertical,
  UserPlus, UserCheck, VolumeX, Volume2, Flag, X, Info, Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { isBlockedByMe, blockUser, unblockUser } from "@/lib/user-blocks";
import VerifiedBadge from "@/components/VerifiedBadge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  labelSmoking, labelPartying, labelSleep, labelCleanliness,
  labelNoise, labelFriends, labelPet, labelDiet,
} from "@/lib/lifestyle-labels";

export const dynamic = "force-dynamic";

interface PublicProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  photos: string[] | null;
  bio: string | null;
  city: string | null;
  comunidad_autonoma: string | null;
  career: string | null;
  university_course: number | null;
  budget_min: number | null;
  budget_max: number | null;
  smoking: string | null;
  partying: string | null;
  sleep_schedule: string | null;
  // cleanliness llega como número (slider 1-5 del onboarding) o texto (flujo
  // antiguo); pet_friendly como booleano o texto. Ver lib/lifestyle-labels.ts.
  cleanliness: string | number | null;
  noise_tolerance: string | null;
  friends_at_home: string | null;
  pet_friendly: string | boolean | null;
  diet: string | null;
  hobbies: string[] | null;
  is_homebody: boolean | null;
  is_early_riser: boolean | null;
  universities?: { name: string } | null;
  // Correo de la universidad confirmado (migración 025): distintivo de estudiante.
  student_email_verified: boolean | null;
}

/** Contadores del grafo social (migración 123). */
interface SocialCounts {
  posts: number;
  followers: number;
  following: number;
}

// Motivos de la denuncia de foto de perfil (RPC report_profile_photo,
// migración 140). p_reason es texto libre en el servidor: mandamos la
// etiqueta legible para que el admin la vea tal cual.
const PHOTO_REPORT_REASONS = [
  "No es esta persona",
  "Foto inapropiada",
  "Foto ofensiva",
  "Otro motivo",
];

/**
 * Contadores de publicaciones/seguidores/siguiendo. Primero la RPC
 * get_social_counts; si no existe en producción todavía, tres counts
 * head-only directos (mismo fallback que la app móvil). Todo fail-soft.
 */
async function fetchSocialCounts(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<SocialCounts> {
  try {
    const { data, error } = await supabase.rpc("get_social_counts", { p_user: userId });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        posts: Number(row?.posts ?? 0),
        followers: Number(row?.followers ?? 0),
        following: Number(row?.following ?? 0),
      };
    }
  } catch { /* sin RPC: caemos al conteo directo */ }
  try {
    const [p, fw, fg] = await Promise.all([
      supabase.from("fomo_threads").select("id", { head: true, count: "exact" })
        .eq("author_id", userId).eq("is_anonymous", false).eq("is_deleted", false).eq("is_hidden", false),
      supabase.from("follows").select("follower_id", { head: true, count: "exact" }).eq("followee_id", userId),
      supabase.from("follows").select("followee_id", { head: true, count: "exact" }).eq("follower_id", userId),
    ]);
    return { posts: p.count ?? 0, followers: fw.count ?? 0, following: fg.count ?? 0 };
  } catch {
    return { posts: 0, followers: 0, following: 0 };
  }
}

export default function PublicProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [relation, setRelation] = useState<"none" | "i_liked" | "they_liked" | "match">("none");
  const [livesIn, setLivesIn] = useState<{ accommodation_id: string; title: string; city: string | null } | null>(null);
  // Grafo social (migración 123): contadores + seguir/siguiendo. Optimista.
  const [counts, setCounts] = useState<SocialCounts>({ posts: 0, followers: 0, following: 0 });
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // Menú ⋯: silenciar (migración 134) y denunciar foto (migración 140).
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  // Bloquear (tabla user_blocks, migración 017): paridad con la app móvil.
  // Pide confirmación dentro del propio menú antes de ejecutar.
  const [blocked, setBlocked] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  // Avisos de acciones (chat restringido, denuncia enviada, etc.).
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/perfil/${id}`);
        return;
      }
      setMe(user.id);

      // If viewing own profile, redirect to /perfil
      if (user.id === id) {
        router.replace("/perfil");
        return;
      }

      // 19/70: registrar la visita a un perfil ajeno (migración 134).
      // Fire-and-forget y fail-soft: si la RPC no existe aún, no pasa nada.
      supabase.rpc("register_profile_view", { p_profile: id }).then(() => {}, () => {});

      // Grafo social: contadores, ¿le sigo? y ¿le tengo silenciado?
      // Todo fail-soft: si las migraciones 123/134 no están, se queda en 0/false.
      fetchSocialCounts(supabase, id).then(setCounts).catch(() => {});
      supabase
        .from("follows")
        .select("followee_id")
        .eq("follower_id", user.id)
        .eq("followee_id", id)
        .maybeSingle()
        .then(({ data: f }) => setFollowed(Boolean(f)), () => {});
      supabase
        .from("muted_users")
        .select("muted_id")
        .eq("muter_id", user.id)
        .eq("muted_id", id)
        .maybeSingle()
        .then(({ data: m }) => setMuted(Boolean(m)), () => {});
      // ¿Le tengo bloqueado? Fail-soft igual que el resto.
      isBlockedByMe(supabase, user.id, id).then(setBlocked, () => {});

      // Public profile view (no PII — see migration 040).
      // `universities` is exposed as an embedded jsonb object in the view.
      const { data, error: e } = await supabase
        .from("public_profiles")
        .select(
          "id, full_name, avatar_url, photos, bio, city, comunidad_autonoma, career, university_course, budget_min, budget_max, smoking, partying, sleep_schedule, cleanliness, noise_tolerance, friends_at_home, pet_friendly, diet, hobbies, is_homebody, is_early_riser, universities, student_email_verified"
        )
        .eq("id", id)
        .maybeSingle();
      if (e || !data) {
        setError("No se pudo cargar el perfil");
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vista public_profiles sin tipos generados
      setProfile(data as any);

      // Public tenancy: only shows if the resident consented (is_public).
      supabase.rpc("get_public_tenancy_for", { p_user_id: id }).then(({ data: t }) => {
        if (t) setLivesIn(t as { accommodation_id: string; title: string; city: string | null });
      });

      // Determine relationship for chat permission
      const [meLikes, theyLike] = await Promise.all([
        supabase
          .from("roommate_matches")
          .select("status")
          .eq("user_id", user.id)
          .eq("matched_user_id", id)
          .eq("status", "liked")
          .maybeSingle(),
        supabase
          .from("roommate_matches")
          .select("status")
          .eq("user_id", id)
          .eq("matched_user_id", user.id)
          .eq("status", "liked")
          .maybeSingle(),
      ]);
      const iLiked = !!meLikes.data;
      const theyLiked = !!theyLike.data;
      setRelation(iLiked && theyLiked ? "match" : iLiked ? "i_liked" : theyLiked ? "they_liked" : "none");

      setLoading(false);
    })();
  }, [id, router]);

  const photos = (profile?.photos && profile.photos.length > 0)
    ? profile.photos
    : (profile?.avatar_url ? [profile.avatar_url] : []);
  const totalPhotos = photos.length;

  const nextPhoto = useCallback(() => {
    setPhotoIdx((i) => (totalPhotos > 0 ? (i + 1) % totalPhotos : 0));
  }, [totalPhotos]);
  const prevPhoto = useCallback(() => {
    setPhotoIdx((i) => (totalPhotos > 0 ? (i - 1 + totalPhotos) % totalPhotos : 0));
  }, [totalPhotos]);

  const openChat = async () => {
    if (relation !== "match") return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_other_user_id: id,
    });
    if (!error && data) {
      router.push(`/chats?chat=${data}`);
      return;
    }
    // Migración 148: el servidor rechaza el chat si el receptor ha restringido
    // quién puede escribirle (dm_privacy). Mensaje amable, no error crudo.
    if (error?.message?.includes("not_allowed")) {
      const name = profile?.full_name ?? "Esta persona";
      setNotice(`${name} ha limitado quién puede escribirle. Si os seguís mutuamente o verificas tu email de estudiante, podrás enviarle un mensaje.`);
    } else {
      setNotice("No se pudo abrir el chat. Inténtalo de nuevo en unos segundos.");
    }
  };

  // ── Seguir / Siguiendo: insert/delete en follows, optimista con revert. ──
  const toggleFollow = async () => {
    if (!me || followBusy) return;
    const next = !followed;
    setFollowBusy(true);
    setFollowed(next);
    setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (next ? 1 : -1)) }));
    const supabase = createClient();
    try {
      if (next) {
        const { error: e } = await supabase
          .from("follows")
          .insert({ follower_id: me, followee_id: id });
        // 23505 = ya le seguías (doble clic): lo damos por bueno.
        if (e && e.code !== "23505") throw e;
      } else {
        const { error: e } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", me)
          .eq("followee_id", id);
        if (e) throw e;
      }
    } catch (err) {
      // Revert del optimista. El código de error se ENSEÑA: seguir estuvo roto
      // desde la 123 (política RLS que consultaba profiles, arreglada en la 156)
      // y este catch mudo hizo que nadie se enterase durante semanas.
      console.error("[perfil] toggleFollow", err);
      const e = err as { code?: string; message?: string };
      const detalle = [e?.code, e?.message].filter(Boolean).join(" · ");
      setFollowed(!next);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers + (next ? -1 : 1)) }));
      setNotice(
        `No se pudo completar. Inténtalo de nuevo en unos segundos.${detalle ? ` (${detalle})` : ""}`
      );
    }
    setFollowBusy(false);
  };

  // ── Silenciar sin bloquear (migración 134): privado y asimétrico. ──
  const toggleMute = async () => {
    if (!me) return;
    setMenuOpen(false);
    const next = !muted;
    setMuted(next);
    const supabase = createClient();
    try {
      if (next) {
        const { error: e } = await supabase
          .from("muted_users")
          .insert({ muter_id: me, muted_id: id });
        if (e && e.code !== "23505") throw e;
        setNotice("Silenciado. Es privado: esta persona no se entera y podéis seguir viéndoos y escribiéndoos con normalidad.");
      } else {
        const { error: e } = await supabase
          .from("muted_users")
          .delete()
          .eq("muter_id", me)
          .eq("muted_id", id);
        if (e) throw e;
        setNotice("Has dejado de silenciar a esta persona.");
      }
    } catch {
      setMuted(!next);
      setNotice("No se pudo completar. Puede que esta función aún no esté disponible.");
    }
  };

  // ── Bloquear / desbloquear (tabla user_blocks, migración 017). ──
  // Bloquear es lo contrario de silenciar: es total (los chats desaparecen
  // para las dos personas, get_my_chats y los feeds la excluyen) y se puede
  // deshacer desde /perfil/bloqueados o desde aquí mismo. Se pide
  // confirmación en el menú porque no es un toggle inocuo.
  const toggleBlock = async () => {
    if (!me || blockBusy) return;
    const next = !blocked;
    // Bloquear pide un segundo clic; desbloquear no hace falta.
    if (next && !blockConfirm) {
      setBlockConfirm(true);
      return;
    }
    setBlockBusy(true);
    const supabase = createClient();
    const ok = next
      ? await blockUser(supabase, me, id)
      : await unblockUser(supabase, me, id);
    setBlockBusy(false);
    setBlockConfirm(false);
    setMenuOpen(false);
    if (!ok) {
      setNotice("No se pudo completar. Inténtalo de nuevo en unos segundos.");
      return;
    }
    setBlocked(next);
    setNotice(
      next
        ? `Has bloqueado a ${profile?.full_name ?? "esta persona"}. Dejaréis de veros y no podrá escribirte. Puedes deshacerlo desde Mi perfil, en Cuentas bloqueadas.`
        : "Has desbloqueado a esta persona. Volveréis a poder veros y escribiros."
    );
  };

  // ── Denunciar foto de perfil (RPC report_profile_photo, migración 140). ──
  const submitPhotoReport = async (reason: string) => {
    if (reportBusy) return;
    setReportBusy(true);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("report_profile_photo", {
      p_target: id,
      p_reason: reason,
    });
    setReportBusy(false);
    setReportOpen(false);
    // Duplicado (una denuncia por persona): la damos por recibida.
    if (e && e.code !== "23505" && !e.message?.includes("duplicate")) {
      setNotice("No se pudo enviar la denuncia. Inténtalo de nuevo en unos segundos.");
      return;
    }
    setNotice("Gracias por avisar. Revisaremos la foto: si acumula varias denuncias, este perfil dejará de aparecer hasta que la revisemos.");
  };

  const likeBack = async () => {
    if (!me || !profile) return;
    const supabase = createClient();
    const { error } = await supabase.from("roommate_matches").upsert(
      {
        user_id: me,
        matched_user_id: profile.id,
        // 157: null = "no se sabe". Antes se mandaba un 50 fijo, un número
        // inventado que luego se enseñaba como si fuera una compatibilidad real.
        compatibility_score: null,
        status: "liked",
      },
      { onConflict: "user_id,matched_user_id" }
    );
    if (error) {
      // El servidor (trigger 119) rechaza el like si no tienes el perfil de
      // roomie completo. En vez de mostrar un match falso, llevamos al usuario
      // a Roomie Match, donde el gate le explica y le deja completarlo.
      router.push("/roomie-match");
      return;
    }
    setRelation("match");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-error mx-auto mb-2" />
          <p className="text-text-secondary">{error || "Perfil no encontrado"}</p>
          <Link href="/roomie-match" className="mt-4 inline-flex items-center gap-1.5 text-violet font-semibold hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary pb-16">
      {/* Header / back button */}
      <div className="sticky top-20 z-20 border-b border-border-light bg-bg-primary/85 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
          {relation === "match" && (
            <button
              type="button"
              onClick={openChat}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <MessageCircle className="h-4 w-4" /> Mensaje
            </button>
          )}
          {relation === "they_liked" && (
            <button
              type="button"
              onClick={likeBack}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-500 text-white text-sm font-semibold hover:bg-pink-600 transition-colors"
            >
              <Heart className="h-4 w-4 fill-current" /> Like también
            </button>
          )}

          {/* Menú ⋯: silenciar y denunciar foto */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Opciones del perfil"
              aria-expanded={menuOpen}
              className="h-9 w-9 rounded-full flex items-center justify-center text-text-secondary hover:bg-bg-secondary hover:text-violet transition-colors"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <>
                {/* Cierra el menú al hacer clic fuera */}
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  onClick={() => { setMenuOpen(false); setBlockConfirm(false); }}
                  className="fixed inset-0 z-30 cursor-default"
                  tabIndex={-1}
                />
                <div className="animate-dropdown absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="w-full flex items-start gap-2.5 px-4 py-3 text-left text-sm hover:bg-bg-secondary/60 transition-colors"
                  >
                    {muted
                      ? <Volume2 className="h-4 w-4 mt-0.5 shrink-0 text-text-muted" />
                      : <VolumeX className="h-4 w-4 mt-0.5 shrink-0 text-text-muted" />}
                    <span>
                      <span className="block font-medium">
                        {muted ? "Dejar de silenciar" : "Silenciar"}
                      </span>
                      <span className="block text-xs text-text-muted mt-0.5">
                        Es privado: no se entera. No es bloquear.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleBlock}
                    disabled={blockBusy}
                    aria-busy={blockBusy}
                    className={cn(
                      "w-full flex items-start gap-2.5 px-4 py-3 text-left text-sm transition-colors border-t border-border-light disabled:opacity-60",
                      blockConfirm ? "bg-error/5 text-error" : "hover:bg-bg-secondary/60"
                    )}
                  >
                    {blockBusy
                      ? <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-text-muted" />
                      : <Ban className={cn("h-4 w-4 mt-0.5 shrink-0", blockConfirm ? "text-error" : "text-text-muted")} />}
                    <span>
                      <span className="block font-medium">
                        {blocked
                          ? "Desbloquear"
                          : blockConfirm
                            ? "Confirmar bloqueo"
                            : "Bloquear"}
                      </span>
                      <span className={cn("block text-xs mt-0.5", blockConfirm ? "text-error/80" : "text-text-muted")}>
                        {blocked
                          ? "Volveréis a poder veros y escribiros."
                          : blockConfirm
                            ? "Pulsa otra vez para bloquear. Dejaréis de veros."
                            : "Dejaréis de veros y no podrá escribirte."}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setReportOpen(true); }}
                    className="w-full flex items-start gap-2.5 px-4 py-3 text-left text-sm text-error hover:bg-error/5 transition-colors border-t border-border-light"
                  >
                    <Flag className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="font-medium">Denunciar foto de perfil</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Aviso de acciones (chat restringido, denuncia enviada, silenciado...) */}
      {notice && (
        <div className="mx-auto max-w-2xl px-4 mt-4">
          <div className="flex items-start gap-2 rounded-xl border border-violet/20 bg-violet-50 p-3 text-sm font-medium text-violet-deep">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Cerrar aviso"
              className="shrink-0 hover:opacity-70 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 mt-4">
        {/* Photo gallery */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
          <div className="relative aspect-[4/5] bg-bg-secondary">
            {totalPhotos > 0 ? (
              <img
                src={photos[photoIdx]}
                alt={`Foto ${photoIdx + 1} de ${profile.full_name ?? "perfil"}`}
                className="w-full h-full object-cover select-none"
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-heading text-7xl font-extrabold text-text-primary/10">
                  {(profile.full_name ?? "?").trim().charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {totalPhotos > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevPhoto}
                  className="absolute top-1/2 left-2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={nextPhoto}
                  className="absolute top-1/2 right-2 -translate-y-1/2 h-10 w-10 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                  aria-label="Siguiente foto"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                {/* Indicator bars */}
                <div className="absolute top-3 left-3 right-3 flex gap-1">
                  {photos.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        i === photoIdx ? "bg-white" : "bg-white/40"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div>
              <h1 className="text-2xl font-extrabold font-heading inline-flex items-center gap-1.5">
                {profile.full_name || "Estudiante"}
                {/* Distintivo de estudiante verificado (correo @uni confirmado). */}
                <VerifiedBadge verified={profile.student_email_verified} size="md" />
              </h1>
              {profile.career && (
                <p className="text-sm text-text-secondary font-medium mt-0.5">
                  {profile.career}
                  {profile.university_course ? ` · ${profile.university_course}º` : ""}
                </p>
              )}
              {profile.universities?.name && (
                <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                  <GraduationCap className="h-3.5 w-3.5" /> {profile.universities.name}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted mt-2">
                {profile.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {profile.city}
                    {profile.comunidad_autonoma ? `, ${profile.comunidad_autonoma}` : ""}
                  </span>
                )}
                {(profile.budget_min || profile.budget_max) && (
                  <span className="flex items-center gap-1">
                    <Euro className="h-3.5 w-3.5" />
                    de {profile.budget_min ?? 0} a {profile.budget_max ?? 0} €/mes
                  </span>
                )}
              </div>
              {livesIn && (
                <Link
                  href={`/alojamiento/${livesIn.accommodation_id}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-medium hover:bg-teal-100 transition-colors"
                >
                  <Home className="h-3.5 w-3.5" />
                  Vive en {livesIn.title}
                </Link>
              )}
            </div>

            {/* Contadores del grafo social + botón Seguir/Siguiendo */}
            <div className="flex items-center gap-3 py-3 border-y border-border-light">
              <div className="flex-1 grid grid-cols-3 text-center">
                <div>
                  <p className="text-lg font-extrabold font-heading leading-tight">{counts.posts}</p>
                  <p className="text-xs text-text-muted">Publicaciones</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold font-heading leading-tight">{counts.followers}</p>
                  <p className="text-xs text-text-muted">Seguidores</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold font-heading leading-tight">{counts.following}</p>
                  <p className="text-xs text-text-muted">Siguiendo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleFollow}
                disabled={followBusy}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60",
                  followed
                    ? "bg-bg-secondary text-text-secondary border border-border hover:border-violet/40"
                    : "bg-violet text-white hover:bg-violet-deep"
                )}
              >
                {followBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : followed
                    ? <UserCheck className="h-4 w-4" />
                    : <UserPlus className="h-4 w-4" />}
                {followed ? "Siguiendo" : "Seguir"}
              </button>
            </div>

            {profile.bio && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted mb-1.5">Sobre mí</h2>
                <p className="text-sm text-text-secondary whitespace-pre-line">{profile.bio}</p>
              </div>
            )}

            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted mb-2">Estilo de vida</h2>
              <div className="flex flex-wrap gap-1.5">
                {labelSmoking(profile.smoking) && <Pill>{labelSmoking(profile.smoking)}</Pill>}
                {labelPartying(profile.partying) && <Pill>{labelPartying(profile.partying)}</Pill>}
                {labelSleep(profile.sleep_schedule) && <Pill>{labelSleep(profile.sleep_schedule)}</Pill>}
                {labelCleanliness(profile.cleanliness) && <Pill>{labelCleanliness(profile.cleanliness)}</Pill>}
                {labelNoise(profile.noise_tolerance) && <Pill>{labelNoise(profile.noise_tolerance)}</Pill>}
                {labelFriends(profile.friends_at_home) && <Pill>{labelFriends(profile.friends_at_home)}</Pill>}
                {profile.is_homebody && <Pill>Casero/a</Pill>}
                {profile.is_early_riser && <Pill>Madrugador/a</Pill>}
                {labelPet(profile.pet_friendly) && <Pill>{labelPet(profile.pet_friendly)}</Pill>}
                {labelDiet(profile.diet) && <Pill>{labelDiet(profile.diet)}</Pill>}
              </div>
            </div>

            {profile.hobbies && profile.hobbies.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted mb-2">Hobbies</h2>
                <div className="flex flex-wrap gap-1.5">
                  {profile.hobbies.map((h) => (
                    <span
                      key={h}
                      className="text-xs px-2.5 py-1 rounded-full bg-fuchsia-50 text-fuchsia font-medium"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer hint */}
            {relation === "i_liked" && (
              <div className="flex items-center gap-2 rounded-xl border border-violet/20 bg-violet-50 p-3 text-xs font-medium text-violet-deep">
                <Heart className="h-4 w-4 shrink-0" />
                <span>Le has dado like. Cuando responda con un like, podrás chatear.</span>
              </div>
            )}
            {relation === "none" && (
              <p className="text-xs text-text-muted">
                Para iniciar un chat, primero tenéis que coincidir en RoomieMatch.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal de denuncia de foto de perfil (RPC report_profile_photo) */}
      {reportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-photo-title"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setReportOpen(false)}
            className="absolute inset-0 bg-black/40 cursor-default"
            tabIndex={-1}
          />
          <div className="animate-sheet-in relative w-full overflow-hidden rounded-t-2xl border border-border bg-bg-primary shadow-float sm:max-w-sm sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
              <h2 id="report-photo-title" className="text-base font-bold font-heading">
                Denunciar foto de perfil
              </h2>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                aria-label="Cerrar"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-5 pt-3 text-xs text-text-muted">
              La denuncia es anónima para esta persona. Si su foto acumula varias
              denuncias, el perfil dejará de aparecer hasta que la revisemos.
            </p>
            <div className="p-3">
              {PHOTO_REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={reportBusy}
                  onClick={() => submitPhotoReport(reason)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left text-sm font-medium hover:bg-bg-secondary/60 transition-colors disabled:opacity-50"
                >
                  {reason}
                  {reportBusy
                    ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                    : <ChevronRight className="h-4 w-4 text-text-muted" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet font-medium">
      {children}
    </span>
  );
}
