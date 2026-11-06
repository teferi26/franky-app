import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, Eye, FileBarChart, Handshake, MapPin, Search, Send, Ticket, Users } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProSponsor, ProVerticalId } from "../../../../../shared/pro/types";
import { PRO_VERTICALS } from "../../../../../shared/pro/verticals";
import { money } from "../../../../../shared/pro/format";
import { SPONSOR_SUGGESTIONS, type CommunityActivity } from "../../../../../shared/pro/demo/community";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, DarkBlock, DarkText, Detail, Empty, Field, Input, Kpi, KpiRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip } from "../../kit";
import { Card, CheckRow, DashedNote, StatRow, StatTile } from "./ui";

const STATUS: Record<ProSponsor["status"], { label: string; tone: "success" | "violet" | "neutral" }> = {
  active: { label: "Activo", tone: "success" },
  proposed: { label: "Propuesta enviada", tone: "violet" },
  finished: { label: "Terminado", tone: "neutral" },
};

const PERKS = ["Logo en carteles y en la ficha", "Mención en los avisos", "Stand en la actividad", "Oferta exclusiva para socios", "Premio con su nombre"];

type Target = { business: string; vertical: ProVerticalId; usual?: string } | null;
type Suggestion = (typeof SPONSOR_SUGGESTIONS)[number];

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
  const propose = (s: Suggestion) => setProposal({ business: s.business, vertical: s.vertical, usual: s.usual });

  return (
    <ProPage>
      <PageHeader
        eyebrow="Patrocinios"
        title="Patrocinadores"
        description={
          active.length
            ? `${active.length} patrocinadores activos que aportan ${money(amount, { round: true })} este curso. Sus ofertas se han canjeado ${redemptions} veces.`
            : "Los negocios de Franky cerca de tu campus buscan llegar a estudiantes. Tú tienes a los estudiantes."
        }
        actions={<PButton label="Buscar patrocinador" icon={Search} onPress={() => setSearching(true)} />}
      />

      <KpiRow>
        <Kpi icon={Handshake} label="Aportado este curso" value={money(amount, { round: true })} hint={`${active.length} activos`} emphasis />
        <Kpi icon={Eye} label="Alcance para ellos" value={reach.toLocaleString("es-ES")} hint="Estudiantes que vieron su marca" />
        <Kpi icon={Ticket} label="Canjes" value={redemptions} hint="Socios que usaron su oferta" />
        <Kpi icon={Send} label="Propuestas abiertas" value={proposed.length} hint="Esperando respuesta" />
      </KpiRow>

      {data.sponsors.length ? (
        [...active, ...proposed, ...finished].map((s) => <SponsorCard key={s.id} sponsor={s} onReport={() => setReport(s.id)} />)
      ) : (
        <Card>
          <Empty
            icon={Handshake}
            title="Aún no tienes patrocinadores"
            body="Mira qué negocios de Franky hay cerca de tu campus y mándales una propuesta. Ellos ya saben lo que vale un estudiante."
            action={<PButton label="Buscar patrocinador" onPress={() => setSearching(true)} />}
          />
        </Card>
      )}
      <Tip title="Por qué te dicen que sí">
        Tus patrocinadores ya usan Franky Pro: ven los canjes de su oferta en tiempo real y reciben un informe con el alcance de cada actividad. Pueden demostrar que les ha salido a cuenta, así que repiten.
      </Tip>

      <Panel
        title="Cerca de tu campus"
        description="Negocios de Franky que suelen patrocinar asociaciones."
        flush
        action={<PButton label="Ver todos" variant="ghost" small onPress={() => setSearching(true)} />}
      >
        {suggestions.slice(0, 4).map((s, i, list) => (
          <SuggestionRow key={s.business} s={s} onPropose={() => propose(s)} last={i === list.length - 1} />
        ))}
      </Panel>

      <ReportSheet sponsorId={report} onClose={() => setReport(null)} />
      <ProposalSheet target={proposal} onClose={() => setProposal(null)} />
      <Sheet open={searching} onClose={() => setSearching(false)} title="Buscar patrocinador" description="Negocios de Franky Pro a pocos minutos del campus.">
        <View style={{ marginHorizontal: -S.lg }}>
          {suggestions.map((s, i) => (
            <SuggestionRow
              key={s.business}
              s={s}
              last={i === suggestions.length - 1}
              onPropose={() => {
                setSearching(false);
                propose(s);
              }}
            />
          ))}
        </View>
        {!suggestions.length ? <Empty icon={Handshake} title="Ya has contactado con todos" body="Te avisaremos cuando llegue un negocio nuevo cerca del campus." /> : null}
      </Sheet>
    </ProPage>
  );
}

function SuggestionRow({ s, onPropose, last }: { s: Suggestion; onPropose: () => void; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
      <PAvatar name={s.business} size={34} />
      <View style={{ flex: 1, gap: 2 }}>
        <PText v="h3" numberOfLines={1}>{s.business}</PText>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MapPin size={12} color={C.muted} />
          <PText v="tiny" style={{ flex: 1 }}>{`${s.sector}, ${s.distance}`}</PText>
        </View>
        <PText v="small" color={C.text} style={{ marginTop: 2 }}>{s.usual}</PText>
        <PText v="tiny">{`${s.students} estudiantes clientes el último mes`}</PText>
      </View>
      <PButton label="Proponer" variant="secondary" small onPress={onPropose} accessibilityLabel={`Proponer a ${s.business}`} />
    </View>
  );
}

function SponsorCard({ sponsor: s, onReport }: { sponsor: ProSponsor; onReport: () => void }) {
  const { update } = usePro();

  const accept = async () => {
    const ok = await update("sponsor.accept", (d) => ({ ...d, sponsors: d.sponsors.map((x) => (x.id === s.id ? { ...x, status: "active" } : x)) }));
    if (!ok) return;
    toast("Patrocinio cerrado", { kind: "success", body: `${s.business} aporta ${money(s.amountCents, { round: true })}. Lo verás en la caja.` });
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <PAvatar name={s.business} toneKey={s.status === "active" ? "violet" : "slate"} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>
            {s.business}
          </Text>
          {s.franky ? <Pill label="Franky Pro" icon={BadgeCheck} /> : null}
          <PText v="small">{`${PRO_VERTICALS[s.vertical].label} · ${s.packageName}`}</PText>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, color: C.text }} maxFontSizeMultiplier={1.2}>
            {money(s.amountCents, { round: true })}
          </Text>
          <Pill label={STATUS[s.status].label} tone={STATUS[s.status].tone} />
        </View>
      </View>
      {s.status !== "proposed" ? (
        <StatRow>
          <StatTile label="estudiantes vieron su marca" value={s.reach.toLocaleString("es-ES")} />
          <StatTile label="canjes de su oferta" value={s.redemptions} />
        </StatRow>
      ) : (
        <DashedNote>La propuesta está en su bandeja de Franky Pro. Suelen responder en dos o tres días.</DashedNote>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: S.sm }}>
        {s.status === "proposed" ? (
          <>
            <PButton label="Recordar" variant="ghost" small onPress={() => toast("Recordatorio enviado", { kind: "success", body: `${s.business} lo ve en su bandeja.` })} />
            <PButton label="Marcar como aceptada" variant="outline" small onPress={() => void accept()} />
          </>
        ) : (
          <PButton label={`Informe para ${s.business.split(" ").slice(0, 2).join(" ")}`} icon={FileBarChart} variant="outline" small onPress={onReport} />
        )}
      </View>
    </Card>
  );
}

function ReportSheet({ sponsorId, onClose }: { sponsorId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const s = data.sponsors.find((x) => x.id === sponsorId);
  if (!s) return null;
  const acts = (data.activities as CommunityActivity[]).filter((a) => a.sponsorId === s.id);
  const attendees = acts.reduce((a, x) => a + (x.status === "done" ? x.checkedIn : x.registered), 0);
  const costPerReach = s.reach ? s.amountCents / s.reach : 0;
  const line = { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" };

  return (
    <Sheet
      open={Boolean(sponsorId)}
      onClose={onClose}
      title={`Informe para ${s.business}`}
      description="Lo que ha conseguido con tu asociación, con datos de Franky."
      footer={
        <PButton
          label="Enviar informe"
          icon={Send}
          onPress={() => {
            toast("Informe enviado", { kind: "success", body: `${s.business} lo tiene en su Franky Pro y en su correo.` });
            onClose();
          }}
        />
      }
    >
      <DarkBlock style={{ marginBottom: 0 }}>
        <DarkText v="label" dim>{s.packageName}</DarkText>
        <DarkText v="display">{s.reach.toLocaleString("es-ES")}</DarkText>
        <DarkText v="small" dim>estudiantes vieron su marca</DarkText>
        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, ...line }}>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{String(s.redemptions)}</DarkText>
            <DarkText v="small" dim>canjes en su local</DarkText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <DarkText v="h2">{String(attendees)}</DarkText>
            <DarkText v="small" dim>asistentes a sus actividades</DarkText>
          </View>
        </View>
      </DarkBlock>
      <View>
        <Detail label="Aportación" value={money(s.amountCents, { round: true })} />
        <Detail
          label="Coste por estudiante alcanzado"
          value={costPerReach ? `${(costPerReach / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €` : "Sin datos"}
        />
        <Detail label="Estudiantes verificados" value="Sí, con cuenta universitaria" last />
      </View>
      {acts.length ? (
        <View style={{ gap: S.xs }}>
          <PText v="h3">Actividades con su marca</PText>
          {acts.map((a, i) => (
            <View
              key={a.id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md, paddingVertical: 8, borderBottomWidth: i === acts.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <PText v="body" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{a.title}</PText>
              <PText v="tiny">{a.status === "done" ? `${a.checkedIn} asistentes` : `${a.registered} inscritos`}</PText>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

function ProposalSheet({ target, onClose }: { target: Target; onClose: () => void }) {
  const { data, update } = usePro();
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
  const send = async () => {
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
    if (!(await update("sponsor.propose", (d) => ({ ...d, sponsors: [...d.sponsors, s] })))) return;
    const act = upcoming.find((a) => a.id === activityId);
    toast("Propuesta enviada", { kind: "success", body: `${target.business} la recibe en su Franky Pro con tus cifras de alcance${act ? ` y la ficha de ${act.title}` : ""}.` });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(target)}
      onClose={onClose}
      title={target ? `Propuesta para ${target.business}` : "Propuesta"}
      description={target?.usual ? `Suele aportar: ${target.usual.toLowerCase()}.` : undefined}
      footer={<PButton label="Enviar propuesta" icon={Send} onPress={() => void send()} disabled={!cents || !perks.length} />}
    >
      <Field label="Nombre del paquete">
        <Input value={pkg} onChangeText={setPkg} label="Nombre del paquete" />
      </Field>
      <Field label="Aportación que pides" hint="Dinero, o su valor si es en producto. Los patrocinios no pagan comisión a Franky.">
        <View style={{ justifyContent: "center" }}>
          <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" label="Aportación que pides en euros" style={{ paddingRight: 32 }} />
          <Text style={{ position: "absolute", right: S.md, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>€</Text>
        </View>
      </Field>
      <Field label="Qué le das a cambio">
        <View style={{ gap: S.sm }}>
          {PERKS.map((p) => {
            const on = perks.includes(p);
            return <CheckRow key={p} variant="box" label={p} checked={on} onPress={() => setPerks((list) => (on ? list.filter((x) => x !== p) : [...list, p]))} />;
          })}
        </View>
      </Field>
      <Field label="Actividad concreta (opcional)">
        <ChoiceGrid
          value={activityId}
          onChange={setActivityId}
          options={[{ value: "", label: "Todo el curso" }, ...upcoming.map((a) => ({ value: a.id, label: a.title }))]}
        />
      </Field>
      <Field label="Mensaje">
        <Input value={message} onChangeText={setMessage} multiline label="Mensaje" style={{ minHeight: 110 }} />
      </Field>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: 10 }}>
        <Users size={16} color={C.blue} />
        <PText v="tiny" color={C.text} style={{ flex: 1 }}>{`Se adjuntan tus cifras: ${members} socios y el alcance de tus últimas actividades.`}</PText>
      </View>
    </Sheet>
  );
}
