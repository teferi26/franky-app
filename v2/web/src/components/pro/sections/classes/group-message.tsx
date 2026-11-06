"use client";

import * as React from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProClassSession } from "@/lib/pro/types";
import { dayLabel, localMinutes, minutesToLabel, time } from "@/lib/pro/format";
import { sessionRoster } from "@/lib/pro/classes";
import { firstName } from "@/lib/pro/classes-care";
import { GROUP_MESSAGE_LABEL, groupMessage, typeExtra, type GroupMessageKind } from "@/lib/pro/classes-ops";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { Avatar, ChoiceChips, Drawer, FormField, inputClass } from "../../kit";

/**
 * Mensaje a todo el grupo de una clase: plantillas para cancelar, cambiar de
 * hora, avisar del examen o felicitar; se abre WhatsApp persona a persona (sin
 * grupos ni listas de difusión) o se copian los móviles de golpe.
 */
export function GroupMessageDrawer({ session, onClose }: { session: ProClassSession | null; onClose: () => void }) {
  const { data, now, vertical } = usePro();
  const toast = useToast();
  const [kind, setKind] = React.useState<GroupMessageKind>("reminder");
  const [newMinute, setNewMinute] = React.useState(0);
  const [sent, setSent] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!session) return;
    setKind("reminder");
    setNewMinute(localMinutes(session.start) + 60);
    setSent(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  if (!session) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const { booked } = sessionRoster(data, session, now);
  const examOn = typeExtra(data, session.classTypeId).examOn;
  const kinds: GroupMessageKind[] = vertical.id === "academy" ? ["reminder", "moved", "cancelled", "exam", "passed"] : ["reminder", "moved", "cancelled"];
  const phoneOf = (clientId?: string) =>
    data.members.find((m) => m.id === clientId)?.phone ?? data.clients.find((c) => c.id === clientId)?.phone;
  const people = booked.map((b) => ({ id: b.id, name: b.clientName, phone: phoneOf(b.clientId) }));
  const withPhone = people.filter((p) => p.phone);

  const text = (name: string) =>
    groupMessage(kind, {
      name: firstName(name),
      className: ct?.name ?? "clase",
      day: dayLabel(session.start, { weekday: true }).split(" de ")[0],
      hour: time(session.start),
      newHour: minutesToLabel(newMinute),
      sender: data.space.owner.firstName || data.space.name,
      place: data.space.name,
      examDay: examOn ? dayLabel(`${examOn}T12:00:00Z`, { weekday: false }) : undefined,
    });

  const copyPhones = async () => {
    try {
      await navigator.clipboard.writeText(withPhone.map((p) => p.phone).join(", "));
      toast.success("Móviles copiados", `${withPhone.length} números listos para pegar.`);
    } catch {
      toast.info("No se pudieron copiar", "Tu navegador no deja copiar desde aquí.");
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title="Mensaje al grupo"
      description={`${ct?.name ?? "Clase"}, ${dayLabel(session.start)} a las ${time(session.start)}. ${booked.length} ${booked.length === 1 ? "persona" : "personas"}.`}
      footer={
        <Button variant="outline" onClick={copyPhones} disabled={!withPhone.length}>
          <Copy className="h-4 w-4" /> Copiar móviles
        </Button>
      }
      wide
    >
      <div className="flex flex-col gap-5">
        <FormField label="Plantilla">
          <ChoiceChips value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: GROUP_MESSAGE_LABEL[k] }))} />
        </FormField>
        {kind === "moved" ? (
          <FormField label="Nueva hora" htmlFor="gm-hour">
            <input
              id="gm-hour"
              type="time"
              step={900}
              value={minutesToLabel(newMinute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setNewMinute((h || 0) * 60 + (m || 0));
              }}
              className={inputClass}
            />
          </FormField>
        ) : null}
        <p className="whitespace-pre-line rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">{text(people[0]?.name ?? "Lucía")}</p>
        <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
          {people.map((p) => {
            const link = customerWhatsApp(p.phone, text(p.name));
            const done = sent.has(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={p.name} size="sm" tone={done ? "emerald" : "slate"} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                {link ? (
                  <Button size="sm" variant={done ? "ghost" : "secondary"} asChild>
                    <a href={link} target="_blank" rel="noreferrer" onClick={() => setSent((s) => new Set(s).add(p.id))}>
                      {done ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />} {done ? "Enviado" : "Enviar"}
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-text-muted">Sin móvil</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Drawer>
  );
}
