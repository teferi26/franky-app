"use client";

import * as React from "react";
import { BadgeCheck, Building2, CalendarDays, Landmark, RefreshCcw, Send, Stamp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProUniAssociation } from "@/lib/pro/types";
import { money, relative } from "@/lib/pro/format";
import { REQUIRED_DOCS, docsOf, missingDocs, pendingCreditGroups, uniExtrasOf } from "@/lib/pro/university";
import type { UniAssociation } from "@/lib/pro/university-types";
import { FACULTIES } from "@/lib/pro/demo/university";
import { cn } from "@/lib/utils";
import { Avatar, Detail, Drawer, Empty, FormField, Kpi, KpiRow, PageHeader, Panel, Pill, SearchInput, Segmented, Tip, inputClass } from "../../kit";
import { ActivitiesView, CreditsView } from "./asociaciones-parts";
import { GovernanceSection, RenewalView, useRequestAllRenewals } from "./asociaciones-renewal";
import { useUniAction } from "./ui";

type View = "registro" | "renovacion" | "creditos" | "actividades";
type Filter = "all" | "ects" | "subsidy" | "unregistered";

const SUBSIDY: Record<ProUniAssociation["subsidyStatus"], { label: string; tone: "neutral" | "info" | "success" }> = {
  none: { label: "Sin subvención", tone: "neutral" },
  submitted: { label: "Subvención pedida", tone: "info" },
  granted: { label: "Subvención concedida", tone: "success" },
};

export default function UniversityAsociaciones() {
  const { data, now } = usePro();
  const [view, setView] = React.useState<View>("registro");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [inviting, setInviting] = React.useState(false);
  const [creditFor, setCreditFor] = React.useState<string | null>(null);

  const extras = uniExtrasOf(data);
  const all = data.uniAssociations as UniAssociation[];
  const registered = all.filter((a) => a.registered);
  const withEcts = all.filter((a) => a.ectsRequests > 0);
  const ectsRequests = withEcts.reduce((a, x) => a + x.ectsRequests, 0);
  const unregistered = all.filter((a) => !a.registered);
  const members = registered.reduce((a, x) => a + x.members, 0);
  const granted = all.filter((a) => a.subsidyStatus === "granted").reduce((a, x) => a + (x.subsidyCents ?? 0), 0);
  const activeCount = data.uniMetrics.find((m) => m.key === "associations")?.value ?? registered.length;
  const groups = pendingCreditGroups(extras.credits, all);
  const renewals = useRequestAllRenewals();
  const eligible = groups.reduce((a, g) => a + g.eligible, 0);

  const list = all
    .filter((a) => {
      if (filter === "ects" && !a.ectsRequests) return false;
      if (filter === "subsidy" && a.subsidyStatus === "none") return false;
      if (filter === "unregistered" && a.registered) return false;
      const q = query.toLowerCase();
      return !q || a.name.toLowerCase().includes(q) || (a.faculty ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => Number(Boolean(b.pendingRegistration)) - Number(Boolean(a.pendingRegistration)) || b.ectsRequests - a.ectsRequests || b.members - a.members);

  const goCredits = (associationId: string | null) => {
    setCreditFor(associationId);
    setView("creditos");
    setOpen(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Asociaciones"
        title="Asociaciones del campus"
        description={`${activeCount} asociaciones con actividad este mes, ${registered.length} registradas aquí con ${members.toLocaleString("es-ES")} socios. ${ectsRequests ? `${ectsRequests} solicitudes de créditos esperan validación.` : "Sin créditos por validar."}`}
        actions={
          view === "registro" ? (
            <Button variant="dark" onClick={() => setInviting(true)}>
              <Send className="h-4 w-4" /> Invitar asociación
            </Button>
          ) : view === "renovacion" && renewals.summary.notAsked.length ? (
            <Button variant="dark" onClick={renewals.request}>
              <RefreshCcw className="h-4 w-4" /> Pedir la renovación a {renewals.summary.missing.length}
            </Button>
          ) : null
        }
      >
        <Segmented<View>
          label="Qué quieres ver"
          value={view}
          onChange={(v) => {
            setView(v);
            if (v !== "creditos") setCreditFor(null);
          }}
          options={[
            { value: "registro", label: "Registro", count: all.length },
            { value: "renovacion", label: "Renovación", count: renewals.summary.missing.length },
            { value: "creditos", label: "Créditos", count: ectsRequests },
            { value: "actividades", label: "Actividades", count: extras.assocActivities.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Building2} label="Registradas" value={registered.length} hint={`${unregistered.length} piden entrar`} onClick={() => { setView("registro"); setFilter("unregistered"); }} />
        <Kpi icon={Stamp} label="Créditos por validar" value={ectsRequests} hint={eligible ? `${eligible} cumplen la asistencia` : `De ${withEcts.length} asociaciones`} emphasis={ectsRequests > 0} onClick={() => goCredits(null)} />
        <Kpi icon={Landmark} label="Subvenciones concedidas" value={money(granted, { round: true })} hint="Este curso" onClick={() => { setView("registro"); setFilter("subsidy"); }} />
        <Kpi icon={Users} label="Socios" value={members.toLocaleString("es-ES")} hint="En asociaciones registradas" />
      </KpiRow>

      {view === "creditos" ? (
        <CreditsView associationId={creditFor} onClearFilter={() => setCreditFor(null)} />
      ) : view === "actividades" ? (
        <ActivitiesView />
      ) : view === "renovacion" ? (
        <RenewalView onOpen={setOpen} />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented<Filter>
              label="Filtrar asociaciones"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Todas", count: all.length },
                { value: "ects", label: "Con créditos", count: withEcts.length },
                { value: "subsidy", label: "Con subvención", count: all.filter((a) => a.subsidyStatus !== "none").length },
                { value: "unregistered", label: "Sin registrar", count: unregistered.length },
              ]}
            />
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar asociación o facultad" className="lg:w-72" />
          </div>

          <Panel flush>
            {list.length ? (
              <ul className="divide-y divide-border-light">
                {list.map((a) => {
                  const missing = a.pendingRegistration && !a.registered ? missingDocs(a).length : 0;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(a.id)}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5"
                      >
                        <Avatar name={a.name} size="sm" tone={a.registered ? "violet" : "slate"} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 text-sm font-semibold">
                            <span className="truncate">{a.name}</span>
                            {a.registered ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Registrada" /> : null}
                          </span>
                          <span className="block truncate text-xs text-text-muted">
                            {a.faculty ?? "Campus"} · {a.members} socios · {a.activities} actividades
                            {a.lastActivityAt ? ` · última ${relative(a.lastActivityAt, now.getTime())}` : ""}
                          </span>
                        </span>
                        <span className="hidden shrink-0 flex-wrap justify-end gap-1.5 md:flex">
                          {a.pendingRegistration && !a.registered ? (
                            <Pill tone={missing ? "warning" : "violet"}>{missing ? `Faltan ${missing} documentos` : "Lista para registrar"}</Pill>
                          ) : null}
                          {a.ectsRequests ? <Pill tone="info">{a.ectsRequests} créditos</Pill> : null}
                          {a.registered ? <Pill tone={SUBSIDY[a.subsidyStatus].tone}>{SUBSIDY[a.subsidyStatus].label}</Pill> : null}
                        </span>
                        {a.ectsRequests || (a.pendingRegistration && !a.registered) ? (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-violet md:hidden" aria-label="Tiene algo pendiente" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                icon={Building2}
                title={all.length ? "Ninguna coincide" : "Aún no hay asociaciones conectadas"}
                body={all.length ? "Prueba con otro filtro o busca por nombre." : "Invita a las asociaciones del registro para gestionar créditos y subvenciones desde aquí."}
              />
            )}
          </Panel>

          <Tip title="Registro sin papeles">
            Cada asociación sube estatutos, acta, junta, socios y plan de actividades. Ves de un vistazo qué le falta, se lo pides con un toque y queda guardado cuándo lo pediste.
          </Tip>
        </>
      )}

      <AssociationDrawer id={open} onClose={() => setOpen(null)} onCredits={goCredits} />
      <InviteDrawer open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function AssociationDrawer({ id, onClose, onCredits }: { id: string | null; onClose: () => void; onCredits: (id: string) => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const a = (data.uniAssociations as UniAssociation[]).find((x) => x.id === id);
  if (!a) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Asociación">
        <span />
      </Drawer>
    );
  }
  const patch = (p: Partial<UniAssociation>, title: string, detail?: string) =>
    run("association.update", (d) => ({ ...d, uniAssociations: d.uniAssociations.map((x) => (x.id === a.id ? { ...x, ...p } : x)) }), title, detail);

  const pendingReg = Boolean(a.pendingRegistration && !a.registered);
  const docs = docsOf(a);
  const missing = docs.filter((d) => !d.ok);
  const toggleDoc = (key: string, ok: boolean) =>
    patch({ docs: docs.map((d) => ({ key: d.key, ok: d.key === key ? ok : d.ok })) }, ok ? "Documento recibido" : "Marcado como pendiente");

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={a.name}
      description={`${a.faculty ?? "Todo el campus"} · ${a.members} socios`}
      footer={
        pendingReg ? (
          <>
            {missing.length ? (
              <Button
                variant="outline"
                onClick={() =>
                  patch({ docsRequestedAt: now.toISOString() }, "Documentación pedida", `${a.name} recibe la lista: ${missing.map((d) => d.label.toLowerCase()).join(", ")}.`)
                }
              >
                Pedir lo que falta
              </Button>
            ) : null}
            <Button
              variant="dark"
              disabled={missing.length > 0}
              onClick={async () => {
                if (await patch({ registered: true, pendingRegistration: false }, "Asociación registrada", "Ya puede pedir créditos y subvenciones desde Franky.")) onClose();
              }}
            >
              <BadgeCheck className="h-4 w-4" /> Aceptar en el registro
            </Button>
          </>
        ) : a.ectsRequests ? (
          <Button variant="dark" onClick={() => onCredits(a.id)}>
            <Stamp className="h-4 w-4" /> Ver {a.ectsRequests} solicitudes de créditos
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {a.registered ? (
            <Pill tone="violet">
              <BadgeCheck className="h-3 w-3" /> Registrada
            </Pill>
          ) : (
            <Pill tone="warning">Sin registrar</Pill>
          )}
          {a.registered ? <Pill tone={SUBSIDY[a.subsidyStatus].tone}>{SUBSIDY[a.subsidyStatus].label}</Pill> : null}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Socios" value={a.members} />
          <Stat label="Actividades" value={a.activities} />
          <Stat label="Créditos" value={a.ectsRequests} />
        </div>

        {pendingReg ? (
          <section className="rounded-2xl border border-border p-4">
            <p className="font-heading text-sm font-bold">Documentación del registro</p>
            <p className="text-xs text-text-muted">
              {missing.length ? `Faltan ${missing.length} de ${REQUIRED_DOCS.length}.` : "Todo entregado: ya puedes aceptarla."}
              {a.docsRequestedAt ? ` Pedida ${relative(a.docsRequestedAt, now.getTime())}.` : ""}
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {docs.map((d) => (
                <li key={d.key}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-bg-secondary">
                    <input type="checkbox" checked={d.ok} onChange={(e) => toggleDoc(d.key, e.target.checked)} className="h-4 w-4 accent-violet" />
                    <span className={cn("flex-1 text-sm", d.ok ? "text-text-secondary" : "font-semibold")}>{d.label}</span>
                    <span className={cn("text-xs", d.ok ? "text-text-muted" : "text-amber-700 dark:text-amber-300")}>{d.ok ? "Recibido" : "Falta"}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="divide-y divide-border-light">
          <Detail label="Ámbito">{a.faculty ?? "Todo el campus"}</Detail>
          {a.lastActivityAt ? (
            <Detail label="Última actividad">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-text-muted" /> {relative(a.lastActivityAt, now.getTime())}
              </span>
            </Detail>
          ) : null}
          {a.subsidyCents ? <Detail label="Subvención">{money(a.subsidyCents, { round: true })}</Detail> : null}
        </div>

        <GovernanceSection a={a} />

        {a.registered && a.subsidyStatus === "submitted" ? (
          <Button variant="outline" onClick={() => patch({ subsidyStatus: "granted" }, "Subvención concedida", `${a.name} recibe el aviso.`)}>
            <Landmark className="h-4 w-4" /> Marcar subvención como concedida
          </Button>
        ) : null}
      </div>
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
      <p className="font-heading text-lg font-bold tabular">{value}</p>
      <p className="text-[0.7rem] text-text-muted">{label}</p>
    </div>
  );
}

function InviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [faculty, setFaculty] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setFaculty("");
  }, [open]);

  const valid = name.trim().length > 2 && /.+@.+\..+/.test(email);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Invitar asociación"
      description="Entra gratis en Franky y queda conectada con tu universidad."
      footer={
        <Button
          variant="dark"
          disabled={!valid}
          onClick={() => {
            toast.success("Invitación preparada", `${name.trim()} recibirá el enlace para crear su espacio.`);
            onClose();
          }}
        >
          <Send className="h-4 w-4" /> Enviar invitación
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Asociación" htmlFor="inv-name">
          <input id="inv-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Club de Fotografía" />
        </FormField>
        <FormField label="Correo de la junta" htmlFor="inv-email">
          <input id="inv-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="junta@asociacion.es" />
        </FormField>
        <FormField label="Facultad" htmlFor="inv-fac">
          <select id="inv-fac" className={inputClass} value={faculty} onChange={(e) => setFaculty(e.target.value)}>
            <option value="">Todo el campus</option>
            {FACULTIES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </FormField>
      </div>
    </Drawer>
  );
}
