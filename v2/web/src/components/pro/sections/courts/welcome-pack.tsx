"use client";

import * as React from "react";
import { Copy, GraduationCap, Send, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { localDate, money } from "@/lib/pro/format";
import { clockLabel } from "@/lib/pro/courts-base";
import {
  checkWelcomePack,
  createWelcomePack,
  valleyOfferPrice,
  welcomePackDefaults,
  welcomePackShareText,
  type WelcomePackCheck,
  type WelcomePackPlan,
} from "@/lib/pro/courts-growth";
import { ChoiceChips, Drawer, FormField, inputClass } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { parseEuros, shortDate } from "./state";

/**
 * Pack de bienvenida de septiembre: en un paso, un clínic de iniciación en
 * hora valle, una americana para que los nuevos se conozcan y, al terminar,
 * el bono del primer mes publicado para estudiantes. Es lo que convierte a
 * los de primero en jugadores de todo el curso.
 */

const WEEKDAYS = [
  { value: "0", label: "L" },
  { value: "1", label: "M" },
  { value: "2", label: "X" },
  { value: "3", label: "J" },
  { value: "4", label: "V" },
];

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
  const toast = useToast();
  const today = localDate(now);
  const [plan, setPlan] = React.useState<WelcomePackPlan | null>(null);
  const [fee, setFee] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [done, setDone] = React.useState<WelcomePackPlan | null>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);

  React.useEffect(() => {
    if (!open) return;
    const p = welcomePackDefaults(data, today);
    setPlan(p);
    setFee(p ? String(p.clinic.monthlyFeeCents / 100) : "");
    setPrice(p ? String(p.americana.pricePerPlayerCents / 100) : "");
    setDone(null);
    // Solo al abrir: después manda lo que cambie el dueño.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const courts = data.resources.filter((r) => r.kind === "court");
  const coaches = data.staff.filter((s) => s.role !== "owner" || data.staff.length === 1);
  const feeCents = parseEuros(fee);
  const priceCents = parseEuros(price);
  const current: WelcomePackPlan | null =
    plan && feeCents !== null && priceCents !== null
      ? {
          ...plan,
          clinic: { ...plan.clinic, monthlyFeeCents: feeCents },
          americana: { ...plan.americana, pricePerPlayerCents: priceCents },
        }
      : null;
  const check = current ? checkWelcomePack(data, current) : null;

  const setClinic = (patch: Partial<WelcomePackPlan["clinic"]>) =>
    setPlan((p) => (p ? { ...p, clinic: { ...p.clinic, ...patch } } : p));
  const setAmericana = (patch: Partial<WelcomePackPlan["americana"]>) =>
    setPlan((p) => (p ? { ...p, americana: { ...p.americana, ...patch } } : p));

  const create = async () => {
    if (!current || !check?.ok) return;
    const ok = await update("court.welcome.create", (d) =>
      createWelcomePack(
        d,
        current,
        { group: localId("gr"), americana: localId("am"), block: localId("blk"), campaign: localId("cp") },
        new Date().toISOString(),
      ),
    );
    if (!ok) return;
    toast.success("Pack de bienvenida listo", "Clínic en la escuela y americana con sus pistas bloqueadas.");
    setDone(current);
  };

  const share = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Invitación copiada", "Pégala en el grupo del club o en tus historias.");
    } catch {
      toast.error("No se ha podido copiar", "Selecciona el texto y cópialo a mano.");
    }
  };

  const firstMonth = () => {
    const valley = valleyOfferPrice(data.resources, today);
    setOffer({
      what: "Primer mes: 4 partidos en mañanas valle",
      date: today,
      from: 10 * 60,
      to: 14 * 60,
      priceCents: valley ? valley * 4 : undefined,
      slots: 20,
    });
  };

  if (!plan && open)
    return (
      <Drawer open onOpenChange={(v) => !v && onClose()} title="Pack de bienvenida">
        <p className="text-sm text-text-muted">
          Da de alta al menos una pista y a tu monitor en Equipo, y vuelve aquí: el pack se monta solo con tus horarios.
        </p>
      </Drawer>
    );

  return (
    <>
      <Drawer
        open={open && !offer}
        onOpenChange={(v) => !v && onClose()}
        wide
        title={done ? "Ya está montado" : "Pack de bienvenida"}
        description={
          done
            ? "Compártelo hoy: los de primero eligen club en las dos primeras semanas."
            : "Clínic de iniciación en hora valle y americana para que los nuevos se conozcan. Cámbialo antes de crearlo."
        }
        footer={
          done ? (
            <>
              <Button variant="outline" onClick={() => share(welcomePackShareText(done, data.space.name))}>
                <Copy className="h-4 w-4" /> Copiar invitación
              </Button>
              <Button variant="dark" onClick={firstMonth}>
                <Send className="h-4 w-4" /> Publicar bono del primer mes
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="dark" onClick={create} disabled={!check?.ok}>
                Crear el pack
              </Button>
            </>
          )
        }
      >
        {done ? (
          <div className="flex flex-col gap-4">
            <p className="whitespace-pre-line rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">
              {welcomePackShareText(done, data.space.name)}
            </p>
            <p className="text-sm text-text-muted">
              El clínic ya aparece en Escuela y la americana en Torneos. Falta el tercer paso: un bono del primer mes solo
              para estudiantes, que se publica en Franky.
            </p>
          </div>
        ) : plan ? (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <p className="flex items-center gap-2 font-heading text-base font-bold">
                <GraduationCap className="h-4 w-4 text-violet" strokeWidth={1.9} /> Clínic de iniciación
              </p>
              <FormField label="Día" hint="Una hora a la semana hasta Navidad.">
                <ChoiceChips value={String(plan.clinic.weekday)} onChange={(v) => setClinic({ weekday: Number(v) })} options={WEEKDAYS} />
              </FormField>
              <FormField label="Hora" htmlFor="wp-clinic-time">
                <select
                  id="wp-clinic-time"
                  value={plan.clinic.from}
                  onChange={(e) => setClinic({ from: Number(e.target.value) })}
                  className={inputClass}
                >
                  {CLINIC_TIMES.map((m) => (
                    <option key={m} value={m}>
                      {clockLabel(m)}
                    </option>
                  ))}
                </select>
              </FormField>
              {courts.length > 1 ? (
                <FormField label="Pista">
                  <ChoiceChips
                    value={plan.clinic.resourceId}
                    onChange={(v) => setClinic({ resourceId: v })}
                    options={courts.map((r) => ({ value: r.id, label: r.name }))}
                  />
                </FormField>
              ) : null}
              {coaches.length > 1 ? (
                <FormField label="Monitor">
                  <ChoiceChips
                    value={plan.clinic.coachId}
                    onChange={(v) => setClinic({ coachId: v })}
                    options={coaches.map((s) => ({ value: s.id, label: s.name.split(" ")[0] }))}
                  />
                </FormField>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Plazas">
                  <ChoiceChips
                    value={String(plan.clinic.capacity)}
                    onChange={(v) => setClinic({ capacity: Number(v) })}
                    options={["6", "8", "10"].map((v) => ({ value: v, label: v }))}
                  />
                </FormField>
                <FormField label="Cuota al mes (€)" htmlFor="wp-fee">
                  <input id="wp-fee" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className={inputClass} />
                </FormField>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <p className="flex items-center gap-2 font-heading text-base font-bold">
                <Trophy className="h-4 w-4 text-violet" strokeWidth={1.9} /> Americana de bienvenida
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Día" htmlFor="wp-am-date" hint={shortDate(plan.americana.date)}>
                  <input
                    id="wp-am-date"
                    type="date"
                    min={today}
                    value={plan.americana.date}
                    onChange={(e) => e.target.value && setAmericana({ date: e.target.value })}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Hora" htmlFor="wp-am-time">
                  <select
                    id="wp-am-time"
                    value={plan.americana.from}
                    onChange={(e) => setAmericana({ from: Number(e.target.value) })}
                    className={inputClass}
                  >
                    {AMERICANA_TIMES.map((m) => (
                      <option key={m} value={m}>
                        {clockLabel(m)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Jugadores" hint={`${Math.floor(plan.americana.maxPlayers / 4)} pistas, 2 h`}>
                  <ChoiceChips
                    value={String(plan.americana.maxPlayers)}
                    onChange={(v) => setAmericana({ maxPlayers: Number(v) })}
                    options={["8", "12", "16"].map((v) => ({ value: v, label: v }))}
                  />
                </FormField>
                <FormField label="Por persona (€)" htmlFor="wp-price">
                  <input id="wp-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputClass} />
                </FormField>
              </div>
            </section>

            {check && !check.ok ? (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {PROBLEM[check.reason]}
              </p>
            ) : current ? (
              <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
                Clínic los {["lunes", "martes", "miércoles", "jueves", "viernes"][current.clinic.weekday]} a las{" "}
                {clockLabel(current.clinic.from)} por {money(current.clinic.monthlyFeeCents)} al mes. Americana el{" "}
                {shortDate(current.americana.date)} a las {clockLabel(current.americana.from)} por{" "}
                {money(current.americana.pricePerPlayerCents)} por persona.
              </p>
            ) : (
              <p className="text-sm text-text-muted">Revisa los importes: escribe solo números.</p>
            )}
          </div>
        ) : null}
      </Drawer>
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
