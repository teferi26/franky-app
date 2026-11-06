import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, Building2, CalendarDays, Check, Landmark, Send, Stamp, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, S } from "@/theme";
import type { ProUniAssociation } from "../../../../../shared/pro/types";
import { money, relative } from "../../../../../shared/pro/format";
import { REQUIRED_DOCS, docsOf, missingDocs, pendingCreditGroups, uniExtrasOf } from "../../../../../shared/pro/university";
import { renewalSummary } from "../../../../../shared/pro/university-renewal";
import type { UniAssociation } from "../../../../../shared/pro/university-types";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, SearchInput, Segmented, Sheet, Tip } from "../../kit";
import { CreditsView, GovernanceSection, RenewalView } from "./asociaciones-parts";
import { ActivitiesView } from "./asociaciones-actividades";
import { Stat, facultyOptions, useUniAction } from "./ui";

type ViewKey = "registro" | "renovacion" | "creditos" | "actividades";
type Filter = "all" | "ects" | "subsidy" | "unregistered";

const SUBSIDY: Record<ProUniAssociation["subsidyStatus"], { label: string; tone: "neutral" | "info" | "success" }> = {
  none: { label: "Sin subvención", tone: "neutral" },
  submitted: { label: "Subvención pedida", tone: "info" },
  granted: { label: "Subvención concedida", tone: "success" },
};

/** Más allá de esta cifra se muestra "Ver más" en lugar de pintar toda la lista. */
const PAGE = 40;

export default function UniversityAsociaciones() {
  const { data, now } = usePro();
  const [view, setView] = React.useState<ViewKey>("registro");
  const [creditFor, setCreditFor] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [inviting, setInviting] = React.useState(false);
  const [limit, setLimit] = React.useState(PAGE);

  React.useEffect(() => setLimit(PAGE), [filter, query]);

  const all = data.uniAssociations as UniAssociation[];
  const registered = all.filter((a) => a.registered);
  const withEcts = all.filter((a) => a.ectsRequests > 0);
  const ectsRequests = withEcts.reduce((a, x) => a + x.ectsRequests, 0);
  const unregistered = all.filter((a) => !a.registered);
  const members = registered.reduce((a, x) => a + x.members, 0);
  const granted = all.filter((a) => a.subsidyStatus === "granted").reduce((a, x) => a + (x.subsidyCents ?? 0), 0);
  const activeCount = data.uniMetrics.find((m) => m.key === "associations")?.value ?? registered.length;
  const eligible = pendingCreditGroups(uniExtrasOf(data).credits, all).reduce((a, g) => a + g.eligible, 0);
  const renewals = renewalSummary(all, now);
  const goCredits = (associationId: string | null) => {
    setCreditFor(associationId);
    setView("creditos");
    setOpen(null);
  };
  const goRegistry = (f: Filter) => {
    setView("registro");
    setFilter(f);
  };

  const list = all
    .filter((a) => {
      if (filter === "ects" && !a.ectsRequests) return false;
      if (filter === "subsidy" && a.subsidyStatus === "none") return false;
      if (filter === "unregistered" && a.registered) return false;
      return !query || a.name.toLowerCase().includes(query.toLowerCase()) || (a.faculty ?? "").toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => Number(Boolean(b.pendingRegistration)) - Number(Boolean(a.pendingRegistration)) || b.ectsRequests - a.ectsRequests || b.members - a.members);
  const visible = list.slice(0, limit);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Asociaciones"
        title="Asociaciones del campus"
        description={`${activeCount} asociaciones con actividad este mes, ${registered.length} registradas aquí con ${members.toLocaleString("es-ES")} socios. ${ectsRequests ? `${ectsRequests} solicitudes de créditos esperan validación.` : "Sin créditos por validar."}`}
        actions={view === "registro" ? <PButton label="Invitar asociación" icon={Send} onPress={() => setInviting(true)} /> : null}
      >
        <Segmented<ViewKey>
          value={view}
          onChange={(v) => {
            setView(v);
            if (v !== "creditos") setCreditFor(null);
          }}
          options={[
            { value: "registro", label: "Registro", count: all.length },
            { value: "renovacion", label: "Renovación", count: renewals.missing.length },
            { value: "creditos", label: "Créditos", count: ectsRequests },
            { value: "actividades", label: "Actividades", count: uniExtrasOf(data).assocActivities.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Building2} label="Registradas" value={registered.length} hint={`${unregistered.length} piden entrar`} onPress={() => goRegistry("unregistered")} />
        <Kpi icon={Stamp} label="Créditos por validar" value={ectsRequests} hint={eligible ? `${eligible} cumplen la asistencia` : `De ${withEcts.length} asociaciones`} emphasis={ectsRequests > 0} onPress={() => goCredits(null)} />
        <Kpi icon={Landmark} label="Subvenciones concedidas" value={money(granted, { round: true })} hint="Este curso" onPress={() => goRegistry("subsidy")} />
        <Kpi icon={Users} label="Socios" value={members.toLocaleString("es-ES")} hint="En asociaciones registradas" />
      </KpiRow>

      {view === "creditos" ? <CreditsView associationId={creditFor} onClearFilter={() => setCreditFor(null)} /> : null}
      {view === "renovacion" ? <RenewalView onOpen={setOpen} /> : null}
      {view === "actividades" ? <ActivitiesView /> : null}
      {view === "registro" ? (
        <RegistryList
          all={all}
          list={list}
          visible={visible}
          filter={filter}
          setFilter={setFilter}
          query={query}
          setQuery={setQuery}
          onOpen={setOpen}
          onMore={() => setLimit((n) => n + PAGE)}
        />
      ) : null}

      <AssociationSheet id={open} onClose={() => setOpen(null)} onCredits={goCredits} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </ProPage>
  );
}

/** Lista del registro con filtros y buscador. */
function RegistryList({
  all,
  list,
  visible,
  filter,
  setFilter,
  query,
  setQuery,
  onOpen,
  onMore,
}: {
  all: UniAssociation[];
  list: UniAssociation[];
  visible: UniAssociation[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  query: string;
  setQuery: (q: string) => void;
  onOpen: (id: string) => void;
  onMore: () => void;
}) {
  const { now } = usePro();
  const withEcts = all.filter((a) => a.ectsRequests > 0);
  const unregistered = all.filter((a) => !a.registered);
  return (
    <>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas", count: all.length },
          { value: "ects", label: "Con créditos", count: withEcts.length },
          { value: "subsidy", label: "Con subvención", count: all.filter((a) => a.subsidyStatus !== "none").length },
          { value: "unregistered", label: "Sin registrar", count: unregistered.length },
        ]}
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Buscar asociación o facultad" />

      <Panel flush>
        {list.length ? (
          <>
            {visible.map((a, i) => (
              <ListRow key={a.id} onPress={() => onOpen(a.id)} accessibilityLabel={a.name} last={i === visible.length - 1 && visible.length === list.length}>
                <PAvatar name={a.name} size={34} toneKey={a.registered ? "violet" : "slate"} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{a.name}</PText>
                    {a.registered ? <BadgeCheck size={14} color={C.blue} /> : null}
                  </View>
                  <PText v="tiny" numberOfLines={2}>
                    {`${a.faculty ?? "Campus"} · ${a.members} socios · ${a.activities} actividades${a.lastActivityAt ? ` · última ${relative(a.lastActivityAt, now.getTime())}` : ""}`}
                  </PText>
                  {(a.pendingRegistration && !a.registered) || a.ectsRequests || a.registered ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {a.pendingRegistration && !a.registered ? (
                        <Pill tone={missingDocs(a).length ? "warning" : "violet"} label={missingDocs(a).length ? `Faltan ${missingDocs(a).length} documentos` : "Lista para registrar"} />
                      ) : null}
                      {a.ectsRequests ? <Pill tone="info" label={`${a.ectsRequests} créditos`} /> : null}
                      {a.registered ? <Pill tone={SUBSIDY[a.subsidyStatus].tone} label={SUBSIDY[a.subsidyStatus].label} /> : null}
                    </View>
                  ) : null}
                </View>
              </ListRow>
            ))}
            {list.length > visible.length ? (
              <View style={{ padding: S.md, alignItems: "center" }}>
                <PButton label={`Ver más (${list.length - visible.length})`} variant="ghost" small onPress={onMore} />
              </View>
            ) : null}
          </>
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
  );
}

function AssociationSheet({ id, onClose, onCredits }: { id: string | null; onClose: () => void; onCredits: (id: string) => void }) {
  const { data, now, pending } = usePro();
  const run = useUniAction();
  const a = (data.uniAssociations as UniAssociation[]).find((x) => x.id === id);
  if (!a) return null;
  const patch = (p: Partial<UniAssociation>, title: string, detail?: string) =>
    run("association.update", (d) => ({ ...d, uniAssociations: d.uniAssociations.map((x) => (x.id === a.id ? { ...x, ...p } : x)) }), title, detail);

  const pendingReg = Boolean(a.pendingRegistration && !a.registered);
  const docs = docsOf(a);
  const missing = docs.filter((d) => !d.ok);
  const toggleDoc = (key: string, ok: boolean) =>
    void patch({ docs: docs.map((d) => ({ key: d.key, ok: d.key === key ? ok : d.ok })) }, ok ? "Documento recibido" : "Marcado como pendiente");

  const footer = pendingReg ? (
    <>
      {missing.length ? (
        <PButton
          label="Pedir lo que falta"
          variant="outline"
          disabled={pending}
          onPress={() => void patch({ docsRequestedAt: now.toISOString() }, "Documentación pedida", `${a.name} recibe la lista: ${missing.map((d) => d.label.toLowerCase()).join(", ")}.`)}
        />
      ) : null}
      <PButton
        label="Aceptar en el registro"
        icon={BadgeCheck}
        disabled={pending || missing.length > 0}
        onPress={async () => {
          if (await patch({ registered: true, pendingRegistration: false }, "Asociación registrada", "Ya puede pedir créditos y subvenciones desde Franky.")) onClose();
        }}
      />
    </>
  ) : a.ectsRequests ? (
    <PButton label={`Ver ${a.ectsRequests} solicitudes de créditos`} icon={Stamp} onPress={() => onCredits(a.id)} />
  ) : undefined;

  return (
    <Sheet open={Boolean(id)} onClose={onClose} title={a.name} description={`${a.faculty ?? "Todo el campus"} · ${a.members} socios`} footer={footer}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {a.registered ? <Pill tone="violet" icon={BadgeCheck} label="Registrada" /> : <Pill tone="warning" label="Sin registrar" />}
        {a.registered ? <Pill tone={SUBSIDY[a.subsidyStatus].tone} label={SUBSIDY[a.subsidyStatus].label} /> : null}
      </View>

      <View style={{ flexDirection: "row", gap: S.sm }}>
        <Stat label="Socios" value={a.members} />
        <Stat label="Actividades" value={a.activities} />
        <Stat label="Créditos" value={a.ectsRequests} />
      </View>

      {pendingReg ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
          <PText v="h3">Documentación del registro</PText>
          <PText v="tiny">
            {`${missing.length ? `Faltan ${missing.length} de ${REQUIRED_DOCS.length}.` : "Todo entregado: ya puedes aceptarla."}${a.docsRequestedAt ? ` Pedida ${relative(a.docsRequestedAt, now.getTime())}.` : ""}`}
          </PText>
          {docs.map((d) => (
            <Tap
              key={d.key}
              onPress={() => toggleDoc(d.key, !d.ok)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: d.ok }}
              accessibilityLabel={d.label}
              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: S.sm }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: d.ok ? C.blue : C.border, backgroundColor: d.ok ? C.blue : C.surface, alignItems: "center", justifyContent: "center" }}>
                {d.ok ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
              <PText v="small" color={d.ok ? C.muted : C.text} style={{ flex: 1 }}>{d.label}</PText>
              <PText v="tiny" color={d.ok ? C.muted : C.warning}>{d.ok ? "Recibido" : "Falta"}</PText>
            </Tap>
          ))}
        </View>
      ) : null}

      <GovernanceSection a={a} />

      <View>
        <Detail label="Ámbito" value={a.faculty ?? "Todo el campus"} last={!a.lastActivityAt && !a.subsidyCents} />
        {a.lastActivityAt ? (
          <Detail
            label="Última actividad"
            last={!a.subsidyCents}
            value={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <CalendarDays size={14} color={C.muted} />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.3}>{relative(a.lastActivityAt, now.getTime())}</Text>
              </View>
            }
          />
        ) : null}
        {a.subsidyCents ? <Detail label="Subvención" value={money(a.subsidyCents, { round: true })} last /> : null}
      </View>

      {a.registered && a.subsidyStatus === "submitted" ? (
        <PButton
          label="Marcar subvención como concedida"
          icon={Landmark}
          variant="outline"
          full
          disabled={pending}
          onPress={() => void patch({ subsidyStatus: "granted" }, "Subvención concedida", `${a.name} recibe el aviso.`)}
        />
      ) : null}
    </Sheet>
  );
}

function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = usePro();
  const faculties = facultyOptions(data);
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
    <Sheet
      open={open}
      onClose={onClose}
      title="Invitar asociación"
      description="Entra gratis en Franky y queda conectada con tu universidad."
      footer={
        <PButton
          label="Enviar invitación"
          icon={Send}
          disabled={!valid}
          onPress={() => {
            toast("Invitación preparada", { kind: "success", body: `${name.trim()} recibirá el enlace para crear su espacio.` });
            onClose();
          }}
        />
      }
    >
      <Field label="Asociación">
        <Input value={name} onChangeText={setName} placeholder="Club de Fotografía" label="Asociación" />
      </Field>
      <Field label="Correo de la junta">
        <Input value={email} onChangeText={setEmail} placeholder="junta@asociacion.es" label="Correo de la junta" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </Field>
      <Field label="Facultad">
        <ChoiceGrid value={faculty} onChange={setFaculty} options={[{ value: "", label: "Todo el campus" }, ...faculties.map((f) => ({ value: f, label: f }))]} />
      </Field>
    </Sheet>
  );
}
