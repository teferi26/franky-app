"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProMembershipPlan } from "@/lib/pro/types";
import { planMembers } from "@/lib/pro/classes";
import { enrollmentFee, setEnrollmentFee } from "@/lib/pro/classes-study";
import { ChoiceChips, Drawer, FormField, inputClass } from "../../kit";

/** Crear o editar un plan, bono o pack con su precio de estudiante. */
export function PlanDrawer({ planId, onClose }: { planId: string | null; onClose: () => void }) {
  const { data, update, vertical } = usePro();
  const toast = useToast();
  const study = vertical.engine === "courts";
  const plan = planId && planId !== "new" ? data.plans.find((p) => p.id === planId) : undefined;
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [studentPrice, setStudentPrice] = React.useState("");
  const [period, setPeriod] = React.useState<ProMembershipPlan["period"]>("month");
  const [sessions, setSessions] = React.useState("");
  const [enrollment, setEnrollment] = React.useState("");
  // Matrícula o cuota de alta: gimnasios y academias con cuota, no packs ni pistas.
  const withEnrollment = vertical.engine === "classes" && vertical.id !== "culture" && period !== "pack";
  const enrollmentLabel = vertical.id === "academy" ? "Matrícula (€)" : "Cuota de alta (€)";

  React.useEffect(() => {
    if (!planId) return;
    setName(plan?.name ?? "");
    setPrice(plan ? String(plan.priceCents / 100) : "");
    setStudentPrice(plan?.studentPriceCents ? String(plan.studentPriceCents / 100) : "");
    setPeriod(plan?.period ?? (vertical.id === "culture" ? "pack" : "month"));
    setSessions(plan?.sessions ? String(plan.sessions) : "");
    const fee = plan ? enrollmentFee(data, plan.id) : 0;
    setEnrollment(fee ? String(fee / 100) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const valid = name.trim().length > 1 && cents(price) > 0;
  const count = plan ? planMembers(data, plan.id) : 0;

  const save = () => {
    const next: ProMembershipPlan = {
      id: plan?.id ?? localId("pl"),
      name: name.trim(),
      priceCents: cents(price),
      studentPriceCents: cents(studentPrice) || undefined,
      period,
      sessions: Number(sessions) > 0 ? Number(sessions) : null,
      members: plan?.members ?? 0,
    };
    void update(plan ? "plan.edit" : "plan.create", (d) => ({
      ...d,
      plans: plan ? d.plans.map((p) => (p.id === plan.id ? next : p)) : [...d.plans, next],
    }));
    // La matrícula se guarda aparte, con los datos propios del motor.
    const fee = withEnrollment ? cents(enrollment) : 0;
    if (fee !== enrollmentFee(data, next.id)) {
      void update("plan.enrollment", (d) => setEnrollmentFee(d, next.id, fee));
    }
    toast.success(plan ? "Plan actualizado" : "Plan creado", plan && count ? `El nuevo precio se aplica a ${count} personas en su próximo cobro.` : "Ya se puede contratar desde tu ficha de Franky.");
    onClose();
  };

  const remove = () => {
    if (!plan) return;
    void update("plan.delete", (d) => ({ ...d, plans: d.plans.filter((p) => p.id !== plan.id) }));
    toast.success("Plan eliminado");
    onClose();
  };

  return (
    <Drawer
      open={Boolean(planId)}
      onOpenChange={(v) => !v && onClose()}
      title={plan ? plan.name : vertical.id === "culture" ? "Nuevo pack" : "Nuevo plan o bono"}
      description={plan ? (vertical.id === "culture" ? `${plan.members} vendidos este curso.` : `${count} personas lo tienen ahora.`) : "Cuota mensual, bono de sesiones o pase suelto."}
      footer={
        <>
          {plan && !count ? (
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={remove}>
              Eliminar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            {plan ? "Guardar" : "Crear"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="pl-name">
          <input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder={study ? "Bono exámenes" : vertical.id === "culture" ? "Bono 4 talleres" : "Ilimitado"} />
        </FormField>
        <FormField label="Tipo">
          <ChoiceChips
            value={period}
            onChange={setPeriod}
            options={[
              { value: "month", label: "Mensual" },
              { value: "quarter", label: "Trimestral" },
              { value: "year", label: "Anual" },
              { value: "pack", label: "Bono o pase" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Precio (€)" htmlFor="pl-price">
            <input id="pl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} placeholder="49" />
          </FormField>
          <FormField label="Precio estudiante (€)" htmlFor="pl-student" hint="Opcional. Solo con carné verificado.">
            <input id="pl-student" inputMode="decimal" value={studentPrice} onChange={(e) => setStudentPrice(e.target.value)} className={inputClass} placeholder="39" />
          </FormField>
        </div>
        {withEnrollment ? (
          <FormField
            label={enrollmentLabel}
            htmlFor="pl-enrollment"
            hint="Opcional. Se cobra una sola vez, con el primer recibo."
          >
            <input
              id="pl-enrollment"
              inputMode="decimal"
              value={enrollment}
              onChange={(e) => setEnrollment(e.target.value)}
              className={inputClass}
              placeholder="Sin matrícula"
            />
          </FormField>
        ) : null}
        <FormField label={study ? "Días incluidos" : "Sesiones incluidas"} htmlFor="pl-sessions" hint="Déjalo vacío si es ilimitado.">
          <input id="pl-sessions" type="number" min={0} value={sessions} onChange={(e) => setSessions(e.target.value)} className={inputClass} placeholder="Ilimitado" />
        </FormField>
      </div>
    </Drawer>
  );
}
