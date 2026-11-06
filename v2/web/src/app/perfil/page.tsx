"use client";
import RoomieConnections from "../roomie-match/components/RoomieConnections";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail, GraduationCap, Camera,
  Loader2, Check, AlertCircle, LogOut, ChevronRight, Trash2,
  Compass, ShieldCheck,
  Eye, VolumeX, BadgeCheck, Home as HomeIcon, Ban, Bell, Lightbulb,
} from "lucide-react";
import InviteFriendsCard from "@/components/InviteFriendsCard";
import CardEntry from "@/components/card/card-entry";
import { createClient } from "@/lib/supabase-client";
import { isNonStudentRole } from "@/lib/roles";
import { prepareImageForUpload, isImageFile, detectMime } from "@/lib/image-upload";
import EmailVerifyBanner from "@/components/EmailVerifyBanner";
import VerifiedBadge from "@/components/VerifiedBadge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import MisEventosSection from "../eventos/components/mis-eventos-section";
import PendingTenancyInvites from "./components/pending-tenancy-invites";
import MyPostsSection from "./components/MyPostsSection";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3MB
const AVATAR_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Prepara una imagen para el bucket de avatares (lo usan la foto de perfil y
 * la galería de fotos, que van al mismo bucket).
 *
 * Dos cosas: convierte a JPEG (las fotos del iPhone llegan en HEIC y el
 * Storage las rechaza con un 415, ver src/lib/image-upload.ts) y, a
 * diferencia del conversor general, tampoco deja pasar el GIF tal cual
 * porque este bucket no lo acepta. Se le declara como JPEG para forzar la
 * reconversión: se queda el primer fotograma, que es justo lo que interesa
 * en una foto de perfil.
 */
async function prepareProfileImage(file: File) {
  const source =
    detectMime(file) === "image/gif"
      ? new File([file], file.name.replace(/\.gif$/i, ".jpg"), { type: "image/jpeg" })
      : file;
  return prepareImageForUpload(source);
}

const CCAA = [
  "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria",
  "Castilla-La Mancha", "Castilla y León", "Cataluña", "Ceuta",
  "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja",
  "Madrid", "Melilla", "Murcia", "Navarra", "País Vasco",
];

interface ProfileData {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  photos: string[] | null;
  bio: string | null;
  city: string | null;
  comunidad_autonoma: string | null;
  onboarding_completed: boolean | null;
  // Correo de la UNIVERSIDAD confirmado (migración 025). Nada que ver con el
  // correo de la cuenta, que es lo que gestiona EmailVerifyBanner.
  student_email_verified: boolean | null;
  // profiles.role. Manda para decidir qué bloques de esta página tienen
  // sentido: a un propietario no se le pide nada de estudiante.
  role: string | null;
}

const MAX_PHOTOS = 6;

function initialsOf(name: string | null, email: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PerfilPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [ccaa, setCcaa] = useState("");

  // 19/70: visitas al perfil y seguidores nuevos de la semana (RPC
  // get_profile_activity, migración 134). Solo se muestra si hay algo (>0).
  const [activity, setActivity] = useState<{ views: number; newFollowers: number }>({ views: 0, newFollowers: 0 });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?next=/perfil");
        return;
      }
      const { data, error: e } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, photos, bio, city, comunidad_autonoma, onboarding_completed, student_email_verified, role")
        .eq("id", user.id)
        .single();

      if (e || !data) {
        setError("No se pudo cargar tu perfil");
        setLoading(false);
        return;
      }
      setProfile(data as ProfileData);
      setFullName(data.full_name ?? "");
      setBio(data.bio ?? "");
      setCity(data.city ?? "");
      setCcaa(data.comunidad_autonoma ?? "");
      setLoading(false);

      // Actividad de la última semana. Fail-soft: si la RPC no existe aún
      // en producción, se queda en 0/0 y el banner no se muestra.
      try {
        const { data: act, error: actErr } = await supabase.rpc("get_profile_activity", { p_days: 7 });
        if (!actErr && act) {
          const row = Array.isArray(act) ? act[0] : act;
          setActivity({
            views: Number(row?.views ?? 0),
            newFollowers: Number(row?.new_followers ?? 0),
          });
        }
      } catch { /* sin migración 134: sin banner */ }
    })();
  }, []);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handlePickAvatar = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !profile) return;
    clearMessages();

    if (!isImageFile(file)) {
      setError("Formato no admitido. Usa JPG, PNG, WebP o GIF.");
      return;
    }

    setUploading(true);

    const prep = await prepareProfileImage(file);
    if (!prep.ok) {
      setUploading(false);
      setError(prep.message);
      return;
    }
    // El peso se mide DESPUÉS de convertir: una foto de 8MB recién hecha con
    // el móvil se queda muy por debajo del tope del bucket al pasar a JPEG.
    if (prep.blob.size > AVATAR_MAX_BYTES) {
      setUploading(false);
      setError("La imagen supera los 3MB.");
      return;
    }

    const supabase = createClient();
    const rand = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}`;
    const path = `${profile.id}/${rand}.${prep.ext}`;

    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, prep.blob, { contentType: prep.contentType, upsert: false });

    if (upErr) {
      setUploading(false);
      setError("No se pudo subir la imagen. Inténtalo de nuevo o prueba con otra foto.");
      return;
    }

    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl ?? null;

    if (!publicUrl) {
      setUploading(false);
      setError("No se pudo obtener la URL de la imagen");
      return;
    }

    const oldUrl = profile.avatar_url;

    const { error: profErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (profErr) {
      setUploading(false);
      setError(profErr.message);
      return;
    }

    await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });

    // Best-effort: delete previous avatar if it was on our bucket
    if (oldUrl && oldUrl.includes(`/${AVATAR_BUCKET}/`)) {
      const marker = `/${AVATAR_BUCKET}/`;
      const idx = oldUrl.indexOf(marker);
      if (idx !== -1) {
        const oldPath = oldUrl.substring(idx + marker.length);
        await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
      }
    }

    setProfile({ ...profile, avatar_url: publicUrl });
    setUploading(false);
    setSuccess("Foto de perfil actualizada");
  };

  const handleRemoveAvatar = async () => {
    if (!profile?.avatar_url) return;
    clearMessages();
    setUploading(true);
    const supabase = createClient();
    const { error: e } = await supabase
      .from("profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (e) {
      setUploading(false);
      setError(e.message);
      return;
    }
    await supabase.auth.updateUser({ data: { avatar_url: null } });
    if (profile.avatar_url.includes(`/${AVATAR_BUCKET}/`)) {
      const marker = `/${AVATAR_BUCKET}/`;
      const idx = profile.avatar_url.indexOf(marker);
      if (idx !== -1) {
        const oldPath = profile.avatar_url.substring(idx + marker.length);
        await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
      }
    }
    setProfile({ ...profile, avatar_url: null });
    setUploading(false);
    setSuccess("Foto eliminada");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    clearMessages();

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres");
      return;
    }
    if (trimmedName.length > 100) {
      setError("Nombre demasiado largo");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: e1 } = await supabase
      .from("profiles")
      .update({
        full_name: trimmedName,
        bio: bio.trim() || null,
        city: city.trim() || null,
        comunidad_autonoma: ccaa || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (e1) {
      setSaving(false);
      setError(e1.message);
      return;
    }

    await supabase.auth.updateUser({ data: { full_name: trimmedName } });

    setProfile({
      ...profile,
      full_name: trimmedName,
      bio: bio.trim() || null,
      city: city.trim() || null,
      comunidad_autonoma: ccaa || null,
    });
    setSaving(false);
    setSuccess("Perfil actualizado");
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet" aria-label="Cargando" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm text-center animate-slide-up">
          <AlertCircle className="mx-auto h-6 w-6 text-error" />
          <p className="eyebrow mt-5">Mi perfil</p>
          <p className="mt-3 text-fluid-h2 font-extrabold text-text-primary">No hemos podido abrir tu perfil</p>
          <p className="mt-2 text-[15px] leading-relaxed text-text-muted">{error || "Vuelve a intentarlo en unos segundos."}</p>
        </div>
      </div>
    );
  }

  const initials = initialsOf(profile.full_name, profile.email);
  // Propietario o gestor de universidad: nada de universidad, carrera, becas,
  // test vocacional ni RoomieMatch. Su perfil es su nombre, su foto, sus datos
  // de contacto y el acceso a su panel.
  const esEstudiante = !isNonStudentRole(profile.role);

  // Rótulo de la cabecera: el lugar si lo hay, y si no el nombre de la sección.
  const eyebrowLugar = [profile.city, profile.comunidad_autonoma].filter(Boolean).join(" · ") || "Mi cuenta";

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial: avatar grande, nombre grande y el lugar como
          rótulo. Sin foto de fondo ni degradado. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="relative shrink-0 animate-slide-up">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-secondary sm:h-28 sm:w-28">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt="Avatar"
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="font-heading text-3xl font-extrabold text-text-primary">{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={handlePickAvatar}
                disabled={uploading}
                className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-primary text-text-primary shadow-card transition-colors hover:border-text-primary/30 hover:bg-bg-secondary disabled:opacity-50"
                aria-label="Cambiar foto"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={AVATAR_MIMES.join(",")}
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1 animate-slide-up [animation-delay:60ms]">
              <p className="eyebrow">{eyebrowLugar}</p>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 truncate text-fluid-h1 font-extrabold text-text-primary">
                  {profile.full_name || "Sin nombre"}
                </h1>
                {/* Distintivo de estudiante verificado (correo de la uni). */}
                <VerifiedBadge verified={profile.student_email_verified} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0" /> {profile.email}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <button
                  type="button"
                  onClick={handlePickAvatar}
                  disabled={uploading}
                  className="link-underline font-semibold text-text-primary disabled:opacity-50"
                >
                  Cambiar foto
                </button>
                {profile.avatar_url && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    className="flex items-center gap-1 text-text-muted transition-colors hover:text-error disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 19/70: actividad de la semana en cifras. Solo si hay algo (>0). */}
          {(activity.views > 0 || activity.newFollowers > 0) && (
            <dl className="mt-10 grid grid-cols-2 gap-8 sm:max-w-sm animate-slide-up [animation-delay:120ms]">
              {activity.views > 0 && (
                <div>
                  <dt className="eyebrow flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Visitas
                  </dt>
                  <dd className="tabular mt-1.5 font-heading text-3xl font-extrabold text-text-primary">
                    {activity.views}
                  </dd>
                  <p className="mt-0.5 text-xs text-text-muted">Esta semana</p>
                </div>
              )}
              {activity.newFollowers > 0 && (
                <div>
                  <dt className="eyebrow">Seguidores</dt>
                  <dd className="tabular mt-1.5 font-heading text-3xl font-extrabold text-violet">
                    +{activity.newFollowers}
                  </dd>
                  <p className="mt-0.5 text-xs text-text-muted">Nuevos esta semana</p>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        {/* Aviso de email pendiente de confirmar (verificación diferida). */}
        <EmailVerifyBanner />

        <Reveal className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
          <p className="eyebrow">Tus datos</p>
          <h2 className="mt-2 font-heading text-xl font-extrabold text-text-primary">Información personal</h2>

          {/* Messages */}
          {(error || success) && (
            <div
              role={error ? "alert" : "status"}
              className={cn(
                "mt-5 flex items-start gap-2 rounded-xl border p-3 text-sm font-medium",
                error
                  ? "border-error/20 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                  : "border-success/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              )}
            >
              {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error || success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="mt-6 space-y-5">
            <Field id="perfil-nombre" label="Nombre completo" required>
              <Input
                id="perfil-nombre"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                placeholder="Tu nombre y apellidos"
              />
            </Field>

            <Field id="perfil-email" label="Email" hint="El email no se puede cambiar desde aquí.">
              <Input id="perfil-email" type="email" value={profile.email ?? ""} disabled />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="perfil-ccaa" label="Comunidad Autónoma">
                <select
                  id="perfil-ccaa"
                  value={ccaa}
                  onChange={(e) => setCcaa(e.target.value)}
                  aria-label="Comunidad Autónoma"
                  className="flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
                >
                  <option value="">Selecciona</option>
                  {CCAA.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field id="perfil-ciudad" label="Ciudad">
                <Input
                  id="perfil-ciudad"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={100}
                  placeholder="Tu ciudad"
                />
              </Field>
            </div>

            <Field id="perfil-bio" label="Sobre ti" hint={`${bio.length}/500`}>
              <Textarea
                id="perfil-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Cuéntale al resto quién eres..."
              />
            </Field>

            <div className="flex items-center justify-end pt-2">
              <Button type="submit" size="lg" loading={saving}>
                {!saving && <Check className="h-4 w-4" />}
                {saving ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Reveal>

        {/* Distintivo de estudiante: solo se ofrece si aún no lo tiene.
            OJO: esto NO es el correo de la cuenta (de eso va EmailVerifyBanner,
            arriba), sino el correo de la universidad (migración 025).
            La verificación ya vive en la web: /perfil/verificar-estudiante
            pide el correo, el endpoint /api/auth/student-verification envía el
            enlace y la misma página lo confirma. Paridad con la pantalla
            /verificar-estudiante de la app.
            No se le ofrece a quien no es estudiante: un propietario no tiene
            correo de universidad que confirmar. */}
        {esEstudiante && profile.student_email_verified !== true && (
          <Reveal className="mt-4 rounded-2xl border border-violet/25 bg-bg-primary p-6 shadow-card sm:p-8">
            <BadgeCheck className="h-5 w-5 text-violet" aria-hidden="true" />
            <p className="eyebrow mt-4">Distintivo</p>
            <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">
              Consigue el distintivo de estudiante
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Confirma el correo de tu universidad y llévalo junto a tu
              nombre en todo Franky.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
                Se nota: la gente se fía más de quien lleva el distintivo.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
                Puedes escribir a quien solo acepta mensajes de estudiantes
                verificados.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
                Es el correo de tu universidad, distinto del correo con el
                que entras en tu cuenta.
              </li>
            </ul>
            <Link href="/perfil/verificar-estudiante" className={cn(buttonVariants({ size: "lg" }), "group mt-6")}>
              Verificar mi correo universitario
              <ChevronRight className="h-4 w-4 arrow-nudge" />
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-text-muted">
              Te enviaremos un enlace a tu correo de la universidad; al
              abrirlo, el distintivo queda activo.
            </p>
          </Reveal>
        )}

        {/* Mis publicaciones de FOMO: paridad con el perfil de la app móvil
            (Actividad, Fotos, Vídeos y Privado). Va antes de las secciones de
            RoomieMatch para darle protagonismo al contenido social. */}
        <MyPostsSection
          userId={profile.id}
          fullName={profile.full_name}
          avatarUrl={profile.avatar_url}
        />

        {/* Photo gallery (up to 6 photos for RoomieMatch). Solo estudiantes:
            estas fotos existen para la tarjeta de RoomieMatch. */}
        {esEstudiante && (
          <PhotosSection
            userId={profile.id}
            photos={profile.photos ?? []}
            onChange={(photos) => setProfile((p) => (p ? { ...p, photos } : p))}
          />
        )}

        {/* Invitaciones de piso pendientes */}
        <div className="mt-4">
          <PendingTenancyInvites />
        </div>

        {/* My events (created + joined) */}
        <div className="mt-4">
          <MisEventosSection userId={profile.id} />
        </div>

        {/* Mi test vocacional. Solo estudiantes: el test recomienda carreras. */}
        {esEstudiante && (
          <div className="mt-4">
            <VocationalResultCard />
          </div>
        )}

        {/* RoomieMatch — likes given, matches, likes received. Solo
            estudiantes: un propietario alquila pisos, no busca roomie. */}
        {esEstudiante && <RoomieConnections />}

        {/* Privacidad: quién puede escribirte + cuentas silenciadas y bloqueadas */}
        <PrivacySection userId={profile.id} />

        {/* Invita a tu gente: enlace personal ?ref= (paridad con la app). */}
        <CardEntry userId={profile.id} />
        <InviteFriendsCard userId={profile.id} />

        {/* Más de Franky: herramientas que salieron del navbar a propósito
            (decisión de IA de navegación del 24-jul): las descubre quien
            investiga su perfil, sin cargar el menú principal. Son de campus,
            así que no se le enseñan a quien no es estudiante. */}
        {esEstudiante && (
          <Reveal className="mt-8">
            <p className="eyebrow">Más de Franky</p>
            <div className="mt-3 divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
              {[
                { href: "/nota-media", label: "Calculadora de nota media", hint: "Tu expediente, al momento" },
                { href: "/mercado", label: "Mercado del campus", hint: "Compra, vende, busca y ofrece" },
                { href: "/comunidades", label: "Comunidades", hint: "Carrera, residencia y aficiones" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
                >
                  <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="hidden sm:inline">{item.hint}</span>
                    <ChevronRight className="h-4 w-4 arrow-nudge" />
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>
        )}

        {/* Atajo al panel de quien no es estudiante: lo suyo son sus pisos,
            sus visitas y su facturación, no un perfil académico. */}
        {profile.role === "propietario" && (
          <Reveal className="mt-8">
            <p className="eyebrow">Tu negocio</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
              <Link
                href="/propietario/dashboard"
                className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <HomeIcon className="h-4 w-4 shrink-0 text-violet" />
                  <div>
                    <span className="block text-sm font-semibold text-text-primary">Mi panel de propietario</span>
                    <span className="block text-xs text-text-muted">Tus pisos, visitas, contratos y cobros</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
              </Link>
            </div>
          </Reveal>
        )}

        {/* Ajustes: una sola lista limpia, sin iconos en cuadrados tintados. */}
        <Reveal className="mt-8">
          <p className="eyebrow">Ajustes</p>
          <div className="mt-3 divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
            {/* El perfil académico y de roomie solo tiene sentido para
                estudiantes: es el cuestionario de universidad, carrera y
                convivencia. */}
            {esEstudiante && (
              <Link
                href="/onboarding?edit=1"
                className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <GraduationCap className="h-4 w-4 shrink-0 text-violet" />
                  <span className="text-sm font-medium text-text-primary">Editar perfil académico y de roomie</span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
              </Link>
            )}
            <Link
              href="/perfil/seguridad"
              className="group flex w-full items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-violet" />
                <span className="text-sm font-medium text-text-primary">Seguridad y segundo factor</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
            </Link>
            <Link
              href="/perfil/notificaciones"
              className="group flex w-full items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
            >
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 shrink-0 text-violet" />
                <span className="text-sm font-medium text-text-primary">Notificaciones</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
            </Link>
            <Link
              href="/sugerencias"
              className="group flex w-full items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
            >
              <div className="flex items-center gap-3">
                <Lightbulb className="h-4 w-4 shrink-0 text-violet" />
                <span className="text-sm font-medium text-text-primary">Sugerir una mejora</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-bg-secondary"
            >
              <div className="flex items-center gap-3">
                <LogOut className="h-4 w-4 shrink-0 text-text-muted" />
                <span className="text-sm font-medium text-text-primary">Cerrar sesión</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
            </button>
          </div>
        </Reveal>

        <DeleteAccountSection key={profile.id} userId={profile.id} />
      </div>
    </div>
  );
}

// ── Privacidad: quién puede escribirte (dm_privacy, migración 134) ────────────
// y acceso a la lista de cuentas silenciadas. Fail-soft: si la columna aún no
// existe en producción, el selector se queda en "Todos" y un cambio fallido
// revierte con aviso.

const DM_PRIVACY_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "seguidos", label: "Solo a quien sigo" },
  { value: "verificados", label: "Solo estudiantes verificados" },
];

function PrivacySection({ userId }: { userId: string }) {
  const [dmPrivacy, setDmPrivacy] = useState("todos");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      // Consulta aparte del perfil principal para que un entorno sin la
      // migración 134 no rompa nada más que este selector.
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("dm_privacy")
          .eq("id", userId)
          .maybeSingle();
        if (!error && data?.dm_privacy) setDmPrivacy(data.dm_privacy as string);
      } catch { /* sin columna todavía: se queda "todos" */ }
    })();
  }, [userId]);

  const save = async (value: string) => {
    const prev = dmPrivacy;
    setDmPrivacy(value);
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ dm_privacy: value, updated_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setDmPrivacy(prev);
      setMsg({ ok: false, text: "No se pudo guardar. Inténtalo de nuevo en unos segundos." });
      return;
    }
    setMsg({ ok: true, text: "Preferencia guardada." });
  };

  return (
    <Reveal className="mt-8">
      <p className="eyebrow">Privacidad</p>
      <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">
        Quién puede escribirte
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Controla quién puede abrirte un chat y a quién has silenciado.
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
        <div>
          <label htmlFor="perfil-dm-privacy" className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
            ¿Quién puede escribirte?
          </label>
          <div className="relative">
            <select
              id="perfil-dm-privacy"
              value={dmPrivacy}
              disabled={saving}
              onChange={(e) => save(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 text-[15px] text-text-primary transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15 disabled:opacity-60"
            >
              {DM_PRIVACY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {saving && (
              <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet" />
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-muted">
            Con &quot;Solo a quien sigo&quot; únicamente podrán abrirte un chat las
            personas a las que sigues; con &quot;Solo estudiantes verificados&quot;,
            quienes hayan verificado su email de universidad. Tus chats existentes
            no se ven afectados.
          </p>
          {msg && (
            <p className={cn("mt-2 text-xs font-medium", msg.ok ? "text-success" : "text-error")} role="status">
              {msg.text}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 divide-y divide-border-light overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
        <Link
          href="/perfil/silenciados"
          className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
        >
          <div className="flex items-center gap-3">
            <VolumeX className="h-4 w-4 shrink-0 text-violet" />
            <div>
              <span className="block text-sm font-medium text-text-primary">Cuentas silenciadas</span>
              <span className="block text-xs text-text-muted">
                Es privado: la otra persona nunca se entera.
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
        </Link>

        <Link
          href="/perfil/bloqueados"
          className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-bg-secondary"
        >
          <div className="flex items-center gap-3">
            <Ban className="h-4 w-4 shrink-0 text-violet" />
            <div>
              <span className="block text-sm font-medium text-text-primary">Cuentas bloqueadas</span>
              <span className="block text-xs text-text-muted">
                No pueden verte ni escribirte. Puedes desbloquear cuando quieras.
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
        </Link>
      </div>
    </Reveal>
  );
}

function DeleteAccountSection({ userId }: { userId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>("");

  const action = useRef(false);
  const alive = useRef(true);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    alive.current = true;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) alive.current = false;
    });
    return () => { alive.current = false; data.subscription.unsubscribe(); };
  }, [userId]);

  const handleDelete = async () => {
    if (action.current || !alive.current) return;
    action.current = true; setDeleting(true); setError("");
    let recorded = false;
    try {
      const client = createClient();
      const { data: { session } } = await client.auth.getSession();
      if (!alive.current || session?.user.id !== userId) throw new Error("La sesión ha cambiado. Vuelve a entrar en tu perfil.");
      const res = await fetch("/api/account/erase", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ confirmation: "ELIMINAR" }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "No se ha registrado la eliminación. Inténtalo de nuevo.");
      recorded = true;
      if (!alive.current) return;
      setRequested(true);
      // Server revocation is owner-specific; shared-client signOut could clear
      // another account that logged in while the deletion request finished.
    } catch (cause) {
      if (alive.current) setError(recorded ? "La eliminación está registrada. Cierra la sesión para salir." : cause instanceof Error ? cause.message : "No se pudo registrar la solicitud. Inténtalo de nuevo.");
    } finally { action.current = false; if (alive.current) setDeleting(false); }
  };

  if (requested) return <div role="status" className="mt-8 border-t border-border-light pt-8">
    <h2 className="font-heading text-xl font-extrabold">Eliminación solicitada</h2>
    <p className="mt-3 text-sm">La cuenta no se puede recuperar. Eliminaremos tus datos personales en un máximo de 30 días y te avisaremos por correo cuando termine.</p>
    <Button className="mt-4" onClick={() => window.location.assign("/login")}>Ir al acceso</Button>
  </div>;

  return (
    <Reveal className="mt-8 border-t border-border-light pt-8">
      <p className="eyebrow">Zona delicada</p>
      <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">Eliminar mi cuenta definitivamente</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-muted">
        Eliminaremos tu perfil, publicaciones, mensajes y archivos personales en un máximo de 30 días. Se detendrán las renovaciones de tus suscripciones y recibirás una confirmación por correo. La cuenta no se podrá recuperar. Solo se conservarán registros necesarios para obligaciones legales, operaciones pendientes y derechos de otras personas, con acceso restringido.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-error/20 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!confirming ? (
        <Button type="button" variant="outline" onClick={() => setConfirming(true)} className="mt-5 text-error hover:border-error/40">
          <Trash2 className="h-4 w-4" />
          Eliminar mi cuenta definitivamente
        </Button>
      ) : (
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-error/20 bg-rose-50 p-5 dark:bg-rose-950/30 animate-fade-in">
          <p className="text-sm leading-relaxed text-rose-700 dark:text-rose-300">
            ¿Eliminar la cuenta y tus datos personales definitivamente? Esta acción no se puede deshacer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" loading={deleting} onClick={handleDelete}>
              {!deleting && <Trash2 className="h-4 w-4" />}
              {deleting ? "Solicitando…" : "Sí, eliminar definitivamente"}
            </Button>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Reveal>
  );
}

// ── Photo gallery section (up to 6 photos) ───────────────────────────────────

function PhotosSection({
  userId,
  photos,
  onChange,
}: {
  userId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const slotsLeft = MAX_PHOTOS - photos.length;

  const handlePick = () => fileRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (slotsLeft <= 0) {
      setErr(`Ya tienes el máximo de ${MAX_PHOTOS} fotos. Elimina alguna antes.`);
      return;
    }

    setErr("");
    setBusy(true);
    const supabase = createClient();
    const newUrls: string[] = [];

    const filesToUpload = files.slice(0, slotsLeft);
    for (const file of filesToUpload) {
      if (!isImageFile(file)) {
        setErr("Formato no admitido. Usa JPG, PNG, WebP o GIF.");
        continue;
      }
      // Convierte a JPEG antes de subir (arregla las fotos HEIC del iPhone).
      const prep = await prepareProfileImage(file);
      if (!prep.ok) {
        setErr(prep.message);
        continue;
      }
      if (prep.blob.size > AVATAR_MAX_BYTES) {
        setErr("Cada imagen debe ocupar menos de 3MB.");
        continue;
      }
      const rand =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `${userId}/photos/${rand}.${prep.ext}`;

      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, prep.blob, { contentType: prep.contentType, upsert: false });
      if (upErr) {
        setErr("No se pudo subir alguna imagen. Inténtalo de nuevo.");
        continue;
      }
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) newUrls.push(pub.publicUrl);
    }

    if (newUrls.length > 0) {
      const updated = [...photos, ...newUrls].slice(0, MAX_PHOTOS);
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ photos: updated, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (profErr) {
        setErr(profErr.message);
      } else {
        onChange(updated);
      }
    }
    setBusy(false);
  };

  const handleRemove = async (url: string) => {
    setErr("");
    setBusy(true);
    const supabase = createClient();
    const updated = photos.filter((p) => p !== url);
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ photos: updated, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profErr) {
      setErr(profErr.message);
      setBusy(false);
      return;
    }
    onChange(updated);
    // Best-effort delete from storage
    if (url.includes(`/${AVATAR_BUCKET}/`)) {
      const marker = `/${AVATAR_BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        const oldPath = url.substring(idx + marker.length);
        await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
      }
    }
    setBusy(false);
  };

  return (
    <Reveal className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Galería</p>
          <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">Mis fotos</h2>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Añade hasta {MAX_PHOTOS} fotos para tu tarjeta de RoomieMatch.
          </p>
        </div>
        <span className="tabular shrink-0 text-sm font-semibold text-text-muted">
          {photos.length}/{MAX_PHOTOS}
        </span>
      </div>

      {err && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-error/20 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-border bg-bg-primary p-5 shadow-card">

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const url = photos[i];
          if (url) {
            return (
              <div
                key={url}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-bg-secondary"
              >
                <Image
                  src={url}
                  alt={`Foto ${i + 1}`}
                  fill
                  sizes="(min-width: 640px) 16vw, 33vw"
                  className="object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  disabled={busy}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-50"
                  aria-label="Eliminar foto"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet text-white">
                    Principal
                  </span>
                )}
              </div>
            );
          }
          // Empty slot — only the first empty slot triggers upload to keep UI simple
          const isFirstEmpty = i === photos.length;
          return (
            <button
              key={i}
              type="button"
              onClick={isFirstEmpty ? handlePick : undefined}
              disabled={!isFirstEmpty || busy}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed text-text-muted transition-colors",
                isFirstEmpty
                  ? "cursor-pointer border-violet/40 hover:border-violet hover:text-violet"
                  : "cursor-default border-border-light opacity-60"
              )}
            >
              {busy && isFirstEmpty ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Camera className="h-5 w-5 mb-0.5" />
                  <span className="text-[10px] font-medium">{isFirstEmpty ? "Añadir" : ""}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_MIMES.join(",")}
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    </Reveal>
  );
}

function VocationalResultCard() {
  const [data, setData] = useState<{
    id: string;
    mbti_type: string | null;
    holland_code: string | null;
    questions_answered: number | null;
    created_at: string;
    top_careers: Array<{ name: string; score: number }> | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vocational/result")
      .then((r) => r.json())
      .then((j) => {
        setData(j.result || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
        <Compass className="h-5 w-5 text-violet" aria-hidden="true" />
        <p className="eyebrow mt-4">Orientación</p>
        <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">Test vocacional</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Aún no has hecho el test. Descubre qué carreras encajan contigo.
        </p>
        <Link href="/test-vocacional" className={cn(buttonVariants({ size: "lg" }), "group mt-6")}>
          Hacer el test
          <ChevronRight className="h-4 w-4 arrow-nudge" />
        </Link>
      </div>
    );
  }

  const top3 = (data.top_careers || []).slice(0, 3);

  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Orientación</p>
          <h2 className="mt-2 font-heading text-xl font-extrabold leading-tight text-text-primary">Mi test vocacional</h2>
          <p className="mt-2 text-xs text-text-muted">
            Completado el {new Date(data.created_at).toLocaleDateString("es-ES", { dateStyle: "long" })}
            {data.questions_answered ? ` · ${data.questions_answered} respuestas` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {data.mbti_type && (
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-primary">
              {data.mbti_type}
            </span>
          )}
          {data.holland_code && (
            <span className="rounded-full border border-violet/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet">
              {data.holland_code.slice(0, 3)}
            </span>
          )}
        </div>
      </div>

      {top3.length > 0 && (
        <div className="mt-6">
          <p className="eyebrow">Top recomendaciones</p>
          <ol className="mt-3 divide-y divide-border-light border-t border-border-light">
            {top3.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="truncate text-text-primary">
                  <span className="tabular mr-2 text-text-muted">{i + 1}</span>
                  {c.name}
                </span>
                <span className="tabular shrink-0 font-semibold text-violet">{c.score}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Link href="/test-vocacional/resultado" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group mt-6")}>
        Ver mi dashboard completo
        <ChevronRight className="h-4 w-4 arrow-nudge" />
      </Link>
    </div>
  );
}
