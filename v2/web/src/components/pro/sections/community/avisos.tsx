"use client";

import * as React from "react";
import { Eye, Megaphone, MessageCircle, Pin, PinOff, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProAnnouncement } from "@/lib/pro/types";
import { dayLabel, pct, relative, time } from "@/lib/pro/format";
import { announcementShareMessage, whatsAppShareUrl } from "@/lib/pro/community";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, Drawer, Empty, FormField, IconButton, Kpi, KpiRow, Meter, PageHeader, Pill, Segmented, Tip, inputClass, textareaClass } from "../../kit";

type Audience = ProAnnouncement["audience"];
type Filter = "all" | Audience;

const AUDIENCE_LABEL: Record<Audience, string> = { todos: "Toda la universidad", socios: "Socios", junta: "Junta" };

/** El mismo aviso, listo para pegar en el grupo de WhatsApp con el enlace a la ficha. */
function shareUrl(a: Pick<ProAnnouncement, "title" | "body">, slug: string): string {
  return whatsAppShareUrl(
    announcementShareMessage({ title: a.title, body: a.body, url: `https://franky.es/n/${slug}` }),
  );
}

export default function CommunityAvisos() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [composing, setComposing] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(null);

  const members = data.communityMembers.length;
  const boardCount = Math.max(1, data.board.length);
  const audienceSize = (a: Audience) => (a === "socios" ? members : a === "junta" ? boardCount : 0);

  const list = [...data.announcements]
    .filter((a) => filter === "all" || a.audience === filter)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.at.localeCompare(a.at));
  const toMembers = data.announcements.filter((a) => a.audience === "socios" && a.reads > 0);
  const memberRead = toMembers.length ? Math.round(toMembers.reduce((acc, a) => acc + pct(a.reads, members), 0) / toMembers.length) : 0;
  const publicReads = data.announcements.filter((a) => a.audience === "todos").reduce((acc, a) => acc + a.reads, 0);
  const latest = [...data.announcements].sort((a, b) => b.at.localeCompare(a.at))[0];

  const togglePin = (a: ProAnnouncement) => {
    update("announcement.pin", (d) => ({
      ...d,
      announcements: d.announcements.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x)),
    }));
    toast.success(a.pinned ? "Aviso desfijado" : "Aviso fijado", a.pinned ? undefined : "Sale el primero en la ficha de la asociación.");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Avisos"
        title="Avisos"
        description={
          latest
            ? `Llegan al Franky de cada persona, no se pierden en el grupo de WhatsApp. El último, ${relative(latest.at, now.getTime())}, ya lo han leído ${latest.reads.toLocaleString("es-ES")}.`
            : "Llegan al Franky de cada persona, no se pierden en el grupo de WhatsApp."
        }
        actions={
          <Button variant="dark" onClick={() => setComposing(true)}>
            <Megaphone className="h-4 w-4" /> Nuevo aviso
          </Button>
        }
      >
        <Segmented<Filter>
          label="Filtrar avisos"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: data.announcements.length },
            { value: "todos", label: "Universidad", count: data.announcements.filter((a) => a.audience === "todos").length },
            { value: "socios", label: "Socios", count: data.announcements.filter((a) => a.audience === "socios").length },
            { value: "junta", label: "Junta", count: data.announcements.filter((a) => a.audience === "junta").length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Megaphone} label="Avisos enviados" value={data.announcements.length} hint="Este curso" />
        <Kpi icon={Eye} label="Lecturas públicas" value={publicReads.toLocaleString("es-ES")} hint="Estudiantes de toda la universidad" emphasis />
        <Kpi icon={Users} label="Socios que leen" value={`${memberRead} %`} hint="De media en avisos a socios" />
        <Kpi icon={Pin} label="Fijados" value={data.announcements.filter((a) => a.pinned).length} hint="Salen primero en tu ficha" />
      </KpiRow>

      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((a, i) => {
            const size = audienceSize(a.audience);
            return (
              <li key={a.id} className="animate-list-in" style={{ "--i": i } as React.CSSProperties}>
                <article
                  className={cn(
                    "flex gap-3 rounded-2xl border bg-bg-primary p-4 shadow-card sm:p-5",
                    a.pinned ? "border-violet/30" : "border-border",
                  )}
                >
                  <button type="button" onClick={() => setOpen(a.id)} className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.pinned ? (
                        <Pill tone="violet">
                          <Pin className="h-3 w-3" /> Fijado
                        </Pill>
                      ) : null}
                      <Pill tone={a.audience === "junta" ? "dark" : a.audience === "socios" ? "info" : "neutral"}>{AUDIENCE_LABEL[a.audience]}</Pill>
                      <span className="text-xs text-text-muted">{relative(a.at, now.getTime())}</span>
                    </div>
                    <h3 className="mt-2 font-heading text-base font-bold">{a.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{a.body}</p>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Eye className="h-3.5 w-3.5" />
                        <span className="tabular">{a.reads.toLocaleString("es-ES")}</span> {size ? `de ${size} lo han leído` : "lecturas"}
                      </span>
                      {size ? <Meter value={a.reads} max={size} className="max-w-40" tone="success" /> : null}
                    </div>
                  </button>
                  <IconButton label={a.pinned ? "Desfijar aviso" : "Fijar aviso"} icon={a.pinned ? PinOff : Pin} onClick={() => togglePin(a)} className="h-10 w-10 shrink-0" />
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={Megaphone}
            title="Sin avisos aquí"
            body="Escribe el primero. Puedes mandarlo a toda la universidad, solo a tus socios o solo a la junta."
            action={
              <Button variant="dark" onClick={() => setComposing(true)}>
                Nuevo aviso
              </Button>
            }
          />
        </div>
      )}

      <Tip title="Llega a los de primero">
        Los avisos para toda la universidad aparecen en Franky a estudiantes que aún no os conocen. Es la forma de llegar a primero sin depender de que alguien comparta el cartel.
      </Tip>

      <Composer open={composing} onClose={() => setComposing(false)} />
      <AnnouncementDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<Audience>("socios");
  const [pinned, setPinned] = React.useState(false);
  const [share, setShare] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setAudience("socios");
    setPinned(false);
    setShare(true);
  }, [open]);

  const send = () => {
    const a: ProAnnouncement = { id: localId("an"), title: title.trim(), body: body.trim(), at: new Date().toISOString(), audience, reads: 0, pinned };
    update("announcement.create", (d) => ({ ...d, announcements: [a, ...d.announcements] }));
    // WhatsApp se abre en el mismo toque: así el navegador no lo bloquea.
    if (share) window.open(shareUrl(a, data.space.slug), "_blank", "noopener,noreferrer");
    toast.success(
      "Aviso enviado",
      audience === "todos"
        ? "Lo verán los estudiantes de tu universidad en Franky."
        : audience === "socios"
          ? `Les llega a tus ${data.communityMembers.length} socios.`
          : "Le llega a la junta.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo aviso"
      description="Una notificación en su Franky y queda guardado en la ficha."
      footer={
        <Button variant="dark" onClick={send} disabled={title.trim().length < 3 || body.trim().length < 3}>
          <Send className="h-4 w-4" /> Enviar aviso
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="A quién">
          <ChoiceChips
            value={audience}
            onChange={setAudience}
            options={[
              { value: "todos", label: "Toda la universidad", hint: "También a quien no te sigue" },
              { value: "socios", label: "Socios", hint: `${data.communityMembers.length} personas` },
              { value: "junta", label: "Junta", hint: `${data.board.length} personas` },
            ]}
          />
        </FormField>
        <FormField label="Título" htmlFor="an-title">
          <input id="an-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Este martes, cinefórum en versión original" />
        </FormField>
        <FormField label="Mensaje" htmlFor="an-body">
          <textarea id="an-body" className={cn(textareaClass, "min-h-[120px]")} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Qué, cuándo, dónde y qué tienen que hacer." />
        </FormField>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-4 w-4 accent-violet" />
          <span>
            <span className="font-semibold">Compartir también en el grupo de WhatsApp</span>
            <span className="block text-xs text-text-muted">Al enviar se abre WhatsApp con el texto y el enlace. Eliges el grupo y listo.</span>
          </span>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-violet" />
          <span>
            <span className="font-semibold">Fijar arriba</span>
            <span className="block text-xs text-text-muted">Sale el primero en la ficha de la asociación hasta que lo quites.</span>
          </span>
        </label>
        {title ? (
          <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">Así lo verán</p>
            <p className="mt-2 text-sm font-semibold">{data.space.name}</p>
            <p className="text-sm">{title}</p>
            {body ? <p className="mt-1 line-clamp-2 text-xs text-text-muted">{body}</p> : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function AnnouncementDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePro();
  const toast = useToast();
  const a = data.announcements.find((x) => x.id === id);
  if (!a) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Aviso">
        <span />
      </Drawer>
    );
  }
  const size = a.audience === "socios" ? data.communityMembers.length : a.audience === "junta" ? data.board.length : 0;
  const unread = size ? Math.max(0, size - a.reads) : 0;
  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={a.title}
      description={`${AUDIENCE_LABEL[a.audience]} · ${dayLabel(a.at)} a las ${time(a.at)}`}
      footer={
        <>
          <Button asChild variant={unread ? "outline" : "dark"}>
            <a href={shareUrl(a, data.space.slug)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" /> Compartir en WhatsApp
            </a>
          </Button>
          {unread ? (
            <Button
              variant="dark"
              onClick={() =>
                toast.success("Recordatorio enviado", `${unread} personas que no lo habían leído lo reciben de nuevo.`)
              }
            >
              <Send className="h-4 w-4" /> Reenviar a quien no lo ha leído
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="whitespace-pre-line text-sm text-text-secondary">{a.body}</p>
        <div className="divide-y divide-border-light">
          <Detail label="Lecturas">{a.reads.toLocaleString("es-ES")}</Detail>
          {size ? <Detail label="Sin leer">{unread}</Detail> : null}
          <Detail label="Fijado">{a.pinned ? "Sí" : "No"}</Detail>
        </div>
        {size ? <Meter value={a.reads} max={size} tone="success" /> : null}
      </div>
    </Drawer>
  );
}
