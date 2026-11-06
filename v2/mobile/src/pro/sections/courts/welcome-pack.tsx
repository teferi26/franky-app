import React from "react";
import { Share, View } from "react-native";
import { GraduationCap, Send, Share2, Trophy } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import { localDate, money } from "../../../../../shared/pro/format";
import { clockLabel } from "../../../../../shared/pro/courts-base";
import {
  checkWelcomePack,
  createWelcomePack,
  valleyOfferPrice,
  welcomePackDefaults,
  welcomePackShareText,
  type WelcomePackCheck,
  type WelcomePackPlan,
} from "../../../../../shared/pro/courts-growth";
import { ChoiceGrid, DayChips, Field, PButton, PText, Sheet, Stepper } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { HourGrid } from "./ui";

/**
 * Pack de bienvenida de septiembre (versión nativa de web
 * courts/welcome-pack.tsx): clínic de iniciación en valle, americana para
 * que los nuevos se conozcan y, al terminar, el bono del primer mes.
 */

const WEEKDAYS = ["L", "M", "X", "J", "V"];
const CLINIC_TIMES = [10 * 60, 10 * 60 + 30, 11 * 60, 11 * 60 + 30, 12 * 60, 12 * 60 + 30, 13 * 60];
const AMERICANA_TIMES = [17 * 60, 17 * 60 + 30, 18 * 60, 18 * 60 + 30, 19 * 60, 19 * 60 + 30, 20 * 60];

const PROBLEM: Record<Exclude<WelcomePackCheck, { ok: true }>["reason"], string> = {
  clinic_coach: "El monitor ya tiene clase a esa hora. Elige otra hora u otro monitor.",
  clinic_court: "Esa pista ya tiene un grupo de escuela a esa hora.",
  clinic_hours: "El clínic se sale de tu horario de ese día.",
  americana_hours: "La americana se sale de tu horario de ese día.",
  americana_courts: "No quedan pistas libres para la americana a esa hora. Prueba otra hora u otro día.",
};

export function WelcomePackDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const [plan, setPlan] = React.useState<WelcomePackPlan | null>(null);
  const [done, setDone] = React.useState<WelcomePackPlan | null>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  React.useEffect(() => {
    if (!open) return;
    setPlan(welcomePackDefaults(data, today));
    setDone(null);
    // Solo al abrir: después manda lo que cambie el dueño.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const courts = data.resources.filter((r) => r.kind === "court");
  const coaches = data.staff.filter((s) => s.role !== "owner" || data.staff.length === 1);
  const check = plan ? checkWelcomePack(data, plan) : null;
  const setClinic = (patch: Partial<WelcomePackPlan["clinic"]>) => setPlan((p) => (p ? { ...p, clinic: { ...p.clinic, ...patch } } : p));
  const setAmericana = (patch: Partial<WelcomePackPlan["americana"]>) => setPlan((p) => (p ? { ...p, americana: { ...p.americana, ...patch } } : p));

  const create = async () => {
    if (!plan || !check?.ok) return;
    const ok = await update("court.welcome.create", (d) =>
      createWelcomePack(d, plan, { group: localId("gr"), americana: localId("am"), block: localId("blk"), campaign: localId("cp") }, new Date().toISOString()),
    );
    if (!ok) return;
    toast("Pack de bienvenida listo", { kind: "success", body: "Clínic en la escuela y americana con sus pistas bloqueadas." });
    setDone(plan);
  };

  const firstMonth = () => {
    const valley = valleyOfferPrice(data.resources, today);
    setOffer({ what: "Primer mes: 4 partidos en mañanas valle", date: today, from: 10 * 60, to: 14 * 60, priceCents: valley ? valley * 4 : undefined, slots: 20 });
  };

  return (
    <>
      <Sheet
        open={open && !offer}
        onClose={onClose}
        title={done ? "Ya está montado" : "Pack de bienvenida"}
        description={
          done
            ? "Compártelo hoy: los de primero eligen club en las dos primeras semanas."
            : plan
              ? "Clínic de iniciación en hora valle y americana para que los nuevos se conozcan."
              : "Da de alta al menos una pista y a tu monitor en Equipo, y vuelve aquí."
        }
        footer={
          done ? (
            <>
              <PButton label="Compartir" icon={Share2} variant="outline" onPress={() => void Share.share({ message: welcomePackShareText(done, data.space.name) })} />
              <PButton label="Bono del primer mes" icon={Send} onPress={firstMonth} />
            </>
          ) : plan ? (
            <>
              <PButton label="Cancelar" variant="ghost" onPress={onClose} />
              <PButton label="Crear el pack" onPress={() => void create()} disabled={!check?.ok} />
            </>
          ) : undefined
        }
      >
        {done ? (
          <>
            <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
              <PText v="small" color={C.text}>{welcomePackShareText(done, data.space.name)}</PText>
            </View>
            <PText v="small">El clínic ya aparece en Escuela y la americana en Torneos. Falta el bono del primer mes, solo para estudiantes.</PText>
          </>
        ) : plan ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <GraduationCap size={16} color={C.blue} strokeWidth={1.9} />
              <PText v="h2">Clínic de iniciación</PText>
            </View>
            <Field label="Día" hint="Una hora a la semana hasta Navidad.">
              <ChoiceGrid value={String(plan.clinic.weekday)} onChange={(v) => setClinic({ weekday: Number(v) })} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
            </Field>
            <Field label="Hora">
              <HourGrid minutes={CLINIC_TIMES} value={plan.clinic.from} onChange={(m) => setClinic({ from: m })} />
            </Field>
            {courts.length > 1 ? (
              <Field label="Pista">
                <ChoiceGrid value={plan.clinic.resourceId} onChange={(v) => setClinic({ resourceId: v })} options={courts.map((r) => ({ value: r.id, label: r.name }))} />
              </Field>
            ) : null}
            {coaches.length > 1 ? (
              <Field label="Monitor">
                <ChoiceGrid value={plan.clinic.coachId} onChange={(v) => setClinic({ coachId: v })} options={coaches.map((s) => ({ value: s.id, label: s.name.split(" ")[0] }))} />
              </Field>
            ) : null}
            <Field label="Cuota al mes">
              <Stepper label="Cuota al mes" value={plan.clinic.monthlyFeeCents} onChange={(v) => setClinic({ monthlyFeeCents: v })} min={0} max={20000} step={500} format={(v) => money(v)} />
            </Field>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: S.sm }}>
              <Trophy size={16} color={C.blue} strokeWidth={1.9} />
              <PText v="h2">Americana de bienvenida</PText>
            </View>
            <Field label="Día">
              <DayChips value={plan.americana.date} onChange={(d) => setAmericana({ date: d })} today={today} days={28} />
            </Field>
            <Field label="Hora">
              <HourGrid minutes={AMERICANA_TIMES} value={plan.americana.from} onChange={(m) => setAmericana({ from: m })} />
            </Field>
            <Field label="Jugadores" hint={`${Math.floor(plan.americana.maxPlayers / 4)} pistas, 2 h`}>
              <ChoiceGrid value={String(plan.americana.maxPlayers)} onChange={(v) => setAmericana({ maxPlayers: Number(v) })} options={["8", "12", "16"].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Por persona">
              <Stepper label="Precio por persona" value={plan.americana.pricePerPlayerCents} onChange={(v) => setAmericana({ pricePerPlayerCents: v })} min={0} max={5000} step={50} format={(v) => money(v)} />
            </Field>

            {check && !check.ok ? (
              <View style={{ borderRadius: R.lg, backgroundColor: `${C.warning}1F`, padding: S.md }}>
                <PText v="small" color={C.warning}>{PROBLEM[check.reason]}</PText>
              </View>
            ) : (
              <PText v="small">
                {`Clínic a las ${clockLabel(plan.clinic.from)} por ${money(plan.clinic.monthlyFeeCents)} al mes. Americana a las ${clockLabel(plan.americana.from)} por ${money(plan.americana.pricePerPlayerCents)} por persona.`}
              </PText>
            )}
          </>
        ) : null}
      </Sheet>
      <OfferComposer
        preset={offer}
        onClose={() => {
          setOffer(null);
          onClose();
        }}
      />
    </>
  );
}
