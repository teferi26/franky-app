import React from "react";
import { Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ArrowRight, CalendarClock, Download, FileText, FolderLock, KeyRound, Plus, Users, Wallet } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProBoardSeat } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, money, pct, relative } from "../../../../../shared/pro/format";
import {
  communityCash,
  communityDocuments,
  daysBetween,
  type CommunityDocument,
  type CommunityMember,
} from "../../../../../shared/pro/demo/community";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Empty, Field, IconButton, Input, Kpi, KpiRow, ListRow, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip } from "../../kit";
import { Card, CashLine, TONE_ORDER } from "./ui";

const KIND_LABEL: Record<CommunityDocument["kind"], string> = {
  estatutos: "Estatutos",
  acta: "Acta",
  cuentas: "Cuentas",
  registro: "Registro",
  otro: "Otro",
};

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

export default function CommunityJunta() {
  const { data, now } = usePro();
  const today = localDate(now);
  const [handover, setHandover] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [docs, setDocs] = React.useState<CommunityDocument[]>(() => communityDocuments(now));
  const [scheduled, setScheduled] = React.useState<ProBoardSeat[] | null>(null);

  const board = data.board;
  const until = board[0]?.until ?? addDays(today, 180);
  const since = board[0]?.since ?? today;
  const left = Math.max(0, daysBetween(today, until));
  const total = Math.max(1, daysBetween(since, until));
  const cash = communityCash(data);
  const members = data.communityMembers as CommunityMember[];
  const pastActivities = data.activities.filter((a) => a.status === "done").length;
  const sortedDocs = [...docs].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Junta"
        title="Junta directiva"
        description={
          board.length
            ? `${board.length} cargos con mandato hasta el ${fullDate(until)}, dentro de ${left} días. Cuando toque el relevo, lo traspasas aquí y no se pierde nada.`
            : "Configura quién hace qué y hasta cuándo. Así el cambio de junta no se lleva nada por delante."
        }
        actions={<PButton label="Traspasar junta" icon={KeyRound} onPress={() => setHandover(true)} />}
      />

      <KpiRow>
        <Kpi icon={Users} label="Cargos" value={board.length} hint={`${data.staff.filter((s) => s.role === "editor").length} voluntarios con acceso`} />
        <Kpi icon={CalendarClock} label="Quedan de mandato" value={`${left} días`} hint={`Hasta el ${fullDate(until)}`} emphasis={left < 45} />
        <Kpi icon={FileText} label="Documentos" value={docs.length} hint="Estatutos, actas y cuentas" />
        <Kpi icon={Wallet} label="Caja del curso" value={money(cash.totalCents, { round: true })} hint="Se queda en la asociación" />
      </KpiRow>

      {board.length ? (
        <View style={{ marginBottom: S.sm }}>
          {board.map((b, i) => (
            <Card key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md, padding: S.lg }}>
              <PAvatar name={b.name} toneKey={TONE_ORDER[i % TONE_ORDER.length]} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <PText v="label">{b.role}</PText>
                <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {b.name}
                </Text>
                <PText v="tiny">{`Desde ${relative(`${b.since}T12:00:00Z`, now.getTime())}`}</PText>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <Panel>
          <Empty
            icon={Users}
            title="Aún no has configurado la junta"
            body="Añade los cargos para que cada persona tenga su acceso y quede constancia de quién firma qué."
            action={<PButton label="Configurar junta" onPress={() => setHandover(true)} />}
          />
        </Panel>
      )}

      {scheduled ? (
        <Panel
          title="Relevo programado"
          description={`El ${fullDate(scheduled[0]?.since ?? until)} la nueva junta recibe su acceso.`}
          action={<PButton label="Cancelar" variant="ghost" small onPress={() => setScheduled(null)} />}
          flush
        >
          {scheduled.map((b, i) => (
            <ListRow key={b.id} last={i === scheduled.length - 1}>
              <PAvatar name={b.name} size={34} />
              <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{b.name}</PText>
              <PText v="tiny">{b.role}</PText>
            </ListRow>
          ))}
        </Panel>
      ) : null}

      <Panel
        title="Documentos"
        description="Todo lo oficial, en un sitio que no depende del Drive de nadie."
        action={<PButton label="Subir" icon={Plus} variant="outline" small onPress={() => setUploading(true)} />}
        flush
      >
        {sortedDocs.map((d, i) => (
          <ListRow key={d.id} last={i === sortedDocs.length - 1}>
            <FileText size={17} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={2}>{d.title}</PText>
              <PText v="tiny" numberOfLines={1}>{`${d.by} · ${dayLabel(d.at, { weekday: false })}`}</PText>
              <View style={{ marginTop: 2 }}>
                <Pill label={KIND_LABEL[d.kind]} />
              </View>
            </View>
            <IconButton label={`Descargar ${d.title}`} icon={Download} onPress={() => toast("Descargando", { kind: "info", body: d.title })} />
          </ListRow>
        ))}
      </Panel>

      <Panel title="Mandato" description="El curso de la junta actual.">
        <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2}>
          {`${pct(total - left, total)} %`}
        </Text>
        <PText v="small">del mandato cumplido</PText>
        <View style={{ marginTop: S.md }}>
          <Meter value={total - left} max={total} tone={left < 45 ? "warning" : "violet"} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: S.sm }}>
          <PText v="tiny">{fullDate(since)}</PText>
          <PText v="tiny">{fullDate(until)}</PText>
        </View>
      </Panel>

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, marginBottom: S.lg, gap: S.sm, ...SHADOW.card }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          <FolderLock size={16} color={C.blue} strokeWidth={1.9} />
          <PText v="h2">Lo que se queda en la asociación</PText>
        </View>
        <View>
          <CashLine label="Socios con su cuota y su historial" value={String(members.length)} />
          <CashLine label="Actividades con su asistencia" value={String(pastActivities)} />
          <CashLine label="Documentos oficiales" value={String(docs.length)} />
          <CashLine label="Caja y cobros del curso" value={money(cash.totalCents, { round: true })} />
          <CashLine label="Patrocinadores y sus informes" value={String(data.sponsors.length)} />
        </View>
      </View>

      <Tip title="El relevo sin dramas">
        Cada año se pierde media asociación en el cambio de junta: contraseñas, el Excel de cuotas, los contactos de los patrocinadores. Aquí la cuenta es de la asociación, no de la presidenta.
      </Tip>

      <HandoverSheet open={handover} onClose={() => setHandover(false)} docs={docs.length} onScheduled={setScheduled} />
      <UploadSheet
        open={uploading}
        onClose={() => setUploading(false)}
        onSave={(doc) => {
          setDocs((list) => [doc, ...list]);
          toast("Documento guardado", { kind: "success", body: `${doc.title} queda en la asociación.` });
        }}
      />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */

type Seat = { id: string; role: string; name: string };

function HandoverSheet({
  open,
  onClose,
  docs,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  docs: number;
  onScheduled: (board: ProBoardSeat[]) => void;
}) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const nextUntil = (() => {
    const current = data.board[0]?.until;
    if (!current) return `${Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 7 ? 1 : 0)}-06-30`;
    return `${Number(current.slice(0, 4)) + 1}-06-30`;
  })();
  const defaultSeats: Seat[] = data.board.length
    ? data.board.map((b) => ({ id: b.id, role: b.role, name: "" }))
    : ["Presidencia", "Tesorería", "Secretaría"].map((role) => ({ id: localId("b"), role, name: "" }));

  const [seats, setSeats] = React.useState<Seat[]>(defaultSeats);
  const [until, setUntil] = React.useState(nextUntil);
  const [mode, setMode] = React.useState<"now" | "end">("end");
  const [focused, setFocused] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setSeats(defaultSeats);
    setUntil(nextUntil);
    setMode("end");
    setFocused(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const members = data.communityMembers as CommunityMember[];
  const valid = seats.every((s) => s.name.trim().length > 2 && s.role.trim());
  const setSeat = (id: string, patch: Partial<Seat>) => setSeats((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // La web usa un calendario; aquí se elige entre los próximos 30 de junio (el mandato siempre acaba ahí).
  const untilOptions = Array.from(new Set([nextUntil, `${Number(nextUntil.slice(0, 4)) + 1}-06-30`, `${Number(nextUntil.slice(0, 4)) + 2}-06-30`, until]))
    .sort()
    .map((d) => ({ value: d, label: fullDate(d) }));

  const confirm = async () => {
    const since = mode === "now" ? today : data.board[0]?.until ? addDays(data.board[0].until, 1) : today;
    const board: ProBoardSeat[] = seats.map((s) => ({ id: s.id, role: s.role.trim(), name: s.name.trim(), since, until }));
    if (mode === "end") {
      onScheduled(board);
      toast("Traspaso programado", {
        kind: "success",
        body: `El ${fullDate(since)} la nueva junta recibe su acceso. Socios, historia, documentos y cuentas se quedan en la asociación.`,
      });
      onClose();
      return;
    }
    const ok = await update("board.handover", (d) => ({
      ...d,
      board,
      communityMembers: d.communityMembers.map((m) =>
        board.some((b) => b.name === m.name) ? { ...m, role: "junta" } : m.role === "junta" && !board.some((b) => b.name === m.name) ? { ...m, role: "socio" } : m,
      ),
      staff: [
        ...board.map((b, i) => ({
          id: `s-${b.id}`,
          name: b.name,
          role: "board" as const,
          tone: TONE_ORDER[i % TONE_ORDER.length],
          title: b.role,
          commissionPct: 0,
          clockedInAt: null,
          weekMinutes: 0,
        })),
        ...d.staff.filter((s) => s.role !== "board"),
      ],
    }));
    if (!ok) return;
    toast("Junta traspasada", { kind: "success", body: "Socios, historia, documentos y cuentas se quedan en la asociación. La nueva junta ya tiene su acceso." });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Traspasar la junta"
      description="Elige los nuevos cargos. La asociación sigue igual, solo cambian las llaves."
      footer={<PButton label={mode === "now" ? "Traspasar ahora" : "Programar traspaso"} icon={KeyRound} onPress={() => void confirm()} disabled={!valid} />}
    >
      <Field label="Cuándo">
        <ChoiceGrid
          value={mode}
          onChange={setMode}
          options={[
            { value: "end", label: "Al terminar el mandato", hint: data.board[0] ? `El ${fullDate(addDays(data.board[0].until, 1))}` : undefined },
            { value: "now", label: "Ahora mismo", hint: "Tras una asamblea" },
          ]}
        />
      </Field>

      <View style={{ gap: S.md }}>
        {seats.map((s) => {
          const previous = data.board.find((b) => b.id === s.id);
          const q = s.name.trim().toLowerCase();
          const matches =
            focused === s.id && q.length >= 2 ? members.filter((m) => m.name.toLowerCase().includes(q) && m.name.toLowerCase() !== q).slice(0, 4) : [];
          return (
            <View key={s.id} style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 14 }}>
              <Field label="Cargo">
                <Input value={s.role} onChangeText={(role) => setSeat(s.id, { role })} label="Cargo" />
              </Field>
              <Field label="Nueva persona" hint={previous ? `Ahora: ${previous.name}` : undefined}>
                <Input
                  value={s.name}
                  placeholder="Busca entre tus socios"
                  label={`Nueva persona para ${s.role}`}
                  autoCapitalize="words"
                  onFocus={() => setFocused(s.id)}
                  onChangeText={(name) => setSeat(s.id, { name })}
                />
                {matches.length ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                    {matches.map((m) => (
                      <Tap
                        key={m.id}
                        onPress={() => {
                          setSeat(s.id, { name: m.name });
                          setFocused(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Elegir a ${m.name}`}
                        style={{ minHeight: 38, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, justifyContent: "center" }}
                      >
                        <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>{m.name}</Text>
                      </Tap>
                    ))}
                  </View>
                ) : null}
              </Field>
            </View>
          );
        })}
        <PButton label="Añadir cargo" icon={Plus} variant="ghost" small onPress={() => setSeats((list) => [...list, { id: localId("b"), role: "Vocal", name: "" }])} />
      </View>

      <Field label="Mandato hasta">
        <ChoiceGrid value={until} onChange={setUntil} options={untilOptions} />
      </Field>

      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: S.sm }}>
        <PText v="h3">Se queda todo en la asociación</PText>
        {[
          [`${members.length} socios`, "con cuota e historial"],
          [`${data.activities.length} actividades`, "con su asistencia"],
          [`${docs} documentos`, "estatutos, actas, cuentas"],
          ["Las cuentas", "cobros, caja y patrocinios"],
        ].map(([a, b]) => (
          <View key={a} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <ArrowRight size={14} color={C.blue} style={{ marginTop: 3 }} />
            <Text style={{ flex: 1, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.4}>
              <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{a}</Text> {b}
            </Text>
          </View>
        ))}
        <PText v="tiny" style={{ marginTop: S.xs }}>La junta saliente pierde el acceso de gestión y sigue como socia. Nadie se lleva contraseñas.</PText>
      </View>
    </Sheet>
  );
}

function UploadSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (doc: CommunityDocument) => void }) {
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<CommunityDocument["kind"]>("acta");
  const [file, setFile] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind("acta");
    setFile(null);
  }, [open]);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: false });
      if (res.canceled || !res.assets?.[0]) return;
      const name = res.assets[0].name;
      setFile(name);
      if (!title) setTitle(name.replace(/\.[^.]+$/, ""));
    } catch {
      toast("No se ha podido abrir el archivo", { kind: "error" });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Subir documento"
      description="PDF o foto. Queda guardado en la asociación, no en tu móvil."
      footer={
        <PButton
          label="Guardar documento"
          disabled={title.trim().length < 3}
          onPress={() => {
            onSave({ id: localId("d"), title: title.trim(), kind, at: new Date().toISOString(), by: "Junta" });
            onClose();
          }}
        />
      }
    >
      <Field label="Nombre">
        <Input value={title} onChangeText={setTitle} placeholder="Acta de la reunión de octubre" label="Nombre" />
      </Field>
      <Field label="Tipo">
        <ChoiceGrid
          value={kind}
          onChange={setKind}
          options={(Object.keys(KIND_LABEL) as CommunityDocument["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </Field>
      <Tap
        onPress={() => void pick()}
        accessibilityRole="button"
        accessibilityLabel="Elige el archivo"
        style={{ minHeight: 96, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, paddingHorizontal: S.lg, paddingVertical: S.xl }}
      >
        <FileText size={20} color={C.muted} strokeWidth={1.75} />
        <PText v="h3">{file ?? "Elige el archivo"}</PText>
        <PText v="tiny">PDF, JPG o PNG hasta 10 MB</PText>
      </Tap>
    </Sheet>
  );
}
