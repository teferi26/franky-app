import React from "react";
import { Text, View } from "react-native";
import { Check, Gift, Heart, Stamp, Star, Ticket, Undo2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProClient, ProValidation } from "../../../../../shared/pro/types";
import { activeBonosFor, bonoRemaining, consumeBono, reviewMessage, usualFor } from "../../../../../shared/pro/tables-ops";
import { stampCandidates, stampStatus, stampValidation } from "../../../../../shared/pro/tables-day";
import { relative } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { Empty, PAvatar, PButton, PText, Panel, SearchInput, Sheet } from "../../kit";
import { StampDots, StudentMark } from "./table-kit";
import { WhatsAppButton, useTablesOps } from "./ops";
import { statusTone } from "./ui";

/**
 * Sello en un toque, versión nativa de stamp-kit.tsx: el habitual pide su
 * café, se le busca por el nombre y se sella sin escribir ningún importe. Si
 * ya tiene la tarjeta completa, la pantalla dice "Invita la casa". Aquí
 * también se descuenta su bono y se pide la reseña después del premio.
 */

export function QuickStampPanel() {
  const { data } = usePro();
  const [open, setOpen] = React.useState(false);
  if (!data.loyalty) return null;
  return (
    <Panel title="Sello rápido" description="Para el habitual de cada mañana: sin escanear ni escribir importe.">
      <Tap
        onPress={() => setOpen(true)}
        haptic
        accessibilityRole="button"
        accessibilityLabel="Sellar a un habitual"
        style={{ minHeight: 64, borderRadius: R.lg, backgroundColor: C.text, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.sm }}
      >
        <Stamp size={22} color={C.bg} strokeWidth={1.9} />
        <Text style={{ fontFamily: FONT.heading, fontSize: 17, color: C.bg }} maxFontSizeMultiplier={1.3}>
          Sellar a un habitual
        </Text>
      </Tap>
      <QuickStampSheet open={open} onClose={() => setOpen(false)} />
    </Panel>
  );
}

type Done = {
  client: ProClient;
  validationId: string;
  kind: "stamp" | "reward";
  stamps: number;
};

function QuickStampSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, pending } = usePro();
  const { ops } = useTablesOps();
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<ProClient | null>(null);
  const [done, setDone] = React.useState<Done | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setPicked(null);
    setDone(null);
  }, [open]);

  const loyalty = data.loyalty;
  if (!loyalty) return null;
  const needed = loyalty.stampsNeeded;
  const list = stampCandidates(data, q, needed, 10);
  const emerald = statusTone("emerald");

  const record = async (client: ProClient, kind: "stamp" | "reward") => {
    const at = new Date().toISOString();
    const base = stampValidation({
      id: localId("v"),
      at,
      clientName: client.name,
      university: client.student?.university,
      staffId: data.staff[0]?.id,
    });
    const v: ProValidation = kind === "reward" ? { ...base, kind: "reward" } : base;
    const ok = await update(kind === "reward" ? "card.reward" : "card.stamp", (d) => ({
      ...d,
      validations: [v, ...d.validations],
      loyalty: d.loyalty
        ? {
            ...d.loyalty,
            stampsToday: d.loyalty.stampsToday + (kind === "stamp" ? 1 : 0),
            rewardsThisMonth: d.loyalty.rewardsThisMonth + (kind === "reward" ? 1 : 0),
          }
        : d.loyalty,
      clients: d.clients.map((c) => (c.id === client.id ? { ...c, visits: c.visits + 1, lastVisit: at } : c)),
    }));
    if (!ok) return;
    const stamps = kind === "reward" ? 0 : Math.min(needed, stampStatus(data.validations, client.name, needed).stamps + 1);
    setDone({ client, validationId: v.id, kind, stamps });
  };

  const undo = async () => {
    if (!done) return;
    const ok = await update("card.undo", (d) => ({
      ...d,
      validations: d.validations.filter((v) => v.id !== done.validationId),
      loyalty: d.loyalty
        ? {
            ...d.loyalty,
            stampsToday: Math.max(0, d.loyalty.stampsToday - (done.kind === "stamp" ? 1 : 0)),
            rewardsThisMonth: Math.max(0, d.loyalty.rewardsThisMonth - (done.kind === "reward" ? 1 : 0)),
          }
        : d.loyalty,
      clients: d.clients.map((c) => (c.id === done.client.id ? { ...c, visits: Math.max(0, c.visits - 1) } : c)),
    }));
    if (ok) {
      toast("Deshecho", { kind: "info", body: done.client.name });
      setDone(null);
    }
  };

  const pickedStatus = picked ? stampStatus(data.validations, picked.name, needed) : null;
  const next = () => {
    setDone(null);
    setPicked(null);
    setQ("");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? "Hecho" : picked ? picked.name : "Sellar a un habitual"}
      description={done || picked ? undefined : "Los que vienen más a menudo salen primero."}
      footer={
        done ? (
          <>
            <PButton label="Deshacer" icon={Undo2} variant="ghost" disabled={pending} onPress={() => void undo()} />
            <PButton label="Siguiente" onPress={next} style={{ flex: 1, minHeight: 52 }} />
          </>
        ) : picked && pickedStatus?.full ? (
          <>
            <PButton label="Volver" variant="ghost" onPress={() => setPicked(null)} />
            <PButton label="Canjear premio" disabled={pending} onPress={() => void record(picked, "reward")} style={{ flex: 1, minHeight: 52 }} />
          </>
        ) : undefined
      }
    >
      {done ? (
        <View style={{ alignItems: "center", gap: S.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.success, alignItems: "center", justifyContent: "center" }}>
            <Check size={28} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.3}>
              {done.kind === "reward" ? "Invita la casa" : `Sello ${done.stamps} de ${needed}`}
            </Text>
            <PText v="small" style={{ textAlign: "center" }}>
              {done.kind === "reward"
                ? `${loyalty.reward}. Empieza una tarjeta nueva.`
                : done.stamps >= needed
                  ? `Tarjeta completa: la próxima vez, ${loyalty.reward.toLowerCase()}.`
                  : `Le ${needed - done.stamps === 1 ? "falta 1 sello" : `faltan ${needed - done.stamps} sellos`} para ${loyalty.reward.toLowerCase()}.`}
            </PText>
          </View>
          {done.kind === "stamp" ? <StampDots value={done.stamps} max={needed} /> : null}
          <View style={{ alignSelf: "stretch" }}>
            <ClientExtras client={done.client} afterReward={done.kind === "reward"} />
          </View>
        </View>
      ) : picked && pickedStatus?.full ? (
        <>
          <View style={{ alignItems: "center", gap: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: emerald.border, backgroundColor: emerald.bg, padding: S.lg }}>
            <Gift size={30} color={emerald.fg} strokeWidth={1.75} />
            <Text style={{ fontFamily: FONT.display, fontSize: 24, color: emerald.fg }} maxFontSizeMultiplier={1.3}>
              Invita la casa
            </Text>
            <PText v="small" color={emerald.fg} style={{ textAlign: "center" }}>
              {`${picked.name.split(" ")[0]} tiene la tarjeta completa: ${loyalty.reward.toLowerCase()}.`}
            </PText>
          </View>
          <ClientExtras client={picked} />
        </>
      ) : (
        <>
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre" />
          {list.length ? (
            <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
              {list.map(({ client, stamps, full, seen }, i) => {
                const bono = ops ? activeBonosFor(ops, client.name)[0] : undefined;
                return (
                  <Tap
                    key={client.id}
                    disabled={pending}
                    onPress={() => (full ? setPicked(client) : void record(client, "stamp"))}
                    accessibilityRole="button"
                    accessibilityLabel={full ? `${client.name}: tiene premio` : `Sellar a ${client.name}`}
                    style={{
                      minHeight: 60,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: S.md,
                      paddingHorizontal: S.md,
                      paddingVertical: S.sm,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: C.borderLight,
                    }}
                  >
                    <PAvatar name={client.name} toneKey="violet" size={34} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {client.name}
                        </PText>
                        {client.student ? <StudentMark university={client.student.university} /> : null}
                      </View>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
                        <StampDots value={stamps} max={needed} />
                        {bono ? <PText v="tiny">{`bono: quedan ${bonoRemaining(bono)}`}</PText> : null}
                        {seen ? <PText v="tiny">{relative(seen)}</PText> : null}
                      </View>
                    </View>
                    <View style={{ borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 8, backgroundColor: full ? emerald.bg : C.accentSoft }}>
                      <Text style={{ fontFamily: FONT.heading, fontSize: 12.5, color: full ? emerald.fg : C.blueDeep }} maxFontSizeMultiplier={1.2}>
                        {full ? "Premio" : "+1 sello"}
                      </Text>
                    </View>
                  </Tap>
                );
              })}
            </View>
          ) : (
            <Empty
              icon={Stamp}
              title="Nadie con ese nombre"
              body="Si es su primera vez, valida su Franky Card con el código y su tarjeta de sellos empieza sola."
            />
          )}
        </>
      )}
    </Sheet>
  );
}

/**
 * Lo que conviene saber del cliente en la barra: lo de siempre, su bono con
 * los usos que le quedan (y el botón para descontar uno) y, tras un premio,
 * pedirle la reseña.
 */
export function ClientExtras({ client, afterReward }: { client: ProClient; afterReward?: boolean }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [used, setUsed] = React.useState<string | null>(null);
  if (!ops) return null;
  const usual = usualFor(ops, client.name);
  const bono = activeBonosFor(ops, client.name)[0];
  const template = bono ? ops.bonoTemplates.find((t) => t.id === bono.templateId) : undefined;
  const askReview = Boolean(afterReward && ops.reviewLink && client.marketingConsent && client.phone);
  if (!usual && !bono && !used && !askReview) return null;

  const spend = async () => {
    if (!bono) return;
    const ok = await save("bono.use", (o) => ({
      ...o,
      bonos: o.bonos.map((b) => (b.id === bono.id ? consumeBono(b, now.toISOString(), client.name) : b)),
    }));
    if (!ok) return;
    const left = bonoRemaining(bono) - 1;
    setUsed(left > 0 ? `Descontado. Quedan ${left}.` : "Descontado. Era el último: ofrécele otro bono.");
    toast("Bono descontado", { kind: "success", body: `${template?.itemName ?? "Uso"} de ${client.name.split(" ")[0]}.` });
  };

  const box = { borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.md, gap: S.sm } as const;

  return (
    <View style={{ gap: S.sm }}>
      {usual ? (
        <View style={[box, { flexDirection: "row" }]}>
          <Heart size={15} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <PText v="body" style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.semibold }}>Lo de siempre: </Text>
            {usual}
          </PText>
        </View>
      ) : null}
      {bono && !used ? (
        <View style={box}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Ticket size={15} color={C.blue} strokeWidth={1.9} />
            <PText v="body" style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT.semibold }}>{template?.name ?? "Bono"}</Text>
              {`, quedan ${bonoRemaining(bono)} de ${bono.uses}${bono.members?.length ? `, grupo ${bono.clientName}` : ""}`}
            </PText>
          </View>
          <PButton label={`Descontar ${template?.itemName.toLowerCase() ?? "uno"}`} variant="secondary" small full onPress={() => void spend()} />
        </View>
      ) : null}
      {used ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
          <PText v="body">{used}</PText>
        </View>
      ) : null}
      {askReview ? (
        <View style={box}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Star size={15} color={C.blue} strokeWidth={1.9} />
            <PText v="body" style={{ flex: 1 }}>
              Se va con su premio: buen momento para pedir la reseña.
            </PText>
          </View>
          <WhatsAppButton phone={client.phone} message={reviewMessage(client.name, data.space.name, ops.reviewLink ?? "")} label="Pedir reseña" />
        </View>
      ) : null}
    </View>
  );
}
