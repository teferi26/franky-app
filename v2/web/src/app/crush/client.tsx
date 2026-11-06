"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Loader2,
  Heart,
  Instagram,
  ShieldCheck,
  Lock,
  HelpCircle,
  Flame,
  Settings,
  UserPlus,
  BadgeCheck,
  Upload,
  Copy,
  AlertCircle,
  Printer,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/motion";
import LigarWall from "./LigarWall";
import LigarMatches from "./LigarMatches";
import LigarRequests from "./LigarRequests";
import LigarInvite from "./LigarInvite";
import PartyCampusBanner from '@/components/social/PartyCampusBanner';

interface LigarProfile {
  eligible: boolean;
  age: number | null;
  instagram_handle: string | null;
  instagram_verified: boolean;
  instagram_verify_token: string | null;
  ig_quarantined: boolean;
  opted_in: boolean;
  university_id: string | null;
}

/** Reescala una imagen a JPEG (lado máx. 1080px) para no subir capturas enormes. */
async function fileToScaledDataUrl(file: File, maxSide = 1080): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("read-error"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("img-error"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Las capturas no acreditan propiedad. La interfaz y la API permanecen
// desactivadas hasta disponer de una prueba independiente de control de cuenta.
const IG_VERIFICATION_ENABLED = false;

type Tab = "wall" | "requests" | "matches" | "profile";

function LigarClient({ embedded = false }: { embedded?: boolean } = {}) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const operation = useRef(false);
  const [profile, setProfile] = useState<LigarProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("wall");
  const [pending, setPending] = useState<number>(0);
  const [nominations, setNominations] = useState<number>(0);
  const [showInvite, setShowInvite] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadPending = useCallback(async () => {
    if (!isCurrent()) return;
    const { data, error: e } = await supabase.rpc("get_ig_pending_count");
    if (!isCurrent()) return;
    if (!e && typeof data === "number") setPending(data);
  }, [supabase, isCurrent]);

  const loadNominations = useCallback(async () => {
    if (!isCurrent()) return;
    const { data, error: e } = await supabase.rpc(
      "get_ligar_nomination_count"
    );
    if (isCurrent() && !e && typeof data === "number") setNominations(data);
  }, [supabase, isCurrent]);

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error: e } = await supabase.rpc("get_ligar_profile");
      if (!isCurrent()) return;
      if (e || !data) throw e ?? new Error("missing-profile");
      const p = data as LigarProfile;
      setProfile(p);
      setHandle(p.instagram_handle ?? "");
      if (p.opted_in) loadPending();
      else loadNominations();
    } catch {
      if (isCurrent()) setLoadError(true);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [supabase, loadPending, loadNominations, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (embedded) return;
    const initial = new URLSearchParams(window.location.search).get("tab");
    if (initial === "requests" || initial === "matches" || initial === "profile") setTab(initial);
  }, [embedded]);

  const save = useCallback(async (optIn: boolean) => {
    if (operation.current || !isCurrent()) return;
    operation.current = true; setSaving(true); setError(null); setSavedMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner) return;
      const { data, error: e } = await supabase.rpc("set_ligar_profile", { p_instagram_handle: handle, p_opted_in: optIn });
      if (!isCurrent()) return;
      if (e || !data) throw e ?? new Error("No se pudo guardar el perfil");
      const p = data as LigarProfile;
      setProfile(p); setHandle(p.instagram_handle ?? "");
      setSavedMsg(optIn ? "¡Ya estás dentro!" : "Has salido de Crush.");
      if (optIn) { setTab("wall"); void loadPending(); }
    } catch { if (isCurrent()) setError("No se han guardado los cambios. Comprueba tu conexión e inténtalo de nuevo."); }
    finally { operation.current = false; if (isCurrent()) setSaving(false); }
  }, [supabase, owner, isCurrent, handle, loadPending]);

  const onVerifyFile = useCallback(
    async (file: File | null) => {
      if (!file || operation.current || !isCurrent()) return;
      operation.current = true;
      setVerifyError(null);
      setVerifying(true);
      try {
        const image = await fileToScaledDataUrl(file);
        if (!isCurrent()) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!isCurrent() || user?.id !== owner) return;
        const res = await fetch("/api/crush/verify-ig", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        const data = await res.json();
        if (!isCurrent()) return;
        if (res.ok && data.verified) {
          setSavedMsg("¡Instagram verificado!");
          await load();
        } else {
          setVerifyError(
            data.reason || data.error || "No hemos podido verificarlo. Inténtalo de nuevo."
          );
        }
      } catch {
        if (isCurrent()) setVerifyError("No se pudo procesar la imagen. Prueba con otra captura.");
      } finally {
        operation.current = false;
        if (isCurrent()) setVerifying(false);
      }
    },
    [load, supabase, owner, isCurrent]
  );

  if (loading) {
    return (
      <div
        role="status"
        className={`flex ${embedded ? "min-h-[320px]" : "min-h-screen"} items-center justify-center text-text-muted`}
      >
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="sr-only">Cargando</span>
      </div>
    );
  }

  if (loadError) return <div role="alert" className="mx-auto my-8 max-w-lg rounded-2xl border border-border bg-bg-primary p-6 text-center shadow-card"><h2 className="font-heading text-xl font-bold text-text-primary">No hemos podido abrir Crush</h2><p className="mt-2 text-sm text-text-muted">Comprueba tu conexión e inténtalo de nuevo. Si tu sesión ha caducado, vuelve a entrar.</p><Button type="button" variant="dark" onClick={load} className="mt-4">Reintentar</Button><Link href="/login?next=/crush" className="link-underline ml-4 text-sm font-semibold text-text-primary">Iniciar sesión</Link></div>;

  // Gate 18+
  if (profile && !profile.eligible) {
    return (
      <div className={`mx-auto flex ${embedded ? "min-h-[360px]" : "min-h-screen"} max-w-md flex-col items-center justify-center px-6 text-center`}>
        <Lock className="h-8 w-8 text-text-muted" />
        <h1 className="mt-5 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
          Solo para mayores de 18
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Crush es una función exclusiva para usuarios que ya
          han cumplido los 18 años. Cuando los cumplas, te esperamos aquí.
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Tu edad se calcula a partir de la fecha de nacimiento de tu perfil. Si
          la introdujiste mal, puedes corregirla en{" "}
          <Link href="/perfil" className="link-underline font-semibold text-text-primary">
            editar perfil
          </Link>
          .
        </p>
        <Link href="/" className={buttonVariants({ variant: "dark", className: "mt-6" })}>
          Volver al inicio
        </Link>
      </div>
    );
  }

  const instagramCard = (
    <div className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
      <label className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
        <Instagram className="h-4 w-4 text-violet" aria-hidden="true" /> Tu Instagram
      </label>
      <p className="mt-1 flex items-center gap-1 text-xs text-text-muted">
        <Lock className="h-3 w-3" /> Privado · solo se revela en un intercambio mutuo
      </p>
      <div className="mt-3 flex items-center rounded-xl border border-border px-3 transition-colors focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/20">
        <span className="text-text-muted">@</span>
        <input
          value={handle}
          onChange={(e) =>
            setHandle(e.target.value.replace(/^@/, "").slice(0, 30))
          }
          placeholder="tu_usuario"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Tu usuario de Instagram"
          className="w-full bg-transparent py-2.5 pl-1 text-text-primary outline-none"
        />
      </div>
      {!handle.trim() && (
        <p className="mt-2 text-xs text-text-muted">
          Escribe tu usuario de Instagram para activar Crush.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      {savedMsg && (
        <p className="mt-3 flex items-center gap-1 text-sm text-success">
          <ShieldCheck className="h-4 w-4" /> {savedMsg}
        </p>
      )}

      <div className="mt-4">
        {profile?.opted_in ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" /> Estás participando en Crush
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => save(true)}
                disabled={saving || !handle.trim()}
                className={buttonVariants({ variant: "outline", className: "flex-1" })}
              >
                {saving ? "Guardando…" : "Guardar Instagram"}
              </button>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={saving}
                className={buttonVariants({ variant: "ghost", className: "text-error hover:text-error" })}
              >
                Salir
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving || !handle.trim()}
            className={buttonVariants({ variant: "dark", size: "lg", className: "w-full" })}
          >
            {saving ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Activar Crush"
            )}
          </button>
        )}
      </div>
    </div>
  );

  const token = profile?.instagram_verify_token ?? null;
  const verifyCard =
    !IG_VERIFICATION_ENABLED || !profile || !profile.instagram_handle ? null : profile.instagram_verified ? (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Instagram verificado</p>
          <p className="text-xs text-emerald-700">
            Tu @{profile.instagram_handle} está confirmado como tuyo. Quien haga
            match contigo verá el sello de verificado.
          </p>
        </div>
      </div>
    ) : !token ? null : (
      <div className="mt-4 rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
        <h3 className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
          <BadgeCheck className="h-4 w-4 text-violet" aria-hidden="true" /> Verifica que es tuyo
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          Demuestra que la cuenta es tuya y consigue el sello{" "}
          <span className="font-semibold text-violet">verificado</span>. Da
          mucha más confianza a tus matches.
        </p>

        <ol className="mt-3 space-y-2 text-sm text-text-secondary">
          <li className="flex gap-2">
            <span className="font-bold tabular text-violet">1.</span>
            <span>
              Copia este código:
              <button
                type="button"
                onClick={() => {
                  if (token) {
                    navigator.clipboard?.writeText(token);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
                className="mx-1 inline-flex items-center gap-1 rounded-md border border-border bg-bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30"
              >
                {token} <Copy className="h-3 w-3" />
              </button>
              {copied && <span className="text-xs text-success">copiado</span>}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold tabular text-violet">2.</span>
            Pégalo en tu biografía de Instagram (Editar perfil → Biografía).
          </li>
          <li className="flex gap-2">
            <span className="font-bold tabular text-violet">3.</span>
            Sube una captura de tu perfil donde se vean tu usuario y el código.
          </li>
        </ol>

        {verifyError && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {verifyError}
          </p>
        )}

        <label
          className={`mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-text-primary py-3 text-sm font-semibold text-bg-primary transition-all hover:-translate-y-px hover:shadow-card-hover ${
            verifying ? "opacity-60" : ""
          }`}
        >
          {verifying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Subir captura y verificar
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={verifying}
            onChange={(e) => {
              onVerifyFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          Después puedes quitar el código de tu bio si quieres.
        </p>
      </div>
    );

  const optedIn = profile?.opted_in ?? false;

  return (
    <div className={embedded ? "" : "min-h-screen bg-bg-primary"}>
      {/* Cabecera tipográfica (v3): rótulo, título y una frase. Sin corazón
          gigante ni degradado de fondo. */}
      {!embedded && <section className="border-b border-border-light">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Reveal className="max-w-2xl">
            <p className="eyebrow flex items-center gap-2">
              <Heart className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
              Gente de tu campus
            </p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Crush
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Intercambia Instagram con gente de tu uni. Sin postureo, sin presión.
            </p>
          </Reveal>
        </div>
      </section>}

      <div className={embedded ? "" : "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8"}>
        <PartyCampusBanner universityId={profile?.university_id} />
        <Link
          href="/crush/live"
          className="group hover-lift mx-auto mb-5 flex max-w-md items-center gap-4 rounded-2xl border border-border bg-bg-primary p-4 shadow-card hover:border-text-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-text-primary">
              Crush Live
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
              Descubre personas afines en los eventos oficiales de Franky.
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge transition-colors group-hover:text-violet" aria-hidden="true" />
        </Link>

        {!optedIn ? (
          <div className="mx-auto max-w-md">
            {/* Gancho: amigos te han invitado */}
            {nominations > 0 && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <Heart className="h-5 w-5 shrink-0 fill-violet/10 text-violet" aria-hidden="true" />
                <p className="text-sm font-semibold text-text-primary">
                  {nominations === 1
                    ? "Un amigo cree que encajarías aquí"
                    : `${nominations} amigos creen que encajarías aquí`}
                  <span className="block text-xs font-normal text-text-muted">
                    Tú decides. Actívalo solo si te apetece.
                  </span>
                </p>
              </div>
            )}

            {/* Cómo funciona */}
            <div className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
                <HelpCircle className="h-4 w-4 text-violet" aria-hidden="true" /> Cómo funciona
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li className="flex gap-2">
                  <span className="text-violet">1.</span>
                  Pones tu Instagram (queda privado, nadie lo ve todavía).
                </li>
                <li className="flex gap-2">
                  <span className="text-violet">2.</span>
                  Para ver quién quiere tu Instagram, tienes que dar el tuyo a
                  esa persona. Tú eliges qué solicitudes aceptar.
                </li>
                <li className="flex gap-2">
                  <span className="text-violet">3.</span>
                  Si los dos queréis, se revela. Así de fácil.
                </li>
              </ul>
            </div>

            <div className="mt-4">{instagramCard}</div>
            {verifyCard}

            <p className="mt-4 text-center text-xs text-text-muted">
              Solo mayores de 18 · Puedes salir cuando quieras
            </p>
          </div>
        ) : (
          <div className={embedded ? "" : "lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:items-start"}>
            <section className="mx-auto w-full max-w-2xl" aria-label="Tablón Crush">
            {/* Gancho de curiosidad → lleva a Solicitudes para aceptarlas */}
            {pending > 0 && tab !== "requests" && (
              <button
                type="button"
                onClick={() => setTab("requests")}
                className="group hover-lift mb-4 flex w-full items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left"
              >
                <Flame className="h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-text-primary">
                    {pending === 1
                      ? "1 persona quiere tu Instagram"
                      : `${pending} personas quieren tu Instagram`}
                  </p>
                  <p className="text-xs text-text-muted">
                    Míralas y acéptalas en Solicitudes.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-text-primary px-3 py-1 text-xs font-semibold text-bg-primary">
                  Ver
                </span>
              </button>
            )}

            {/* Pestañas del sistema; el contador de solicitudes va como pastilla. */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList aria-label="Secciones de Crush" className="mb-4 flex w-full">
                <TabsTrigger value="wall" className="flex-1">Muro</TabsTrigger>
                <TabsTrigger value="requests" className="flex-1">
                  Solicitudes
                  {pending > 0 && (
                    <span className="ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-violet px-1 text-[10px] font-bold text-white tabular">
                      {pending}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="matches" className="flex-1">Matches</TabsTrigger>
                <TabsTrigger value="profile" aria-label="Tu perfil" className="px-3">
                  <Settings className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "wall" && <LigarWall />}
            {tab === "requests" && <LigarRequests onChanged={loadPending} />}
            {tab === "matches" && <LigarMatches />}
            {tab === "profile" && (
              <>
                {instagramCard}
                {verifyCard}
                <p className="mt-4 text-center text-xs text-text-muted">
                  Solo mayores de 18 · Puedes salir cuando quieras
                </p>
              </>
            )}

            {/* Invitar a un amigo */}
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className={buttonVariants({ variant: "outline", className: "mt-6 w-full" })}
            >
              <UserPlus className="h-4 w-4" /> Invitar a un amigo
            </button>
            {/* El generador de cartel con QR no se enlazaba desde ningún sitio:
                solo lo encontraba quien conociera la URL. Su sitio natural es
                justo debajo de invitar, porque es lo mismo a otra escala. */}
            <Link
              href="/crush/cartel"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text-primary"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimir cartel con QR para tu campus
            </Link>
            </section>

            {/* Barra lateral (solo escritorio) */}
            <aside className={embedded ? "hidden" : "sticky top-24 mt-8 hidden lg:mt-0 lg:block"}>
              <div className="border-b border-border-light pb-5">
                <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
                  <HelpCircle className="h-4 w-4 text-violet" aria-hidden="true" /> Cómo funciona
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                  <li className="flex gap-2">
                    <span className="text-violet">1.</span>
                    Publica a quién te gusta y qué aportas. Anónimo o público.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-violet">2.</span>
                    Elige a quién le aparece: todos, chicas o chicos.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-violet">3.</span>
                    Pide el Instagram a quien te interese. Si ambos queréis, se
                    revela.
                  </li>
                </ul>
              </div>
              <div className="flex items-start gap-2 pt-5 text-xs leading-relaxed text-text-muted">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Tu Instagram es privado: solo se enseña en un intercambio mutuo.
              </div>
            </aside>
          </div>
        )}
      </div>

      {showInvite && <LigarInvite onClose={() => setShowInvite(false)} />}
    </div>
  );
}

export default withAccountScope<{ embedded?: boolean }>(LigarClient);
