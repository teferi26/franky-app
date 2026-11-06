import React from "react";
import { Share, View } from "react-native";
import { CalendarClock, Check, Megaphone, Plus, ScrollText, Share2, ShieldAlert, Trash2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProCourtPolicy, ProSpecialHours } from "../../../../../shared/pro/courts-types";
import { addDays, localDate, money, plural, relative, shortDay } from "../../../../../shared/pro/format";
import { MATCH_MINUTES, priceFor } from "../../../../../shared/pro/courts";
import { clockLabel, courtsOps, patchCourts } from "../../../../../shared/pro/courts-base";
import {
  COURTS_AMENITIES,
  WARNING_LABEL,
  checkSpecialHours,
  penaltyFor,
  policyShareText,
  removeSpecialHours,
  removeWarning,
  saveSpecialHours,
  setPolicy,
  warningsByPerson,
} from "../../../../../shared/pro/courts-admin";
import {
  ChoiceGrid,
  DayChips,
  Empty,
  Field,
  Input,
  ListRow,
  MultiChips,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Sheet,
  Stepper,
  TimeStepper,
  Toggle,
} from "../../kit";

/**
 * Normas del club o de la sala (versión nativa de web courts/normas.tsx):
 * preaviso, penalización, liberación de partidos y puestos, lluvia,
 * horarios especiales y convivencia.
 */
export default function Normas() {
  const { data, vertical, demo } = usePro();
  const coworking = vertical.id === "coworking";
  const ready = demo || Boolean(data.courts);
  if (!ready)
    return (
      <ProPage>
        <PageHeader eyebrow="Normas" title={coworking ? "Normas de la sala" : "Normas del club"} />
        <Panel>
          <Empty
            icon={ScrollText}
            title="Tus normas, en un solo sitio"
            body="Aquí pondrás el preaviso para cancelar, lo que paga quien no viene y los horarios especiales. Se aplican solas en cada reserva."
          />
        </Panel>
      </ProPage>
    );
  return <NormasBody />;
}

function NormasBody() {
  const { data, update, vertical, now, pending } = usePro();
  const ops = courtsOps(data);
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const [draft, setDraft] = React.useState<ProCourtPolicy>(ops.policy);
  const [covered, setCovered] = React.useState<string[]>(ops.coveredIds);
  const [hoursSheet, setHoursSheet] = React.useState(false);

  const savedKey = JSON.stringify([ops.policy, ops.coveredIds]);
  React.useEffect(() => {
    setDraft(ops.policy);
    setCovered(ops.coveredIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const dirty = JSON.stringify([draft, covered]) !== savedKey;
  const courts = data.resources.filter((r) => r.kind === "court");
  const sample = courts[0] ?? data.resources[0];
  const samplePrice = sample ? (priceFor(sample, addDays(today, 1), 19 * 60, coworking ? 60 : MATCH_MINUTES) ?? 0) : 0;
  const set = <K extends keyof ProCourtPolicy>(key: K, value: ProCourtPolicy[K]) => setDraft((p) => ({ ...p, [key]: value }));
  const share = policyShareText(draft, data.space.name, coworking, coworking ? ops.rules : []);

  const save = async () => {
    const ok = await update("court.policy.save", (d) => patchCourts(setPolicy(d, draft), { coveredIds: covered }));
    if (ok) toast("Normas guardadas", "Se aplican desde ahora en las nuevas cancelaciones.");
  };

  const summary =
    draft.penaltyPct === 0
      ? `Se cancela sin coste con ${draft.noticeHours} h de preaviso y sin penalización.`
      : `Cancelar es gratis hasta ${draft.noticeHours} h antes. Después, o si no viene, se cobra el ${draft.penaltyPct} %.`;
  const penalties = ops.penalties.filter((p) => localDate(p.at) >= addDays(today, -30));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Normas"
        title={coworking ? "Normas de la sala" : "Normas del club"}
        description={summary}
        actions={<PButton label="Compartir" icon={Share2} variant="outline" small onPress={() => void Share.share({ message: share })} />}
      />

      <Panel
        title="Cancelaciones y ausencias"
        description={
          samplePrice && draft.penaltyPct
            ? `Con una reserva de ${money(samplePrice)}, quien cancela tarde paga ${money(penaltyFor(draft, samplePrice))}.`
            : "Lo que se aplica cuando alguien cancela tarde o no aparece."
        }
      >
        <View style={{ gap: S.lg }}>
          <Field label="Cancelar gratis hasta">
            <ChoiceGrid
              value={String(draft.noticeHours)}
              onChange={(v) => set("noticeHours", Number(v))}
              options={[0, 6, 12, 24, 48].map((h) => ({ value: String(h), label: h === 0 ? "La hora" : `${h} h antes` }))}
            />
          </Field>
          <Field label="Si cancela tarde o no viene, paga">
            <ChoiceGrid
              value={String(draft.penaltyPct)}
              onChange={(v) => set("penaltyPct", Number(v))}
              options={[0, 25, 50, 100].map((p) => ({ value: String(p), label: p === 0 ? "Nada" : `El ${p} %` }))}
            />
          </Field>
          <Field label="Marcar en rojo a partir de" hint="La ficha avisa y, al reservar, lo ves antes de confirmar.">
            <ChoiceGrid
              value={String(draft.noShowWarnAt)}
              onChange={(v) => set("noShowWarnAt", Number(v))}
              options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ausencias` }))}
            />
          </Field>
        </View>
      </Panel>

      {coworking ? (
        <Panel title="Puestos reservados" description="Si alguien no llega, su puesto vuelve a estar libre.">
          <Field label="Liberar el puesto tras">
            <ChoiceGrid
              value={String(draft.releaseAfterMinutes)}
              onChange={(v) => set("releaseAfterMinutes", Number(v))}
              options={[15, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }))}
            />
          </Field>
        </Panel>
      ) : (
        <>
          <Panel title="Partidos abiertos" description="Un partido que no se completa no te bloquea la pista: se libera a tiempo.">
            <Field label="Liberar la pista si no está completo">
              <ChoiceGrid
                value={String(draft.matchReleaseHours)}
                onChange={(v) => set("matchReleaseHours", Number(v))}
                options={[2, 3, 6, 12].map((h) => ({ value: String(h), label: `${h} h antes` }))}
              />
            </Field>
          </Panel>
          <Panel title="Si llueve" description="El botón Llueve mueve las reservas exteriores a estas pistas.">
            <View style={{ gap: S.md }}>
              <Field label="Pistas cubiertas">
                <MultiChips options={courts.map((r) => ({ value: r.id, label: r.name }))} value={covered} onChange={setCovered} />
              </Field>
              <Toggle label="Cancelar por lluvia no cuesta nada" value={draft.rainFree} onChange={(v) => set("rainFree", v)} />
            </View>
          </Panel>
        </>
      )}

      <Panel title="Puntualidad y uso" description="Va al final del mensaje de confirmación.">
        <Input
          multiline
          value={draft.punctualityNote}
          onChangeText={(v) => set("punctualityNote", v)}
          maxLength={400}
          label="Puntualidad y uso"
          placeholder={coworking ? "Silencio en la zona de silencio. Las llamadas, fuera." : "Llega 10 minutos antes. La pista se entrega a la hora en punto."}
        />
      </Panel>

      {dirty ? (
        <View style={{ marginBottom: S.lg }}>
          <PButton label="Guardar cambios" icon={Check} full onPress={() => void save()} disabled={pending} />
        </View>
      ) : null}

      <SpecialHoursPanel onAdd={() => setHoursSheet(true)} />
      {coworking ? <AmenitiesPanel /> : null}
      {coworking ? <WarningsPanel /> : null}

      {!coworking ? (
        <Panel title="Penalizaciones del último mes" flush>
          {penalties.length ? (
            penalties
              .slice()
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((p, i, list) => (
                <ListRow key={p.id} last={i === list.length - 1}>
                  <PAvatar name={p.clientName} size={32} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{p.clientName}</PText>
                    <PText v="tiny">
                      {p.kind === "no_show" ? "No vino" : "Canceló tarde"}, {relative(p.at, now.getTime())}
                    </PText>
                  </View>
                  <Pill label={p.status === "charged" ? money(p.amountCents) : "Perdonada"} tone={p.status === "charged" ? "neutral" : "success"} />
                </ListRow>
              ))
          ) : (
            <Empty icon={ShieldAlert} title="Nadie ha faltado este mes" body="Cuando alguien cancele tarde, al anularla eliges si cobrar o perdonar." />
          )}
        </Panel>
      ) : null}

      <Panel title="Así lo recibe tu cliente">
        <PText v="small">{share}</PText>
      </Panel>

      <SpecialHoursSheet open={hoursSheet} onClose={() => setHoursSheet(false)} />
    </ProPage>
  );
}

/** "vie 3 oct" para una fecha YYYY-MM-DD. */
function day(date: string) {
  return shortDay(`${date}T12:00:00Z`).replace(/./g, "");
}

function SpecialHoursPanel({ onAdd }: { onAdd: () => void }) {
  const { data, update, now, vertical } = usePro();
  const today = localDate(now);
  const list = courtsOps(data).specialHours.filter((s) => s.to >= today);
  const coworking = vertical.id === "coworking";

  const announce = async (s: ProSpecialHours) => {
    const text = `${s.label} en ${data.space.name}: del ${day(s.from)} al ${day(s.to)}, de ${clockLabel(s.open)} a ${clockLabel(s.close)}.`;
    await Share.share({ message: text });
    const ok = await update("court.hours.announce", (d) => saveSpecialHours(d, { ...s, announced: true }));
    if (ok) toast("Horario anunciado");
  };

  return (
    <Panel
      title="Horarios especiales"
      description={coworking ? "Exámenes, festivos o verano. El calendario y el aforo lo respetan." : "Verano, festivos o un torneo. El calendario lo respeta."}
      action={<PButton label="Añadir" icon={Plus} variant="outline" small onPress={onAdd} />}
      flush
    >
      {list.length ? (
        list.map((s, i) => (
          <ListRow key={s.id} last={i === list.length - 1}>
            <CalendarClock size={16} color={C.muted} strokeWidth={1.9} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{s.label}</PText>
              <PText v="tiny">
                Del {day(s.from)} al {day(s.to)}, de {clockLabel(s.open)} a {clockLabel(s.close)}
              </PText>
            </View>
            {s.announced ? (
              <Pill label="Anunciado" tone="success" />
            ) : (
              <PButton label="Anunciar" icon={Megaphone} variant="outline" small onPress={() => void announce(s)} />
            )}
            <Tap
              onPress={() => void update("court.hours.remove", (d) => removeSpecialHours(d, s.id))}
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${s.label}`}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Trash2 size={16} color={C.muted} strokeWidth={1.9} />
            </Tap>
          </ListRow>
        ))
      ) : (
        <Empty
          icon={CalendarClock}
          title="Sin horarios especiales"
          body={coworking ? "¿Abres hasta las 2:00 en enero? Ponlo aquí y los estudiantes con exámenes lo sabrán a tiempo." : "Horario de verano, Navidad o un festivo local: ponlo aquí y nadie reserva cuando está cerrado."}
        />
      )}
    </Panel>
  );
}

function SpecialHoursSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const [label, setLabel] = React.useState("");
  const [from, setFrom] = React.useState(addDays(today, 7));
  const [days, setDays] = React.useState(7);
  const [openAt, setOpenAt] = React.useState(8 * 60);
  const [closeAt, setCloseAt] = React.useState(24 * 60);

  React.useEffect(() => {
    if (!open) return;
    setLabel("");
    setFrom(addDays(today, 7));
    setDays(7);
    setOpenAt(8 * 60);
    setCloseAt(24 * 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draft: ProSpecialHours = { id: "nuevo", label: label.trim(), from, to: addDays(from, days - 1), open: openAt, close: closeAt, announced: false };
  const check = checkSpecialHours(data, draft);
  const valid = draft.label.length >= 3 && check.ok;

  const save = async () => {
    if (!valid) return;
    const saved = { ...draft, id: localId("hs") };
    const ok = await update("court.hours.save", (d) => saveSpecialHours(d, saved));
    if (ok) {
      toast("Horario guardado", `${saved.label}: el calendario ya lo respeta.`);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo horario especial"
      description="Del primer al último día, ambos incluidos."
      footer={<PButton label="Guardar" full onPress={() => void save()} disabled={!valid} />}
    >
      <View style={{ gap: S.lg }}>
        <Field label="Nombre">
          <Input value={label} onChangeText={setLabel} placeholder="Exámenes de enero" />
        </Field>
        <Field label="Empieza">
          <DayChips value={from} onChange={setFrom} today={today} days={60} />
        </Field>
        <Field label="Días">
          <Stepper value={days} onChange={setDays} min={1} max={60} label="días" format={(v) => plural(v, "día", "días")} />
        </Field>
        <Field label="Abre">
          <TimeStepper value={openAt} onChange={setOpenAt} label="hora de apertura" min={6 * 60} max={14 * 60} step={30} />
        </Field>
        <Field label="Cierra">
          <TimeStepper value={closeAt} onChange={setCloseAt} label="hora de cierre" min={14 * 60} max={28 * 60} step={30} />
        </Field>
        {!check.ok ? (
          <PText v="small" color={C.error}>
            {check.reason === "overlap" ? `Coincide con «${check.with}». Cambia las fechas.` : "Revisa las fechas y las horas."}
          </PText>
        ) : null}
      </View>
    </Sheet>
  );
}

function AmenitiesPanel() {
  const { data, update } = usePro();
  const amenities = courtsOps(data).amenities;
  const toggle = (id: string, on: boolean) =>
    void update("court.amenities", (d) =>
      patchCourts(d, (o) => ({ amenities: on ? [...o.amenities.filter((a) => a !== id), id] : o.amenities.filter((a) => a !== id) })),
    );
  return (
    <Panel title="Servicios de tu sala" description="Es lo que el estudiante mira antes de elegir dónde estudiar.">
      {COURTS_AMENITIES.map((a) => (
        <Toggle key={a.id} label={a.label} value={amenities.includes(a.id)} onChange={(v) => toggle(a.id, v)} />
      ))}
    </Panel>
  );
}

function WarningsPanel() {
  const { data, update, now } = usePro();
  const people = warningsByPerson(data, localDate(now));
  const limit = Math.max(3, courtsOps(data).policy.noShowWarnAt);
  return (
    <Panel title="Avisos de convivencia" description="Últimos 90 días. Al tercero, la ficha se marca." flush>
      {people.length ? (
        people.map((p, i) => (
          <ListRow key={p.key} last={i === people.length - 1}>
            <PAvatar name={p.name} size={32} toneKey={p.count >= limit ? "rose" : "slate"} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{p.name}</PText>
              <PText v="tiny" numberOfLines={1}>
                {WARNING_LABEL[p.last.kind]}
                {p.last.note ? `: ${p.last.note}` : ""}
              </PText>
            </View>
            <Pill label={plural(p.count, "aviso", "avisos")} tone={p.count >= limit ? "danger" : "neutral"} />
            <Tap
              onPress={() => void update("court.warning.remove", (d) => removeWarning(d, p.last.id))}
              accessibilityRole="button"
              accessibilityLabel={`Quitar el último aviso de ${p.name}`}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Trash2 size={16} color={C.muted} strokeWidth={1.9} />
            </Tap>
          </ListRow>
        ))
      ) : (
        <Empty icon={ShieldAlert} title="Todo tranquilo" body="Los avisos que apunte la recepción por ruido o por guardar el puesto aparecen aquí." />
      )}
    </Panel>
  );
}
