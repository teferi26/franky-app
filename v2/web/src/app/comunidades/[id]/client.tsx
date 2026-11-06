"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Loader2, Users, Send, Hash, Lock, Pencil, ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { uploadCommunityImage } from "@/lib/community-image-upload";
import { Button, buttonVariants } from "@/components/ui/button";
import { SocialSafetyActions } from '@/components/SocialSafetyActions';
import { ensureCommunityTerms } from '@/lib/community-terms-client';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import { useSocialModerationRefresh } from '@/lib/social-moderation-client';
import { communityRpc, communityAdmissionAction, communityAdmissionError, type CommunityAdmission } from '@/lib/community-admission-client';

// Los cuatro valores que admite el CHECK de la migración 138. Misma lista que
// /comunidades/crear y que la app (mobile/src/lib/communities.ts).
const KINDS = [
  { value: "carrera", label: "Carrera" },
  { value: "residencia", label: "Residencia" },
  { value: "estudio", label: "Estudio" },
  { value: "aficion", label: "Afición" },
] as const;

/**
 * Ficha de una comunidad (migración 138): cabecera, unirse/salir y su feed de
 * publicaciones. Publicar exige ser miembro (lo impone la RPC).
 */
type Community = CommunityAdmission;
type Post = {
  id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
};

function ComunidadDetailClient({ id }: { id: string }) {
  const { owner, isCurrent } = useAccountGuard();
  const confirm = useConfirm();
  const { user, loading: sessionLoading } = useSession();
  const [community, setCommunity] = useState<Community | null | "notfound">(null);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const membershipLock = useRef(false); const loadSequence = useRef(0);
  const acceptTerms = async () => {
    try { return !!user && await ensureCommunityTerms(user.id, isCurrent, confirm); }
    catch { setNotice('No se pudieron comprobar las normas. Inténtalo de nuevo.'); return false; }
  };

  // ── Edición para quien la creó ──────────────────────────────────────────
  // No existía en ningún sitio: una vez creada, la foto y el nombre de una
  // comunidad eran para siempre. La RLS sí lo permitía desde la 138
  // ("communities_owner_update": created_by = auth.uid()).
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editKind, setEditKind] = useState<(typeof KINDS)[number]["value"]>("aficion");
  const [editPrivate, setEditPrivate] = useState(false);
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editError, setEditError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadPosts = useCallback(async () => {
    try { const data = await communityRpc<Post[]>("get_community_posts", {
      p_community: id,
      p_limit: 40,
      p_offset: 0,
    }, owner, isCurrent);
    if (isCurrent()) setPosts(data ?? []);
    } catch { if (isCurrent()) setNotice('No se ha podido cargar el muro. Actualiza la comunidad para reintentar.'); }
  }, [id, owner, isCurrent]);

  const loadCommunity = useCallback(async () => {
    const sequence = ++loadSequence.current; setLoadError('');
    try {
      const data = await communityRpc<Community>('get_community_admission', { p_id: id }, owner, isCurrent);
      if (!isCurrent() || sequence !== loadSequence.current) return;
      setCommunity(data); setIsMember(data.is_member); setMemberCount(Number(data.member_count) || 0);
      if (data.is_private && !data.is_member) setPosts([]);
    } catch (error) {
      if (!isCurrent() || sequence !== loadSequence.current) return;
      if (/community_not_found/.test(String((error as {message?:unknown})?.message))) { setCommunity('notfound'); setPosts([]); }
      else setLoadError(communityAdmissionError(error));
    }
  }, [id, owner, isCurrent]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    loadCommunity();
  }, [loadCommunity, user, sessionLoading]);

  useEffect(() => {
    if (isMember || (community && community !== "notfound" && !community.is_private)) {
      loadPosts();
    }
  }, [isMember, community, loadPosts]);

  useSocialModerationRefresh(() => { void loadCommunity(); void loadPosts(); });
  const toggleMembership = async () => {
    if (membershipLock.current || !isCurrent() || !community || community === 'notfound') return;
    membershipLock.current = true; setBusy(true); setNotice('');
    try {
      if (isMember) {
        await communityRpc('leave_community', { p_id: id }, owner, isCurrent);
        if (isCurrent()) { setPosts([]); setNotice('Has salido de la comunidad.'); }
      } else {
        const action = communityAdmissionAction(community);
        await communityRpc(action.name, action.args, owner, isCurrent);
        if (isCurrent()) setNotice(action.requested ? 'Solicitud enviada. El equipo de la comunidad la revisará.' : 'Ya formas parte de la comunidad.');
      }
      if (isCurrent()) await loadCommunity();
    } catch (error) { if (isCurrent()) setNotice(communityAdmissionError(error)); }
    finally { membershipLock.current = false; if (isCurrent()) setBusy(false); }
  };

  const declineInvitation = async () => {
    if (membershipLock.current || !isCurrent() || !community || community === 'notfound' || !community.admission_id) return;
    membershipLock.current = true; setBusy(true);
    try { await communityRpc('respond_community_invitation', { p_id: community.admission_id, p_accept: false }, owner, isCurrent); if (isCurrent()) { setNotice('Has declinado la invitación.'); await loadCommunity(); } }
    catch (error) { if (isCurrent()) setNotice(communityAdmissionError(error)); }
    finally { membershipLock.current = false; if (isCurrent()) setBusy(false); }
  };

  const abrirEdicion = () => {
    if (!community || community === "notfound") return;
    setEditName(community.name);
    setEditDesc(community.description ?? "");
    setEditKind(community.kind as (typeof KINDS)[number]["value"]);
    setEditPrivate(community.is_private);
    setEditImage(community.image_url);
    setEditError("");
    setEditing(true);
  };

  const subirFoto = async (file: File) => {
    if (!user) return;
    if (!await acceptTerms()) return;
    setBusy(true);
    setEditError("");
    try {
      const supabase = createClient();
      const { url } = await uploadCommunityImage(supabase, user.id, file);
      setEditImage(url);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    }
    setBusy(false);
  };

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await acceptTerms()) return;
    if (editImage && !editImage.includes('/ugc-approved/')) return setEditError('Vuelve a elegir la foto o quítala para revisar la comunidad.');
    const nombre = editName.trim();
    if (nombre.length < 3) return setEditError("El nombre debe tener al menos 3 letras.");
    setBusy(true);
    setEditError("");
    const supabase = createClient();
    // .select() a propósito: sin él, un UPDATE que la RLS bloquea devuelve ok
    // con cero filas y el usuario se cree que ha guardado.
    const { data, error } = await supabase
      .from("communities")
      .update({
        name: nombre,
        description: editDesc.trim() || null,
        kind: editKind,
        is_private: editPrivate,
        image_url: editImage,
      })
      .eq("id", id)
      .select("id");
    setBusy(false);
    if (error || !data?.length) {
      console.error("[comunidades] update", error);
      setEditError(error?.message ?? "No se guardó nada. Comprueba que la comunidad sigue siendo tuya.");
      return;
    }
    setEditing(false);
    loadCommunity();
  };

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await acceptTerms()) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_community_post", {
      p_community: id,
      p_body: body,
      p_image_url: null,
    });
    setBusy(false);
    if (!error) {
      setNotice('Enviado a revisión. Se mostrará cuando comprobemos que cumple las normas.');
      setDraft("");
      loadPosts();
    } else {
      setNotice('No se ha publicado. Comprueba la conexión e inténtalo de nuevo.');
    }
  };

  if (loadError && community === null) return <div className="mx-auto max-w-md p-8"><p role="alert">{loadError}</p><Button className="mt-4" onClick={() => void loadCommunity()}>Reintentar</Button></div>;
  if (sessionLoading || (user && community === null)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="font-heading text-xl font-extrabold">Entra para ver la comunidad</h2>
        <Link
          href={`/login?next=${encodeURIComponent(`/comunidades/${id}`)}`}
          className={buttonVariants({ variant: "dark", size: "lg", className: "mt-5" })}
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (community === "notfound" || community === null) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-semibold">Esta comunidad no está disponible para tu cuenta.</p>
        <Link href="/comunidades" className="link-underline mt-4 inline-flex font-semibold text-text-primary">
          Ver comunidades
        </Link>
      </div>
    );
  }

  const canSeePosts = isMember || !community.is_private;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:py-12 animate-page-in">
      {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
      {loadError && <p role="alert" className="mb-4 text-sm">{loadError} <button className="underline" onClick={() => void loadCommunity()}>Reintentar</button></p>}
      {community.created_by !== user.id && <SocialSafetyActions kind="community" id={community.id} onSuppressed={() => setCommunity('notfound')} />}
      <Link
        href="/comunidades"
        className="group mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> Comunidades
      </Link>

      {/* Cabecera */}
      <div className="overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card">
        {/* Banda de foto solo si la comunidad tiene imagen; si no, la
            cabecera es tipográfica. */}
        <div className={`relative bg-bg-secondary ${community.image_url ? "h-40 sm:h-48" : "h-0"}`}>
          {community.image_url && (
            <Image
              src={community.image_url}
              alt=""
              fill
              className="object-cover"
              // Sin `sizes`, Next asume 100vw y sirve la variante mas grande del
              // srcset (hasta 3840 px) para una banda de 672 px de ancho.
              sizes="(max-width: 672px) 100vw, 672px"
            />
          )}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">
                <Hash className="h-5 w-5 text-violet" aria-hidden="true" />
                {community.name}
              </h1>
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-text-muted">
                <Users className="h-3.5 w-3.5" /> {memberCount} miembros
                {community.is_private && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs">
                    <Lock className="h-3 w-3" /> Privada
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {community.created_by === user.id && (
                <button
                  onClick={abrirEdicion}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              )}
              <button
                onClick={toggleMembership}
                disabled={busy || (!isMember && (community.admission_status === 'requested' || (community.join_policy === 'invite' && community.admission_status !== 'invited')))}
                className={buttonVariants({
                  variant: isMember ? "outline" : "dark",
                  className: isMember ? "hover:border-error hover:text-error" : undefined,
                })}
              >
                {busy ? "…" : isMember ? "Salir" : community.admission_status === 'invited' ? 'Aceptar invitación' : community.admission_status === 'requested' ? 'Solicitud pendiente' : community.join_policy === 'request' ? 'Solicitar acceso' : community.join_policy === 'invite' ? 'Se requiere invitación' : "Unirme"}
              </button>
              {!isMember && community.admission_status === 'invited' ? <button disabled={busy} onClick={() => void declineInvitation()} className={buttonVariants({ variant: 'outline' })}>Declinar</button> : null}
            </div>
          </div>
          {community.description && (
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {community.description}
            </p>
          )}
        </div>
      </div>

      {/* Panel de edición (solo quien la creó) */}
      {editing && (
        <form
          onSubmit={guardarEdicion}
          className="mt-5 space-y-4 rounded-2xl border border-border bg-bg-primary p-5 shadow-card animate-scale-in"
        >
          <h2 className="font-heading text-lg font-extrabold text-text-primary">Editar comunidad</h2>

          {editError && (
            <p className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error">{editError}</p>
          )}

          <div>
            <span className="mb-1.5 block text-sm font-semibold">Foto</span>
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-bg-secondary">
                {editImage && (
                  // Miniatura fija de 96 px: pedir la imagen a ese tamano evita
                  // descargar la foto original completa solo para la vista previa.
                  <Image src={editImage} alt="" fill className="object-cover" sizes="96px" />
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subirFoto(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ImagePlus className="h-4 w-4" /> Cambiar foto
              </button>
              {editImage && (
                <button
                  type="button"
                  onClick={() => setEditImage(null)}
                  className="text-sm text-text-muted hover:text-error"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Nombre</span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={80}
              className="w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-semibold">Tipo</span>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setEditKind(k.value)}
                  aria-pressed={editKind === k.value}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    editKind === k.value
                      ? "border-text-primary bg-text-primary text-bg-primary"
                      : "border-border text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Descripción</span>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editPrivate}
              onChange={(e) => setEditPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-border text-violet focus:ring-violet/30"
            />
            Comunidad privada (solo entra quien invites)
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="dark" disabled={busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      )}

      {/* Publicar (solo miembros) */}
      {isMember && (
        <form onSubmit={publish} className="mt-5 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`Escribe algo en ${community.name}…`}
            className="w-full resize-none rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm text-text-primary transition-colors focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" variant="dark" size="sm" disabled={busy || !draft.trim()}>
              <Send className="h-4 w-4" /> Publicar
            </Button>
          </div>
        </form>
      )}

      {/* Feed */}
      <div className="mt-5">
        {!canSeePosts ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Lock className="mx-auto mb-2 h-6 w-6 text-text-muted" />
            <p className="text-sm text-text-muted">
              Esta comunidad es privada. Únete para ver sus publicaciones.
            </p>
          </div>
        ) : posts === null ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            Todavía no hay nada publicado. {isMember ? "¡Rompe el hielo!" : ""}
          </p>
        ) : (
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id} className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-7 w-7 overflow-hidden rounded-full bg-bg-secondary ring-1 ring-border">
                    {p.author_avatar && (
                      <Image src={p.author_avatar} alt="" width={28} height={28} className="h-full w-full object-cover" unoptimized />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{p.author_name || "Estudiante"}</span>
                  <time className="ml-auto text-xs text-text-muted" dateTime={p.created_at}>
                    {new Date(p.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </time>
                </div>
                {p.body && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text-primary">{p.body}</p>}
                {!p.is_mine && <SocialSafetyActions kind="community_post" id={p.id} onSuppressed={() => setPosts(old => old?.filter(item => item.id !== p.id) ?? [])} />}
                {p.image_url && (
                  <div className="img-zoom relative mt-3 h-56 overflow-hidden rounded-2xl border border-border bg-bg-secondary">
                    <Image src={p.image_url} alt="" fill className="object-cover" sizes="100vw" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export default withAccountScope(ComunidadDetailClient);
