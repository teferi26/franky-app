"use client";

import { memo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, MessageCircle, VenetianMask } from "lucide-react";
import { fomoTimeAgo, type FomoThread } from "./types";
import FomoIgButton from "./FomoIgButton";
import FomoReportButton from './FomoReportButton';

/** Poll results shown read-only (used on the feed; the detail view makes it votable). */
function PollPreview({ poll }: { poll: NonNullable<FomoThread["poll"]> }) {
  const total = poll.total_votes || 0;
  return (
    <div className="mt-4 space-y-2">
      <p className="font-heading text-[15px] font-bold text-text-primary">{poll.question}</p>
      {poll.options.map((o) => {
        const pct = total > 0 ? Math.round((o.vote_count / total) * 100) : 0;
        const mine = poll.my_option_id === o.id;
        return (
          <div
            key={o.id}
            className="relative overflow-hidden rounded-xl border border-border px-3.5 py-2.5"
          >
            {/* Barra de resultado: violeta muy claro; la opción propia, un punto más. */}
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-[var(--ease-out-expo)] ${mine ? "bg-violet-100" : "bg-violet-50"}`}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3 text-sm">
              <span className={mine ? "font-semibold text-violet-deep" : "text-text-primary"}>
                {o.label}
              </span>
              <span className="tabular text-text-muted">{pct}%</span>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-text-muted tabular">
        {total} {total === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

export function FomoAuthorHeader({ thread }: { thread: FomoThread }) {
  if (thread.is_anonymous || !thread.author) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-secondary text-text-muted">
          <VenetianMask className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-text-primary">Anónimo</p>
          <p className="text-xs text-text-muted">{fomoTimeAgo(thread.created_at)}</p>
        </div>
      </div>
    );
  }
  const a = thread.author;
  return (
    <div className="flex items-center gap-3">
      {a.avatar_url ? (
        <Image
          src={a.avatar_url}
          alt={a.full_name || "Perfil"}
          width={36}
          height={36}
          className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 font-heading text-sm font-bold text-violet-deep">
          {(a.full_name || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <div className="leading-tight">
        <p className="text-sm font-semibold text-text-primary">
          {a.full_name || "Estudiante"}
          {a.is_organization && <span className="ml-2 rounded-full bg-violet/10 px-2 py-1 text-[10px] text-violet">{a.verified?'Universidad verificada':'Perfil institucional'}</span>}
          {a.age ? <span className="font-normal text-text-muted"> · {a.age}</span> : null}
        </p>
        <p className="text-xs text-text-muted">{fomoTimeAgo(thread.created_at)}</p>
      </div>
    </div>
  );
}

/** Media renderer shared by feed + detail. */
export function FomoMedia({
  url,
  type,
  interactive = true,
}: {
  url: string;
  type: "image" | "audio" | "video";
  /** false en el feed: el vídeo es una miniatura muda (la tarjeta entera es un
      Link y unos controles nativos se comerían el clic de navegación). */
  interactive?: boolean;
}) {
  if (type === "image") {
    return (
      <div className="img-zoom relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-bg-secondary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Imagen adjunta a la publicación"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  if (type === "video") {
    return (
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-bg-dark">
        <video
          src={url}
          controls={interactive}
          muted={!interactive}
          playsInline
          preload="metadata"
          aria-label="Vídeo adjunto a la publicación"
          className="max-h-[480px] w-full object-contain"
        >
          Tu navegador no soporta vídeo.
        </video>
        {!interactive && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Vídeo
          </span>
        )}
      </div>
    );
  }
  return (
    <audio
      controls
      preload="none"
      src={url}
      aria-label="Nota de voz de la publicación"
      className="mt-4 w-full"
    >
      Tu navegador no soporta audio.
    </audio>
  );
}

function FomoThreadCard({
  thread,
  slug,
}: {
  thread: FomoThread;
  slug: string;
}) {
  const [suppressed, setSuppressed] = useState(false);
  if (suppressed) return null;
  return (
    <article className="group hover-lift block rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15">
    <Link href={`/fomo/${slug}/${thread.id}`} className="block">
      <FomoAuthorHeader thread={thread} />
      {thread.body && (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text-primary">
          {thread.body}
        </p>
      )}
      {thread.media_url && thread.media_type && (
        <FomoMedia url={thread.media_url} type={thread.media_type} interactive={false} />
      )}
      {thread.poll && <PollPreview poll={thread.poll} />}
    </Link>

      {/* Pie de acciones: corazón y respuestas, en gris hasta que hay algo
          propio. El corazón se remonta al cambiar la reacción y hace el pop. */}
      <div className="mt-4 flex items-center gap-5 border-t border-border-light pt-3 text-sm text-text-muted tabular">
        <span className={`flex items-center gap-1.5 transition-colors ${thread.my_reaction ? "text-rose-600" : "group-hover:text-text-primary"}`}>
          <Heart
            key={thread.my_reaction ? "on" : "off"}
            className={`h-4 w-4 ${thread.my_reaction ? "fill-current animate-heart-pop" : ""}`}
            aria-hidden
          />
          {thread.reaction_count}
          <span className="sr-only">
            {thread.reaction_count === 1 ? "reacción" : "reacciones"}
          </span>
        </span>
        <span className="flex items-center gap-1.5 transition-colors group-hover:text-text-primary">
          <MessageCircle className="h-4 w-4" aria-hidden />
          {thread.reply_count}
          <span className="sr-only">
            {thread.reply_count === 1 ? "respuesta" : "respuestas"}
          </span>
        </span>
        {!thread.is_mine && <FomoReportButton targetType="thread" targetId={thread.id} className="ml-auto" onSuppressed={() => setSuppressed(true)} />}
        {!thread.is_anonymous && thread.author && !thread.author.is_organization && !thread.is_mine && (
          <span className="ml-auto flex items-center gap-2">
            <FomoIgButton
              authorId={thread.author.id}
              authorName={thread.author.full_name}
            />
          </span>
        )}
      </div>
    </article>
  );
}

// El feed de FOMO carga por páginas con scroll infinito: cada página nueva
// hacía re-renderizar TODAS las tarjetas ya pintadas. La tarjeta solo depende
// de `thread` y `slug`, y al añadir una página las publicaciones anteriores
// conservan su referencia, así que con memo solo se renderizan las nuevas.
export default memo(FomoThreadCard);
