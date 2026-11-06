"use client";

import * as React from "react";
import {
  CalendarRange,
  Copy,
  GraduationCap,
  Handshake,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCourtAgreement } from "@/lib/pro/courts-types";
import { addDays, durationLabel, localDate, money, plural } from "@/lib/pro/format";
import {
  AGREEMENT_KIND_LABEL,
  agreementMembers,
  agreementMonth,
  agreementReport,
  courseOf,
  monthName,
  removeAgreement,
  saveAgreement,
  toggleAgreementMember,
} from "@/lib/pro/courts-growth";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Pill,
  RowList,
  SearchInput,
  StepNav,
  Tip,
  inputClass,
} from "../../kit";
import { WhatsAppLink, firstName } from "./booking-ops";
import { CourtsNotReady, shortDate, useCourtsState } from "./state";

/**
 * Convenios con la universidad de al lado, asociaciones y empresas: sus
 * miembros reservan con el precio pactado y, a fin de mes, el responsable
 * recibe el resumen de lo que han jugado. Es la forma de convertir un
 * acuerdo de palabra en jugadores fijos todo el curso.
 */

type EditPreset = { agreement?: ProCourtAgreement } | null;

export default function ConveniosSection() {
  const { ready } = useCourtsState();
  const [edit, setEdit] = React.useState<EditPreset>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Convenios" title="Convenios" />
        <CourtsNotReady
          icon={Handshake}
          title="Firma tu primer convenio"
          body="Un precio pactado con la universidad o con una asociación llena tus mañanas con gente que vuelve cada semana."
        />
      </div>
    );
  return (
    <>
      <Convenios onEdit={setEdit} onOpen={setOpenId} />
      <AgreementDrawer
        agreementId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(a) => {
          setOpenId(null);
          setEdit({ agreement: a });
        }}
      />
      <EditDrawer preset={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function Convenios({
  onEdit,
  onOpen,
}: {
  onEdit: (p: EditPreset) => void;
  onOpen: (id: string) => void;
}) {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const month = today.slice(0, 7);
  const active = ops.agreements.filter((a) => a.active && a.to >= today);
  const rows = ops.agreements
    .map((a) => ({ a, m: agreementMonth(data, a, month), members: agreementMembers(data, a).length }))
    .sort((x, y) => Number(y.a.active) - Number(x.a.active) || y.m.bookings - x.m.bookings);
  const total = rows.reduce(
    (acc, r) => ({
      bookings: acc.bookings + r.m.bookings,
      amount: acc.amount + r.m.amountCents,
      saved: acc.saved + r.m.savedCents,
      members: acc.members + r.members,
    }),
    { bookings: 0, amount: 0, saved: 0, members: 0 },
  );

  const description = active.length
    ? `En ${monthName(month)}, ${plural(total.bookings, "reserva", "reservas")} con precio pactado y ${money(total.amount, { round: true })} de pista vendida.`
    : "Pacta un precio con la universidad de al lado o con una asociación y sus miembros reservan con él.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Convenios"
        title={active.length ? plural(active.length, "convenio en vigor", "convenios en vigor") : "Convenios"}
        description={description}
        actions={
          <Button variant="dark" onClick={() => onEdit({})}>
            <Plus className="h-4 w-4" /> Nuevo convenio
          </Button>
        }
      />

      {rows.length ? (
        <>
          <KpiRow>
            <Kpi label="En vigor" value={active.length} icon={Handshake} hint="universidades y asociaciones" />
            <Kpi label="Pueden reservar" value={total.members} icon={Users} hint="personas con precio pactado" />
            <Kpi label={`Reservas de ${monthName(month)}`} value={total.bookings} hint={money(total.amount, { round: true })} emphasis={total.bookings > 0} />
            <Kpi label="Ahorro para ellos" value={money(total.saved, { round: true })} hint="frente a la tarifa normal" />
          </KpiRow>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {rows.map(({ a, m, members }) => (
              <AgreementCard key={a.id} agreement={a} month={m} members={members} today={today} onOpen={() => onOpen(a.id)} />
            ))}
          </div>

          <Tip title="Cómo se aplica">
            Al reservar para alguien del convenio, el precio pactado sale solo. A fin de mes, abre el convenio y manda el
            resumen al responsable: es lo que hace que lo renueve el curso que viene.
          </Tip>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary">
          <Empty
            icon={Handshake}
            title="Tu primer convenio"
            body="La universidad de al lado, el club deportivo de una facultad o una empresa del barrio. Pones el descuento y las horas, y sus miembros reservan con él."
            action={
              <Button variant="dark" onClick={() => onEdit({})}>
                Crear convenio
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}

function scopeLabel(a: ProCourtAgreement): string {
  return `${a.discountPct} % ${a.valleyOnly ? "en mañanas valle" : "a cualquier hora"}`;
}

function AgreementCard({
  agreement: a,
  month: m,
  members,
  today,
  onOpen,
}: {
  agreement: ProCourtAgreement;
  month: ReturnType<typeof agreementMonth>;
  members: number;
  today: string;
  onOpen: () => void;
}) {
  const expired = a.to < today;
  const ending = !expired && a.to <= addDays(today, 30);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/20 sm:p-5"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-heading text-base font-bold">{a.name}</span>
          <span className="mt-0.5 block text-sm text-text-muted">{scopeLabel(a)}</span>
        </span>
        {!a.active ? (
          <Pill>En pausa</Pill>
        ) : expired ? (
          <Pill tone="warning">Terminado</Pill>
        ) : ending ? (
          <Pill tone="warning">Acaba el {shortDate(a.to)}</Pill>
        ) : (
          <Pill tone="violet">{AGREEMENT_KIND_LABEL[a.kind]}</Pill>
        )}
      </span>
      <span className="grid grid-cols-3 gap-2 rounded-xl bg-bg-secondary p-3">
        <Figure label="Reservas" value={String(m.bookings)} />
        <Figure label="Horas" value={durationLabel(m.minutes) || "0"} />
        <Figure label="Personas" value={`${m.players.length} de ${members}`} />
      </span>
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        {a.university ? (
          <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.9} />
        ) : (
          <Users className="h-3.5 w-3.5" strokeWidth={1.9} />
        )}
        {a.university
          ? `Estudiantes verificados de la ${a.university.replace("Universidad", "universidad")}`
          : plural(a.memberIds.length, "persona apuntada", "personas apuntadas")}
        {a.contact.name ? ` · ${a.contact.name}` : ""}
      </span>
    </button>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[0.7rem] font-medium text-text-muted">{label}</span>
      <span className="block truncate font-heading text-lg font-extrabold tabular">{value}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha del convenio: resumen del mes y miembros                      */
/* ------------------------------------------------------------------ */

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function AgreementDrawer({
  agreementId,
  onClose,
  onEdit,
}: {
  agreementId: string | null;
  onClose: () => void;
  onEdit: (a: ProCourtAgreement) => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [query, setQuery] = React.useState("");
  const agreement = ops.agreements.find((a) => a.id === agreementId) ?? null;

  React.useEffect(() => {
    // A primeros de mes, lo útil es el resumen del mes que acaba de cerrar.
    const day = Number(today.slice(8));
    setMonth(day <= 5 ? monthShift(today.slice(0, 7), -1) : today.slice(0, 7));
    setQuery("");
  }, [agreementId, today]);

  if (!agreement) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const m = agreementMonth(data, agreement, month);
  const report = agreementReport(agreement, month, m, data.space.name);
  const members = agreementMembers(data, agreement);
  const q = query.trim().toLowerCase();
  const candidates =
    !agreement.university && q.length >= 2
      ? data.clients
          .filter((c) => c.name.toLowerCase().includes(q) && !agreement.memberIds.includes(c.id))
          .slice(0, 5)
      : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Resumen copiado", "Pégalo en un correo o en WhatsApp.");
    } catch {
      toast.error("No se ha podido copiar", "Selecciona el texto y cópialo a mano.");
    }
  };

  const toggle = (clientId: string, name: string, adding: boolean) => {
    update("court.agreement.member", (d) => toggleAgreementMember(d, agreement.id, clientId));
    toast.success(
      adding ? "Apuntado al convenio" : "Quitado del convenio",
      adding ? `${firstName(name)} ya reserva con el precio pactado.` : undefined,
    );
    setQuery("");
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      wide
      title={agreement.name}
      description={`${scopeLabel(agreement)}, hasta el ${shortDate(agreement.to)}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onEdit(agreement)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" onClick={copy}>
            <Copy className="h-4 w-4" /> Copiar resumen
          </Button>
          <WhatsAppLink
            phone={agreement.contact.phone}
            label={`Enviar a ${firstName(agreement.contact.name)}`}
            message={report}
            className="min-h-10"
          />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <StepNav
          label={`${monthName(month)} de ${month.slice(0, 4)}`}
          onPrev={() => setMonth(monthShift(month, -1))}
          onNext={() => setMonth(monthShift(month, 1))}
          onToday={() => setMonth(today.slice(0, 7))}
          isToday={month === today.slice(0, 7)}
        />

        <div className="grid grid-cols-2 gap-2.5">
          <Kpi label="Reservas" value={m.bookings} hint={durationLabel(m.minutes) || "sin horas"} />
          <Kpi label="Pista vendida" value={money(m.amountCents, { round: true })} hint={`${money(m.savedCents, { round: true })} de ahorro para ellos`} />
        </div>

        <div className="rounded-2xl bg-bg-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Resumen para {agreement.contact.name}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{report}</p>
        </div>

        {m.players.length ? (
          <div>
            <p className="text-[0.82rem] font-semibold">Quién ha jugado</p>
            <RowList className="mt-2 rounded-2xl border border-border">
              {m.players.slice(0, 12).map((p) => (
                <div key={p.clientId} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <Avatar name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="text-sm text-text-muted tabular">{plural(p.bookings, "reserva", "reservas")}</span>
                </div>
              ))}
            </RowList>
          </div>
        ) : null}

        <div>
          <p className="text-[0.82rem] font-semibold">
            {agreement.university ? "Quién puede reservar" : `Apuntados (${members.length})`}
          </p>
          {agreement.university ? (
            <p className="mt-1 text-sm text-text-muted">
              Cualquier estudiante verificado de la {agreement.university.replace("Universidad", "universidad")}. Ahora
              mismo {plural(members.length, "jugador de tu club lo es", "jugadores de tu club lo son")}.
            </p>
          ) : (
            <>
              <SearchInput value={query} onChange={setQuery} placeholder="Apuntar a alguien por su nombre" className="mt-2" />
              {candidates.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id, c.name, true)}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.9} /> {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {members.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {members.map((c) => (
                    <span key={c.id} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-bg-secondary pl-3 text-xs font-semibold">
                      {c.name}
                      <button
                        type="button"
                        aria-label={`Quitar a ${c.name}`}
                        onClick={() => toggle(c.id, c.name, false)}
                        className="inline-flex h-10 w-9 items-center justify-center rounded-full text-text-muted hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-text-muted">Apunta a los socios que te pase el responsable.</p>
              )}
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Crear o editar                                                      */
/* ------------------------------------------------------------------ */

const DISCOUNTS = [10, 15, 20, 25, 30];

function EditDrawer({ preset, onClose }: { preset: EditPreset; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const existing = preset?.agreement;
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ProCourtAgreement["kind"]>("university");
  const [university, setUniversity] = React.useState("");
  const [discount, setDiscount] = React.useState(20);
  const [valleyOnly, setValleyOnly] = React.useState(true);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [contact, setContact] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [active, setActive] = React.useState(true);

  // Universidades que ya tienen estudiantes verificados en el club, primero la que más.
  const universities = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const c of data.clients)
      if (c.student?.verified) count.set(c.student.university, (count.get(c.student.university) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([u, n]) => ({ u, n }));
  }, [data.clients]);

  React.useEffect(() => {
    if (!preset) return;
    const endOfCourse = `${Number(courseOf(today).slice(0, 4)) + 1}-06-30`;
    setName(existing?.name ?? "");
    setKind(existing?.kind ?? "university");
    setUniversity(existing?.university ?? universities[0]?.u ?? "");
    setDiscount(existing?.discountPct ?? 20);
    setValleyOnly(existing?.valleyOnly ?? true);
    setFrom(existing?.from ?? today);
    setTo(existing?.to ?? endOfCourse);
    setContact(existing?.contact.name ?? "");
    setPhone(existing?.contact.phone ?? "");
    setActive(existing?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const valid = name.trim().length >= 3 && contact.trim().length >= 2 && to >= from && (kind !== "university" || university);

  const save = () => {
    if (!valid) return;
    const agreement: ProCourtAgreement = {
      id: existing?.id ?? localId("cv"),
      name: name.trim(),
      kind,
      university: kind === "university" ? university : undefined,
      memberIds: existing?.memberIds ?? [],
      discountPct: discount,
      valleyOnly,
      from,
      to,
      contact: { name: contact.trim(), phone: phone.trim() || undefined },
      active,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    update("court.agreement.save", (d) => saveAgreement(d, agreement));
    toast.success(existing ? "Convenio guardado" : "Convenio creado", `${scopeLabel(agreement)} para ${agreement.name}.`);
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    update("court.agreement.remove", (d) => removeAgreement(d, existing.id));
    toast.success("Convenio borrado", "Las reservas ya hechas no cambian de precio.");
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={existing ? "Editar convenio" : "Nuevo convenio"}
      description="Sus miembros reservan con este descuento sin que tengas que acordarte."
      footer={
        <>
          {existing ? (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>
              Borrar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            {existing ? "Guardar" : "Crear convenio"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Con quién">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(["university", "association", "company"] as const).map((k) => ({
              value: k,
              label: AGREEMENT_KIND_LABEL[k],
            }))}
          />
        </FormField>
        <FormField label="Nombre del convenio" htmlFor="cv-name">
          <input
            id="cv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "university" ? "Deportes UA" : kind === "association" ? "Club Deportivo Politécnica" : "Plantilla de la empresa"}
            className={inputClass}
          />
        </FormField>
        {kind === "university" ? (
          <FormField label="Universidad" hint="Entra cualquier estudiante verificado de esa universidad, sin apuntarlo a mano.">
            {universities.length ? (
              <ChoiceChips
                value={university}
                onChange={setUniversity}
                options={universities.map(({ u, n }) => ({ value: u, label: u, hint: plural(n, "jugador tuyo", "jugadores tuyos") }))}
              />
            ) : (
              <input value={university} onChange={(e) => setUniversity(e.target.value)} placeholder="Universidad de Alicante" className={inputClass} />
            )}
          </FormField>
        ) : null}
        <FormField label="Descuento">
          <ChoiceChips
            value={String(discount)}
            onChange={(v) => setDiscount(Number(v))}
            options={DISCOUNTS.map((d) => ({ value: String(d), label: `${d} %` }))}
          />
        </FormField>
        <FormField label="Cuándo vale">
          <ChoiceChips
            value={valleyOnly ? "valle" : "todo"}
            onChange={(v) => setValleyOnly(v === "valle")}
            options={[
              { value: "valle", label: "Mañanas valle", hint: "De 10 a 14 h entre semana" },
              { value: "todo", label: "A cualquier hora" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde" htmlFor="cv-from">
            <input id="cv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta" htmlFor="cv-to">
            <input id="cv-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Responsable" htmlFor="cv-contact">
            <input id="cv-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Nombre" className={inputClass} />
          </FormField>
          <FormField label="Su móvil" htmlFor="cv-phone" hint="Para mandarle el resumen del mes.">
            <input id="cv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="600 000 000" className={inputClass} />
          </FormField>
        </div>
        {existing ? (
          <label className="flex min-h-10 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
            En vigor (quítalo para pausarlo sin borrarlo)
          </label>
        ) : null}
        <p className="flex items-start gap-2 text-sm text-text-muted">
          {valleyOnly ? <Sun className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} /> : <CalendarRange className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />}
          {valleyOnly
            ? "Solo en mañanas valle: llenas las horas que hoy pierdes sin tocar el precio de la tarde."
            : "A cualquier hora: útil para asociaciones pequeñas o empresas con horario fijo."}
        </p>
      </div>
    </Drawer>
  );
}
