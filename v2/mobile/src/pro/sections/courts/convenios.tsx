import React from "react";
import { Share, View } from "react-native";
import { GraduationCap, Handshake, Plus, Share2, Users, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S, SHADOW } from "@/theme";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProCourtAgreement } from "../../../../../shared/pro/courts-types";
import { durationLabel, localDate, money, plural, shortDay } from "../../../../../shared/pro/format";
import { courtsOps } from "../../../../../shared/pro/courts-base";
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
} from "../../../../../shared/pro/courts-growth";
import { ChoiceGrid, Empty, Field, Input, Kpi, KpiRow, PButton, PText, PageHeader, Panel, Pill, SearchInput, Sheet, StepNav, Tip, Toggle } from "../../kit";
import { WhatsAppButton, firstName } from "./booking-ops";

/**
 * Convenios con universidades, asociaciones y empresas (versión nativa de
 * web courts/convenios.tsx): sus miembros reservan con el precio pactado y a
 * fin de mes el responsable recibe el resumen.
 */

type EditPreset = { agreement?: ProCourtAgreement } | null;

function day(date: string) {
  return shortDay(`${date}T12:00:00Z`).replace(/\./g, "");
}

function scopeLabel(a: ProCourtAgreement): string {
  return `${a.discountPct} % ${a.valleyOnly ? "en mañanas valle" : "a cualquier hora"}`;
}

function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function Convenios() {
  const { data, now, demo } = usePro();
  const [edit, setEdit] = React.useState<EditPreset>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const today = localDate(now);
  const month = today.slice(0, 7);
  const ready = demo || Boolean(data.courts);
  const ops = courtsOps(data);
  const active = ops.agreements.filter((a) => a.active && a.to >= today);
  const rows = ops.agreements
    .map((a) => ({ a, m: agreementMonth(data, a, month), members: agreementMembers(data, a).length }))
    .sort((x, y) => Number(y.a.active) - Number(x.a.active) || y.m.bookings - x.m.bookings);
  const bookings = rows.reduce((acc, r) => acc + r.m.bookings, 0);
  const amount = rows.reduce((acc, r) => acc + r.m.amountCents, 0);
  const saved = rows.reduce((acc, r) => acc + r.m.savedCents, 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Convenios"
        title={active.length ? plural(active.length, "convenio en vigor", "convenios en vigor") : "Convenios"}
        description={
          active.length
            ? `En ${monthName(month)}, ${plural(bookings, "reserva", "reservas")} con precio pactado y ${money(amount, { round: true })} de pista vendida.`
            : "Pacta un precio con la universidad de al lado o con una asociación y sus miembros reservan con él."
        }
        actions={ready ? <PButton label="Nuevo convenio" icon={Plus} onPress={() => setEdit({})} /> : null}
      />
      {!ready ? (
        <Panel>
          <Empty icon={Handshake} title="Firma tu primer convenio" body="Un precio pactado con la universidad o con una asociación llena tus mañanas con gente que vuelve cada semana." />
        </Panel>
      ) : rows.length ? (
        <>
          <KpiRow>
            <Kpi label={`Reservas de ${monthName(month)}`} value={bookings} hint={money(amount, { round: true })} emphasis={bookings > 0} />
            <Kpi label="Ahorro para ellos" value={money(saved, { round: true })} hint="frente a la tarifa normal" />
          </KpiRow>
          {rows.map(({ a, m, members }) => (
            <Tap
              key={a.id}
              onPress={() => setOpenId(a.id)}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}, ${scopeLabel(a)}`}
              style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.md, marginBottom: S.md, ...SHADOW.card }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
                <View style={{ flex: 1 }}>
                  <PText v="h2" numberOfLines={1}>{a.name}</PText>
                  <PText v="small">{scopeLabel(a)}</PText>
                </View>
                {!a.active ? <Pill label="En pausa" /> : a.to < today ? <Pill tone="warning" label="Terminado" /> : <Pill tone="violet" label={AGREEMENT_KIND_LABEL[a.kind]} />}
              </View>
              <View style={{ flexDirection: "row", gap: S.md, borderRadius: R.md, backgroundColor: C.input, padding: S.md }}>
                <Figure label="Reservas" value={String(m.bookings)} />
                <Figure label="Horas" value={durationLabel(m.minutes) || "0"} />
                <Figure label="Personas" value={`${m.players.length} de ${members}`} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {a.university ? <GraduationCap size={14} color={C.muted} /> : <Users size={14} color={C.muted} />}
                <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>
                  {`${a.university ? `Estudiantes verificados de la ${a.university.replace("Universidad", "universidad")}` : plural(a.memberIds.length, "persona apuntada", "personas apuntadas")} · ${a.contact.name}`}
                </PText>
              </View>
            </Tap>
          ))}
          <Tip title="Cómo se aplica">
            Al reservar para alguien del convenio, el precio pactado sale solo. A fin de mes, abre el convenio y manda el resumen al responsable.
          </Tip>
        </>
      ) : (
        <Panel>
          <Empty
            icon={Handshake}
            title="Tu primer convenio"
            body="La universidad de al lado, el club deportivo de una facultad o una empresa del barrio. Pones el descuento y las horas, y sus miembros reservan con él."
            action={<PButton label="Crear convenio" onPress={() => setEdit({})} />}
          />
        </Panel>
      )}
      <AgreementSheet
        agreementId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(a) => {
          setOpenId(null);
          setEdit({ agreement: a });
        }}
      />
      <EditSheet preset={edit} onClose={() => setEdit(null)} />
    </ProPage>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <PText v="tiny">{label}</PText>
      <PText v="h3" numberOfLines={1}>{value}</PText>
    </View>
  );
}

function AgreementSheet({ agreementId, onClose, onEdit }: { agreementId: string | null; onClose: () => void; onEdit: (a: ProCourtAgreement) => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [query, setQuery] = React.useState("");
  const agreement = courtsOps(data).agreements.find((a) => a.id === agreementId) ?? null;

  React.useEffect(() => {
    // A primeros de mes, lo útil es el resumen del mes que acaba de cerrar.
    setMonth(Number(today.slice(8)) <= 5 ? monthShift(today.slice(0, 7), -1) : today.slice(0, 7));
    setQuery("");
  }, [agreementId, today]);

  if (!agreement) return null;
  const m = agreementMonth(data, agreement, month);
  const report = agreementReport(agreement, month, m, data.space.name);
  const members = agreementMembers(data, agreement);
  const q = query.trim().toLowerCase();
  const candidates = !agreement.university && q.length >= 2 ? data.clients.filter((c) => c.name.toLowerCase().includes(q) && !agreement.memberIds.includes(c.id)).slice(0, 5) : [];

  const toggle = (clientId: string, name: string, adding: boolean) => {
    void update("court.agreement.member", (d) => toggleAgreementMember(d, agreement.id, clientId));
    toast(adding ? "Apuntado al convenio" : "Quitado del convenio", { kind: "success", body: adding ? `${firstName(name)} ya reserva con el precio pactado.` : undefined });
    setQuery("");
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={agreement.name}
      description={`${scopeLabel(agreement)}, hasta el ${day(agreement.to)}.`}
      footer={
        <>
          <PButton label="Editar" variant="ghost" onPress={() => onEdit(agreement)} />
          <PButton label="Compartir" icon={Share2} variant="outline" onPress={() => void Share.share({ message: report })} />
          <WhatsAppButton phone={agreement.contact.phone} label={`Enviar a ${firstName(agreement.contact.name)}`} message={report} />
        </>
      }
    >
      <StepNav
        label={`${monthName(month)} de ${month.slice(0, 4)}`}
        onPrev={() => setMonth(monthShift(month, -1))}
        onNext={() => setMonth(monthShift(month, 1))}
        onToday={() => setMonth(today.slice(0, 7))}
        isToday={month === today.slice(0, 7)}
      />
      <KpiRow>
        <Kpi label="Reservas" value={m.bookings} hint={durationLabel(m.minutes) || "sin horas"} />
        <Kpi label="Pista vendida" value={money(m.amountCents, { round: true })} hint={`${money(m.savedCents, { round: true })} de ahorro`} />
      </KpiRow>
      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 6 }}>
        <PText v="label">{`Resumen para ${agreement.contact.name}`}</PText>
        <PText v="small" color={C.text}>{report}</PText>
      </View>
      <Field label={agreement.university ? "Quién puede reservar" : `Apuntados (${members.length})`}>
        {agreement.university ? (
          <PText v="small">
            {`Cualquier estudiante verificado de la ${agreement.university.replace("Universidad", "universidad")}. Ahora mismo ${plural(members.length, "jugador de tu club lo es", "jugadores de tu club lo son")}.`}
          </PText>
        ) : (
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Apuntar a alguien por su nombre" />
            {candidates.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {candidates.map((c) => (
                  <PButton key={c.id} label={c.name} icon={Plus} small variant="outline" onPress={() => toggle(c.id, c.name, true)} />
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {members.map((c) => (
                <Tap
                  key={c.id}
                  onPress={() => toggle(c.id, c.name, false)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar a ${c.name}`}
                  style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, backgroundColor: C.input }}
                >
                  <PText v="small" color={C.text}>{c.name}</PText>
                  <X size={13} color={C.muted} />
                </Tap>
              ))}
            </View>
          </>
        )}
      </Field>
    </Sheet>
  );
}

const DISCOUNTS = [10, 15, 20, 25, 30];

function EditSheet({ preset, onClose }: { preset: EditPreset; onClose: () => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const existing = preset?.agreement;
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<ProCourtAgreement["kind"]>("university");
  const [university, setUniversity] = React.useState("");
  const [discount, setDiscount] = React.useState(20);
  const [valleyOnly, setValleyOnly] = React.useState(true);
  const [contact, setContact] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [active, setActive] = React.useState(true);

  const universities = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const c of data.clients) if (c.student?.verified) count.set(c.student.university, (count.get(c.student.university) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  }, [data.clients]);

  React.useEffect(() => {
    if (!preset) return;
    setName(existing?.name ?? "");
    setKind(existing?.kind ?? "university");
    setUniversity(existing?.university ?? universities[0] ?? "");
    setDiscount(existing?.discountPct ?? 20);
    setValleyOnly(existing?.valleyOnly ?? true);
    setContact(existing?.contact.name ?? "");
    setPhone(existing?.contact.phone ?? "");
    setActive(existing?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const valid = name.trim().length >= 3 && contact.trim().length >= 2 && (kind !== "university" || Boolean(university));

  const save = () => {
    if (!valid) return;
    // Vigencia: del día de hoy al final del curso (se cambia en la web si hace falta).
    const agreement: ProCourtAgreement = {
      id: existing?.id ?? localId("cv"),
      name: name.trim(),
      kind,
      university: kind === "university" ? university : undefined,
      memberIds: existing?.memberIds ?? [],
      discountPct: discount,
      valleyOnly,
      from: existing?.from ?? today,
      to: existing?.to ?? `${Number(courseOf(today).slice(0, 4)) + 1}-06-30`,
      contact: { name: contact.trim(), phone: phone.trim() || undefined },
      active,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    void update("court.agreement.save", (d) => saveAgreement(d, agreement));
    toast(existing ? "Convenio guardado" : "Convenio creado", { kind: "success", body: `${scopeLabel(agreement)} para ${agreement.name}.` });
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    void update("court.agreement.remove", (d) => removeAgreement(d, existing.id));
    toast("Convenio borrado", { kind: "success", body: "Las reservas ya hechas no cambian de precio." });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={existing ? "Editar convenio" : "Nuevo convenio"}
      description="Sus miembros reservan con este descuento sin que tengas que acordarte."
      footer={
        <>
          {existing ? <PButton label="Borrar" variant="ghost" onPress={remove} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={existing ? "Guardar" : "Crear convenio"} onPress={save} disabled={!valid} />
        </>
      }
    >
      <Field label="Con quién">
        <ChoiceGrid value={kind} onChange={setKind} options={(["university", "association", "company"] as const).map((k) => ({ value: k, label: AGREEMENT_KIND_LABEL[k] }))} />
      </Field>
      <Field label="Nombre del convenio">
        <Input value={name} onChangeText={setName} placeholder={kind === "university" ? "Deportes UA" : "Club Deportivo Politécnica"} label="Nombre del convenio" />
      </Field>
      {kind === "university" ? (
        <Field label="Universidad" hint="Entra cualquier estudiante verificado de esa universidad.">
          {universities.length ? (
            <ChoiceGrid value={university} onChange={setUniversity} options={universities.map((u) => ({ value: u, label: u }))} />
          ) : (
            <Input value={university} onChangeText={setUniversity} placeholder="Universidad de Alicante" label="Universidad" />
          )}
        </Field>
      ) : null}
      <Field label="Descuento">
        <ChoiceGrid value={String(discount)} onChange={(v) => setDiscount(Number(v))} options={DISCOUNTS.map((d) => ({ value: String(d), label: `${d} %` }))} />
      </Field>
      <Field label="Cuándo vale">
        <ChoiceGrid
          value={valleyOnly ? "valle" : "todo"}
          onChange={(v) => setValleyOnly(v === "valle")}
          options={[
            { value: "valle", label: "Mañanas valle", hint: "De 10 a 14 h entre semana" },
            { value: "todo", label: "A cualquier hora" },
          ]}
        />
      </Field>
      <Field label="Responsable">
        <Input value={contact} onChangeText={setContact} placeholder="Nombre" label="Responsable" />
      </Field>
      <Field label="Su móvil" hint="Para mandarle el resumen del mes.">
        <Input value={phone} onChangeText={setPhone} placeholder="600 000 000" keyboardType="phone-pad" label="Móvil del responsable" />
      </Field>
      {existing ? <Toggle label="En vigor" detail="Quítalo para pausarlo sin borrarlo." value={active} onChange={setActive} /> : null}
    </Sheet>
  );
}
