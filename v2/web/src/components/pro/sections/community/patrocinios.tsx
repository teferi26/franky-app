"use client";

import * as React from "react";
import { BadgeCheck, Download, Eye, FileBarChart, Handshake, MapPin, Search, Send, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProSponsor, ProVerticalId } from "@/lib/pro/types";
import { PRO_VERTICALS } from "@/lib/pro/verticals";
import { localDate, money } from "@/lib/pro/format";
import { courseStart, isActiveMember } from "@/lib/pro/community";
import { sponsorDossierFromData } from "@/lib/pro/community-docs";
import type { CommunityMember } from "@/lib/pro/community-types";
import { openPrintable } from "./files";
import { SPONSOR_SUGGESTIONS, type CommunityActivity } from "@/lib/pro/demo/community";
import { cn } from "@/lib/utils";
import { Avatar, Detail, Drawer, Empty, FormField, Kpi, KpiRow, PageHeader, Panel, Pill, Tip, inputClass, textareaClass } from "../../kit";

const STATUS: Record<ProSponsor["status"], { label: string; tone: "success" | "violet" | "neutral" }> = {
  active: { label: "Activo", tone: "success" },
  proposed: { label: "Propuesta enviada", tone: "violet" },
  finished: { label: "Terminado", tone: "neutral" },
};

const PERKS = ["Logo en carteles y en la ficha", "Mención en los avisos", "Stand en la actividad", "Oferta exclusiva para socios", "Premio con su nombre"];

type Target = { business: string; vertical: ProVerticalId; usual?: string } | null;

export default function CommunityPatrocinios() {
  const { data } = usePro();
  const [report, setReport] = React.useState<string | null>(null);
  const [proposal, setProposal] = React.useState<Target>(null);
  const [searching, setSearching] = React.useState(false);

  const active = data.sponsors.filter((s) => s.status === "active");
  const proposed = data.sponsors.filter((s) => s.status === "proposed");
  const finished = data.sponsors.filter((s) => s.status === "finished");
  const amount = active.reduce((a, s) => a + s.amountCents, 0);
  const reach = data.sponsors.reduce((a, s) => a + s.reach, 0);
  const redemptions = data.sponsors.reduce((a, s) => a + s.redemptions, 0);
  const suggestions = SPONSOR_SUGGESTIONS.filter((s) => !data.sponsors.some((x) => x.business === s.business));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Patrocinios"
        title="Patrocinadores"
        description={
          active.length
            ? `${active.length} patrocinadores activos que aportan ${money(amount, { round: true })} este curso. Sus ofertas se han canjeado ${redemptions} veces.`
            : "Los negocios de Franky cerca de tu campus buscan llegar a estudiantes. Tú tienes a los estudiantes."
        }
        actions={
          <Button variant="dark" onClick={() => setSearching(true)}>
            <Search className="h-4 w-4" /> Buscar patrocinador
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Handshake} label="Aportado este curso" value={money(amount, { round: true })} hint={`${active.length} activos`} emphasis />
        <Kpi icon={Eye} label="Alcance para ellos" value={reach.toLocaleString("es-ES")} hint="Estudiantes que vieron su marca" />
        <Kpi icon={Ticket} label="Canjes" value={redemptions} hint="Socios que usaron su oferta" />
        <Kpi icon={Send} label="Propuestas abiertas" value={proposed.length} hint="Esperando respuesta" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-3">
          {data.sponsors.length ? (
            [...active, ...proposed, ...finished].map((s) => <SponsorCard key={s.id} sponsor={s} onReport={() => setReport(s.id)} />)
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={Handshake}
                title="Aún no tienes patrocinadores"
                body="Mira qué negocios de Franky hay cerca de tu campus y mándales una propuesta. Ellos ya saben lo que vale un estudiante."
                action={
                  <Button variant="dark" onClick={() => setSearching(true)}>
                    Buscar patrocinador
                  </Button>
                }
              />
            </div>
          )}
          <Tip title="Por qué te dicen que sí">
            Tus patrocinadores ya usan Franky Pro: ven los canjes de su oferta en tiempo real y reciben un informe con el alcance de cada actividad. Pueden demostrar que les ha salido a cuenta, así que repiten.
          </Tip>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <DossierPanel />
          <Panel
            title="Cerca de tu campus"
            description="Negocios de Franky que suelen patrocinar asociaciones."
            flush
            action={
              <Button variant="ghost" size="sm" onClick={() => setSearching(true)}>
                Ver todos
              </Button>
            }
          >
            <ul className="divide-y divide-border-light">
              {suggestions.slice(0, 4).map((s) => (
                <SuggestionRow key={s.business} s={s} onPropose={() => setProposal({ business: s.business, vertical: s.vertical, usual: s.usual })} />
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <ReportDrawer sponsorId={report} onClose={() => setReport(null)} />
      <ProposalDrawer target={proposal} onClose={() => setProposal(null)} />
      <Drawer open={searching} onOpenChange={setSearching} title="Buscar patrocinador" description="Negocios de Franky Pro a pocos minutos del campus." wide>
        <ul className="-mx-5 divide-y divide-border-light">
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.business}
              s={s}
              onPropose={() => {
                setSearching(false);
                setProposal({ business: s.business, vertical: s.vertical, usual: s.usual });
              }}
            />
          ))}
        </ul>
        {!suggestions.length ? <Empty icon={Handshake} title="Ya has contactado con todos" body="Te avisaremos cuando llegue un negocio nuevo cerca del campus." /> : null}
      </Drawer>
    </div>
  );
}

function SuggestionRow({ s, onPropose }: { s: (typeof SPONSOR_SUGGESTIONS)[number]; onPropose: () => void }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <Avatar name={s.business} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{s.business}</p>
        <p className="flex items-center gap-1 text-xs text-text-muted">
          <MapPin className="h-3 w-3" /> {s.sector}, {s.distance}
        </p>
        <p className="mt-1 text-xs text-text-secondary">{s.usual}</p>
        <p className="mt-1 text-[0.7rem] text-text-muted tabular">{s.students} estudiantes clientes el último mes</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onPropose}>
        Proponer
      </Button>
    </li>
  );
}

function SponsorCard({ sponsor: s, onReport }: { sponsor: ProSponsor; onReport: () => void }) {
  const { update } = usePro();
  const toast = useToast();
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={s.business} tone={s.status === "active" ? "violet" : "slate"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-heading text-base font-bold">{s.business}</h3>
            {s.franky ? (
              <Pill tone="neutral">
                <BadgeCheck className="h-3 w-3 text-violet" /> Franky Pro
              </Pill>
            ) : null}
          </div>
          <p className="text-sm text-text-muted">
            {PRO_VERTICALS[s.vertical].label} · {s.packageName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-heading text-lg font-bold tabular">{money(s.amountCents, { round: true })}</p>
          <Pill tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Pill>
        </div>
      </div>
      {s.status !== "proposed" ? (
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-bg-secondary px-2 py-2">
            <p className="font-heading text-base font-bold tabular">{s.reach.toLocaleString("es-ES")}</p>
            <p className="text-[0.7rem] text-text-muted">estudiantes vieron su marca</p>
          </div>
          <div className="rounded-xl bg-bg-secondary px-2 py-2">
            <p className="font-heading text-base font-bold tabular">{s.redemptions}</p>
            <p className="text-[0.7rem] text-text-muted">canjes de su oferta</p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-text-muted">
          La propuesta está en su bandeja de Franky Pro. Suelen responder en dos o tres días.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {s.status === "proposed" ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => toast.success("Recordatorio enviado", `${s.business} lo ve en su bandeja.`)}>
              Recordar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                update("sponsor.accept", (d) => ({ ...d, sponsors: d.sponsors.map((x) => (x.id === s.id ? { ...x, status: "active" } : x)) }));
                toast.success("Patrocinio cerrado", `${s.business} aporta ${money(s.amountCents, { round: true })}. Lo verás en la caja.`);
              }}
            >
              Marcar como aceptada
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onReport}>
            <FileBarChart className="h-3.5 w-3.5" /> Informe para {s.business.split(" ").slice(0, 2).join(" ")}
          </Button>
        )}
      </div>
    </article>
  );
}

function ReportDrawer({ sponsorId, onClose }: { sponsorId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const toast = useToast();
  const s = data.sponsors.find((x) => x.id === sponsorId);
  if (!s) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Informe">
        <span />
      </Drawer>
    );
  }
  const acts = (data.activities as CommunityActivity[]).filter((a) => a.sponsorId === s.id);
  const attendees = acts.reduce((a, x) => a + (x.status === "done" ? x.checkedIn : x.registered), 0);
  const costPerReach = s.reach ? s.amountCents / s.reach : 0;
  return (
    <Drawer
      open={Boolean(sponsorId)}
      onOpenChange={(o) => !o && onClose()}
      title={`Informe para ${s.business}`}
      description="Lo que ha conseguido con tu asociación, con datos de Franky."
      footer={
        <Button
          variant="dark"
          onClick={() => {
            toast.success("Informe enviado", `${s.business} lo tiene en su Franky Pro y en su correo.`);
            onClose();
          }}
        >
          <Send className="h-4 w-4" /> Enviar informe
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-bg-dark p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{s.packageName}</p>
          <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{s.reach.toLocaleString("es-ES")}</p>
          <p className="text-sm text-white/70">estudiantes vieron su marca</p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="font-heading text-xl font-bold tabular">{s.redemptions}</p>
              <p className="text-xs text-white/60">canjes en su local</p>
            </div>
            <div>
              <p className="font-heading text-xl font-bold tabular">{attendees}</p>
              <p className="text-xs text-white/60">asistentes a sus actividades</p>
            </div>
          </div>
        </div>
        <div className="divide-y divide-border-light">
          <Detail label="Aportación">{money(s.amountCents, { round: true })}</Detail>
          <Detail label="Coste por estudiante alcanzado">{costPerReach ? `${(costPerReach / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €` : "Sin datos"}</Detail>
          <Detail label="Estudiantes verificados">Sí, con cuenta universitaria</Detail>
        </div>
        {acts.length ? (
          <section>
            <h3 className="font-heading text-sm font-bold">Actividades con su marca</h3>
            <ul className="mt-2 divide-y divide-border-light">
              {acts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <span className="shrink-0 text-xs text-text-muted tabular">
                    {a.status === "done" ? `${a.checkedIn} asistentes` : `${a.registered} inscritos`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function ProposalDrawer({ target, onClose }: { target: Target; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [pkg, setPkg] = React.useState("");
  const [amount, setAmount] = React.useState("200");
  const [perks, setPerks] = React.useState<string[]>([PERKS[0], PERKS[3]]);
  const [activityId, setActivityId] = React.useState("");
  const [message, setMessage] = React.useState("");

  const upcoming = (data.activities as CommunityActivity[]).filter((a) => a.status === "published");
  const members = data.communityMembers.length;

  React.useEffect(() => {
    if (!target) return;
    setPkg(`Patrocinador de ${data.space.name}`);
    setAmount("200");
    setPerks([PERKS[0], PERKS[3]]);
    setActivityId("");
    setMessage(
      `Hola, somos ${data.space.name}, asociación de la ${data.space.campus} con ${members} socios. Nuestras actividades las ven miles de estudiantes en Franky y nos encantaría contar con vosotros.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100) || 0;
  const send = () => {
    if (!target) return;
    const s: ProSponsor = {
      id: localId("sp"),
      business: target.business,
      vertical: target.vertical,
      packageName: pkg.trim() || "Patrocinio",
      amountCents: cents,
      status: "proposed",
      reach: 0,
      redemptions: 0,
      franky: true,
    };
    update("sponsor.propose", (d) => ({ ...d, sponsors: [...d.sponsors, s] }));
    const act = upcoming.find((a) => a.id === activityId);
    toast.success("Propuesta enviada", `${target.business} la recibe en su Franky Pro con tus cifras de alcance${act ? ` y la ficha de ${act.title}` : ""}.`);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={target ? `Propuesta para ${target.business}` : "Propuesta"}
      description={target?.usual ? `Suele aportar: ${target.usual.toLowerCase()}.` : undefined}
      footer={
        <Button variant="dark" onClick={send} disabled={!cents || !perks.length}>
          <Send className="h-4 w-4" /> Enviar propuesta
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre del paquete" htmlFor="pr-name">
          <input id="pr-name" className={inputClass} value={pkg} onChange={(e) => setPkg(e.target.value)} />
        </FormField>
        <FormField label="Aportación que pides" htmlFor="pr-amount" hint="Dinero, o su valor si es en producto. Los patrocinios no pagan comisión a Franky.">
          <div className="relative">
            <input id="pr-amount" inputMode="decimal" className={cn(inputClass, "pr-8")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
          </div>
        </FormField>
        <FormField label="Qué le das a cambio">
          <div className="flex flex-col gap-2">
            {PERKS.map((p) => {
              const on = perks.includes(p);
              return (
                <label key={p} className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm", on ? "border-violet bg-violet-50 text-violet-deep" : "border-border")}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet"
                    checked={on}
                    onChange={(e) => setPerks((list) => (e.target.checked ? [...list, p] : list.filter((x) => x !== p)))}
                  />
                  {p}
                </label>
              );
            })}
          </div>
        </FormField>
        <FormField label="Actividad concreta (opcional)" htmlFor="pr-act">
          <select id="pr-act" className={inputClass} value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">Todo el curso</option>
            {upcoming.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Mensaje" htmlFor="pr-msg">
          <textarea id="pr-msg" className={cn(textareaClass, "min-h-[110px]")} value={message} onChange={(e) => setMessage(e.target.value)} />
        </FormField>
        <p className="flex items-center gap-2 rounded-xl bg-bg-secondary px-3 py-2.5 text-xs text-text-secondary">
          <Users className="h-4 w-4 shrink-0 text-violet" /> Se adjuntan tus cifras: {members} socios y el alcance de tus últimas actividades.
        </p>
      </div>
    </Drawer>
  );
}

/** El dossier con los datos del curso, listo para mandar a un negocio. */
function DossierPanel() {
  const { data, now } = usePro();
  const toast = useToast();
  const members = (data.communityMembers as CommunityMember[]).filter(isActiveMember);
  const from = courseStart(now);
  const done = data.activities.filter((a) => a.status === "done");
  const avg = done.length ? Math.round(done.reduce((acc, a) => acc + a.checkedIn, 0) / done.length) : 0;
  const reach = (data.activities as CommunityActivity[])
    .filter((a) => a.status !== "draft")
    .reduce((acc, a) => acc + (a.reachOutside ?? 0), 0);
  const fresh = members.filter((m) => localDate(m.joinedAt) >= from).length;

  const download = () => {
    const html = sponsorDossierFromData(data, now);
    const opened = openPrintable(html, `Dossier de patrocinio ${data.space.name}`);
    toast.success(
      "Dossier listo",
      opened ? "Guárdalo en PDF y mándalo con tu propuesta." : "Se ha descargado. Ábrelo y guárdalo en PDF.",
    );
  };

  return (
    <Panel title="Tu dossier de patrocinio" description="Con los datos de verdad de este curso, no con promesas.">
      <dl className="grid grid-cols-2 gap-3">
        <DossierFigure label="Socios" value={members.length} />
        <DossierFigure label="Nuevos este curso" value={fresh} />
        <DossierFigure label="Asistentes de media" value={avg} />
        <DossierFigure label="Alcance en Franky" value={reach.toLocaleString("es-ES")} />
      </dl>
      <Button variant="outline" className="mt-4 w-full" onClick={download} disabled={!members.length}>
        <Download className="h-4 w-4" /> Descargar dossier
      </Button>
    </Panel>
  );
}

function DossierFigure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-bg-secondary px-3 py-2.5">
      <dd className="font-heading text-lg font-bold tabular">{value}</dd>
      <dt className="truncate text-xs text-text-muted">{label}</dt>
    </div>
  );
}
