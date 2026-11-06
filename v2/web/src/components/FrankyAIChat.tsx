"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send, X, Sparkles, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-client";
import { basicReply, safeAssistantActions, type AssistantAction } from "@/lib/ai-public";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: AssistantAction[];
  mode?: 'ai' | 'basic';
};

const SUGGESTIONS = [
  "Quiero encontrar una beca para estudiar",
  "Busco piso y compañeros de piso",
  "¿Dónde encuentro eventos universitarios?",
  "Ayúdame a organizar mi estudio esta semana",
];

// Model text is rendered as React text. Only validated actions become links.

export default function FrankyAIChat() {
  const pathname = usePathname();
  const scholarshipId = pathname?.match(/^\/becas\/([a-f0-9-]{36})$/i)?.[1];
  const isBecaria = pathname === '/becas' || !!scholarshipId;
  const suggestions = isBecaria ? scholarshipId ? ['¿Qué requisitos tiene esta beca?', '¿Qué documentos necesito?', '¿Cuál es el plazo de solicitud?', '¿Cómo se solicita?'] : ['Busco becas para un grado universitario', '¿Cómo encuentro becas de mi comunidad?', '¿Qué ayudas hay para Erasmus?', '¿Cómo sé si una convocatoria sigue abierta?'] : SUGGESTIONS;
  const [authReady, setAuthReady] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // Mobile keyboard offset (iOS): pixels the keyboard takes from the bottom
  const [kbOffset, setKbOffset] = useState(0);
  // Available visual viewport height (shrinks when keyboard opens)
  const [vvHeight, setVvHeight] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Anonymous visitors get the local navigator; paid calls still require a session.
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let authChanged = false;
    const adoptOwner = (next: string | null) => {
      if (!mounted) return;
      setAuthReady(true);
      if (ownerRef.current === next) return;
      ownerRef.current = next;
      requestRef.current?.abort();
      requestRef.current = null;
      setOwner(next);
      setMessages([]);
      setInput('');
      setRequestError(null);
      setLoading(false);
      setOpen(false);
    };
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!authChanged) adoptOwner(user?.id ?? null);
    }).catch(() => { if (!authChanged) adoptOwner(null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      authChanged = true;
      adoptOwner(session?.user.id ?? null);
    });
    return () => {
      mounted = false;
      ownerRef.current = null;
      requestRef.current?.abort();
      requestRef.current = null;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const openAssistant = () => {
      if (!authReady) return;
      delete document.documentElement.dataset.frankyAssistantOpen;
      setOpen(true);
    };
    window.addEventListener('franky:open-assistant', openAssistant);
    if (document.documentElement.dataset.frankyAssistantOpen === 'true') openAssistant();
    return () => window.removeEventListener('franky:open-assistant', openAssistant);
  }, [authReady]);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setMessages([]);
    setInput('');
    setRequestError(null);
    setLoading(false);
  }, [scholarshipId]);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages, loading]);

  // Auto-focus input on every device — we handle the keyboard layout with
  // visualViewport below so nothing gets cut off.
  useEffect(() => {
    if (!open) return;
    // Small delay lets the open animation finish before the keyboard appears
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  // Track the mobile on-screen keyboard via visualViewport so the chat sheet
  // can shrink + lift above the keyboard without overflowing the screen.
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const vp = window.visualViewport;
    if (!vp) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
      setKbOffset(kb);
      setVvHeight(vp.height);
    };
    update();
    vp.addEventListener("resize", update);
    vp.addEventListener("scroll", update);
    return () => {
      vp.removeEventListener("resize", update);
      vp.removeEventListener("scroll", update);
    };
  }, [open]);

  // Close with Escape and trap Tab focus inside the dialog while open.
  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Body scroll lock on mobile while bottom-sheet is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-scroll-lock", "true");
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-scroll-lock");
    };
  }, [open]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || text.trim().length > 2000 || loading || requestRef.current || !authReady || ownerRef.current !== owner) return;
      const sender = owner;
      const controller = new AbortController();
      requestRef.current = controller;
      const isCurrent = () => ownerRef.current === sender && requestRef.current === controller;
      const timeout = window.setTimeout(() => controller.abort(), 27_000);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setRequestError(null);

      try {
        const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
        if (!owner) {
          const answer = basicReply(text, null, history.filter(h => h.role === 'user').at(-1)?.content, scholarshipId);
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: answer.reply, actions: answer.actions, mode: 'basic', timestamp: new Date() }]);
          return;
        }
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), history, ...(scholarshipId ? { scholarshipId } : {}) }),
          signal: controller.signal,
        });

        const data = await res.json();
        if (!isCurrent()) return;
        if (!res.ok || typeof data.reply !== 'string' || !data.reply.trim()) {
          setRequestError(res.status === 429 ? 'Has enviado varias preguntas seguidas. Espera un momento y vuelve a intentarlo.' :
            typeof data.error === 'string' ? data.error : 'No hemos podido responder. Inténtalo de nuevo.');
          setMessages(prev => prev.filter(message => message.id !== userMsg.id));
          setInput(userMsg.content);
          return;
        }

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply.slice(0, 6000),
          actions: safeAssistantActions(data.actions),
          mode: data.mode === 'basic' ? 'basic' : 'ai',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        if (!isCurrent()) return;
        setMessages(prev => prev.filter(message => message.id !== userMsg.id));
        setInput(userMsg.content);
        setRequestError('No hemos podido conectar. Tu pregunta está conservada para volver a enviarla.');
      } finally {
        window.clearTimeout(timeout);
        if (isCurrent()) {
          requestRef.current = null;
          setLoading(false);
        }
      }
    },
    [messages, loading, owner, authReady, scholarshipId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Don't show the floating Franky AI on pages that already are chat surfaces.
  if (pathname?.startsWith("/chats")) return null;
  if (!authReady) return null;

  return (
    <>
      {/* Floating button — just the Franky logo, no background padding */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          // Por encima de la barra de pestañas de móvil y de la barra de
          // cookies: los dos publican su alto en variables CSS (ver globals.css
          // y CookieConsent) y aquí se suman.
          style={{
            bottom: "calc(max(1rem, env(safe-area-inset-bottom)) + var(--tabbar-offset, 0px) + var(--cookie-bar-offset, 0px))",
            right: "max(1rem, env(safe-area-inset-right))",
          }}
          // Burbuja (v3): el icono de Franky con un anillo hairline y la sombra
          // flotante del sistema; sube 2 px al pasar el ratón, sin brillos.
          className="hover-lift fixed z-50 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-primary shadow-float animate-scale-in active:scale-95 md:h-12 md:w-12"
          aria-label="Abrir asistente Franky AI"
        >
          <Image
            src="/img/franky-icon.png"
            alt="Franky AI"
            width={48}
            height={48}
            className="w-full h-full object-cover"
          />
        </button>
      )}

      {/* Chat panel — bottom sheet on mobile (adapts to keyboard), floating card on md+ */}
      {open && (
        <>
          {/* Backdrop (mobile only, tap to close) */}
          <button
            type="button"
            aria-label="Cerrar chat"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-bg-dark/40 animate-fade-in md:hidden"
          />
          <div
            ref={panelRef}
            style={{
              // Mobile: sit flush above the keyboard. When keyboard is closed
              // kbOffset=0 so sheet sits at the bottom. When keyboard opens,
              // the sheet lifts exactly by the keyboard height.
              bottom: `${kbOffset}px`,
              // Sheet height: when keyboard is open, fill the remaining visible
              // area (vvHeight). When closed, use a comfortable 72dvh.
              height:
                kbOffset > 0 && vvHeight
                  ? `${Math.min(vvHeight, 600)}px`
                  : undefined,
            }}
            className={cn(
              // Hoja inferior en móvil (entra deslizando), tarjeta flotante en
              // escritorio (entra con escala). Superficie blanca, borde hairline
              // y la sombra flotante del sistema: nada de glass ni de sombras negras.
              "fixed left-0 right-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-bg-primary shadow-float animate-sheet-in",
              // mobile default height (keyboard closed)
              "h-[72dvh] max-h-[72dvh]",
              // desktop: floating card bottom-right
              "md:inset-auto md:!bottom-6 md:top-auto md:left-auto md:right-6 md:w-[380px] md:!h-[560px] md:!max-h-[calc(100vh-6rem)] md:rounded-2xl md:border md:border-border md:animate-scale-in"
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Asistente Franky AI"
          >
          {/* Cabecera (v3): blanca, con el icono de Franky suelto y una línea
              hairline debajo. Antes era una banda con degradado violeta. */}
          <div
            className="flex shrink-0 items-center gap-3 border-b border-border-light px-4 py-3"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            <Image
              src="/img/franky-icon.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold text-text-primary">{isBecaria ? 'BecarIA · Pregunta a Franky' : 'Franky AI'}</p>
              <p className="truncate text-xs text-text-muted">{isBecaria ? 'Te ayudo con las fichas de becas' : 'Te ayudo a encontrar lo que buscas'}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="-m-2 rounded-lg p-2 text-text-muted transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary"
              aria-label="Cerrar chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="py-4">
                <Sparkles className="h-6 w-6 text-violet animate-slide-up" />
                <p className="eyebrow mt-4 animate-slide-up [animation-delay:40ms]">Franky AI</p>
                <p className="mt-2 font-heading text-xl font-extrabold tracking-tight text-text-primary animate-slide-up [animation-delay:80ms]">
                  ¿Qué quieres saber?
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted animate-slide-up [animation-delay:120ms]">
                  {isBecaria ? 'Pregúntame por requisitos, documentos o plazos. Te ayudaré con la información publicada y te diré qué falta comprobar.' : 'Encuentra becas, estudios, piso, compañeros y planes. También puedo ayudarte a organizar tu estudio.'}
                </p>
                <div className="mt-5 space-y-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      style={{ ["--i" as string]: i + 3 }}
                      className="group animate-list-in flex w-full items-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-left text-[13px] text-text-secondary transition-[border-color,background-color,color] duration-200 hover:border-text-primary/20 hover:bg-bg-secondary hover:text-text-primary"
                    >
                      <span className="flex-1">{s}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:-translate-y-px group-hover:translate-x-px" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex gap-2 animate-list-in",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <Image
                    src="/img/franky-icon.png"
                    alt=""
                    width={28}
                    height={28}
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                  />
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "rounded-br-md bg-text-primary text-bg-primary"
                      : "rounded-bl-md bg-bg-secondary text-text-primary"
                  )}
                >
                  {m.role === "assistant" ? (
                    <>
                      {m.mode === 'basic' && <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Guía rápida</p>}
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      {!!m.actions?.length && <div className="mt-3 flex flex-col gap-2">
                        {m.actions.map(action => <Link key={action.href} href={action.href} onClick={() => setOpen(false)} className="inline-flex items-center justify-between gap-2 rounded-xl border border-border bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary hover:border-violet">
                          {action.label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        </Link>)}
                      </div>}
                    </>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2 animate-fade-in">
                <Image
                  src="/img/franky-icon.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-full"
                />
                <div className="rounded-2xl rounded-bl-md bg-bg-secondary px-4 py-3">
                  <span className="sr-only">Franky AI está escribiendo</span>
                  <div className="flex gap-1" aria-hidden="true">
                    <div className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-border-light p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {requestError && <p role="alert" className="mb-3 rounded-xl bg-bg-secondary p-3 text-sm text-text-secondary">{requestError}</p>}
            {!owner && <p className="mb-3 text-xs text-text-secondary">Puedes usar la guía rápida. <Link href="/login" className="font-semibold underline">Inicia sesión</Link> para hacer preguntas específicas a la IA.</p>}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                aria-label="Pregunta a Franky AI"
                maxLength={2000}
                disabled={loading}
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20 focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                aria-label="Enviar mensaje"
                className={cn(buttonVariants({ size: "icon" }), "shrink-0")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-text-muted">
              {owner ? <>Tus preguntas y contexto reciente se envían a DeepSeek. Evita datos sensibles. <Link href="/privacidad" className="underline">Privacidad</Link>. Verifica la información importante.</> : 'Información pública para orientarte por Franky.'}
            </p>
          </form>
          </div>
        </>
      )}
    </>
  );
}
