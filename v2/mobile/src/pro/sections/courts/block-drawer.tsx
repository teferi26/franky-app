import React from "react";
import { View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import type { ToneKey } from "../../../../../shared/pro/types";
import type { ProCourtBlock, ProCourtBlockReason } from "../../../../../shared/pro/courts-types";
import { dayLabel, localDate, time } from "../../../../../shared/pro/format";
import { hoursFor } from "../../../../../shared/pro/courts";
import { BLOCK_REASON_LABEL, blocksOn, clockLabel } from "../../../../../shared/pro/courts-base";
import { addBlock, blockConflicts, removeBlock } from "../../../../../shared/pro/courts-ops";
import { ChoiceGrid, DayChips, Detail, Field, Input, MultiChips, PButton, PText, Sheet, TimeStepper } from "../../kit";

/**
 * Bloquear pistas por mantenimiento, clase, torneo o evento privado (versión
 * nativa de web courts/block-drawer.tsx). Antes de guardar enseña las
 * reservas que pisaría.
 */

export type BlockTarget =
  | { mode: "new"; date: string; resourceId?: string; minute?: number }
  | { mode: "view"; date: string; blockId: string }
  | null;

/** Tono de cada motivo en el calendario, de la paleta de recursos. */
export const BLOCK_TONE: Record<ProCourtBlockReason, ToneKey> = {
  maintenance: "slate",
  class: "sky",
  tournament: "violet",
  private: "amber",
};

export function BlockDrawer({ target, onClose }: { target: BlockTarget; onClose: () => void }) {
  const { data, update, vertical, now } = usePro();
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const [resourceIds, setResourceIds] = React.useState<string[]>([]);
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState(8 * 60);
  const [to, setTo] = React.useState(9 * 60 + 30);
  const [reason, setReason] = React.useState<ProCourtBlockReason>("maintenance");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!target || target.mode !== "new") return;
    const hours = hoursFor(data, target.date);
    const start = target.minute ?? hours?.open ?? 8 * 60;
    setResourceIds(target.resourceId ? [target.resourceId] : []);
    setDate(target.date);
    setFrom(start);
    setTo(Math.min(start + 90, hours?.close ?? start + 90));
    setReason("maintenance");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  if (target.mode === "view") {
    const block = blocksOn(data, target.date).find((b) => b.id === target.blockId);
    if (!block) return null;
    const names = block.resourceIds
      .map((id) => data.resources.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    const remove = () => {
      void update("court.block.remove", (d) => removeBlock(d, block.id));
      toast("Bloqueo quitado", { kind: "success", body: `${names} vuelve a estar disponible para reservar.` });
      onClose();
    };
    return (
      <Sheet
        open
        onClose={onClose}
        title={block.note ?? BLOCK_REASON_LABEL[block.reason]}
        description={`${names} · ${dayLabel(`${block.date}T12:00:00Z`)} · ${clockLabel(block.from)} a ${clockLabel(block.to)}`}
        footer={
          block.virtual ? (
            <PButton label="Entendido" onPress={onClose} />
          ) : (
            <>
              <PButton label="Cerrar" variant="ghost" onPress={onClose} />
              <PButton label="Quitar bloqueo" variant="outline" onPress={remove} />
            </>
          )
        }
      >
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
          <Detail label="Motivo" value={BLOCK_REASON_LABEL[block.reason]} />
          <Detail label={coworking ? "Espacios" : "Pistas"} value={names} />
          <Detail label="Horario" value={`${clockLabel(block.from)} a ${clockLabel(block.to)}`} last />
        </View>
        {block.virtual ? (
          <PText v="small">Es un grupo de la escuela: ocupa esta pista cada semana del curso. Cambia su horario o su pista en Escuela.</PText>
        ) : block.sourceId ? (
          <PText v="small">Lo creó un torneo o la liga. Si lo quitas, la pista se puede volver a reservar a esa hora.</PText>
        ) : null}
      </Sheet>
    );
  }

  const hours = hoursFor(data, date);
  const conflicts = resourceIds.length && to > from ? blockConflicts(data, { resourceIds, date, from, to }) : [];
  const valid = resourceIds.length > 0 && to > from && Boolean(hours);

  const save = () => {
    if (!valid) return;
    const block: ProCourtBlock = { id: localId("blk"), resourceIds, date, from, to, reason, note: note.trim() || undefined };
    void update("court.block.add", (d) => addBlock(d, block));
    toast("Pista bloqueada", {
      kind: "success",
      body: conflicts.length
        ? `Hay ${conflicts.length === 1 ? "una reserva" : `${conflicts.length} reservas`} a esa hora: muévelas desde el calendario.`
        : `${BLOCK_REASON_LABEL[reason]} de ${clockLabel(from)} a ${clockLabel(to)}. Nadie podrá reservar a esa hora.`,
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={coworking ? "Bloquear un espacio" : "Bloquear pistas"}
      description="Mantenimiento, clases, torneos o eventos privados. No se podrá reservar a esa hora."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Bloquear" onPress={save} disabled={!valid} />
        </>
      }
    >
      <Field label={coworking ? "Espacios" : "Pistas"}>
        <MultiChips options={data.resources.map((r) => ({ value: r.id, label: r.name }))} value={resourceIds} onChange={setResourceIds} />
      </Field>
      <Field label="Motivo">
        <ChoiceGrid
          value={reason}
          onChange={setReason}
          options={(Object.keys(BLOCK_REASON_LABEL) as ProCourtBlockReason[]).map((k) => ({ value: k, label: BLOCK_REASON_LABEL[k] }))}
        />
      </Field>
      <Field label="Día">
        <DayChips value={date} onChange={setDate} today={today} />
      </Field>
      {hours ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
          <Field label="Desde">
            <TimeStepper label="Desde" value={from} onChange={setFrom} min={hours.open} max={hours.close - 30} step={30} />
          </Field>
          <Field label="Hasta">
            <TimeStepper label="Hasta" value={to} onChange={setTo} min={from + 30} max={hours.close} step={30} />
          </Field>
        </View>
      ) : (
        <PText v="small">Ese día está cerrado.</PText>
      )}
      <Field label="Nota" hint="La ve tu equipo en el calendario.">
        <Input value={note} onChangeText={setNote} placeholder={reason === "maintenance" ? "Cambio de red, cepillado, focos..." : "Cumpleaños de Lucía, torneo de empresa..."} />
      </Field>
      {conflicts.length ? (
        <View style={{ borderRadius: R.lg, backgroundColor: `${C.warning}1F`, padding: S.md, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={15} color={C.warning} />
            <PText v="h3" color={C.warning}>{conflicts.length === 1 ? "Hay una reserva a esa hora" : `Hay ${conflicts.length} reservas a esa hora`}</PText>
          </View>
          {conflicts.map((b) => (
            <PText key={b.id} v="small">
              {`${b.clientName}, ${data.resources.find((r) => r.id === b.resourceId)?.name ?? ""} a las ${time(b.start)}`}
            </PText>
          ))}
          <PText v="tiny">Se bloquea igual; después muévelas desde el calendario y avísales.</PText>
        </View>
      ) : null}
    </Sheet>
  );
}
