import React from "react";
import { AppState, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { BadgeCheck, Check, Delete, Gift, History, Keyboard, Pencil, ScanLine, Stamp, Wallet } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProClient, ProLoyalty, ProValidation } from "../../../../../shared/pro/types";
import { localDate, money, plural, time } from "../../../../../shared/pro/format";
import { stampsFor } from "../../../../../shared/pro/tables";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Empty, Field, Input, Kpi, KpiRow, ListRow, LiveDot, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, Tip } from "../../kit";
import { StampDots, StudentMark, shortUni } from "./table-kit";
import { Card, statusTone } from "./ui";
import { ClientExtras, QuickStampPanel } from "./stamp-kit";

type Step = "idle" | "scanning" | "amount" | "done";

type Receipt = {
  code: string;
  at: string;
  client: ProClient;
  amountCents: number;
  discountCents: number;
  stamps: number | null;
  reward: boolean;
  completed: boolean;
};

export default function TablesValidar() {
  const { demo } = usePro();
  if (!demo) return <RealTablesValidar />;
  return <DemoTablesValidar />;
}

/* ------------------------------------------------------------------ */
/* Negocio real                                                        */
/* ------------------------------------------------------------------ */

/**
 * En un negocio real la validación la hace la recepción de Franky Card que ya
 * existe en la app (/card-recepcion): escáner con cámara, conceptos, importe
 * y confirmación en dos pasos con el titular. No se duplica aquí: se activa
 * este negocio como espacio de trabajo y se abre esa pantalla.
 */
function RealTablesValidar() {
  const { spaceId, data } = usePro();
  const workspace = useWorkspace();
  const router = useRouter();
  const [opening, setOpening] = React.useState(false);

  const open = async (path: "/card-recepcion" | "/card-comercio-historial") => {
    if (opening) return;
    setOpening(true);
    try {
      if (workspace.active?.id !== spaceId) await workspace.select(spaceId);
      router.push(path as never);
    } catch {
      toast("No se ha podido abrir la recepción", { kind: "error", body: "Actualiza la lista de negocios y vuelve a intentarlo." });
    } finally {
      setOpening(false);
    }
  };

  return (
    <ProPage>
      <PageHeader eyebrow="Franky Card" title="Validar Franky Card" description="Escanea la tarjeta, revisa el importe y espera la confirmación del estudiante." />
      <Card>
        <View style={{ gap: S.md }}>
          <PButton label="Escanear código" icon={ScanLine} full disabled={opening} onPress={() => void open("/card-recepcion")} style={{ minHeight: 56 }} />
          <PText v="small">{`Se abre la recepción de ${data.space.name}. Prepara los conceptos, escanea el código de su tarjeta y confirma cuando el estudiante haya aceptado.`}</PText>
          <Steps />
        </View>
      </Card>
      <Panel title="Operaciones registradas">
        <PText v="small">Consulta los consumos validados y los ajustes de cada operación.</PText>
        <PButton label="Ver historial" icon={History} variant="outline" disabled={opening} onPress={() => void open("/card-comercio-historial")} style={{ marginTop: S.md }} />
      </Panel>
    </ProPage>
  );
}

/** Los tres pasos de la validación. */
function Steps() {
  return (
    <View style={{ flexDirection: "row", gap: S.sm }}>
      {["Escanea", "Importe", "Validar"].map((label, i) => (
        <View key={label} style={{ flex: 1, alignItems: "center", borderRadius: R.md, backgroundColor: C.input, paddingVertical: S.sm }}>
          <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>{i + 1}</Text>
          <PText v="tiny">{label}</PText>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

function DemoTablesValidar() {
  const { data, now, vertical } = usePro();
  const [editOpen, setEditOpen] = React.useState(false);
  const [limit, setLimit] = React.useState(40);
  const today = localDate(now);
  const label = vertical.nav.find((n) => n.id === "validar")?.label ?? "Franky Card";
  const todays = data.validations.filter((v) => localDate(v.at) === today).sort((a, b) => b.at.localeCompare(a.at));
  const discounted = todays.reduce((a, v) => a + v.discountCents, 0);
  const charged = todays.reduce((a, v) => a + v.amountCents - v.discountCents, 0);
  const pct = data.space.publicProfile.cardDiscountPct;
  const stampsToday = data.loyalty?.stampsToday ?? 0;
  const history = todays.length > 60 ? todays.slice(0, limit) : todays;

  return (
    <ProPage>
      <PageHeader
        eyebrow={label}
        title={vertical.id === "bar" ? "Fidelidad y Franky Card" : "Validar Franky Card"}
        description={`Hoy: ${plural(todays.length, "validación", "validaciones")}${data.loyalty ? ` y ${plural(stampsToday, "sello", "sellos")}` : ""}. Los estudiantes con Franky Card tienen un ${pct} % de descuento aquí.`}
        actions={<PButton label={data.loyalty ? "Editar tarjeta" : "Crear tarjeta de sellos"} icon={Pencil} variant="outline" onPress={() => setEditOpen(true)} />}
      />

      {/* En la cafetería el sello rápido va primero: es el gesto de cada mañana. */}
      {vertical.id === "cafe" ? <QuickStampPanel /> : null}

      <ValidateFlow />

      {vertical.id !== "cafe" ? <QuickStampPanel /> : null}

      <KpiRow>
        <Kpi icon={ScanLine} label="Validaciones hoy" value={todays.length} hint={`${new Set(todays.map((v) => v.clientName)).size} estudiantes`} />
        <Kpi icon={Wallet} label="Cobrado con Card" value={money(charged, { round: true })} hint={`${money(discounted)} descontados`} />
      </KpiRow>

      <LoyaltyCard onEdit={() => setEditOpen(true)} />

      <Panel title="Historial de hoy" description={todays.length ? "El estudiante tiene el mismo comprobante en su móvil." : undefined} flush>
        {todays.length ? (
          <>
            {history.map((v, i) => (
              <HistoryRow key={v.id} v={v} last={i === history.length - 1 && history.length === todays.length} />
            ))}
            {history.length < todays.length ? (
              <Tap onPress={() => setLimit((l) => l + 40)} accessibilityRole="button" style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.semibold, color: C.blue }} maxFontSizeMultiplier={1.3}>Ver más</Text>
              </Tap>
            ) : null}
          </>
        ) : (
          <Empty icon={ScanLine} title="Aún no has validado ninguna hoy" body="Cuando un estudiante te enseñe su tarjeta, toca Escanear código. Son tres toques." />
        )}
      </Panel>

      <LoyaltyDrawer open={editOpen} onClose={() => setEditOpen(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Flujo de validación                                                 */
/* ------------------------------------------------------------------ */

function ValidateFlow() {
  const { data, update, pending } = usePro();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = React.useState<Step>("idle");
  const [camera, setCamera] = React.useState(false);
  const [turn, setTurn] = React.useState(0);
  const [amount, setAmount] = React.useState("");
  const [manual, setManual] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [receipt, setReceipt] = React.useState<Receipt | null>(null);

  const candidates = React.useMemo(() => {
    const members = data.clients.filter((c) => c.student?.verified && c.cardMember);
    return members.length ? members : data.clients.filter((c) => c.student);
  }, [data.clients]);
  const client = candidates.length ? candidates[turn % candidates.length] : null;

  // En la demo cualquier código vale: con cámara se espera a leer uno (o se
  // simula a los pocos segundos); sin cámara, se simula la lectura como en la web.
  React.useEffect(() => {
    if (step !== "scanning") return;
    const id = setTimeout(() => setStep("amount"), camera ? 2500 : 900);
    return () => clearTimeout(id);
  }, [step, camera]);

  // Si la app pasa a segundo plano, se apaga la cámara.
  React.useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") setCamera(false);
    });
    return () => sub.remove();
  }, []);

  const pct = data.space.publicProfile.cardDiscountPct;
  const cents = toCents(amount);
  const discount = Math.round((cents * pct) / 100);
  const loyalty = data.loyalty;
  const stamps = client && loyalty ? stampsFor(data.validations, client.name, loyalty.stampsNeeded) : 0;
  const full = Boolean(loyalty && stamps >= loyalty.stampsNeeded);
  const quick = quickAmounts(data);
  const emerald = statusTone("emerald");

  const startScan = async () => {
    const result = permission?.granted ? permission : await requestPermission().catch(() => null);
    setCamera(Boolean(result?.granted));
    setStep("scanning");
  };

  const press = (k: string) => {
    setAmount((prev) => {
      if (k === "del") return prev.slice(0, -1);
      if (k === ",") return prev.includes(",") ? prev : prev ? `${prev},` : "0,";
      const [int, dec] = prev.split(",");
      if (dec !== undefined && dec.length >= 2) return prev;
      if (dec === undefined && int.length >= 4) return prev;
      if (prev === "0") return k;
      return prev + k;
    });
  };

  const reset = () => {
    setStep("idle");
    setCamera(false);
    setAmount("");
    setReceipt(null);
    setManual(false);
    setCode("");
    setTurn((t) => t + 1);
  };

  const confirm = async (reward: boolean) => {
    if (!client) return;
    const at = new Date().toISOString();
    const rewardValue = Math.min(cents || 160, 400);
    const v: ProValidation = {
      id: localId("v"),
      at,
      clientName: client.name,
      university: client.student?.university,
      kind: reward ? "reward" : "discount",
      amountCents: reward ? rewardValue : cents,
      discountCents: reward ? rewardValue : discount,
      staffId: data.staff[0]?.id,
    };
    const afterStamps = loyalty ? (reward ? 0 : Math.min(loyalty.stampsNeeded, stamps + 1)) : null;
    const completed = Boolean(loyalty && !reward && afterStamps === loyalty.stampsNeeded);
    if (
      !(await update(reward ? "card.reward" : "card.validate", (d) => ({
        ...d,
        validations: [v, ...d.validations],
        loyalty: d.loyalty
          ? {
              ...d.loyalty,
              stampsToday: d.loyalty.stampsToday + (reward ? 0 : 1),
              rewardsThisMonth: d.loyalty.rewardsThisMonth + (reward ? 1 : 0),
            }
          : d.loyalty,
        clients: d.clients.map((c) =>
          c.id === client.id
            ? { ...c, visits: c.visits + 1, spentCents: c.spentCents === null ? null : c.spentCents + v.amountCents - v.discountCents, lastVisit: at }
            : c,
        ),
      })))
    )
      return;
    setReceipt({
      code: `FK-${1000 + Math.floor(Math.random() * 9000)}`,
      at,
      client,
      amountCents: v.amountCents,
      discountCents: v.discountCents,
      stamps: afterStamps,
      reward,
      completed,
    });
    setStep("done");
    if (reward) toast("Premio canjeado", { kind: "success", body: `${client.name.split(" ")[0]} empieza una tarjeta nueva.` });
    else if (completed) toast("Tarjeta completa", { kind: "success", body: `La próxima vez, ${loyalty?.reward.toLowerCase()} para ${client.name.split(" ")[0]}.` });
    else toast("Validado", { kind: "success", body: `${money(cents - discount)} con un ${pct} % de descuento.` });
  };

  if (!client) {
    return (
      <Panel>
        <Empty icon={ScanLine} title="Todavía no hay estudiantes con tarjeta" body="Cuando un estudiante active su Franky Card cerca de ti, podrás validarla desde aquí." />
      </Panel>
    );
  }

  return (
    <View style={{ borderRadius: R.xl, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, marginBottom: S.lg, ...SHADOW.card }}>
      {step === "idle" ? (
        <View style={{ gap: S.md }}>
          <Tap
            onPress={() => void startScan()}
            haptic
            accessibilityRole="button"
            accessibilityLabel="Escanear código de su Franky Card"
            style={{ height: 176, borderRadius: R.xl, backgroundColor: C.text, alignItems: "center", justifyContent: "center", gap: S.md }}
          >
            <ScanLine size={46} color={C.bg} strokeWidth={1.6} />
            <Text style={{ fontFamily: FONT.heading, fontSize: 20, color: C.bg }} maxFontSizeMultiplier={1.3}>Escanear código</Text>
            <Text style={{ fontSize: 13.5, color: C.bg, opacity: 0.7 }} maxFontSizeMultiplier={1.3}>El código de su Franky Card</Text>
          </Tap>
          {manual ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <Input
                label="Código de la tarjeta"
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                value={code}
                onChangeText={(t) => {
                  const v = t.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6) setStep("amount");
                }}
                placeholder="6 cifras"
                style={{ flex: 1, minHeight: 50, textAlign: "center", fontFamily: FONT.heading, fontSize: 20, letterSpacing: 6 }}
              />
              <PButton label="Cancelar" variant="ghost" onPress={() => setManual(false)} />
            </View>
          ) : (
            <PButton label="Sin cámara: escribir el código" icon={Keyboard} variant="ghost" onPress={() => setManual(true)} style={{ alignSelf: "center" }} />
          )}
          <Steps />
        </View>
      ) : null}

      {step === "scanning" ? (
        <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: S.lg, paddingVertical: S.md }}>
          {camera && permission?.granted ? (
            <View style={{ width: "100%", height: 260, borderRadius: R.lg, overflow: "hidden", backgroundColor: "#000000" }}>
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={() => {
                  // Demo: cualquier código abre la tarjeta del siguiente estudiante de ejemplo.
                  setCamera(false);
                  setStep("amount");
                }}
              />
            </View>
          ) : (
            <ScanFrame />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <LiveDot />
            <PText v="h3">Leyendo el código</PText>
          </View>
          <PButton label="Cancelar" variant="ghost" onPress={reset} />
        </View>
      ) : null}

      {step === "amount" ? (
        <View style={{ gap: S.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
            <PAvatar name={client.name} size={48} toneKey="violet" />
            <View style={{ flex: 1, gap: 3 }}>
              <PText v="h2" numberOfLines={1}>{client.name}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm }}>
                <StudentMark university={client.student?.university} />
                {client.student?.faculty ? <PText v="tiny" numberOfLines={1}>{client.student.faculty}</PText> : null}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm, marginTop: 2 }}>
                <Pill label="Tarjeta activa" tone="success" icon={BadgeCheck} />
                {loyalty ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <StampDots value={stamps} max={loyalty.stampsNeeded} />
                    <PText v="tiny">{`${stamps}/${loyalty.stampsNeeded}`}</PText>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <ClientExtras client={client} />

          {full && loyalty ? (
            <View style={{ gap: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: emerald.border, backgroundColor: emerald.bg, padding: S.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                <Gift size={20} color={emerald.fg} strokeWidth={1.9} />
                <PText v="h3" color={emerald.fg} style={{ flex: 1 }}>{`Tiene la tarjeta completa: ${loyalty.reward.toLowerCase()}.`}</PText>
              </View>
              <PButton label="Canjear premio" full disabled={pending} onPress={() => void confirm(true)} />
            </View>
          ) : null}

          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg, paddingVertical: S.md, alignItems: "center" }}>
            <PText v="tiny" style={{ fontFamily: FONT.semibold }}>Importe del ticket</PText>
            <Text
              accessibilityLiveRegion="polite"
              style={{ fontFamily: FONT.display, fontSize: 46, letterSpacing: -1.2, color: amount ? C.text : C.muted }}
              maxFontSizeMultiplier={1.1}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {amount ? `${amount} €` : "0 €"}
            </Text>
          </View>

          {quick.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {quick.map((q) => (
                <Tap
                  key={q.label}
                  onPress={() => setAmount((q.cents / 100).toFixed(2).replace(".", ","))}
                  accessibilityRole="button"
                  accessibilityLabel={`${q.label}, ${money(q.cents)}`}
                  style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 12.5, color: C.text }} maxFontSizeMultiplier={1.3}>{q.label}</Text>
                  <Text style={{ fontSize: 12.5, color: C.muted }} maxFontSizeMultiplier={1.3}>{money(q.cents)}</Text>
                </Tap>
              ))}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"].map((k) => (
              <Tap
                key={k}
                onPress={() => press(k)}
                accessibilityRole="button"
                accessibilityLabel={k === "del" ? "Borrar" : k === "," ? "Coma decimal" : k}
                style={{ width: "31.8%", height: 58, borderRadius: R.lg, backgroundColor: C.input, alignItems: "center", justifyContent: "center" }}
              >
                {k === "del" ? (
                  <Delete size={24} color={C.text} strokeWidth={1.75} />
                ) : (
                  <Text style={{ fontFamily: FONT.heading, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>{k}</Text>
                )}
              </Tap>
            ))}
          </View>

          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
            <SumRow label={`Descuento Franky Card (${pct} %)`} value={`-${money(discount)}`} accent />
            {loyalty ? <SumRow label="Sello" value={`+1 (${Math.min(loyalty.stampsNeeded, stamps + 1)}/${loyalty.stampsNeeded})`} /> : null}
            <SumRow label="Cobra" value={money(cents - discount)} total last />
          </View>

          <View style={{ flexDirection: "row", gap: S.sm }}>
            <PButton label="Cancelar" variant="ghost" onPress={reset} style={{ minHeight: 56 }} />
            <PButton
              label={`Validar ${cents > 0 ? money(cents - discount) : ""}`.trim()}
              disabled={pending || cents <= 0}
              onPress={() => void confirm(false)}
              style={{ flex: 1, minHeight: 56 }}
            />
          </View>
        </View>
      ) : null}

      {step === "done" && receipt ? (
        <View accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: S.md }}>
          <View style={{ marginTop: S.sm, width: 64, height: 64, borderRadius: 32, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}>
            <Check size={32} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.3}>{receipt.reward ? "Premio canjeado" : "Validado"}</Text>
            <PText v="small" style={{ textAlign: "center" }}>{`${receipt.code} · ${time(receipt.at)} · ${receipt.client.name}`}</PText>
          </View>
          <View style={{ alignSelf: "stretch", borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
            <SumRow label="Importe" value={money(receipt.amountCents)} />
            <SumRow label={receipt.reward ? "Premio" : "Descuento"} value={`-${money(receipt.discountCents)}`} accent />
            <SumRow label="Cobrado" value={money(receipt.amountCents - receipt.discountCents)} total last={!(receipt.stamps !== null && loyalty)} />
            {receipt.stamps !== null && loyalty ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingVertical: S.sm }}>
                <PText v="small">Tarjeta de sellos</PText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <StampDots value={receipt.stamps} max={loyalty.stampsNeeded} />
                  <PText v="small" color={C.text}>{`${receipt.stamps}/${loyalty.stampsNeeded}`}</PText>
                </View>
              </View>
            ) : null}
          </View>
          {receipt.completed && loyalty ? (
            <View style={{ alignSelf: "stretch", borderRadius: R.lg, backgroundColor: emerald.bg, paddingHorizontal: S.lg, paddingVertical: S.sm }}>
              <PText v="h3" color={emerald.fg} style={{ textAlign: "center" }}>{`Tarjeta completa. La próxima vez: ${loyalty.reward.toLowerCase()}.`}</PText>
            </View>
          ) : null}
          {receipt.reward ? (
            <View style={{ alignSelf: "stretch" }}>
              <ClientExtras client={receipt.client} afterReward />
            </View>
          ) : null}
          <PText v="tiny" style={{ textAlign: "center" }}>{`${receipt.client.name.split(" ")[0]} ve este mismo comprobante en su móvil.`}</PText>
          <PButton label="Siguiente cliente" full onPress={reset} style={{ minHeight: 56 }} />
        </View>
      ) : null}
    </View>
  );
}

/** Marco de lectura cuando no hay cámara. */
function ScanFrame() {
  const corner = { position: "absolute" as const, width: 32, height: 32, borderColor: C.text };
  return (
    <View style={{ width: 160, height: 160 }}>
      <View style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 16 }]} />
      <View style={[corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 16 }]} />
      <View style={[corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 16 }]} />
      <View style={[corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 16 }]} />
      <View style={{ position: "absolute", left: 16, right: 16, top: 79, height: 2, backgroundColor: C.blue }} />
    </View>
  );
}

function SumRow({ label, value, accent, total, last }: { label: string; value: string; accent?: boolean; total?: boolean; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.sm, paddingVertical: S.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.borderLight }}>
      <PText v={total ? "h3" : "small"} style={{ flexShrink: 1 }}>{label}</PText>
      <Text
        style={{ fontFamily: total ? FONT.display : FONT.semibold, fontSize: total ? 22 : 14, color: accent ? C.blue : C.text }}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
    </View>
  );
}

function toCents(v: string): number {
  if (!v) return 0;
  return Math.round(Number(v.replace(",", ".")) * 100) || 0;
}

/** Importes de un toque: lo que más se pide y el menú del día. */
function quickAmounts(data: ReturnType<typeof usePro>["data"]): { label: string; cents: number }[] {
  const out: { label: string; cents: number }[] = [];
  if (data.dailyMenu) out.push({ label: "Menú del día", cents: data.dailyMenu.priceCents });
  data.menu
    .filter((m) => m.studentFavorite && m.available)
    .slice(0, 3)
    .forEach((m) => out.push({ label: m.name, cents: m.priceCents }));
  return out;
}

/* ------------------------------------------------------------------ */
/* Tarjeta de sellos                                                   */
/* ------------------------------------------------------------------ */

function LoyaltyCard({ onEdit }: { onEdit: () => void }) {
  const { data } = usePro();
  const loyalty = data.loyalty;
  if (!loyalty) {
    return (
      <Panel>
        <Empty
          icon={Stamp}
          title="Crea tu tarjeta de sellos"
          body="Por ejemplo: el 10.º café gratis. Los estudiantes la llevan en Franky y se suma sola al validar."
          action={<PButton label="Crear tarjeta" onPress={onEdit} />}
        />
      </Panel>
    );
  }
  return (
    <Panel title="Tu tarjeta de sellos" action={<PButton label="Editar" small variant="outline" onPress={onEdit} />}>
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, padding: S.lg }}>
        <PText v="label">{data.space.name}</PText>
        <PText v="h2" style={{ marginTop: 4 }}>{loyalty.reward}</PText>
        <View accessible accessibilityLabel={`${loyalty.stampsNeeded} sellos`} style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.md }}>
          {Array.from({ length: loyalty.stampsNeeded }, (_, i) => {
            const last = i === loyalty.stampsNeeded - 1;
            const early = i < 3;
            return (
              <View
                key={i}
                style={{
                  width: "17.4%",
                  aspectRatio: 1,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderStyle: last || early ? "solid" : "dashed",
                  borderColor: last || early ? C.blue : C.border,
                  backgroundColor: last ? C.blue : early ? C.accentSoft : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {last ? (
                  <Gift size={16} color="#FFFFFF" strokeWidth={1.9} />
                ) : (
                  <Text style={{ fontFamily: FONT.heading, fontSize: 12, color: early ? C.blueDeep : C.muted }} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
        {[
          { label: "Tarjetas activas", value: loyalty.activeCards },
          { label: "Sellos hoy", value: loyalty.stampsToday },
          { label: "Premios del mes", value: loyalty.rewardsThisMonth },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1, alignItems: "center" }}>
            <PText v="tiny" style={{ textAlign: "center" }}>{s.label}</PText>
            <Text style={{ fontFamily: FONT.heading, fontSize: 20, color: C.text }} maxFontSizeMultiplier={1.3}>{s.value}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: S.lg }}>
        <Tip title="Por qué funciona">
          Quien lleva 7 sellos no se va a la cafetería de al lado. El código de la tarjeta cambia cada 30 segundos, así que una captura de pantalla no sirve.
        </Tip>
      </View>
    </Panel>
  );
}

function LoyaltyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, pending } = usePro();
  const [needed, setNeeded] = React.useState<"5" | "6" | "8" | "10" | "12">("10");
  const [reward, setReward] = React.useState("");
  const [pct, setPct] = React.useState<"5" | "10" | "15" | "20">("10");

  React.useEffect(() => {
    if (!open) return;
    const n = String(data.loyalty?.stampsNeeded ?? 10);
    setNeeded((["5", "6", "8", "10", "12"].includes(n) ? n : "10") as typeof needed);
    setReward(data.loyalty?.reward ?? (data.space.vertical === "cafe" ? "El 10.º café gratis" : "Una ración gratis"));
    const p = String(data.space.publicProfile.cardDiscountPct);
    setPct((["5", "10", "15", "20"].includes(p) ? p : "10") as typeof pct);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const base: ProLoyalty = data.loyalty ?? { stampsNeeded: 10, reward: "", activeCards: 0, stampsToday: 0, rewardsThisMonth: 0 };
    if (
      !(await update("loyalty.save", (d) => ({
        ...d,
        loyalty: { ...base, stampsNeeded: Number(needed), reward: reward.trim() },
        space: { ...d.space, publicProfile: { ...d.space.publicProfile, cardDiscountPct: Number(pct), cardEnabled: true } },
      })))
    )
      return;
    toast(data.loyalty ? "Tarjeta actualizada" : "Tarjeta de sellos creada", {
      kind: "success",
      body: `${reward.trim()} con ${needed} sellos. Los estudiantes ya la ven en Franky.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={data.loyalty ? "Editar tarjeta de sellos" : "Crear tarjeta de sellos"}
      description="Un sello por visita validada. Al completarla, el premio se canjea en la misma pantalla."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar" onPress={() => void save()} disabled={pending || reward.trim().length < 3} />
        </>
      }
    >
      <Field label="Sellos para el premio">
        <ChoiceGrid value={needed} onChange={setNeeded} options={(["5", "6", "8", "10", "12"] as const).map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Premio" hint="Algo barato para ti y deseable para ellos.">
        <Input value={reward} onChangeText={setReward} label="Premio" />
      </Field>
      <Field label="Descuento Franky Card" hint="Se aplica solo al validar. Lo que más se usa: 10 %.">
        <ChoiceGrid value={pct} onChange={setPct} options={(["5", "10", "15", "20"] as const).map((v) => ({ value: v, label: `${v} %` }))} />
      </Field>
    </Sheet>
  );
}

function HistoryRow({ v, last }: { v: ProValidation; last: boolean }) {
  return (
    <ListRow last={last}>
      <Text style={{ width: 44, fontFamily: FONT.semibold, fontSize: 13.5, color: C.muted }} maxFontSizeMultiplier={1.3}>{time(v.at)}</Text>
      <View style={{ flex: 1 }}>
        <PText v="h3" numberOfLines={1}>{v.clientName}</PText>
        {v.university ? <PText v="tiny">{shortUni(v.university)}</PText> : null}
      </View>
      <Pill
        label={v.kind === "reward" ? "Premio" : v.kind === "stamp" ? "Sello" : `-${money(v.discountCents)}`}
        tone={v.kind === "reward" ? "success" : v.kind === "stamp" ? "neutral" : "violet"}
      />
      <Text style={{ width: 64, textAlign: "right", fontFamily: FONT.semibold, fontSize: 13.5, color: C.text }} maxFontSizeMultiplier={1.3}>
        {money(v.amountCents - v.discountCents)}
      </Text>
    </ListRow>
  );
}
