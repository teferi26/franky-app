import React from "react";
import { View } from "react-native";
import { Eye, Megaphone, Pin, PinOff, Send, Users } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProAnnouncement } from "../../../../../shared/pro/types";
import { dayLabel, pct, relative, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, IconButton, Input, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Pill, Segmented, Sheet, Tip, Toggle } from "../../kit";
import { Card } from "./ui";

type Audience = ProAnnouncement["audience"];
type Filter = "all" | Audience;

const AUDIENCE_LABEL: Record<Audience, string> = { todos: "Toda la universidad", socios: "Socios", junta: "Junta" };

export default function CommunityAvisos() {
  const { data, now, update } = usePro();
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

  const togglePin = async (a: ProAnnouncement) => {
    const ok = await update("announcement.pin", (d) => ({
      ...d,
      announcements: d.announcements.map((x) => (x.id === a.id ? { ...x, pinned: !x.pinned } : x)),
    }));
    if (!ok) return;
    toast(a.pinned ? "Aviso desfijado" : "Aviso fijado", { kind: "success", body: a.pinned ? undefined : "Sale el primero en la ficha de la asociación." });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Avisos"
        title="Avisos"
        description={
          latest
            ? `Llegan al Franky de cada persona, no se pierden en el grupo de WhatsApp. El último, ${relative(latest.at, now.getTime())}, ya lo han leído ${latest.reads.toLocaleString("es-ES")}.`
            : "Llegan al Franky de cada persona, no se pierden en el grupo de WhatsApp."
        }
        actions={<PButton label="Nuevo aviso" icon={Megaphone} onPress={() => setComposing(true)} />}
      >
        <Segmented<Filter>
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
        list.map((a) => {
          const size = audienceSize(a.audience);
          return (
            <Card key={a.id} highlight={a.pinned} style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
              <Tap onPress={() => setOpen(a.id)} accessibilityRole="button" accessibilityLabel={a.title} style={{ flex: 1, gap: S.sm, borderRadius: R.sm }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  {a.pinned ? <Pill label="Fijado" tone="violet" icon={Pin} /> : null}
                  <Pill label={AUDIENCE_LABEL[a.audience]} tone={a.audience === "junta" ? "dark" : a.audience === "socios" ? "info" : "neutral"} />
                  <PText v="tiny">{relative(a.at, now.getTime())}</PText>
                </View>
                <PText v="h2">{a.title}</PText>
                <PText v="small" numberOfLines={2}>{a.body}</PText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <Eye size={14} color={C.muted} />
                  <PText v="tiny">{`${a.reads.toLocaleString("es-ES")} ${size ? `de ${size} lo han leído` : "lecturas"}`}</PText>
                </View>
                {size ? <Meter value={a.reads} max={size} tone="success" /> : null}
              </Tap>
              <IconButton label={a.pinned ? "Desfijar aviso" : "Fijar aviso"} icon={a.pinned ? PinOff : Pin} onPress={() => void togglePin(a)} />
            </Card>
          );
        })
      ) : (
        <Card>
          <Empty
            icon={Megaphone}
            title="Sin avisos aquí"
            body="Escribe el primero. Puedes mandarlo a toda la universidad, solo a tus socios o solo a la junta."
            action={<PButton label="Nuevo aviso" onPress={() => setComposing(true)} />}
          />
        </Card>
      )}

      <Tip title="Llega a los de primero">
        Los avisos para toda la universidad aparecen en Franky a estudiantes que aún no os conocen. Es la forma de llegar a primero sin depender de que alguien comparta el cartel.
      </Tip>

      <Composer open={composing} onClose={() => setComposing(false)} />
      <AnnouncementSheet id={open} onClose={() => setOpen(null)} />
    </ProPage>
  );
}

function Composer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<Audience>("socios");
  const [pinned, setPinned] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setAudience("socios");
    setPinned(false);
  }, [open]);

  const send = async () => {
    const a: ProAnnouncement = { id: localId("an"), title: title.trim(), body: body.trim(), at: new Date().toISOString(), audience, reads: 0, pinned };
    if (!(await update("announcement.create", (d) => ({ ...d, announcements: [a, ...d.announcements] })))) return;
    toast("Aviso enviado", {
      kind: "success",
      body:
        audience === "todos"
          ? "Lo verán los estudiantes de tu universidad en Franky."
          : audience === "socios"
            ? `Les llega a tus ${data.communityMembers.length} socios.`
            : "Le llega a la junta.",
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo aviso"
      description="Una notificación en su Franky y queda guardado en la ficha."
      footer={<PButton label="Enviar aviso" icon={Send} onPress={() => void send()} disabled={title.trim().length < 3 || body.trim().length < 3} />}
    >
      <Field label="A quién">
        <ChoiceGrid
          value={audience}
          onChange={setAudience}
          options={[
            { value: "todos", label: "Toda la universidad", hint: "También a quien no te sigue" },
            { value: "socios", label: "Socios", hint: `${data.communityMembers.length} personas` },
            { value: "junta", label: "Junta", hint: `${data.board.length} personas` },
          ]}
        />
      </Field>
      <Field label="Título">
        <Input value={title} onChangeText={setTitle} placeholder="Este martes, cinefórum en versión original" label="Título" />
      </Field>
      <Field label="Mensaje">
        <Input value={body} onChangeText={setBody} multiline placeholder="Qué, cuándo, dónde y qué tienen que hacer." label="Mensaje" style={{ minHeight: 120 }} />
      </Field>
      <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
        <Toggle label="Fijar arriba" detail="Sale el primero en la ficha de la asociación hasta que lo quites." value={pinned} onChange={setPinned} />
      </View>
      {title ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: S.lg, gap: 2 }}>
          <PText v="label">Así lo verán</PText>
          <PText v="h3" style={{ marginTop: S.sm }}>{data.space.name}</PText>
          <PText v="body" style={{ fontSize: 14 }}>{title}</PText>
          {body ? <PText v="tiny" numberOfLines={2} style={{ marginTop: 4 }}>{body}</PText> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function AnnouncementSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePro();
  const a = data.announcements.find((x) => x.id === id);
  if (!a) return null;
  const size = a.audience === "socios" ? data.communityMembers.length : a.audience === "junta" ? data.board.length : 0;
  const unread = size ? Math.max(0, size - a.reads) : 0;
  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={a.title}
      description={`${AUDIENCE_LABEL[a.audience]} · ${dayLabel(a.at)} a las ${time(a.at)}`}
      footer={
        unread ? (
          <PButton
            label="Reenviar a quien no lo ha leído"
            icon={Send}
            onPress={() => toast("Recordatorio enviado", { kind: "success", body: `${unread} personas que no lo habían leído lo reciben de nuevo.` })}
          />
        ) : undefined
      }
    >
      <PText v="body" color={C.muted}>{a.body}</PText>
      <View>
        <Detail label="Lecturas" value={a.reads.toLocaleString("es-ES")} />
        {size ? <Detail label="Sin leer" value={unread} /> : null}
        <Detail label="Fijado" value={a.pinned ? "Sí" : "No"} last />
      </View>
      {size ? <Meter value={a.reads} max={size} tone="success" /> : null}
    </Sheet>
  );
}
