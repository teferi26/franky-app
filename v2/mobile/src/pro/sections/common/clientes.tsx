import React from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BadgeCheck, Contact, Download, MessageCircle, Sparkles, UserPlus } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProClient, ProClientSource } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, money, relative, time } from "../../../../../shared/pro/format";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { sectionLabel } from "../../sections";
import {
  Detail,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Sheet,
  StatusPill,
  Tip,
  Toggle,
} from "../../kit";
import { MiniStat, shareCsv } from "./ui";

const SOURCE: Record<ProClientSource, string> = {
  franky: "Franky",
  hueco: "Hueco relámpago",
  card: "Franky Card",
  instagram: "Instagram",
  phone: "Teléfono",
  walkin: "Pasó por la puerta",
  google: "Google",
  grupo: "Grupo",
  unknown: "Sin indicar",
};
const FRANKY: ProClientSource[] = ["franky", "hueco", "card", "grupo"];

/** Filas que se pintan de golpe; el resto con "Ver más". */
const PAGE = 40;

type Filter = "all" | "students" | "franky" | "lost" | "noshow";

export default function ClientesSection() {
  const { data, now, vertical, update, demo, can } = usePro();
  const showFinance = demo || can("finance.read");
  const params = useLocalSearchParams<{ c?: string }>();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<string | null>(typeof params.c === "string" ? params.c : null);
  const [creating, setCreating] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(PAGE);

  const today = localDate(now);
  const sixWeeksAgo = addDays(today, -42);
  const monthAgo = addDays(today, -30);
  const label = sectionLabel(vertical.id, "clientes");

  const counts = {
    all: data.clients.length,
    students: data.clients.filter((c) => c.student).length,
    franky: data.clients.filter((c) => FRANKY.includes(c.source)).length,
    lost: data.clients.filter((c) => c.lastVisit && localDate(c.lastVisit) < sixWeeksAgo).length,
    noshow: data.clients.filter((c) => c.noShows > 0).length,
  };

  const list = data.clients
    .filter((c) => {
      if (filter === "students" && !c.student) return false;
      if (filter === "franky" && !FRANKY.includes(c.source)) return false;
      if (filter === "lost" && !(c.lastVisit && localDate(c.lastVisit) < sixWeeksAgo)) return false;
      if (filter === "noshow" && !c.noShows) return false;
      const q = query.trim().toLowerCase();
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    })
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));

  // Al cambiar de filtro o búsqueda se vuelve a la primera página.
  React.useEffect(() => setVisibleCount(PAGE), [filter, query]);

  const newThisMonth = data.clients.filter((c) => localDate(c.createdAt) >= monthAgo).length;
  const recurring = data.clients.filter((c) => c.visits >= 3).length;

  const exportCsv = () => {
    const rows = [
      ["Nombre", "Teléfono", "Universidad", "Visitas", ...(showFinance ? ["Gasto (€)"] : []), "Última visita", "Origen", "Acepta comunicaciones"],
      ...data.clients.map((c) => [
        c.name,
        c.phone ?? "",
        c.student?.university ?? "",
        String(c.visits),
        ...(showFinance ? [c.spentCents === null ? "" : (c.spentCents / 100).toFixed(2).replace(".", ",")] : []),
        c.lastVisit ? localDate(c.lastVisit) : "",
        SOURCE[c.source],
        c.marketingConsent ? "Sí" : "No",
      ]),
    ];
    void shareCsv(rows, `clientes-${data.space.slug}-${today}.csv`, {
      title: "Exportado",
      body: "Tus clientes son tuyos: te llevas la lista cuando quieras.",
    });
  };

  const shown = list.slice(0, visibleCount);

  return (
    <ProPage>
      <PageHeader
        eyebrow={label}
        title={`${data.clients.length.toLocaleString("es-ES")} ${label.toLowerCase()}`}
        description={
          demo
            ? `${counts.students} son estudiantes y ${counts.franky} llegaron por Franky. Todos son tuyos: los exportas cuando quieras.`
            : "Sus citas, preferencias y visitas en una sola ficha. Puedes exportar tu lista cuando la necesites."
        }
        actions={
          <>
            <PButton label="Exportar" variant="outline" icon={Download} onPress={exportCsv} />
            <PButton label="Añadir" icon={UserPlus} onPress={() => setCreating(true)} />
          </>
        }
      />

      <KpiRow>
        <Kpi label="Nuevos en 30 días" value={newThisMonth} />
        <Kpi label="Vuelven (3+ visitas)" value={`${Math.round((recurring / Math.max(1, data.clients.length)) * 100)} %`} hint={`${recurring} personas`} />
        {demo ? <Kpi label="Estudiantes" value={counts.students} hint={`${data.clients.filter((c) => c.student?.verified).length} verificados`} /> : null}
        {demo ? <Kpi icon={Sparkles} label="Llegaron por Franky" value={counts.franky} emphasis /> : null}
      </KpiRow>

      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, teléfono o correo" />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todos", count: counts.all },
          ...(demo
            ? [
                { value: "students" as const, label: "Estudiantes", count: counts.students },
                { value: "franky" as const, label: "De Franky", count: counts.franky },
              ]
            : []),
          { value: "lost", label: "Hace más de 6 semanas", count: counts.lost },
          { value: "noshow", label: "No se presentaron", count: counts.noshow },
        ]}
      />

      {filter === "lost" && counts.lost ? (
        <Tip title="Recupéralos">
          {`Son ${counts.lost} personas que no vienen desde hace más de seis semanas. Puedes preparar un mensaje de WhatsApp desde su ficha para quienes aceptaron recibir tus comunicaciones.`}
        </Tip>
      ) : null}

      <Panel flush>
        {shown.length ? (
          shown.map((c, i) => {
            const sub = c.student ? c.student.university.replace("Universidad de ", "").replace("Universidad ", "") : (c.phone ?? c.email ?? "");
            return (
              <ListRow key={c.id} onPress={() => setOpen(c.id)} accessibilityLabel={`${c.name}, ${c.visits} visitas`} last={i === shown.length - 1}>
                <PAvatar name={c.name} toneKey={c.student ? "violet" : "slate"} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{c.name}</PText>
                    {c.student?.verified ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                  </View>
                  <PText v="tiny" numberOfLines={1}>{`${sub ? `${sub} · ` : ""}${c.visits} visitas`}</PText>
                  {FRANKY.includes(c.source) ? (
                    <View style={{ marginTop: 2 }}>
                      <Pill label={SOURCE[c.source]} tone="success" />
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <PText v="tiny">{c.lastVisit ? relative(c.lastVisit, now.getTime()) : "Nunca"}</PText>
                  {showFinance ? <PText v="small" color={C.text}>{c.spentCents === null ? "Sin datos" : money(c.spentCents, { round: true })}</PText> : null}
                </View>
              </ListRow>
            );
          })
        ) : (
          <Empty icon={Contact} title="Nadie con ese filtro" body="Prueba con otra búsqueda o añade a alguien a mano." />
        )}
      </Panel>

      {list.length > visibleCount ? (
        <View style={{ gap: S.sm, alignItems: "center", marginBottom: S.lg }}>
          <PText v="small">{`Mostrando ${visibleCount} de ${list.length}`}</PText>
          <PButton label="Ver más clientes" variant="outline" full onPress={() => setVisibleCount((count) => count + PAGE)} />
        </View>
      ) : null}

      <ClientSheet clientId={open} onClose={() => setOpen(null)} />
      <NewClientSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (c) => {
          if (!(await update("client.create", (d) => ({ ...d, clients: [c, ...d.clients] })))) return;
          toast("Añadido", { kind: "success", body: c.name });
          setCreating(false);
          if (demo) setOpen(c.id);
        }}
      />
    </ProPage>
  );
}

function ClientSheet({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const { data, update, now, pending, can, demo } = usePro();
  const showFinance = demo || can("finance.read");
  const client = data.clients.find((c) => c.id === clientId) ?? null;
  const [technical, setTechnical] = React.useState("");

  React.useEffect(() => {
    setTechnical(client?.technical ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const history = client
    ? data.bookings
        .filter((b) => b.clientId === client.id)
        .sort((a, b) => b.start.localeCompare(a.start))
        .slice(0, 8)
    : [];
  const ticket = !client || client.spentCents === null ? null : client.visits ? Math.round(client.spentCents / client.visits) : 0;
  const whatsapp = client ? customerWhatsApp(client.phone, `Hola ${client.name.split(" ")[0]}, te escribimos de ${data.space.name}.`) : undefined;

  const save = async () => {
    if (!client) return;
    if (!(await update("client.technical", (d) => ({ ...d, clients: d.clients.map((c) => (c.id === client.id ? { ...c, technical } : c)) })))) return;
    toast("Ficha guardada", { kind: "success" });
  };

  return (
    <Sheet
      open={Boolean(client)}
      onClose={onClose}
      title={client?.name ?? ""}
      description={
        client ? (client.student ? `${client.student.university} · ${client.student.faculty}` : (client.phone ?? client.email ?? "Sin datos de contacto")) : undefined
      }
      footer={
        client ? (
          <>
            {whatsapp ? <PButton label="WhatsApp" variant="outline" icon={MessageCircle} onPress={() => void Linking.openURL(whatsapp)} /> : null}
            <PButton label="Guardar ficha" disabled={pending || !can("client.technical")} onPress={() => void save()} />
          </>
        ) : undefined
      }
    >
      {client ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {client.student?.verified ? (
              <Pill label="Estudiante verificado" tone="violet" icon={BadgeCheck} />
            ) : client.student ? (
              <Pill label="Estudiante" />
            ) : null}
            {client.cardMember ? <Pill label="Franky Card" tone="dark" /> : null}
            {FRANKY.includes(client.source) ? <Pill label={`Llegó por ${SOURCE[client.source]}`} tone="success" /> : <Pill label={SOURCE[client.source]} />}
            {client.noShows ? <Pill label={`${client.noShows} sin presentarse`} tone="danger" /> : null}
          </View>

          <View style={{ flexDirection: "row", gap: S.sm }}>
            <MiniStat label="Visitas" value={String(client.visits)} />
            {showFinance ? <MiniStat label="Gasto" value={client.spentCents === null ? "Sin datos" : money(client.spentCents, { round: true })} /> : null}
            {showFinance ? <MiniStat label="Ticket medio" value={ticket === null ? "Sin datos" : money(ticket, { round: true })} /> : null}
          </View>

          <Field label="Ficha técnica" hint="Fórmula de color, técnica, preferencias. Solo la ve tu equipo.">
            <Input
              value={technical}
              onChangeText={setTechnical}
              multiline
              label="Ficha técnica"
              placeholder="Por ejemplo: 6.1 + 7.13 al 50 %, 20 vol, 35 min. Degradado bajo con 0,5."
            />
          </Field>

          <View style={{ gap: S.sm }}>
            <PText v="h3">{demo ? "Historial" : "Citas del periodo consultado"}</PText>
            {history.length ? (
              <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border }}>
                {history.map((b, i) => (
                  <View
                    key={b.id}
                    style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: 10, borderBottomWidth: i === history.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <PText v="body" numberOfLines={1}>{data.services.find((s) => s.id === b.serviceId)?.name ?? "Visita"}</PText>
                      <PText v="tiny">{`${dayLabel(b.start)} · ${time(b.start)}`}</PText>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <PText v="small" color={C.text}>{money(b.priceCents)}</PText>
                      <StatusPill status={b.status} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <PText v="small">{demo ? "Aún no hay visitas registradas en Franky Pro." : "No hay citas de esta persona en el periodo consultado."}</PText>
            )}
          </View>

          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
            {client.email ? <Detail label="Correo" value={client.email} /> : null}
            <Detail label="Cliente desde" value={dayLabel(client.createdAt, { weekday: false })} />
            <Detail label="Última visita" value={client.lastVisit ? relative(client.lastVisit, now.getTime()) : "Nunca"} />
            <Detail label="Acepta comunicaciones" value={client.marketingConsent ? "Sí" : "No"} last />
          </View>
          <PText v="tiny">Solo escribimos a quien ha aceptado recibir comunicaciones de tu negocio.</PText>
        </>
      ) : null}
    </Sheet>
  );
}

function NewClientSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (c: ProClient) => Promise<void> }) {
  const { pending, can } = usePro();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [consent, setConsent] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setConsent(false);
    }
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir cliente"
      description="Para quien llama o pasa por la puerta. No necesita tener Franky."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton
            label="Añadir"
            disabled={pending || !can("client.create") || name.trim().length < 2}
            onPress={() =>
              void onCreate({
                id: localId("c"),
                name: name.trim(),
                phone: phone.trim() || undefined,
                tags: [],
                visits: 0,
                spentCents: 0,
                noShows: 0,
                source: "walkin",
                marketingConsent: consent,
                cardMember: false,
                createdAt: new Date().toISOString(),
              })
            }
          />
        </>
      }
    >
      <Field label="Nombre y apellido">
        <Input value={name} onChangeText={setName} autoFocus autoCapitalize="words" label="Nombre y apellido" />
      </Field>
      <Field label="Teléfono">
        <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" label="Teléfono" />
      </Field>
      <Toggle label="Acepta recibir avisos y ofertas del negocio" value={consent} onChange={setConsent} />
    </Sheet>
  );
}
