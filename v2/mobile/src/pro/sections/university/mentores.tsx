import React from "react";
import { Text, View } from "react-native";
import { Check, Globe2, MessageCircle, Pause, Play, Sprout, UserPlus, Users, Wand2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import { relative } from "../../../../../shared/pro/format";
import {
  MENTOR_YEAR_LABEL,
  assignMentor,
  autoMatch,
  hasRoom,
  mentorLoad,
  mentoringByFaculty,
  mentorsOf,
  pauseMentor,
  silentMatches,
  waitingDays,
  withMentors,
} from "../../../../../shared/pro/university-mentors";
import type { ProUniMentor } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, Meter, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip } from "../../kit";
import { EmptyBox, HiddenGroup, facultyOptions, useUniAction } from "./ui";

const CAPACITY = ["1", "2", "3", "4", "5"];

export default function UniversityMentores() {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const [creating, setCreating] = React.useState(false);
  const [openMentor, setOpenMentor] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState<string | null>(null);

  const waiting = m.requests.filter((r) => r.status === "waiting").sort((a, b) => a.at.localeCompare(b.at));
  const matched = m.requests.filter((r) => r.status === "matched");
  const talked = matched.filter((r) => r.talked).length;
  const active = m.mentors.filter((x) => x.active);
  const room = active.reduce((a, x) => a + Math.max(0, x.capacity - mentorLoad(x, m.requests)), 0);
  const faculties = mentoringByFaculty(m);
  const silent = silentMatches(m.requests, now);
  const preview = autoMatch(m.mentors, m.requests, now);
  const talkedHidden = matched.length < 10;

  const matchAll = () =>
    run(
      "mentors.match",
      (d) => withMentors(d, (x) => ({ requests: autoMatch(x.mentors, x.requests, now).requests })),
      preview.matched === 1 ? "1 persona ya tiene mentor" : `${preview.matched} personas ya tienen mentor`,
      preview.withoutMentor.length ? `Siguen esperando en ${preview.withoutMentor.join(", ")}: hace falta un mentor más allí.` : "A cada mentor le llega un aviso para escribir primero.",
    );

  const description = m.mentors.length
    ? `${waiting.length === 1 ? "1 persona de primero espera" : `${waiting.length} personas de primero esperan`} mentor y ${matched.length} ya tienen.${
        talkedHidden ? "" : ` ${Math.round((talked / matched.length) * 10)} de cada 10 parejas ya se han escrito.`
      }`
    : "Estudiantes de segundo en adelante que acompañan a quien llega. Da de alta a los primeros y quien pida mentor en Franky te llegará aquí.";

  return (
    <ProPage>
      <PageHeader
        eyebrow="Primero"
        title="Mentores de primero"
        description={description}
        actions={
          <>
            {preview.matched > 0 ? <PButton label={`Emparejar a ${preview.matched}`} icon={Wand2} onPress={() => void matchAll()} /> : null}
            <PButton label="Nuevo mentor" icon={UserPlus} variant={preview.matched > 0 ? "outline" : "dark"} onPress={() => setCreating(true)} />
          </>
        }
      />

      {m.mentors.length || m.requests.length ? (
        <>
          <KpiRow>
            <Kpi icon={Sprout} label="Esperan mentor" value={waiting.length} hint={waiting[0] ? `La más antigua, ${relative(waiting[0].at, now.getTime())}` : "Nadie esperando"} emphasis={waiting.length > 0} />
            <Kpi icon={Users} label="Acompañados" value={matched.length} hint="Personas de primero con mentor" />
            <Kpi icon={UserPlus} label="Mentores activos" value={active.length} hint={`${room} plazas libres`} />
            <Kpi icon={MessageCircle} label="Ya se han escrito" value={talkedHidden ? "Oculto" : `${Math.round((talked / matched.length) * 100)} %`} hint={talkedHidden ? "Menos de 10 parejas" : "De las parejas emparejadas"} />
          </KpiRow>

          <Panel title="Esperando mentor" description="Sin nombres: solo facultad y cuándo lo pidió. Tócala para elegir mentor a mano." flush>
            {waiting.length ? (
              waiting.map((r, i) => {
                const days = waitingDays(r, now);
                const facultyRoom = active.some((x) => x.faculty === r.faculty && hasRoom(x, m.requests));
                return (
                  <ListRow key={r.id} onPress={() => setAssigning(r.id)} accessibilityLabel={`Primero de ${r.faculty}`} last={i === waiting.length - 1}>
                    <Sprout size={16} color={C.muted} strokeWidth={1.9} />
                    <View style={{ flex: 1 }}>
                      <PText v="h3" numberOfLines={1}>{`Primero de ${r.faculty}`}</PText>
                      <PText v="tiny" numberOfLines={2}>{`Lo pidió ${relative(r.at, now.getTime())}${facultyRoom ? "" : ". No hay mentor libre en su facultad"}`}</PText>
                    </View>
                    {r.international ? <Pill tone="info" icon={Globe2} label="De fuera" /> : null}
                    <Pill tone={days >= 3 ? "warning" : "neutral"} label={days === 0 ? "Hoy" : `${days} d`} />
                  </ListRow>
                );
              })
            ) : (
              <Empty icon={Sprout} title="Nadie espera mentor" body="Cuando alguien de primero lo pida desde Franky, aparecerá aquí para emparejarlo." />
            )}
          </Panel>

          <Panel title="Por facultad" description="Plazas, espera y parejas que ya han hablado." flush>
            {faculties.map((f, i) => (
              <View key={f.faculty} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 6, borderBottomWidth: i === faculties.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
                  <PText v="h3" style={{ flex: 1 }} numberOfLines={1}>{f.faculty}</PText>
                  {f.waiting > 0 && f.room === 0 ? <Pill tone="warning" label="Falta un mentor" /> : null}
                </View>
                <PText v="tiny">{`${f.mentors} mentores, ${f.room} plazas libres · ${f.waiting} esperan · ${f.matched} acompañados`}</PText>
                {f.hidden ? (
                  <HiddenGroup />
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                    <View style={{ flex: 1 }}>
                      <Meter value={f.talked} max={f.matched} />
                    </View>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{`${f.talkedPct} % se han escrito`}</Text>
                  </View>
                )}
              </View>
            ))}
          </Panel>

          <Panel title="Mentores" description={`${active.length} activos de ${m.mentors.length}.`} flush>
            {[...m.mentors]
              .sort((a, b) => Number(b.active) - Number(a.active) || a.faculty.localeCompare(b.faculty) || a.name.localeCompare(b.name))
              .map((x, i, list) => (
                <ListRow key={x.id} onPress={() => setOpenMentor(x.id)} accessibilityLabel={x.name} last={i === list.length - 1}>
                  <PAvatar name={x.name} toneKey={x.active ? "violet" : "slate"} size={34} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{x.name}</PText>
                    <PText v="tiny" numberOfLines={1}>{`${x.faculty} · ${MENTOR_YEAR_LABEL[x.year] ?? `${x.year}º`}`}</PText>
                  </View>
                  {x.active ? <PText v="small" color={C.text}>{`${mentorLoad(x, m.requests)} de ${x.capacity}`}</PText> : <Pill label="En pausa" />}
                </ListRow>
              ))}
          </Panel>

          {silent.length ? (
            <Tip title="Parejas en silencio">
              {`${silent.length === 1 ? "1 pareja lleva" : `${silent.length} parejas llevan`} más de cinco días sin escribirse. Si un mentor no responde, abre su ficha y pasa a su gente a otro.`}
            </Tip>
          ) : null}
          <Tip title="Las conversaciones son suyas">
            Solo ves cifras: quién espera, cuántos acompaña cada mentor y si la pareja ya se ha escrito. Lo que se cuentan queda entre ellos, en el chat de Franky.
          </Tip>
        </>
      ) : (
        <EmptyBox>
          <Empty
            icon={Sprout}
            title="Aún no hay mentores"
            body="Da de alta a estudiantes de segundo en adelante con cuántas personas pueden acompañar. Quien llegue a primero podrá pedir mentor desde Franky."
          />
        </EmptyBox>
      )}

      <NewMentorSheet open={creating} onClose={() => setCreating(false)} />
      <MentorSheet id={openMentor} onClose={() => setOpenMentor(null)} />
      <AssignSheet id={assigning} onClose={() => setAssigning(null)} />
    </ProPage>
  );
}

function NewMentorSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const faculties = facultyOptions(data);
  const [name, setName] = React.useState("");
  const [faculty, setFaculty] = React.useState("");
  const [year, setYear] = React.useState("3");
  const [capacity, setCapacity] = React.useState("3");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setFaculty(faculties[0] ?? "");
    setYear("3");
    setCapacity("3");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = name.trim().length > 2 && faculty.trim().length > 1;
  const save = async () => {
    if (!valid) return;
    const mentor: ProUniMentor = { id: localId("me"), name: name.trim(), faculty: faculty.trim(), year: Number(year), capacity: Number(capacity), active: true, since: now.toISOString() };
    const ok = await run(
      "mentors.create",
      (d) => withMentors(d, (x) => ({ mentors: [...x.mentors, mentor] })),
      "Mentor dado de alta",
      `${mentor.name} ya puede acompañar a ${capacity === "1" ? "1 persona" : `${capacity} personas`} de primero de ${mentor.faculty}.`,
    );
    if (ok) onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo mentor" description="Estudiante de segundo en adelante que acompaña a quien llega." footer={<PButton label="Dar de alta" icon={UserPlus} disabled={!valid} onPress={() => void save()} />}>
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder="Nombre y apellido" label="Nombre" />
      </Field>
      <Field label="Facultad">
        {faculties.length ? (
          <ChoiceGrid<string> value={faculty} onChange={setFaculty} options={faculties.map((f) => ({ value: f, label: f }))} />
        ) : (
          <Input value={faculty} onChangeText={setFaculty} placeholder="Derecho" label="Facultad" />
        )}
      </Field>
      <Field label="Curso">
        <ChoiceGrid<string> value={year} onChange={setYear} options={[2, 3, 4, 5].map((y) => ({ value: String(y), label: MENTOR_YEAR_LABEL[y] }))} />
      </Field>
      <Field label="Puede acompañar a" hint="Personas de primero a la vez. Tres suele ser un buen número.">
        <ChoiceGrid<string> value={capacity} onChange={setCapacity} options={CAPACITY.map((c) => ({ value: c, label: c }))} />
      </Field>
    </Sheet>
  );
}

function MentorSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const mentor = m.mentors.find((x) => x.id === id);
  const [pausing, setPausing] = React.useState(false);
  React.useEffect(() => setPausing(false), [id]);
  if (!mentor) return null;

  const load = mentorLoad(mentor, m.requests);
  const own = m.requests.filter((r) => r.status === "matched" && r.mentorId === mentor.id);
  const talked = own.filter((r) => r.talked).length;

  const setCapacity = (value: string) =>
    void run("mentors.update", (d) => withMentors(d, (x) => ({ mentors: x.mentors.map((y) => (y.id === mentor.id ? { ...y, capacity: Number(value) } : y)) })), "Plazas actualizadas");
  const pause = async (release: boolean) => {
    const ok = await run(
      "mentors.pause",
      (d) => withMentors(d, (x) => pauseMentor(x, mentor.id, release)),
      `${mentor.name} en pausa`,
      release && load ? `${load === 1 ? "La persona que acompañaba vuelve" : `Las ${load} personas que acompañaba vuelven`} a la cola para darles otro mentor.` : "No recibirá a nadie nuevo.",
    );
    if (ok) onClose();
  };
  const resume = () => void run("mentors.resume", (d) => withMentors(d, (x) => ({ mentors: x.mentors.map((y) => (y.id === mentor.id ? { ...y, active: true } : y)) })), `${mentor.name} vuelve a estar activo`);

  return (
    <Sheet
      open={Boolean(id)}
      onClose={onClose}
      title={mentor.name}
      description={`${mentor.faculty} · ${MENTOR_YEAR_LABEL[mentor.year] ?? `${mentor.year}º`}`}
      footer={
        !mentor.active ? (
          <PButton label="Reactivar" icon={Play} onPress={resume} />
        ) : pausing ? (
          <>
            <PButton label="Volver" variant="ghost" onPress={() => setPausing(false)} />
            {load ? <PButton label="Mantener a su gente" variant="outline" onPress={() => void pause(false)} /> : null}
            <PButton label={load ? "Pasar a su gente a otro" : "Pausar"} onPress={() => void pause(true)} />
          </>
        ) : (
          <PButton label="Pausar" icon={Pause} variant="outline" onPress={() => setPausing(true)} />
        )
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <PAvatar name={mentor.name} toneKey={mentor.active ? "violet" : "slate"} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 26, color: C.text }} maxFontSizeMultiplier={1.2}>{`${load} de ${mentor.capacity}`}</Text>
          <PText v="tiny">personas de primero ahora mismo</PText>
        </View>
        {!mentor.active ? <Pill label="En pausa" /> : null}
      </View>
      <View>
        <Detail label="Mentor desde" value={relative(mentor.since, now.getTime())} />
        <Detail label="Ya se han escrito" value={own.length ? `${talked} de ${own.length}` : "Aún no acompaña a nadie"} last />
      </View>
      {mentor.active ? (
        <Field label="Puede acompañar a">
          <ChoiceGrid<string> value={String(mentor.capacity)} onChange={setCapacity} options={CAPACITY.map((c) => ({ value: c, label: c }))} />
        </Field>
      ) : null}
      {pausing ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
          <PText v="small">
            {load
              ? "Deja de recibir gente nueva. Elige si sigue con quien ya acompaña o si pasan a la cola para darles otro mentor."
              : "Deja de recibir gente nueva hasta que lo reactives."}
          </PText>
        </View>
      ) : null}
    </Sheet>
  );
}

function AssignSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const m = mentorsOf(data);
  const request = m.requests.find((r) => r.id === id);
  if (!request) return null;

  const options = m.mentors
    .filter((x) => x.active)
    .map((x) => ({ mentor: x, load: mentorLoad(x, m.requests), same: x.faculty === request.faculty, room: hasRoom(x, m.requests) }))
    .sort((a, b) => Number(b.room) - Number(a.room) || Number(b.same) - Number(a.same) || a.load - b.load);

  const assign = async (mentor: ProUniMentor) => {
    const ok = await run("mentors.assign", (d) => withMentors(d, (x) => ({ requests: assignMentor(x.requests, request.id, mentor.id, now) })), `Emparejado con ${mentor.name}`, "Le llega un aviso para escribir primero.");
    if (ok) onClose();
  };
  const days = waitingDays(request, now);

  return (
    <Sheet open={Boolean(id)} onClose={onClose} title="Elegir mentor" description={`Primero de ${request.faculty}, esperando ${days === 0 ? "desde hoy" : `${days} días`}`}>
      {request.international ? <PText v="small">Llega de fuera: si alguien ha estado de Erasmus, mejor.</PText> : null}
      {options.length ? (
        options.map(({ mentor, load, same, room }) => (
          <Tap
            key={mentor.id}
            onPress={() => void assign(mentor)}
            disabled={!room}
            accessibilityRole="button"
            accessibilityLabel={`Emparejar con ${mentor.name}`}
            style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.sm, opacity: room ? 1 : 0.5 }}
          >
            <PAvatar name={mentor.name} toneKey="violet" size={32} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{mentor.name}</PText>
              <PText v="tiny" numberOfLines={1}>{`${mentor.faculty} · ${load} de ${mentor.capacity}`}</PText>
            </View>
            {!same ? <Pill label="Otra facultad" /> : null}
            {room ? <Check size={16} color={C.muted} /> : <Pill tone="warning" label="Completo" />}
          </Tap>
        ))
      ) : (
        <PText v="small">No hay mentores activos. Da de alta uno desde la página de mentores.</PText>
      )}
    </Sheet>
  );
}
