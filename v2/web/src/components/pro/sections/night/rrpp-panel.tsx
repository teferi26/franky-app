"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Copy, MessageCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProPromoter } from "@/lib/pro/types";
import { money, shortDay, time } from "@/lib/pro/format";
import { eventPhase, focusEvent, shortUni } from "@/lib/pro/night";
import { nightTitle } from "@/lib/pro/night-ops";
import {
  TARGET_STATUS_LABEL,
  promoterNudge,
  promoterPanel,
  promoterTargets,
  type TargetStatus,
} from "@/lib/pro/night-promoters";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { Avatar, Drawer, Empty, Meter, Panel, Pill, RowList } from "../../kit";
import { whatsAppShare } from "./ops-ui";

const STATUS_TONE: Record<TargetStatus, "neutral" | "success" | "warning" | "danger" | "violet"> = {
  none: "neutral",
  ahead: "violet",
  on_track: "success",
  behind: "warning",
  done: "success",
  missed: "danger",
};

/* ------------------------------------------------------------------ */
/* Objetivos de la próxima noche                                       */
/* ------------------------------------------------------------------ */

/**
 * Cómo va cada RRPP con objetivo en la noche que viene: primero quien va
 * flojo, con un mensaje listo para animarle.
 */
export function TargetsPanel({ onOpen }: { onOpen: (promoterId: string) => void }) {
  const { data, now } = usePro();
  const ev = focusEvent(data, now);
  if (!ev) return null;
  const rows = promoterTargets(data, ev, now);
  const behind = rows.filter((r) => r.state.status === "behind");
  const phase = eventPhase(ev, now);
  return (
    <Panel
      title={`Objetivos para ${ev.name}`}
      description={
        rows.length
          ? behind.length
            ? `${behind.length} ${behind.length === 1 ? "va flojo" : "van flojos"} para ${phase === "live" ? "esta noche" : shortDay(ev.doorsOpen)}.`
            : "Todos van a buen ritmo."
          : "Pon un objetivo por noche en la ficha de cada RRPP y verás aquí quién va flojo."
      }
      flush
    >
      {rows.length ? (
        <RowList>
          {rows.map(({ promoter: p, state }) => {
            const count = phase === "live" || phase === "past" ? state.scanned : state.signedUp;
            const nudge = promoterNudge(p, ev, state, data.space.slug);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 basis-48 items-center gap-3 text-left">
                  <Avatar name={p.name} size="sm" tone={state.status === "behind" ? "amber" : "slate"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="shrink-0 text-text-muted tabular">
                        {count} de {state.target}
                      </span>
                    </span>
                    <Meter
                      value={count}
                      max={state.target ?? 1}
                      tone={state.status === "behind" || state.status === "missed" ? "warning" : state.status === "done" ? "success" : "violet"}
                      className="mt-1.5"
                    />
                  </span>
                </button>
                <span className="flex shrink-0 items-center gap-2">
                  <Pill tone={STATUS_TONE[state.status]}>{TARGET_STATUS_LABEL[state.status]}</Pill>
                  {state.status === "behind" ? (
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={customerWhatsApp(p.phone, nudge) ?? whatsAppShare(nudge)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Escribir a ${p.name} por WhatsApp`}
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Animar
                      </a>
                    </Button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </RowList>
      ) : (
        <Empty icon={Target} title="Sin objetivos todavía" body="Un objetivo por noche ayuda a ver a tiempo quién no va a llegar." className="py-8" />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Panel del RRPP                                                      */
/* ------------------------------------------------------------------ */

/**
 * Lo que ve un RRPP cuando entra con su acceso: su enlace y su QR, cómo va su
 * lista esta noche, lo que lleva ganado y lo que le falta. Nada de los demás.
 */
export function PromoterPanelView({ promoter }: { promoter: ProPromoter }) {
  const { data, now } = usePro();
  const toast = useToast();
  const panel = promoterPanel(data, promoter, now);
  const [qr, setQr] = React.useState("");

  React.useEffect(() => {
    // Negro sobre blanco para que lo lea cualquier móvil en la cola.
    QRCode.toDataURL(`https://${panel.link}`, { margin: 1, width: 320, color: { dark: "#000000", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [panel.link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${panel.link}`);
      toast.success("Enlace copiado", panel.link);
    } catch {
      toast.info("Copia el enlace", panel.link);
    }
  };

  const ev = panel.event;
  const phase = ev ? eventPhase(ev, now) : null;
  const share = `Entradas y lista para ${ev ? `${ev.name} (${shortDay(ev.doorsOpen)})` : data.space.name}: https://${panel.link}`;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center gap-4 rounded-2xl border border-border p-4">
        <div className="shrink-0 rounded-2xl border border-border bg-white p-2">
          {qr ? (
            <img src={qr} alt={`Código QR de ${panel.link}`} className="h-24 w-24" />
          ) : (
            <div className="h-24 w-24 rounded-xl skeleton-shimmer" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Tu enlace</p>
          <p className="mt-1 break-all text-sm font-semibold">{panel.link}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
            <Button asChild variant="dark" size="sm">
              <a href={whatsAppShare(share)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Compartir
              </a>
            </Button>
          </div>
        </div>
      </section>

      {ev && panel.cap ? (
        <section className="rounded-2xl border border-border p-4">
          <p className="eyebrow">{phase === "live" ? "Esta noche" : `${nightTitle(ev.date)} · ${ev.name}`}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-text-muted">En tu lista</p>
              <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">
                {panel.cap.signedUp}
                {panel.cap.max !== null ? <span className="text-base font-bold text-text-muted"> de {panel.cap.max}</span> : null}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Han entrado</p>
              <p className="font-heading text-3xl font-extrabold tracking-[-0.03em] tabular">{panel.target?.scanned ?? 0}</p>
            </div>
          </div>
          {panel.cap.max !== null ? (
            <Meter value={panel.cap.signedUp} max={panel.cap.max} tone={panel.cap.full ? "warning" : "violet"} className="mt-3" />
          ) : null}
          <ul className="mt-3 flex flex-col gap-1 text-sm text-text-secondary">
            {panel.cap.full ? <li>Tu cupo de esta noche está lleno.</li> : null}
            {panel.target?.target ? (
              <li>
                Tu objetivo es {panel.target.target}.{" "}
                {panel.target.missing ? `Te faltan ${panel.target.missing}.` : "Ya lo tienes."}
              </li>
            ) : null}
            {panel.cutoffAt ? <li>Tu lista entra gratis hasta las {time(panel.cutoffAt)}.</li> : null}
            {panel.tierHint ? <li>{panel.tierHint}</li> : null}
          </ul>
        </section>
      ) : (
        <p className="rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">
          Cuando haya una noche a la venta, verás aquí tu lista y cuánta gente ha entrado.
        </p>
      )}

      <section className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-border px-3 py-2.5">
          <p className="text-xs text-text-muted">Ganado este mes</p>
          <p className="mt-0.5 font-heading text-xl font-extrabold tabular">{money(panel.monthCents)}</p>
          <p className="text-xs text-text-muted">{panel.monthScanned} personas en puerta</p>
        </div>
        <div className="rounded-2xl border border-border px-3 py-2.5">
          <p className="text-xs text-text-muted">Te deben</p>
          <p className="mt-0.5 font-heading text-xl font-extrabold tabular">{money(panel.pendingCents)}</p>
          <p className="text-xs text-text-muted">
            {panel.lastPayout ? `Último pago ${shortDay(panel.lastPayout.at)}` : "Aún sin pagos"}
          </p>
        </div>
      </section>

      <section>
        <p className="eyebrow mb-2">Tus últimas noches</p>
        {panel.recent.length ? (
          <RowList className="rounded-2xl border border-border">
            {panel.recent.map((n) => (
              <div key={n.eventId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.name}</span>
                  <span className="text-xs text-text-muted">
                    {nightTitle(n.date)} · {n.scanned} de {n.sold + n.list} entraron
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular">{money(n.commissionCents)}</span>
              </div>
            ))}
          </RowList>
        ) : (
          <p className="text-sm text-text-muted">Tus noches aparecerán aquí en cuanto entre alguien con tu enlace.</p>
        )}
        <p className="mt-2 text-xs text-text-muted">Cobras {panel.rule.toLowerCase()}: solo cuenta quien entra por la puerta.</p>
      </section>
    </div>
  );
}

/** El panel del RRPP tal y como lo ve en su móvil, para enseñárselo o revisarlo. */
export function PromoterPanelDrawer({ promoterId, onClose }: { promoterId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const p = promoterId ? data.promoters.find((x) => x.id === promoterId) : undefined;
  return (
    <Drawer
      open={Boolean(p)}
      onOpenChange={(v) => !v && onClose()}
      title={p ? `Así lo ve ${p.name.split(" ")[0]}` : "Panel del RRPP"}
      description={p ? `${shortUni(p.university) || "RRPP"} · solo su enlace, su lista y lo que gana` : undefined}
    >
      {p ? <PromoterPanelView promoter={p} /> : null}
    </Drawer>
  );
}
