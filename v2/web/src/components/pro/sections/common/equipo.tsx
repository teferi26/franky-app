"use client";

import * as React from "react";
import { Check, Clock3, Download, LogIn, LogOut, Minus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProEngine, ProRole, ProStaff } from "@/lib/pro/types";
import { addDays, capitalize, dayLabel, durationLabel, localDate, money, time } from "@/lib/pro/format";
import { TONE_ORDER } from "../../tones";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, FormField, Kpi, KpiRow, LiveDot, PageHeader, Panel, Pill, Segmented, Tip, inputClass } from "../../kit";
import { AgendaTeamRules } from "../agenda/team-rules";
import { monthSummary } from "@/lib/pro/agenda-money";

/** Cómo se llama cada rol en cada tipo de negocio y qué puede hacer. */
const ROLES: Record<ProEngine, { role: ProRole; label: string; hint: string }[]> = {
  agenda: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Todo menos facturación" },
    { role: "staff", label: "Profesional", hint: "Su agenda, sus clientes y cobrar" },
    { role: "reception", label: "Recepción", hint: "Agenda de todos y cobrar" },
  ],
  tables: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado de sala", hint: "Reservas, sala, carta y equipo" },
    { role: "staff", label: "Camarero", hint: "Sala, reservas del día y validar" },
    { role: "reception", label: "Barra", hint: "Validar Franky Card y sellos" },
  ],
  night: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Eventos, reservados y equipo" },
    { role: "reception", label: "Puerta", hint: "Solo escanear y ver aforo" },
    { role: "rrpp", label: "RRPP", hint: "Su enlace, su lista y sus ventas" },
  ],
  classes: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Coordinador", hint: "Horario, socios y cobros" },
    { role: "staff", label: "Monitor o profesor", hint: "Sus clases y pasar lista" },
    { role: "reception", label: "Recepción", hint: "Altas, cobros y check-in" },
  ],
  courts: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Reservas, precios y equipo" },
    { role: "staff", label: "Monitor", hint: "Sus clases y partidos" },
    { role: "reception", label: "Recepción", hint: "Reservas y cobros" },
  ],
  housing: [
    { role: "owner", label: "Dirección", hint: "Todo, incluida la facturación" },
    { role: "agent", label: "Agente", hint: "Sus interesados, visitas y pisos" },
    { role: "manager", label: "Administración", hint: "Inquilinos, cobros y fianzas" },
  ],
  community: [
    { role: "board", label: "Junta", hint: "Todo lo de la asociación" },
    { role: "editor", label: "Voluntario", hint: "Actividades y check-in" },
  ],
  university: [
    { role: "owner", label: "Responsable", hint: "Todo el espacio institucional" },
    { role: "editor", label: "Comunicación", hint: "Publicaciones y bienvenida" },
    { role: "manager", label: "Moderación", hint: "Moderar el campus" },
  ],
};

const CAPABILITIES: { label: string; roles: ProRole[] }[] = [
  { label: "Ver la operación del día", roles: ["owner", "manager", "staff", "reception", "agent", "board", "editor"] },
  { label: "Crear y mover reservas o citas", roles: ["owner", "manager", "reception", "staff", "agent", "board"] },
  { label: "Cobrar y validar Franky Card", roles: ["owner", "manager", "reception", "staff"] },
  { label: "Ver ingresos e informes", roles: ["owner", "manager"] },
  { label: "Lanzar ofertas a estudiantes", roles: ["owner", "manager", "board"] },
  { label: "Gestionar el equipo", roles: ["owner", "manager", "board"] },
  { label: "Plan y facturación de Franky", roles: ["owner", "board"] },
];

export default function EquipoSection() {
  const { data, vertical, update, now, pending, can, demo } = usePro();
  const toast = useToast();
  const [tab, setTab] = React.useState<"personas" | "fichajes" | "permisos">("personas");
  const [inviting, setInviting] = React.useState(false);
  const roles = ROLES[vertical.engine];
  const today = localDate(now);
  const monthStart = today.slice(0, 8) + "01";

  const weekStart = addDays(today, -6);
  const minutesFor = (staffId: string) =>
    data.shifts
      .filter((s) => s.staffId === staffId && s.date >= weekStart)
      .reduce((a, s) => a + Math.max(0, (new Date(s.outAt ?? now.toISOString()).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes), 0);
  // En la agenda la comisión sigue las reglas de cada persona (servicios,
  // productos, sin propinas): la misma cuenta que Caja, vista Mes.
  const agendaMonth = vertical.engine === "agenda" ? monthSummary(data, today.slice(0, 7)) : null;
  const commissionFor = (st: ProStaff) =>
    agendaMonth
      ? (agendaMonth.staff.find((row) => row.staff.id === st.id)?.commissionCents ?? 0)
      : Math.round(
          data.payments.filter((p) => p.staffId === st.id && localDate(p.at) >= monthStart).reduce((a, p) => a + p.amountCents, 0) * (st.commissionPct / 100),
        );
  const clockedIn = data.staff.filter((s) => s.clockedInAt).length;
  const totalCommissions = data.staff.reduce((a, s) => a + commissionFor(s), 0);
  const weekHours = data.staff.reduce((a, s) => a + minutesFor(s.id), 0);

  const clock = async (st: ProStaff) => {
    const at = new Date().toISOString();
    if (st.clockedInAt) {
      if (!(await update("staff.clockOut", (d) => ({
        ...d,
        staff: d.staff.map((s) => (s.id === st.id ? { ...s, clockedInAt: null } : s)),
        shifts: d.shifts.map((sh) => (sh.staffId === st.id && sh.outAt === null ? { ...sh, outAt: at } : sh)),
      })))) return;
      toast.success(`${st.name.split(" ")[0]} ha fichado la salida`, time(at));
    } else {
      if (!(await update("staff.clockIn", (d) => ({
        ...d,
        staff: d.staff.map((s) => (s.id === st.id ? { ...s, clockedInAt: at } : s)),
        shifts: [...d.shifts, { id: localId("sh"), staffId: st.id, date: today, inAt: at, outAt: null, breakMinutes: 0 }],
      })))) return;
      toast.success(`${st.name.split(" ")[0]} ha fichado la entrada`, time(at));
    }
  };

  const exportShifts = () => {
    const rows = [
      ["Fecha", "Persona", "Entrada", "Salida", "Descanso (min)", "Horas"],
      ...[...data.shifts]
        .sort((a, b) => a.inAt.localeCompare(b.inAt))
        .map((s) => {
          const st = data.staff.find((x) => x.id === s.staffId);
          const mins = s.outAt ? (new Date(s.outAt).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes : 0;
          return [s.date, st?.name ?? "", time(s.inAt), s.outAt ? time(s.outAt) : "", String(s.breakMinutes), (mins / 60).toFixed(2).replace(".", ",")];
        }),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-jornada-${data.space.slug}-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Registro exportado", "Listo para tu gestoría o una inspección.");
  };

  const roleLabel = (r: ProRole) => roles.find((x) => x.role === r)?.label ?? r;
  const showCommissions = (demo || can("finance.read")) && (vertical.engine === "agenda" || data.staff.some((s) => s.commissionPct > 0));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipo"
        title={`${data.staff.length} ${data.staff.length === 1 ? "persona" : "personas"} en ${data.space.name}`}
        description={`${clockedIn} ${clockedIn === 1 ? "ha fichado" : "han fichado"} hoy. Cada una entra con su propio acceso y ve solo lo suyo.`}
        actions={
          <Button variant="dark" onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" /> Invitar
          </Button>
        }
      >
        <Segmented
          label="Apartados"
          value={tab}
          onChange={setTab}
          options={[
            { value: "personas", label: "Personas" },
            { value: "fichajes", label: "Fichajes" },
            { value: "permisos", label: "Permisos" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Clock3} label="Fichados ahora" value={`${clockedIn}/${data.staff.length}`} />
        <Kpi label="Horas, 7 días" value={`${Math.round(weekHours / 60)} h`} hint="de todo el equipo" />
        <Kpi label={showCommissions ? "Comisiones del mes" : "Personas"} value={showCommissions ? money(totalCommissions, { round: true }) : data.staff.length} />
        <Kpi label="Accesos" value={data.staff.length} hint="sin compartir contraseñas" />
      </KpiRow>

      {tab === "personas" ? (
        <Panel flush>
          <ul className="divide-y divide-border-light">
            {data.staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <Avatar name={s.name} tone={s.tone} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{s.name}</span>
                    <Pill>{roleLabel(s.role)}</Pill>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                    {s.clockedInAt ? (
                      <>
                        <LiveDot className="h-1.5 w-1.5" /> Trabajando desde las {time(s.clockedInAt)}
                      </>
                    ) : (
                      s.title
                    )}
                  </span>
                </span>
                <span className="hidden text-right text-sm sm:block">
                  <span className="block font-semibold tabular">{durationLabel(Math.round(minutesFor(s.id)))}</span>
                  <span className="text-xs text-text-muted">esta semana</span>
                </span>
                {showCommissions && s.commissionPct ? (
                  <span className="hidden text-right text-sm md:block">
                    <span className="block font-semibold tabular">{money(commissionFor(s), { round: true })}</span>
                    <span className="text-xs text-text-muted">{agendaMonth ? "comisión del mes" : `${s.commissionPct} % del mes`}</span>
                  </span>
                ) : null}
                <Button size="sm" variant={s.clockedInAt ? "outline" : "secondary"} disabled={pending || !can(s.clockedInAt ? "staff.clockOut" : "staff.clockIn")} onClick={() => clock(s)}>
                  {s.clockedInAt ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
                  {s.clockedInAt ? "Fichar salida" : "Fichar entrada"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {tab === "personas" && vertical.engine === "agenda" ? <AgendaTeamRules /> : null}

      {tab === "fichajes" ? (
        <>
          <Panel
            title="Registro de jornada"
            description="Entradas y salidas de los últimos 7 días."
            action={
              <Button size="sm" variant="outline" onClick={exportShifts}>
                <Download className="h-3.5 w-3.5" /> Exportar
              </Button>
            }
            flush
          >
            <div className="overflow-x-auto pro-scroll">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left text-xs uppercase tracking-wider text-text-muted">
                    <th className="px-5 py-2.5 font-semibold">Día</th>
                    <th className="px-3 py-2.5 font-semibold">Persona</th>
                    <th className="px-3 py-2.5 font-semibold">Entrada</th>
                    <th className="px-3 py-2.5 font-semibold">Salida</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Horas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {[...data.shifts]
                    .filter((s) => s.date >= weekStart)
                    .sort((a, b) => b.inAt.localeCompare(a.inAt))
                    .map((s) => {
                      const st = data.staff.find((x) => x.id === s.staffId);
                      const mins = Math.max(0, (new Date(s.outAt ?? now.toISOString()).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes);
                      return (
                        <tr key={s.id} className="hover:bg-bg-secondary">
                          <td className="px-5 py-2.5 text-text-muted">{capitalize(dayLabel(`${s.date}T12:00:00Z`))}</td>
                          <td className="px-3 py-2.5 font-medium">{st?.name}</td>
                          <td className="px-3 py-2.5 tabular">{time(s.inAt)}</td>
                          <td className="px-3 py-2.5 tabular">{s.outAt ? time(s.outAt) : <Pill tone="success">Trabajando</Pill>}</td>
                          <td className="px-5 py-2.5 text-right font-semibold tabular">{durationLabel(Math.round(mins))}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Tip title="Registro de jornada">
            Es obligatorio llevarlo desde 2019. Cada persona ficha desde su móvil al entrar y al salir, y el registro se guarda cuatro años. Si te lo pide una inspección o tu gestoría, lo exportas en un clic.
          </Tip>
        </>
      ) : null}

      {tab === "permisos" ? (
        <Panel title="Qué puede hacer cada rol" description="Los permisos se aplican en el servidor: quien no tiene acceso no lo ve ni aunque lo busque." flush>
          <div className="overflow-x-auto pro-scroll">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border-light text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="px-5 py-2.5 font-semibold">Puede</th>
                  {roles.map((r) => (
                    <th key={r.role} className="px-3 py-2.5 text-center font-semibold">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {CAPABILITIES.map((c) => (
                  <tr key={c.label}>
                    <td className="px-5 py-2.5">{c.label}</td>
                    {roles.map((r) => (
                      <td key={r.role} className="px-3 py-2.5 text-center">
                        {c.roles.includes(r.role) ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Sí" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-border" aria-label="No" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <InviteDrawer open={inviting} onClose={() => setInviting(false)} roles={roles} />
    </div>
  );
}

function InviteDrawer({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: { role: ProRole; label: string; hint: string }[] }) {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [role, setRole] = React.useState<ProRole>(roles[roles.length > 2 ? 2 : 1]?.role ?? "staff");

  React.useEffect(() => {
    if (open) {
      setName("");
      setContact("");
      setRole(roles[roles.length > 2 ? 2 : 1]?.role ?? "staff");
    }
  }, [open, roles]);

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Invitar al equipo"
      description="Guarda sus datos y el rol que tendrá en el equipo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="dark"
            disabled={pending || !can("staff.invite") || name.trim().length < 2 || contact.trim().length < 5}
            onClick={async () => {
              const tone = TONE_ORDER[data.staff.length % TONE_ORDER.length];
              if (!(await update("staff.invite", (d) => ({
                ...d,
                staff: [
                  ...d.staff,
                  {
                    id: localId("s"),
                    name: name.trim(),
                    role,
                    tone,
                    title: roles.find((r) => r.role === role)?.label ?? "Equipo",
                    commissionPct: 0,
                    clockedInAt: null,
                    weekMinutes: 0,
                    phone: contact.trim(),
                  },
                ],
              })))) return;
              toast.success("Persona añadida", `${name.trim()} ya aparece en el equipo.`);
              onClose();
            }}
          >
            Añadir al equipo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="inv-name">
          <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </FormField>
        <FormField label="Móvil o correo" htmlFor="inv-contact">
          <input id="inv-contact" value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} placeholder="600 000 000 o nombre@correo.com" />
        </FormField>
        <FormField label="Rol">
          <ChoiceChips value={role} onChange={setRole} options={roles.map((r) => ({ value: r.role, label: r.label, hint: r.hint }))} className={cn("grid grid-cols-1 sm:grid-cols-2")} />
        </FormField>
      </div>
    </Drawer>
  );
}
