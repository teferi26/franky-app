"use client";

import { useState, useRef, useEffect, Suspense, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle, Send, ArrowLeft, LogIn, Search, Check, CheckCheck,
  MoreVertical, Flag, Ban, X, Info, Paperclip, Mic, Square, Play, Pause, Loader2,
  Users, Home, Calendar, Palette, Bell, BellOff, Archive, BarChart3,
  CalendarDays, MapPin, Plus, SmilePlus,
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import {
  useChat,
  type Conversation, type Message, type OtherProfile,
  type ChatPoll, type PollResult,
} from "@/hooks/useChat";
import { createClient } from "@/lib/supabase-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

// ── Temas del chat (estilo Franky) ────────────────────────────────────────────
// Todo el chat pinta contra variables CSS (--chat-*) que define el tema activo.
// El tema es una elección PERSONAL de cada usuario (localStorage): cambia cómo
// lo ve él, no cómo lo ve la otra persona. "franky" es el tema por defecto.
type ChatTheme = {
  id: string;
  label: string;
  emoji: string;
  vars: Record<string, string>;
};

const CHAT_THEMES: ChatTheme[] = [
  {
    id: "franky", label: "Franky", emoji: "💜",
    vars: {
      "--chat-wallpaper": "var(--color-bg-primary)",
      "--chat-surface": "var(--color-bg-primary)",
      "--chat-panel": "var(--color-bg-secondary)",
      "--chat-border": "var(--color-border)",
      "--chat-text": "var(--color-text-primary)",
      "--chat-muted": "var(--color-text-muted)",
      "--chat-accent": "var(--color-violet)",
      "--chat-bubble-mine": "var(--color-violet)",
      "--chat-bubble-mine-solid": "var(--color-violet)",
      "--chat-bubble-mine-text": "#ffffff",
      "--chat-bubble-mine-time": "rgba(255,255,255,0.72)",
      "--chat-bubble-other": "var(--color-bg-secondary)",
      "--chat-bubble-other-text": "var(--color-text-primary)",
      "--chat-tick": "#ddd0ff",
    },
  },
  {
    id: "medianoche", label: "Medianoche", emoji: "🌙",
    vars: {
      "--chat-wallpaper": "linear-gradient(170deg,#0d0817 0%,#171028 60%,#1d1233 100%)",
      "--chat-surface": "#151022",
      "--chat-panel": "#1e1730",
      "--chat-border": "#2c2344",
      "--chat-text": "#f2eefc",
      "--chat-muted": "#9d92b8",
      "--chat-accent": "#a78bfa",
      "--chat-bubble-mine": "linear-gradient(135deg,#7c3aed 0%,#9333ea 100%)",
      "--chat-bubble-mine-solid": "#7c3aed",
      "--chat-bubble-mine-text": "#ffffff",
      "--chat-bubble-mine-time": "rgba(255,255,255,0.7)",
      "--chat-bubble-other": "#251c3d",
      "--chat-bubble-other-text": "#f2eefc",
      "--chat-tick": "#c4b5fd",
    },
  },
  {
    id: "ocaso", label: "Ocaso", emoji: "🌅",
    vars: {
      "--chat-wallpaper": "linear-gradient(165deg,#fff7f2 0%,#ffe9e2 50%,#fde0ec 100%)",
      "--chat-surface": "#ffffff",
      "--chat-panel": "#fdf1ec",
      "--chat-border": "#f6e0d7",
      "--chat-text": "#33202a",
      "--chat-muted": "#a07a86",
      "--chat-accent": "#f97362",
      "--chat-bubble-mine": "linear-gradient(135deg,#fb7185 0%,#f97316 100%)",
      "--chat-bubble-mine-solid": "#fb7185",
      "--chat-bubble-mine-text": "#ffffff",
      "--chat-bubble-mine-time": "rgba(255,255,255,0.75)",
      "--chat-bubble-other": "#ffffff",
      "--chat-bubble-other-text": "#33202a",
      "--chat-tick": "#ffe4e6",
    },
  },
  {
    id: "menta", label: "Menta", emoji: "🌿",
    vars: {
      "--chat-wallpaper": "linear-gradient(160deg,#f2fbf7 0%,#e3f6ec 60%,#dcf2ea 100%)",
      "--chat-surface": "#ffffff",
      "--chat-panel": "#edf7f2",
      "--chat-border": "#d9ece2",
      "--chat-text": "#1c2e26",
      "--chat-muted": "#6b8a7b",
      "--chat-accent": "#10b981",
      "--chat-bubble-mine": "linear-gradient(135deg,#10b981 0%,#0ea5a5 100%)",
      "--chat-bubble-mine-solid": "#10b981",
      "--chat-bubble-mine-text": "#ffffff",
      "--chat-bubble-mine-time": "rgba(255,255,255,0.75)",
      "--chat-bubble-other": "#ffffff",
      "--chat-bubble-other-text": "#1c2e26",
      "--chat-tick": "#a7f3d0",
    },
  },
  {
    id: "clasico", label: "Clásico", emoji: "📟",
    vars: {
      "--chat-wallpaper": "#efeae2",
      "--chat-surface": "#ffffff",
      "--chat-panel": "#f0f2f5",
      "--chat-border": "#e9edef",
      "--chat-text": "#111b21",
      "--chat-muted": "#667781",
      "--chat-accent": "#00a884",
      "--chat-bubble-mine": "#d9fdd3",
      "--chat-bubble-mine-solid": "#d9fdd3",
      "--chat-bubble-mine-text": "#111b21",
      "--chat-bubble-mine-time": "#667781",
      "--chat-bubble-other": "#ffffff",
      "--chat-bubble-other-text": "#111b21",
      "--chat-tick": "#53bdeb",
    },
  },
];

const CHAT_THEME_KEY = "franky_chat_theme";

function useChatTheme(): [ChatTheme, (id: string) => void] {
  const [themeId, setThemeId] = useState("franky");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHAT_THEME_KEY);
      if (stored && CHAT_THEMES.some((t) => t.id === stored)) setThemeId(stored);
    } catch { /* localStorage bloqueado: tema por defecto */ }
  }, []);
  const set = useCallback((id: string) => {
    setThemeId(id);
    try { window.localStorage.setItem(CHAT_THEME_KEY, id); } catch { /* ídem */ }
  }, []);
  const theme = CHAT_THEMES.find((t) => t.id === themeId) ?? CHAT_THEMES[0];
  return [theme, set];
}

// Selector de tema: botón de paleta + panel con vista previa de cada tema.
function ThemePicker({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Tema del chat"
        aria-label="Cambiar el tema del chat"
        className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--chat-muted)] hover:bg-[var(--chat-panel)] transition-colors"
      >
        <Palette className="h-5 w-5" />
      </button>
      {open && (
        <div className="animate-dropdown absolute right-0 top-11 z-40 w-64 rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface)] p-3 shadow-float">
          <p className="eyebrow mb-2 px-1">
            Tema del chat (solo lo ves tú)
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            {CHAT_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { onPick(t.id); setOpen(false); }}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--chat-panel)] ${
                  current === t.id ? "ring-2 ring-[var(--chat-accent)]" : ""
                }`}
              >
                {/* mini vista previa: fondo + burbuja mía */}
                <span
                  className="h-9 w-12 rounded-lg shrink-0 relative overflow-hidden border border-black/5"
                  style={{ background: t.vars["--chat-wallpaper"] }}
                >
                  <span
                    className="absolute bottom-1 right-1 h-3 w-6 rounded-md"
                    style={{ background: t.vars["--chat-bubble-mine"] }}
                  />
                  <span
                    className="absolute top-1 left-1 h-3 w-5 rounded-md"
                    style={{ background: t.vars["--chat-bubble-other"], border: "1px solid rgba(0,0,0,0.06)" }}
                  />
                </span>
                <span className="text-sm font-medium text-[var(--chat-text)]">
                  {t.label}
                </span>
                {current === t.id && <Check className="h-4 w-4 ml-auto text-[var(--chat-accent)]" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Report reasons ────────────────────────────────────────────────────────────
const REPORT_REASONS = [
  "Spam o publicidad",
  "Contenido inapropiado",
  "Acoso o comportamiento abusivo",
  "Información falsa",
  "Otro motivo",
];

type Filter = "all" | "unread" | "groups";

// ── Bubble tail SVGs (authentic WhatsApp shape) ───────────────────────────────
function TailOut() {
  return (
    <svg
      viewBox="0 0 8 13"
      width="8"
      height="13"
      className="absolute top-0 -right-[7px]"
      aria-hidden
    >
      <path d="M5.188,1H0v11.193l6.467-8.625C7.526,2.156,6.958,1,5.188,1z" fill="var(--chat-bubble-mine-solid)" />
    </svg>
  );
}

function TailIn() {
  return (
    <svg
      viewBox="0 0 8 13"
      width="8"
      height="13"
      className="absolute top-0 -left-[7px]"
      aria-hidden
    >
      <path d="M2.812,1H8v11.193l-6.467-8.625C0.474,2.156,1.042,1,2.812,1z" fill="var(--chat-bubble-other)" />
    </svg>
  );
}

// ── Sender name colors for group chats (WhatsApp-style) ───────────────────────
const GROUP_NAME_COLORS = [
  "#e542a3", "#3497f9", "var(--chat-accent)", "#a45ff5", "#f5a623",
  "#d9544f", "#1fa2a6", "#6a7cff", "#c9742a", "#7d8c3a",
];
function nameColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GROUP_NAME_COLORS[h % GROUP_NAME_COLORS.length];
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="h-[calc(100dvh-5rem)] [background:var(--chat-wallpaper)]"
      style={CHAT_THEMES[0].vars as React.CSSProperties}>
      <div className="max-w-7xl mx-auto h-full grid grid-cols-1 md:grid-cols-[400px_1fr]">
        <div className="bg-[var(--chat-surface)] p-4 space-y-3 border-r border-[var(--chat-border)]">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
        <div className="hidden md:block" />
      </div>
    </div>
  );
}

// ── Media bubbles ─────────────────────────────────────────────────────────────
function MediaImageBubble({
  path,
  getUrl,
  onOpen,
}: {
  path: string;
  getUrl: (p: string) => Promise<string | null>;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getUrl(path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path, getUrl]);

  return (
    <button
      type="button"
      onClick={() => url && onOpen(url)}
      className="block overflow-hidden rounded-md bg-gray-100"
      style={{ maxWidth: 260 }}
    >
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt="Imagen adjunta"
          className="block w-full h-auto max-h-80 object-cover"
          loading="lazy"
        />
      ) : (
        <div role="status" className="w-60 h-40 flex items-center justify-center text-[var(--chat-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="sr-only">Cargando imagen</span>
        </div>
      )}
    </button>
  );
}

function MediaAudioBubble({
  path,
  duration,
  getUrl,
}: {
  path: string;
  duration?: number;
  getUrl: (p: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [total, setTotal] = useState<number>(duration ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    getUrl(path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path, getUrl]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); } else { a.pause(); }
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = total > 0 ? Math.min(100, (cur / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 px-2 py-1.5" style={{ minWidth: 220, maxWidth: 280 }}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {!url ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1 overflow-hidden rounded-full bg-[var(--chat-border)]">
          <div className="h-full bg-[var(--chat-accent)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[11px] tabular-nums text-[var(--chat-muted)]">
          {fmt(cur)} / {fmt(total || 0)}
        </div>
      </div>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCur(0); }}
          onTimeUpdate={(e) => setCur((e.currentTarget as HTMLAudioElement).currentTime)}
          onLoadedMetadata={(e) => {
            const d = (e.currentTarget as HTMLAudioElement).duration;
            if (isFinite(d) && d > 0) setTotal(d);
          }}
          className="hidden"
        />
      )}
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  title,
  description,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-confirm-title"
        className="bg-[var(--chat-surface)] rounded-2xl p-6 max-w-sm w-full shadow-xl"
      >
        <h3 id="chat-confirm-title" className="font-bold text-base mb-2">{title}</h3>
        <p className="text-sm text-[var(--chat-muted)] mb-6">{description}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button
            size="sm"
            className={danger ? "bg-error text-white hover:opacity-90" : "bg-[var(--chat-accent)] text-white hover:opacity-90"}
            onClick={onConfirm}
          >
            Confirmar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Report modal ──────────────────────────────────────────────────────────────
function ReportModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-report-title"
        className="bg-[var(--chat-surface)] rounded-2xl p-6 max-w-sm w-full shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="chat-report-title" className="font-bold text-base">Reportar usuario</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-[var(--chat-muted)] hover:text-[var(--chat-text)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 mb-5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => setSelected(r)}
              className={`w-full text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                selected === r
                  ? "border-[var(--chat-accent)] font-medium text-[var(--chat-accent)]"
                  : "border-[var(--chat-border)] text-[var(--chat-text)] hover:bg-[var(--chat-panel)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <Button
          className="w-full bg-[var(--chat-accent)] text-white hover:opacity-90"
          disabled={!selected}
          onClick={() => selected && onSubmit(selected)}
        >
          <Flag className="h-4 w-4 mr-2" />
          Enviar reporte
        </Button>
      </motion.div>
    </div>
  );
}

// ── New group button + modal ─────────────────────────────────────────────────
function NewGroupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 w-10 rounded-full hover:bg-[var(--chat-border)] text-[var(--chat-muted)] flex items-center justify-center transition-colors"
        title="Nuevo grupo"
        aria-label="Nuevo grupo"
      >
        <Users className="h-5 w-5" />
      </button>
      {open && <NewGroupModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { conversations, loading } = useChat();
  // Group members are drawn from people you already have 1:1 chats with
  // (e.g. RoomieMatch matches) — the friends graph was removed.
  const contacts = useMemo(
    () => conversations.filter((c) => !c.is_group && c.other_user).map((c) => c.other_user!),
    [conversations]
  );
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const create = async () => {
    setError(null);
    if (!name.trim()) { setError("Ponle nombre al grupo"); return; }
    if (selected.size === 0) { setError("Añade al menos 1 amigo"); return; }
    setCreating(true);
    const { data, error: err } = await supabase.rpc("create_group_chat", {
      p_name: name.trim(),
      p_members: Array.from(selected),
    });
    setCreating(false);
    if (err) { setError(err.message); return; }
    onClose();
    router.push(`/chats?chat=${data}`);
  };

  // Accesibilidad: Escape cierra, como el resto de diálogos de esta pantalla.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-new-group-title"
        className="bg-[var(--chat-surface)] rounded-2xl p-6 max-w-md w-full max-h-[85vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="chat-new-group-title" className="font-bold text-lg">Nuevo grupo</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--chat-muted)] hover:text-[var(--chat-text)]"><X className="h-5 w-5" /></button>
        </div>

        <Input
          placeholder="Nombre del grupo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4"
          maxLength={60}
        />

        <p className="text-xs font-semibold text-[var(--chat-muted)] uppercase tracking-wide mb-2">
          Contactos ({selected.size} seleccionados)
        </p>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1 min-h-[180px]">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : contacts.length === 0 ? (
            <p className="text-sm text-[var(--chat-muted)] py-8 text-center">
              Necesitas tener chats abiertos para crear un grupo.{" "}
              <Link href="/roomie-match" className="text-[var(--chat-accent)] underline">Busca compi</Link>
            </p>
          ) : (
            contacts.map((p) => {
              const isSel = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${
                    isSel ? "bg-[var(--chat-panel)]" : "hover:bg-[var(--chat-panel)]"
                  }`}
                >
                  <Avatar className="h-9 w-9">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name} />}
                    <AvatarFallback className="bg-[var(--chat-panel)] text-[var(--chat-muted)] text-sm">
                      {p.full_name?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-left text-sm font-medium truncate">{p.full_name}</span>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                    isSel ? "bg-[var(--chat-accent)] border-[var(--chat-accent)]" : "border-[#cfd9d2]"
                  }`}>
                    {isSel && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={create}
            disabled={creating || selected.size === 0 || !name.trim()}
            className="flex-1 bg-[var(--chat-accent)] text-white hover:opacity-90"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Crear grupo
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Visit request modal ───────────────────────────────────────────────────────
function VisitRequestModal({
  chatId,
  userId,
  targetId,
  onClose,
  onSent,
}: {
  chatId: string;
  userId: string;
  targetId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const submit = async () => {
    setError(null);
    setBusy(true);
    const { error: insErr } = await supabase.from("visit_requests").insert({
      conversation_id: chatId,
      requester_id: userId,
      target_id: targetId,
      preferred_date: date || null,
      notes: notes.trim() || null,
    });
    if (insErr) { setBusy(false); setError(insErr.message); return; }

    const dateText = date ? ` para el ${new Date(date).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : "";
    const noteText = notes.trim() ? `: "${notes.trim()}"` : "";
    await supabase.from("messages").insert({
      conversation_id: chatId,
      sender_id: userId,
      content: `🏠 Propuesta de visita conjunta al piso${dateText}${noteText}`,
      message_type: "system",
    });
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    setBusy(false);
    onSent();
    onClose();
  };

  // Accesibilidad: Escape cierra, como el resto de diálogos de esta pantalla.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-visit-title"
        className="bg-[var(--chat-surface)] rounded-2xl p-6 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-10 w-10 items-center justify-center">
            <Home className="h-5 w-5 text-[var(--chat-accent)]" />
          </div>
          <div>
            <h3 id="chat-visit-title" className="font-bold text-base">Visita conjunta</h3>
            <p className="text-xs text-[var(--chat-muted)]">Propón ver un piso juntos</p>
          </div>
        </div>

        <label className="block text-xs font-semibold text-[var(--chat-muted)] mb-1 mt-3">Fecha preferida</label>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--chat-muted)] pointer-events-none" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="pl-9"
            min={new Date().toISOString().split("T")[0]} />
        </div>

        <label className="block text-xs font-semibold text-[var(--chat-muted)] mb-1 mt-3">Mensaje opcional</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="¿Qué zona? ¿Presupuesto? ¿Horario?"
          className="w-full rounded-xl border border-[var(--chat-border)] p-2.5 text-sm focus:outline-none focus:border-[var(--chat-accent)] resize-none"
        />

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="flex-1 bg-[var(--chat-accent)] text-white hover:opacity-90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Home className="h-4 w-4" />}
            Enviar propuesta
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (sameDay) return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return "ayer";
  if (d > sevenDaysAgo) return d.toLocaleDateString("es-ES", { weekday: "long" });
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return "HOY";
  if (isYesterday) return "AYER";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

function formatMeetupDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Reacciones a mensajes (130) ───────────────────────────────────────────────
// Mismo set que el menú del mensaje del móvil, con las 5 emojis acordadas.
const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢"] as const;

// Botón de reaccionar junto a la burbuja: aparece al pasar el ratón (o con
// foco de teclado) y abre un picker pequeño con las 5 emojis. La propia se
// resalta; repetirla la quita (toggle en el hook).
function ReactionButton({
  myEmoji,
  onPick,
  side,
}: {
  myEmoji: string | null;
  onPick: (emoji: string) => void;
  side: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0 self-center" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Reaccionar al mensaje"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-7 w-7 rounded-full flex items-center justify-center text-[var(--chat-muted)] hover:bg-[var(--chat-surface)] transition-opacity ${
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <SmilePlus className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute bottom-8 ${side === "right" ? "right-0" : "left-0"} z-20 flex gap-0.5 bg-[var(--chat-surface)] border border-[var(--chat-border)] rounded-full px-1.5 py-1 shadow-lg`}
        >
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              onClick={() => { onPick(e); setOpen(false); }}
              aria-label={`Reaccionar con ${e}`}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-lg hover:scale-110 transition-transform ${
                myEmoji === e ? "bg-[var(--chat-panel)] ring-1 ring-[var(--chat-accent)]" : ""
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Encuestas y quedadas dentro del hilo (135/148) ────────────────────────────
// Tarjeta neutra (no "mía" ni "ajena": la vota cualquier participante), con
// barra de resultados por opción, marca de "tu voto" y fecha/lugar destacados
// arriba cuando es una quedada. Copiado del comportamiento del móvil.
function PollCard({
  poll,
  results,
  onVote,
}: {
  poll: ChatPoll;
  results: PollResult[];
  onVote: (optionIndex: number) => void;
}) {
  const votesByIdx = new Map(results.map((r) => [r.option_index, r]));
  const totalVotes = results.reduce((n, r) => n + r.votes, 0);
  const isMeetup = !!(poll.meetup_at || poll.meetup_place);
  const closed = !!poll.closed_at;

  return (
    <div className="flex justify-center my-2">
      <div className="w-full max-w-[420px] bg-[var(--chat-surface)] border border-[var(--chat-border)] rounded-2xl p-4 shadow-sm">
        {isMeetup && (
          <div className="mb-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[var(--chat-accent)]">
              <CalendarDays className="h-4 w-4" />
              <span className="text-[13px] font-bold">Quedada</span>
            </div>
            {poll.meetup_at && (
              <p className="text-[13.5px] font-semibold text-[var(--chat-text)]">
                {formatMeetupDate(poll.meetup_at)}
              </p>
            )}
            {poll.meetup_place && (
              <p className="flex items-center gap-1 text-[12.5px] text-[var(--chat-muted)]">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{poll.meetup_place}</span>
              </p>
            )}
          </div>
        )}

        <p className="text-[15px] font-bold text-[var(--chat-text)] mb-2.5">{poll.question}</p>

        <div className="space-y-2">
          {poll.options.map((opt, i) => {
            const r = votesByIdx.get(i);
            const votes = r?.votes ?? 0;
            const mine = r?.mine ?? false;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            return (
              <button
                key={i}
                type="button"
                disabled={closed}
                onClick={() => onVote(i)}
                aria-pressed={mine}
                aria-label={`${opt}, ${votes} ${votes === 1 ? "voto" : "votos"}${mine ? ", tu voto" : ""}`}
                className={`relative block w-full overflow-hidden rounded-xl border text-left transition-colors ${
                  mine
                    ? "border-[var(--chat-accent)]"
                    : "border-[var(--chat-border)] hover:border-[var(--chat-accent)]/60"
                } ${closed ? "cursor-default opacity-80" : ""}`}
              >
                {/* Barra de resultados (proporción de votos de esta opción) */}
                <span
                  className="absolute inset-y-0 left-0 bg-[var(--chat-accent)]/15"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center justify-between gap-2 px-3 py-2">
                  <span className={`inline-flex items-center gap-1.5 text-[13.5px] text-[var(--chat-text)] ${mine ? "font-bold" : "font-medium"}`}>
                    {mine && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {opt}
                  </span>
                  <span className="text-[12px] text-[var(--chat-muted)] tabular-nums shrink-0">
                    {votes > 0 ? `${pct}% · ${votes}` : "0%"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-[var(--chat-muted)] mt-2">
          {closed ? "Encuesta cerrada" : poll.multi ? "Puedes elegir varias opciones" : "Una opción por persona"}
          {" · "}{totalVotes} {totalVotes === 1 ? "voto" : "votos"}
        </p>
      </div>
    </div>
  );
}

// Formulario de encuesta o quedada: pregunta, 2 a 8 opciones, multi opcional y
// fecha/lugar opcionales (si se rellenan, es una quedada). Mismo flujo que el
// PollComposerModal del móvil.
function PollComposerModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (params: {
    question: string;
    options: string[];
    multi: boolean;
    meetupAt: string | null;
    meetupPlace: string | null;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [isMeetup, setIsMeetup] = useState(false);
  const [meetupAt, setMeetupAt] = useState("");
  const [meetupPlace, setMeetupPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const addOption = () =>
    setOptions((prev) => (prev.length < 8 ? [...prev, ""] : prev));

  const validOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit = question.trim().length > 0 && validOptions.length >= 2 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    const res = await onCreate({
      question: question.trim(),
      options: validOptions,
      multi,
      meetupAt: isMeetup && meetupAt ? new Date(meetupAt).toISOString() : null,
      meetupPlace: isMeetup ? (meetupPlace.trim() || null) : null,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onClose();
  };

  const inputCls =
    "w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 text-sm text-[var(--chat-text)] placeholder:text-[var(--chat-muted)] focus:outline-none focus:border-[var(--chat-accent)]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-poll-title"
        className="bg-[var(--chat-surface)] rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="chat-poll-title" className="font-bold text-lg text-[var(--chat-text)]">
            Crear encuesta o quedada
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-[var(--chat-muted)] hover:text-[var(--chat-text)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-xs font-semibold text-[var(--chat-muted)] mb-1">Pregunta</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="¿Qué preguntamos?"
          aria-label="Pregunta de la encuesta"
          className={`${inputCls} resize-none mb-3`}
        />

        <p className="text-xs font-semibold text-[var(--chat-muted)] mb-1">Opciones (2 a 8)</p>
        <div className="space-y-2 mb-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={80}
                placeholder={`Opción ${i + 1}`}
                aria-label={`Opción ${i + 1}`}
                className={inputCls}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Quitar opción ${i + 1}`}
                  className="shrink-0 text-[var(--chat-muted)] hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--chat-accent)] hover:opacity-80 mb-3"
          >
            <Plus className="h-4 w-4" />
            Añadir opción
          </button>
        )}

        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span>
            <span className="block text-sm font-semibold text-[var(--chat-text)]">Varias opciones</span>
            <span className="block text-xs text-[var(--chat-muted)]">Cada persona puede votar más de una</span>
          </span>
          <input
            type="checkbox"
            checked={multi}
            onChange={(e) => setMulti(e.target.checked)}
            className="h-4 w-4 accent-[var(--chat-accent)]"
            aria-label="Permitir varias opciones"
          />
        </label>

        <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
          <span>
            <span className="block text-sm font-semibold text-[var(--chat-text)]">Es una quedada</span>
            <span className="block text-xs text-[var(--chat-muted)]">Añade fecha, hora y lugar</span>
          </span>
          <input
            type="checkbox"
            checked={isMeetup}
            onChange={(e) => setIsMeetup(e.target.checked)}
            className="h-4 w-4 accent-[var(--chat-accent)]"
            aria-label="Marcar como quedada"
          />
        </label>

        {isMeetup && (
          <div className="space-y-2 mt-1 mb-1">
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--chat-muted)] pointer-events-none" />
              <input
                type="datetime-local"
                value={meetupAt}
                onChange={(e) => setMeetupAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                aria-label="Fecha y hora de la quedada"
                className={`${inputCls} pl-9`}
              />
            </div>
            <input
              value={meetupPlace}
              onChange={(e) => setMeetupPlace(e.target.value)}
              maxLength={120}
              placeholder="Lugar (opcional)"
              aria-label="Lugar de la quedada"
              className={inputCls}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 bg-[var(--chat-accent)] hover:opacity-90 text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {isMeetup ? "Crear quedada" : "Crear encuesta"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Chat list sidebar ─────────────────────────────────────────────────────────
function ChatList({
  conversations,
  loading,
  activeId,
  mutedIds,
  onSelect,
  themePicker,
}: {
  conversations: Conversation[];
  loading: boolean;
  activeId: string | null;
  mutedIds: Set<string>;
  onSelect: (id: string) => void;
  themePicker?: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      const name = c.is_group ? (c.group_name ?? "") : (c.other_user?.full_name ?? "");
      const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (filter === "unread" && c.unread_count === 0) return false;
      if (filter === "groups" && !c.is_group) return false;
      return true;
    });
  }, [conversations, search, filter]);

  return (
    <div className="flex flex-col h-full bg-[var(--chat-surface)]">
      {/* Sidebar header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--chat-border)] px-4">
        <h1 className="font-heading text-lg font-extrabold tracking-tight text-[var(--chat-text)]">Chats</h1>
        <div className="flex items-center gap-1">
          {themePicker}
          <NewGroupButton />
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--chat-muted)]" />
          <input
            placeholder="Buscar o empezar nuevo chat"
            aria-label="Buscar conversaciones"
            className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-panel)] py-2.5 pl-10 pr-3 text-sm text-[var(--chat-text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--chat-muted)] focus:border-[var(--chat-accent)] focus:outline-none focus:ring-[3px] focus:ring-[var(--chat-accent)]/15"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex shrink-0 gap-2 px-3 py-3">
        {([
          { id: "all", label: "Todos" },
          { id: "unread", label: "No leídos" },
          { id: "groups", label: "Grupos" },
        ] as { id: Filter; label: string }[]).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border border-transparent bg-[var(--chat-accent)] text-white"
                  : "border border-[var(--chat-border)] text-[var(--chat-muted)] hover:text-[var(--chat-text)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="h-px bg-[var(--chat-border)] shrink-0" />

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          /* Vacío de la lista de chats. El icono llevaba un verde cableado
             (#cfd9d2, herencia de un clon de WhatsApp) que no era de la marca
             ni cambiaba con el tema del chat; ahora hereda --chat-muted. El
             texto ya no manda solo a Roomie: los chats nacen sobre todo de
             Crush y de las comunidades. */
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <MessageCircle
              className="h-10 w-10 mb-3 opacity-40"
              style={{ color: "var(--chat-muted)" }}
              aria-hidden="true"
            />
            <p className="text-sm font-semibold" style={{ color: "var(--chat-text)" }}>
              {search ? "Sin resultados" : "Todavía no tienes conversaciones"}
            </p>
            <p className="text-xs mt-1 max-w-[22ch]" style={{ color: "var(--chat-muted)" }}>
              {search
                ? "Ningún chat coincide con lo que buscas."
                : "Los chats nacen de un match en Crush, de una comunidad o de un plan al que te apuntes."}
            </p>
            {!search && (
              <Link
                href="/crush"
                className={cn(buttonVariants({ size: "sm" }), "mt-4")}
              >
                Ir a Crush
              </Link>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const other = conv.other_user;
            const hasUnread = conv.unread_count > 0;
            const displayName = conv.is_group
              ? (conv.group_name || "Grupo")
              : (other?.full_name || "Usuario");
            const avatarUrl = conv.is_group ? conv.group_avatar_url : other?.avatar_url;
            const initial = conv.is_group
              ? (conv.group_name?.[0]?.toUpperCase() || "G")
              : (other?.full_name?.[0]?.toUpperCase() || "?");
            const isActive = activeId === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 transition-colors text-left border-b border-[var(--chat-panel)] ${
                  isActive ? "bg-[var(--chat-panel)]" : "hover:bg-[var(--chat-panel)]"
                }`}
              >
                <Avatar className="h-12 w-12 shrink-0">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className={conv.is_group ? "bg-[var(--chat-panel)] text-[var(--chat-muted)]" : "bg-[var(--chat-panel)] text-[var(--chat-muted)] font-semibold"}>
                    {conv.is_group ? <Users className="h-5 w-5" /> : initial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-[15px] truncate font-medium text-[var(--chat-text)]">
                      {displayName}
                      {conv.is_group && (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--chat-muted)]">
                          · {conv.member_count}
                        </span>
                      )}
                    </p>
                    {conv.last_message_at && (
                      <span className={`text-[11px] shrink-0 ${hasUnread ? "text-[var(--chat-accent)] font-medium" : "text-[var(--chat-muted)]"}`}>
                        {formatListTime(conv.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[13px] truncate ${hasUnread ? "text-[var(--chat-text)]" : "text-[var(--chat-muted)]"}`}>
                      {conv.last_message || "Sin mensajes aún"}
                    </p>
                    {/* Indicador de conversación silenciada (130) */}
                    {mutedIds.has(conv.id) && (
                      <span title="Silenciado" className="shrink-0 text-[var(--chat-muted)]">
                        <BellOff className="h-3.5 w-3.5" aria-label="Conversación silenciada" />
                      </span>
                    )}
                    {hasUnread && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--chat-accent)] text-white text-[11px] font-bold flex items-center justify-center">
                        {conv.unread_count > 99 ? "99+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Chat view ─────────────────────────────────────────────────────────────────
function ChatView({
  chatId,
  housingListingId,
  onHousingSent,
  userId,
  otherUser,
  conversation,
  muted,
  onToggleMute,
  onArchive,
  onBack,
  onBlock,
  onReport,
  themePicker,
}: {
  chatId: string;
  housingListingId?: string;
  onHousingSent: (listingId: string) => void;
  userId: string;
  otherUser?: OtherProfile | null;
  conversation?: Conversation | null;
  muted: boolean;
  onToggleMute: () => void;
  onArchive: () => void;
  onBack: () => void;
  onBlock: (targetId: string) => Promise<void>;
  onReport: (targetId: string, reason: string) => Promise<void>;
  themePicker?: React.ReactNode;
}) {
  const {
    messages, loading, sendMessage, sendMediaMessage, getSignedMediaUrl, markRead,
    reactions, toggleReaction, polls, pollResults, votePoll, createPoll,
  } = useChat(chatId);
  const confirmDialog = useConfirm();
  const isGroup = !!conversation?.is_group;
  // Perfiles de los remitentes para mostrar quién envía cada mensaje en grupos
  const [senders, setSenders] = useState<Record<string, { full_name: string; avatar_url: string | null }>>({});
  const fetchedSenderIds = useRef<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [showPollForm, setShowPollForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxOpenerRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => { if (chatId) markRead(chatId); }, [chatId]);

  // Al cambiar de chat, limpiar la caché de remitentes
  useEffect(() => {
    setSenders({});
    fetchedSenderIds.current = new Set();
    lastSeenMsgIdRef.current = null;
    setAnnounce("");
  }, [chatId]);

  // En grupos, cargar nombre/avatar de cada remitente (excepto el propio)
  useEffect(() => {
    if (!isGroup) return;
    const ids = Array.from(new Set(messages.map((m) => m.sender_id))).filter(
      (id) => id !== userId && !fetchedSenderIds.current.has(id)
    );
    if (ids.length === 0) return;
    ids.forEach((id) => fetchedSenderIds.current.add(id));
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      if (!active || !data) return;
      setSenders((prev) => {
        const next = { ...prev };
        for (const p of data as Array<{ id: string; full_name: string; avatar_url: string | null }>) {
          next[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        }
        return next;
      });
    })();
    return () => { active = false; };
  }, [isGroup, messages, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, polls]);

  // Anunciar a lectores de pantalla el mensaje entrante (sin releer el historial)
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const prevId = lastSeenMsgIdRef.current;
    lastSeenMsgIdRef.current = last.id;
    if (prevId === null) return; // primera carga: no anunciar
    if (last.id === prevId) return;
    if (last.sender_id === userId) return; // solo mensajes de la otra persona
    if (last.message_type === "system") return;
    const who = isGroup
      ? (senders[last.sender_id]?.full_name ?? "Alguien")
      : (otherUser?.full_name ?? "Alguien");
    const what =
      last.message_type === "image" ? "ha enviado una imagen"
      : last.message_type === "audio" ? "ha enviado un audio"
      : "ha enviado un mensaje";
    setAnnounce(`${who} ${what}`);
  }, [messages, userId, isGroup, senders, otherUser]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMenu(false);
    }
    if (showMenu) {
      document.addEventListener("mousedown", handle);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showMenu]);

  // Lightbox: cerrar con Escape, mover el foco al abrir y devolverlo al cerrar
  useEffect(() => {
    if (!lightbox) return;
    lightboxOpenerRef.current = document.activeElement as HTMLElement | null;
    lightboxCloseRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lightboxOpenerRef.current?.focus?.();
    };
  }, [lightbox]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setMediaError(null);
    try {
      const result = await sendMessage(text, housingListingId);
      if (!result.ok) { setMediaError("No se pudo enviar. Tu mensaje sigue aquí para reintentarlo."); return; }
      setText("");
      if (housingListingId) onHousingSent(housingListingId);
    } catch {
      setMediaError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    } finally { setSending(false); }
  };

  const handlePickImage = () => { setMediaError(null); fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSending(true);
    setMediaError(null);
    const res = await sendMediaMessage(file, "image", { name: file.name });
    if (!res.ok) setMediaError(res.error);
    setSending(false);
  };

  const startRecording = async () => {
    setMediaError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const baseMime = mime.split(";")[0];
        const blob = new Blob(recordChunksRef.current, { type: baseMime });
        setRecording(false);
        if (recordTimerRef.current) { window.clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        const secondsAtStop = recordSeconds;
        setRecordSeconds(0);
        if (blob.size === 0) return;
        setSending(true);
        const res = await sendMediaMessage(blob, "audio", { mime: baseMime, duration: secondsAtStop });
        if (!res.ok) setMediaError(res.error);
        setSending(false);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 60) { mr.stop(); return s; }
          return s + 1;
        });
      }, 1000);
    } catch {
      setMediaError("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();
  const cancelRecording = () => {
    recordChunksRef.current = [];
    try { mediaRecorderRef.current?.stream?.getTracks()?.forEach((t) => t.stop()); } catch {}
    if (recordTimerRef.current) { window.clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    setRecordSeconds(0);
    mediaRecorderRef.current = null;
  };

  useEffect(() => () => {
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    try { mediaRecorderRef.current?.stream?.getTracks()?.forEach((t) => t.stop()); } catch {}
  }, []);

  const handleBlock = async () => {
    if (!otherUser) return;
    await onBlock(otherUser.id);
    setShowBlockConfirm(false);
    onBack();
  };

  const handleReport = async (reason: string) => {
    if (!otherUser) return;
    await onReport(otherUser.id, reason);
    setShowReport(false);
  };

  const headerName = conversation?.is_group
    ? (conversation.group_name || "Grupo")
    : (otherUser?.full_name || "Usuario");
  const headerAvatar = conversation?.is_group ? conversation.group_avatar_url : otherUser?.avatar_url;
  const headerSubtitle = conversation?.is_group
    ? `${conversation.member_count} miembros`
    : (otherUser?.university || "");

  // Hilo unificado (135/148): mensajes y encuestas/quedadas fundidos por fecha
  // de creación, agrupados por día para los separadores. La encuesta aparece
  // así en su sitio del hilo, igual que en el móvil.
  type FeedItem =
    | { kind: "msg"; key: string; ts: string; msg: Message }
    | { kind: "poll"; key: string; ts: string; poll: ChatPoll };
  const feedByDay = useMemo(() => {
    const items: FeedItem[] = [];
    for (const m of messages) items.push({ kind: "msg", key: `m-${m.id}`, ts: m.created_at, msg: m });
    for (const p of polls) items.push({ kind: "poll", key: `p-${p.id}`, ts: p.created_at, poll: p });
    items.sort((a, b) => a.ts.localeCompare(b.ts));
    const groups: { dayKey: string; items: FeedItem[] }[] = [];
    for (const it of items) {
      const dayKey = new Date(it.ts).toDateString();
      const last = groups[groups.length - 1];
      if (last && last.dayKey === dayKey) last.items.push(it);
      else groups.push({ dayKey, items: [it] });
    }
    return groups;
  }, [messages, polls]);

  // Reacciones agrupadas por mensaje: emoji, total y si la mía está entre ellas.
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
    for (const r of reactions) {
      const arr = map.get(r.message_id) ?? [];
      const found = arr.find((x) => x.emoji === r.emoji);
      if (found) {
        found.count += 1;
        found.mine = found.mine || r.user_id === userId;
      } else {
        arr.push({ emoji: r.emoji, count: 1, mine: r.user_id === userId });
      }
      map.set(r.message_id, arr);
    }
    return map;
  }, [reactions, userId]);

  // Mi emoji por mensaje (para resaltarla en el picker).
  const myReactionByMsg = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reactions) if (r.user_id === userId) map.set(r.message_id, r.emoji);
    return map;
  }, [reactions, userId]);

  return (
    <>
      {/* Región para anunciar mensajes entrantes a lectores de pantalla */}
      <div aria-live="polite" role="status" className="sr-only">{announce}</div>

      {/* Chat header */}
      <div className="z-10 flex h-16 shrink-0 items-center gap-3 border-b border-l border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 sm:px-4">
        <button
          onClick={onBack}
          className="md:hidden p-2 rounded-full hover:bg-[var(--chat-border)] text-[var(--chat-muted)]"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <Avatar className="h-10 w-10 shrink-0">
          {headerAvatar && <AvatarImage src={headerAvatar} alt={headerName} />}
          <AvatarFallback className={conversation?.is_group ? "bg-[var(--chat-panel)] text-[var(--chat-muted)]" : "bg-[var(--chat-panel)] text-[var(--chat-muted)] font-semibold text-sm"}>
            {conversation?.is_group ? <Users className="h-5 w-5" /> : (headerName?.[0]?.toUpperCase() || "?")}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="truncate font-heading text-[15px] font-bold text-[var(--chat-text)]">{headerName}</p>
          {headerSubtitle && (
            <p className="text-[12px] text-[var(--chat-muted)] truncate">{headerSubtitle}</p>
          )}
        </div>

        {themePicker}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="p-2 rounded-full hover:bg-[var(--chat-border)] text-[var(--chat-muted)]"
            aria-label="Más opciones"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.1 }}
                role="menu"
                className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface)] py-1 shadow-float"
              >
                {otherUser && !conversation?.is_group && (
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--chat-text)] hover:bg-[var(--chat-panel)] transition-colors"
                    onClick={() => { setShowVisit(true); setShowMenu(false); }}
                  >
                    <Home className="h-4 w-4 text-[var(--chat-accent)]" />
                    Visita conjunta
                  </button>
                )}
                {/* Silenciar (130): preferencia del participante, solo cambia lo que ve él */}
                <button
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--chat-text)] hover:bg-[var(--chat-panel)] transition-colors"
                  onClick={() => { setShowMenu(false); onToggleMute(); }}
                >
                  {muted
                    ? <Bell className="h-4 w-4 text-[var(--chat-muted)]" />
                    : <BellOff className="h-4 w-4 text-[var(--chat-muted)]" />}
                  {muted ? "Activar sonido" : "Silenciar"}
                </button>
                {/* Archivar (072): quita la conversación de tu lista, no de la del otro */}
                <button
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--chat-text)] hover:bg-[var(--chat-panel)] transition-colors"
                  onClick={() => { setShowMenu(false); onArchive(); }}
                >
                  <Archive className="h-4 w-4 text-[var(--chat-muted)]" />
                  Archivar conversación
                </button>
                {otherUser && !conversation?.is_group && (
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--chat-text)] hover:bg-[var(--chat-panel)] transition-colors"
                    onClick={() => { setShowReport(true); setShowMenu(false); }}
                  >
                    <Flag className="h-4 w-4 text-[var(--chat-muted)]" />
                    Reportar
                  </button>
                )}
                {otherUser && !conversation?.is_group && (
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => { setShowBlockConfirm(true); setShowMenu(false); }}
                  >
                    <Ban className="h-4 w-4" />
                    Bloquear
                  </button>
                )}
                {conversation?.is_group && (
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    onClick={async () => {
                      setShowMenu(false);
                      const ok = await confirmDialog({
                        title: `¿Salir del grupo "${conversation.group_name}"?`,
                        description: "Dejarás de recibir mensajes. Podrás volver a unirte si alguien te añade.",
                        confirmText: "Salir",
                        variant: "danger",
                      });
                      if (!ok) return;
                      const supabase = createClient();
                      await supabase.rpc("leave_group_chat", { p_conv: chatId });
                      onBack();
                    }}
                  >
                    <X className="h-4 w-4" />
                    Salir del grupo
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages — WhatsApp wallpaper */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-3 [background:var(--chat-wallpaper)]"
      >
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className={`h-10 w-48 ${i % 2 === 0 ? "ml-auto" : ""}`} />
            ))}
          </div>
        ) : messages.length === 0 && polls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="max-w-xs px-6 py-5">
              <MessageCircle className="mx-auto h-6 w-6 text-[var(--chat-accent)]" strokeWidth={1.75} />
              <p className="mt-4 font-heading text-lg font-extrabold text-[var(--chat-text)]">Empieza la conversación</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--chat-muted)]">
                Di hola a {otherUser?.full_name?.split(" ")[0] || "esta persona"}.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {feedByDay.map((group) => (
              <div key={group.dayKey} className="flex flex-col gap-1">
                {/* Day separator */}
                <div className="flex justify-center my-3">
                  <span className="bg-[var(--chat-surface)]/90 text-[11px] text-[var(--chat-muted)] font-medium px-3 py-1 rounded-md shadow-sm">
                    {formatDayLabel(group.items[0].ts)}
                  </span>
                </div>

                {group.items.map((item, i) => {
                  // Tarjeta de encuesta o quedada, fundida en el hilo (135/148)
                  if (item.kind === "poll") {
                    return (
                      <PollCard
                        key={item.key}
                        poll={item.poll}
                        results={pollResults[item.poll.id] ?? []}
                        onVote={(optionIndex) => votePoll(item.poll.id, optionIndex)}
                      />
                    );
                  }

                  const msg = item.msg;
                  // System message
                  if (msg.message_type === "system") {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-center py-1"
                      >
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                          <Info className="h-3 w-3" />
                          {msg.content}
                        </span>
                      </motion.div>
                    );
                  }

                  const isMine = msg.sender_id === userId;
                  // El anterior solo cuenta para la colita si también es un mensaje
                  // (una encuesta intercalada rompe la racha del mismo remitente).
                  const prevItem = i > 0 ? group.items[i - 1] : null;
                  const prev = prevItem && prevItem.kind === "msg" ? prevItem.msg : null;
                  const showTail = !prev || prev.sender_id !== msg.sender_id || prev.message_type === "system";
                  const isRead = !!msg.read_at;
                  const chips = reactionsByMsg.get(msg.id) ?? [];
                  const myEmoji = myReactionByMsg.get(msg.id) ?? null;
                  const time = new Date(msg.created_at).toLocaleTimeString("es-ES", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  const isMedia = (msg.message_type === "image" || msg.message_type === "audio") && !!msg.attachment_url;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.1 }}
                      className={`group flex flex-col ${isMine ? "items-end" : "items-start"} ${showTail ? "mt-1.5" : "mt-0.5"}`}
                    >
                      {/* Fila burbuja + botón de reaccionar (el botón queda hacia el centro) */}
                      <div className={`flex items-center gap-1 max-w-[85%] sm:max-w-[65%] ${isMine ? "flex-row" : "flex-row-reverse"}`}>
                        <ReactionButton
                          myEmoji={myEmoji}
                          side={isMine ? "right" : "left"}
                          onPick={(emoji) => toggleReaction(msg.id, emoji)}
                        />
                      <div
                        className={`relative min-w-0 shadow-sm ${
                          isMine
                            ? "[background:var(--chat-bubble-mine)] text-[var(--chat-bubble-mine-text)]"
                            : "bg-[var(--chat-bubble-other)] text-[var(--chat-bubble-other-text)]"
                        } ${
                          isMine
                            ? showTail ? "rounded-2xl rounded-tr-sm" : "rounded-2xl"
                            : showTail ? "rounded-2xl rounded-tl-sm" : "rounded-2xl"
                        } ${isMedia ? "p-1" : "px-3 py-1.5 pr-[62px]"}`}
                      >
                        {showTail && (isMine ? <TailOut /> : <TailIn />)}
                        {msg.organization_label && <p className="mb-1 text-xs font-semibold">Equipo de {msg.organization_label}</p>}

                        {isGroup && !isMine && showTail && (
                          <p
                            className={`text-[12.5px] font-semibold leading-tight truncate ${isMedia ? "px-1.5 pt-1 pb-0.5" : "mb-0.5"}`}
                            style={{ color: nameColor(msg.sender_id) }}
                          >
                            {senders[msg.sender_id]?.full_name ?? "Usuario"}
                          </p>
                        )}

                        {msg.message_type === "image" && msg.attachment_url ? (
                          <>
                            <MediaImageBubble
                              path={msg.attachment_url}
                              getUrl={getSignedMediaUrl}
                              onOpen={(u) => setLightbox(u)}
                            />
                            {/* Time overlay over image */}
                            <div className="absolute bottom-2 right-3 flex items-center gap-1 bg-black/45 text-white text-[10px] px-1.5 py-0.5 rounded">
                              <span>{time}</span>
                              {isMine && (isRead
                                ? <><CheckCheck className="h-3 w-3 text-[var(--chat-tick)]" /><span className="sr-only">Leído</span></>
                                : <><CheckCheck className="h-3 w-3 text-white/80" /><span className="sr-only">Entregado</span></>
                              )}
                            </div>
                          </>
                        ) : msg.message_type === "audio" && msg.attachment_url ? (
                          <>
                            <MediaAudioBubble
                              path={msg.attachment_url}
                              duration={msg.attachment_meta?.duration}
                              getUrl={getSignedMediaUrl}
                            />
                            <div className="flex items-center justify-end gap-1 mt-0.5 px-2 pb-1">
                              <span className={`text-[11px] ${isMine ? "text-[var(--chat-bubble-mine-time)]" : "text-[var(--chat-muted)]"}`}>{time}</span>
                              {isMine && (isRead
                                ? <><CheckCheck className="h-3 w-3 text-[var(--chat-tick)]" /><span className="sr-only">Leído</span></>
                                : <><CheckCheck className="h-3 w-3 text-[var(--chat-muted)]" /><span className="sr-only">Entregado</span></>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-[14.2px] text-inherit whitespace-pre-wrap break-words leading-snug">
                              {msg.content}
                            </p>
                            <span className={`absolute bottom-1 right-2 flex items-center gap-1 text-[11px] ${isMine ? "text-[var(--chat-bubble-mine-time)]" : "text-[var(--chat-muted)]"}`}>
                              {time}
                              {isMine && (isRead
                                ? <><CheckCheck className="h-3 w-3 text-[var(--chat-tick)]" /><span className="sr-only">Leído</span></>
                                : <><CheckCheck className="h-3 w-3 text-[var(--chat-muted)]" /><span className="sr-only">Entregado</span></>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                      </div>

                      {/* Chips de reacciones bajo la burbuja (toggle de la propia) */}
                      {chips.length > 0 && (
                        <div className={`flex gap-1 -mt-1 mb-0.5 relative z-[1] ${isMine ? "pr-9" : "pl-9"}`}>
                          {chips.map((c) => (
                            <button
                              key={c.emoji}
                              type="button"
                              onClick={() => toggleReaction(msg.id, c.emoji)}
                              aria-pressed={c.mine}
                              aria-label={`Reacción ${c.emoji}, ${c.count} en total${c.mine ? ", incluida la tuya" : ""}`}
                              className={`inline-flex items-center gap-1 rounded-full border bg-[var(--chat-surface)] px-1.5 py-0.5 shadow-sm transition-colors ${
                                c.mine
                                  ? "border-[var(--chat-accent)]"
                                  : "border-[var(--chat-border)] hover:border-[var(--chat-accent)]/50"
                              }`}
                            >
                              <span className="text-[12px] leading-none">{c.emoji}</span>
                              {c.count > 1 && (
                                <span className="text-[11px] leading-none text-[var(--chat-muted)] tabular-nums">
                                  {c.count}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {housingListingId && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-violet-100 bg-violet-50 px-4 py-2 text-sm text-violet-900">
          <Link href={`/alojamiento/${housingListingId}`} className="underline">Mensaje sobre este piso</Link>
          <button type="button" onClick={() => onHousingSent(housingListingId)} className="shrink-0 text-xs underline">Quitar referencia</button>
        </div>
      )}
      {/* Input */}
      <div className="shrink-0 border-t border-[var(--chat-border)] bg-[var(--chat-surface)] px-2 py-2.5 sm:px-3">
        {mediaError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-error/20 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            <span className="truncate">{mediaError}</span>
            <button onClick={() => setMediaError(null)} className="shrink-0 text-red-500"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {recording ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-panel)] px-3 py-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-[var(--chat-text)] tabular-nums">
              Grabando… {String(Math.floor(recordSeconds / 60)).padStart(1, "0")}:{String(recordSeconds % 60).padStart(2, "0")}
            </span>
            <span className="text-[11px] text-[var(--chat-muted)] hidden sm:inline">máx 60s</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={cancelRecording}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-error text-white transition-opacity hover:opacity-90"
              aria-label="Detener grabación"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-end gap-1.5 sm:gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePickImage}
              disabled={sending}
              className="shrink-0 h-10 w-10 rounded-full text-[var(--chat-muted)] hover:bg-[var(--chat-border)] flex items-center justify-center disabled:opacity-50"
              aria-label="Adjuntar"
              title="Adjuntar foto"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            {/* Encuesta o quedada (135/148) */}
            <button
              type="button"
              onClick={() => setShowPollForm(true)}
              disabled={sending}
              className="shrink-0 h-10 w-10 rounded-full text-[var(--chat-muted)] hover:bg-[var(--chat-border)] flex items-center justify-center disabled:opacity-50"
              aria-label="Crear encuesta o quedada"
              title="Encuesta o quedada"
            >
              <BarChart3 className="h-5 w-5" />
            </button>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe un mensaje"
              aria-label="Escribe un mensaje"
              rows={1}
              className="max-h-32 flex-1 resize-none rounded-xl border border-[var(--chat-border)] bg-[var(--chat-panel)] px-3.5 py-2.5 text-[15px] text-[var(--chat-text)] transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--chat-muted)] focus:border-[var(--chat-accent)] focus:outline-none focus:ring-[3px] focus:ring-[var(--chat-accent)]/15"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            {text.trim() ? (
              <button
                type="submit"
                disabled={sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
                aria-label="Enviar"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={sending}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--chat-accent)] text-white transition-[opacity,transform] duration-200 hover:opacity-90 active:scale-[0.96] disabled:opacity-50"
                aria-label="Grabar audio"
                title="Grabar audio"
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Imagen ampliada"
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              ref={lightboxCloseRef}
              onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
              className="absolute top-4 right-4 p-2 rounded-full bg-[var(--chat-surface)]/10 text-white hover:bg-[var(--chat-surface)]/20"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Imagen ampliada del mensaje" className="max-h-[90vh] max-w-full object-contain rounded-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showReport && otherUser && (
          <ReportModal onClose={() => setShowReport(false)} onSubmit={handleReport} />
        )}
        {showBlockConfirm && otherUser && (
          <ConfirmDialog
            title="¿Bloquear usuario?"
            description={`Ya no verás mensajes de ${otherUser.full_name}. Esta acción se puede deshacer desde ajustes.`}
            danger
            onConfirm={handleBlock}
            onCancel={() => setShowBlockConfirm(false)}
          />
        )}
        {showVisit && otherUser && (
          <VisitRequestModal
            chatId={chatId}
            userId={userId}
            targetId={otherUser.id}
            onClose={() => setShowVisit(false)}
            onSent={() => {}}
          />
        )}
        {showPollForm && (
          <PollComposerModal
            onClose={() => setShowPollForm(false)}
            onCreate={createPoll}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Empty pane (desktop, no chat selected) ───────────────────────────────────
function EmptyPane() {
  return (
    <div className="relative hidden flex-1 flex-col items-center justify-center border-l border-[var(--chat-border)] bg-[var(--chat-panel)] p-10 text-center md:flex">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="relative max-w-md animate-slide-up">
        <MessageCircle className="mx-auto h-7 w-7 text-[var(--chat-accent)]" strokeWidth={1.75} />
        <p className="eyebrow mt-6">Franky Chats</p>
        <h2 className="mt-3 text-fluid-h2 font-extrabold text-[var(--chat-text)]">
          Elige una conversación
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--chat-muted)]">
          Habla con tus matches de Roomie, tus amigos y tus grupos de eventos.
        </p>
      </div>
    </div>
  );
}

// ── Main inner component (uses useSearchParams) ───────────────────────────────
function ChatsInner() {
  const [chatTheme, setChatTheme] = useChatTheme();
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    conversations, loading, markRead, blockUser, reportUser, fetchConversations,
    mutedIds, setConversationMuted, archiveChat,
  } = useChat();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [housingContext, setHousingContext] = useState<{ chatId: string; listingId: string } | null>(null);

  useEffect(() => {
    const chatParam = searchParams.get("chat");
    const housingParam = searchParams.get("housing");
    setHousingContext(chatParam && housingParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(housingParam)
      ? { chatId: chatParam, listingId: housingParam } : null);
    if (chatParam && chatParam !== activeChatId) {
      setActiveChatId(chatParam);
      markRead(chatParam);
    }
  }, [searchParams]);

  // Lock the body scroll while on /chats so the page is fully fixed:
  // only the navbar is interactive at the top, no footer below.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  // If we land on a chat that isn't in the list yet (just created from
  // Roomie Match / event signup), refetch so name + last message resolve.
  useEffect(() => {
    if (!activeChatId) return;
    if (conversations.find((c) => c.id === activeChatId)) return;
    fetchConversations();
  }, [activeChatId, conversations, fetchConversations]);

  const handleSelectChat = useCallback((id: string) => {
    setHousingContext(null);
    setActiveChatId(id);
    markRead(id);
    router.replace(`/chats?chat=${id}`, { scroll: false });
  }, [markRead, router]);

  const handleBack = useCallback(() => {
    setHousingContext(null);
    setActiveChatId(null);
    router.replace("/chats", { scroll: false });
  }, [router]);

  const handleBlock = useCallback(async (targetId: string) => {
    await blockUser(targetId);
    handleBack();
  }, [blockUser, handleBack]);

  const handleReport = useCallback(async (targetId: string, reason: string) => {
    await reportUser(targetId, reason);
  }, [reportUser]);

  // Silenciar (130): toggle sobre la conversación abierta, optimista en el hook.
  const handleToggleMute = useCallback(() => {
    if (!activeChatId) return;
    setConversationMuted(activeChatId, !mutedIds.has(activeChatId));
  }, [activeChatId, mutedIds, setConversationMuted]);

  // Archivar (072): salimos del chat y el hook lo quita de la lista de forma
  // optimista (recarga la lista real si el RPC falla).
  const handleArchive = useCallback(() => {
    if (!activeChatId) return;
    const id = activeChatId;
    handleBack();
    archiveChat(id);
  }, [activeChatId, archiveChat, handleBack]);

  if (authLoading) return <LoadingSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen [background:var(--chat-wallpaper)] flex items-center justify-center" style={chatTheme.vars as React.CSSProperties}>
        <div className="mx-4 max-w-md text-center animate-slide-up">
          <MessageCircle className="mx-auto h-6 w-6 text-[var(--chat-accent)]" strokeWidth={1.75} />
          <p className="eyebrow mt-6">Chats</p>
          <h1 className="mt-3 text-fluid-h2 font-extrabold text-[var(--chat-text)]">Mensajería en tiempo real</h1>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--chat-muted)]">
            Inicia sesión para chatear con otros estudiantes y compañeros de piso.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/login">
              <LogIn className="h-4 w-4" />
              Iniciar sesión
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const otherUser = activeChatId
    ? conversations.find((c) => c.id === activeChatId)?.other_user ?? null
    : null;
  const activeConv = activeChatId
    ? conversations.find((c) => c.id === activeChatId) ?? null
    : null;

  return (
    <div className="h-[calc(100dvh-5rem)] bg-[var(--chat-panel)] relative" style={chatTheme.vars as React.CSSProperties}>
      <div className="relative max-w-[1600px] mx-auto h-full px-0 md:px-4 md:py-3">
        <div className="flex h-full overflow-hidden border border-[var(--chat-border)] [background:var(--chat-wallpaper)] md:rounded-2xl md:shadow-card">
          {/* Sidebar */}
          <aside
            className={`w-full md:w-[400px] lg:w-[440px] shrink-0 bg-[var(--chat-surface)] ${
              activeChatId ? "hidden md:flex" : "flex"
            } flex-col`}
          >
            <ChatList
              conversations={conversations}
              loading={loading}
              activeId={activeChatId}
              mutedIds={mutedIds}
              onSelect={handleSelectChat}
              themePicker={<ThemePicker current={chatTheme.id} onPick={setChatTheme} />}
            />
          </aside>

          {/* Chat area */}
          {activeChatId ? (
            <main className={`flex-1 flex flex-col min-w-0 ${!activeChatId ? "hidden md:flex" : "flex"}`}>
              <ChatView
                key={activeChatId}
                chatId={activeChatId}
                housingListingId={housingContext?.chatId === activeChatId ? housingContext.listingId : undefined}
                onHousingSent={(listingId) => setHousingContext(current => current?.chatId === activeChatId && current.listingId === listingId ? null : current)}
                userId={user.id}
                otherUser={otherUser}
                conversation={activeConv}
                muted={mutedIds.has(activeChatId)}
                onToggleMute={handleToggleMute}
                onArchive={handleArchive}
                onBack={handleBack}
                onBlock={handleBlock}
                onReport={handleReport}
                themePicker={<ThemePicker current={chatTheme.id} onPick={setChatTheme} />}
              />
            </main>
          ) : (
            <EmptyPane />
          )}
        </div>
      </div>


    </div>
  );
}

// ── Export: wrap in Suspense for useSearchParams ──────────────────────────────
function ChatsClientInner() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ChatsInner />
    </Suspense>
  );
}

// reducedMotion vivía en el MotionConfig global de AppProviders; al sacar
// framer-motion del árbol raíz, cada pantalla que lo usa lo declara en local.
export default function ChatsClient() {
  return (
    <MotionConfig reducedMotion="user">
      <ChatsClientInner />
    </MotionConfig>
  );
}
