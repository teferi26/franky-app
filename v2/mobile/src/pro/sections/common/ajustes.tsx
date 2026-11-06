import React from "react";
import { Linking, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Check, Download, ExternalLink, ImagePlus, MessageCircle, Share2, ShieldCheck } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { PRO_CONTACT } from "../../../../../shared/pro/contact";
import { money } from "../../../../../shared/pro/format";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Field, Input, PButton, PText, PageHeader, Panel, Pill, Segmented, Tip, TimeStepper } from "../../kit";
import { Knob } from "./ui";

type Tab = "negocio" | "horario" | "enlace" | "plan" | "datos";
const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export default function AjustesSection() {
  const [tab, setTab] = React.useState<Tab>("negocio");
  return (
    <ProPage>
      <PageHeader eyebrow="Ajustes" title="Tu negocio en Franky" description="Lo que ven los estudiantes, tu horario, tu enlace de reservas y tu plan.">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "negocio", label: "Negocio" },
            { value: "horario", label: "Horario" },
            { value: "enlace", label: "Enlace y QR" },
            { value: "plan", label: "Plan" },
            { value: "datos", label: "Tus datos" },
          ]}
        />
      </PageHeader>
      {tab === "negocio" ? <Business /> : null}
      {tab === "horario" ? <Hours /> : null}
      {tab === "enlace" ? <LinkAndQr /> : null}
      {tab === "plan" ? <Plan /> : null}
      {tab === "datos" ? <Data /> : null}
    </ProPage>
  );
}

function Business() {
  const { data, update, pending, can } = usePro();
  const [name, setName] = React.useState(data.space.name);
  const [address, setAddress] = React.useState(data.space.address);
  const [city, setCity] = React.useState(data.space.city);
  const [description, setDescription] = React.useState(data.space.publicProfile.description);
  const dirty = name !== data.space.name || address !== data.space.address || city !== data.space.city || description !== data.space.publicProfile.description;

  const save = async () => {
    if (
      !(await update("space.update", (d) => ({
        ...d,
        space: { ...d.space, name, address, city, publicProfile: { ...d.space.publicProfile, description } },
      })))
    )
      return;
    toast("Guardado", { kind: "success", body: "Tu ficha ya muestra los cambios." });
  };

  return (
    <>
      <Panel title="Datos públicos" description="Aparecen en tu ficha de Franky.">
        <View style={{ gap: S.lg }}>
          <Field label="Nombre del negocio">
            <Input value={name} onChangeText={setName} label="Nombre del negocio" />
          </Field>
          <Field label="Dirección">
            <Input value={address} onChangeText={setAddress} label="Dirección" />
          </Field>
          <Field label="Ciudad">
            <Input value={city} onChangeText={setCity} label="Ciudad" />
          </Field>
          <Field label="Descripción" hint="Dos frases: qué haces y por qué venir. Piensa en alguien que no te conoce.">
            <Input value={description} onChangeText={setDescription} multiline maxLength={280} label="Descripción" />
          </Field>
          <PButton label="Guardar cambios" full disabled={pending || !can("space.update") || !dirty} onPress={() => void save()} />
        </View>
      </Panel>
      <Panel title="Fotos" description={`${data.space.publicProfile.photos} fotos publicadas`}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {Array.from({ length: Math.min(6, data.space.publicProfile.photos) }, (_, i) => (
            <View key={i} style={{ width: "31.5%", aspectRatio: 1, borderRadius: R.md, backgroundColor: C.input }} />
          ))}
        </View>
        <PButton
          label="Añadir fotos"
          variant="outline"
          icon={ImagePlus}
          full
          style={{ marginTop: S.lg }}
          onPress={() => toast("Sube tus fotos", { kind: "info", body: "Desde el móvil puedes subirlas directamente desde la galería." })}
        />
        <PText v="tiny" style={{ marginTop: S.md }}>Luz natural, el local con gente y tu trabajo de cerca. Las fotos del iPhone se convierten solas.</PText>
      </Panel>
    </>
  );
}

function Hours() {
  const { data, update, pending, can } = usePro();
  const [hours, setHours] = React.useState(data.space.hours);

  const save = async () => {
    if (!(await update("space.hours", (d) => ({ ...d, space: { ...d.space, hours } })))) return;
    toast("Horario guardado", { kind: "success" });
  };

  return (
    <Panel title="Horario de apertura" description="Se usa para tu agenda, tus reservas online y para enseñarte abierto a los estudiantes.">
      {DAYS.map((day, i) => {
        const h = hours[i];
        return (
          <View key={day} style={{ paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === DAYS.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
            <Tap
              onPress={() => setHours((prev) => prev.map((x, j) => (j === i ? (x ? null : { open: 10 * 60, close: 20 * 60 }) : x)))}
              accessibilityRole="switch"
              accessibilityState={{ checked: Boolean(h) }}
              accessibilityLabel={`Abierto el ${day.toLowerCase()}`}
              style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 44 }}
            >
              <PText v="h3" style={{ flex: 1 }}>{day}</PText>
              {!h ? <PText v="small">Cerrado</PText> : null}
              <Knob on={Boolean(h)} />
            </Tap>
            {h ? (
              <View style={{ gap: S.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
                  <PText v="small">Abre</PText>
                  <TimeStepper
                    value={h.open}
                    max={h.close - 15}
                    onChange={(m) => setHours((prev) => prev.map((x, j) => (j === i && x ? { ...x, open: m } : x)))}
                    label={`hora de apertura del ${day.toLowerCase()}`}
                  />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
                  <PText v="small">Cierra</PText>
                  <TimeStepper
                    value={h.close}
                    min={h.open + 15}
                    onChange={(m) => setHours((prev) => prev.map((x, j) => (j === i && x ? { ...x, close: m } : x)))}
                    label={`hora de cierre del ${day.toLowerCase()}`}
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <PButton label="Guardar horario" full style={{ marginTop: S.md }} disabled={pending || !can("space.hours")} onPress={() => void save()} />
    </Panel>
  );
}

type QrRef = { toDataURL: (cb: (base64: string) => void) => void } | null;

function LinkAndQr() {
  const { data } = usePro();
  const url = `https://franky.es/n/${data.space.slug}`;
  const qrRef = React.useRef<QrRef>(null);
  const [shared, setShared] = React.useState(false);

  // No hay portapapeles en la app: la hoja de compartir del sistema ya trae "Copiar".
  const share = async () => {
    try {
      const result = await Share.share({ message: url, url });
      if (result.action === Share.sharedAction) {
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      }
    } catch {
      toast("No se ha podido compartir", { kind: "error" });
    }
  };

  const saveQr = () => {
    const ref = qrRef.current;
    if (!ref) return;
    ref.toDataURL(async (base64) => {
      try {
        if (!(await Sharing.isAvailableAsync())) throw new Error("sin compartir");
        const file = new File(Paths.cache, `qr-${data.space.slug}.png`);
        if (file.exists) file.delete();
        file.create();
        file.write(base64, { encoding: "base64" });
        await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: "Guardar el QR de tu local", UTI: "public.png" });
      } catch {
        toast("No se ha podido guardar el QR", { kind: "error", body: "Inténtalo de nuevo en un momento." });
      }
    });
  };

  return (
    <>
      <Panel title="Tu enlace de reservas" description="Ponlo en la bio de Instagram, en Google y en WhatsApp. Abre tu ficha con el botón Reservar.">
        <View style={{ minHeight: 46, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.input, paddingHorizontal: S.md, justifyContent: "center" }}>
          <Text selectable style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.4} numberOfLines={1}>
            {url}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
          <PButton label={shared ? "Compartido" : "Compartir"} icon={shared ? Check : Share2} style={{ flex: 1 }} full onPress={() => void share()} />
          <PButton label="Ver ficha" variant="outline" icon={ExternalLink} style={{ flex: 1 }} full onPress={() => void Linking.openURL(url)} />
        </View>
        <View style={{ gap: S.sm, marginTop: S.lg }}>
          {[
            { t: "Instagram", d: "Edita tu perfil y pégalo en Sitio web." },
            { t: "Google", d: "En tu ficha de Google, en Reservas." },
            { t: "WhatsApp", d: "Como respuesta rápida para quien pide cita." },
          ].map((x) => (
            <View key={x.t} style={{ borderRadius: R.md, backgroundColor: C.input, padding: S.md, gap: 2 }}>
              <PText v="h3">{x.t}</PText>
              <PText v="small">{x.d}</PText>
            </View>
          ))}
        </View>
      </Panel>
      <Panel title="QR para tu local" description="Para el mostrador, el espejo o las mesas.">
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Código QR de ${url}`}
          style={{ alignSelf: "center", width: 232, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: "#FFFFFF", padding: S.md, alignItems: "center", gap: S.sm }}
        >
          <QRCode value={url} size={204} color="#121019" backgroundColor="#FFFFFF" quietZone={4} getRef={(c: QrRef) => (qrRef.current = c)} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 11.5, color: "#121019" }} maxFontSizeMultiplier={1.2}>Reserva con Franky</Text>
        </View>
        <PButton label="Descargar QR" variant="outline" icon={Download} full style={{ marginTop: S.lg }} onPress={saveQr} />
      </Panel>
    </>
  );
}

function Plan() {
  const { data, vertical } = usePro();
  const p = vertical.price;
  const isUni = vertical.id === "university";
  const founder = data.space.plan === "founder";
  const includes = [
    "Toda la operación de tu sector sin límites",
    "Ficha en Franky con reservas directas",
    "Ofertas relámpago y calendario académico",
    "Clientes, recordatorios y reseñas",
    "Equipo, permisos y fichaje",
    "Resultados de lo que te trae Franky",
    "Soporte por WhatsApp con una persona",
  ];
  return (
    <>
      <Panel title="Tu plan" description={isUni ? "Piloto anual por servicio o facultad, con alcance acordado." : "Cuota fija. Cero comisión por cada cliente que te trae Franky."}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: S.sm }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 34, letterSpacing: -1, color: C.text }} maxFontSizeMultiplier={1.2}>
            {isUni ? `Desde ${money(p.founder * 100, { round: true })}` : p.monthly ? money(p.monthly * 100, { round: true }) : "Gratis"}
          </Text>
          <PText v="body" color={C.muted}>{isUni ? "al año" : p.monthly ? "al mes" : ""}</PText>
          {founder && !isUni && p.founder && p.founder < p.annual ? <Pill label="Fundador" tone="violet" /> : null}
        </View>
        {!isUni && p.annual ? (
          <PText v="small" color={C.text} style={{ marginTop: S.sm }}>
            {`O ${money(p.annual * 100, { round: true })} al año (dos meses gratis).${
              founder && p.founder && p.founder < p.annual ? ` Como fundador, el primer año te sale por ${money(p.founder * 100, { round: true })}.` : ""
            }`}
          </PText>
        ) : null}
        {p.note ? <PText v="small" style={{ marginTop: 4 }}>{p.note}</PText> : null}
        <View style={{ gap: S.sm, marginTop: S.lg, marginBottom: S.lg }}>
          {includes.map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: S.sm }}>
              <Check size={16} color={C.blue} strokeWidth={2.4} style={{ marginTop: 1 }} />
              <PText v="small" color={C.text} style={{ flex: 1 }}>{i}</PText>
            </View>
          ))}
        </View>
        <Tip title="Sin permanencia">
          Cancelas cuando quieras y te llevas tus datos. Si dejas de pagar, tu ficha sigue en Franky y la Franky Card sigue funcionando gratis.
        </Tip>
      </Panel>
      <Panel title="Hablemos" description="Te lo dejamos montado en tu local y resolvemos cualquier duda.">
        <PButton
          label="Escribir por WhatsApp"
          icon={MessageCircle}
          full
          onPress={() => void Linking.openURL(PRO_CONTACT.whatsappHref(`Hola, soy de ${data.space.name} y quiero hablar de mi plan de Franky Pro`))}
        />
        <Tap
          onPress={() => void Linking.openURL(`tel:+${PRO_CONTACT.phoneE164}`)}
          accessibilityRole="link"
          accessibilityLabel={`Llamar al ${PRO_CONTACT.phoneLabel}`}
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: S.sm }}
        >
          <PText v="small">{`o llama al ${PRO_CONTACT.phoneLabel}`}</PText>
        </Tap>
      </Panel>
    </>
  );
}

function Data() {
  const { data } = usePro();
  const points = [
    "Exportas tus clientes, reservas y fichajes cuando quieras, en CSV.",
    "Franky trata los datos de tus clientes solo para darte el servicio, con contrato de encargado del tratamiento.",
    "Nunca usamos a tus clientes para campañas de otros negocios.",
    "Las notas técnicas solo las ve tu equipo.",
  ];
  const stats: [string, number][] = [
    ["Clientes", data.clients.length || data.communityMembers.length || data.leads.length],
    ["Reservas y citas", data.bookings.length],
    ["Personas del equipo", data.staff.length],
    ["Fichajes", data.shifts.length],
  ];
  return (
    <>
      <Panel title="Tus datos son tuyos">
        <View style={{ gap: S.md }}>
          {points.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: S.sm }}>
              <ShieldCheck size={16} color={C.blue} style={{ marginTop: 1 }} />
              <PText v="small" style={{ flex: 1 }}>{p}</PText>
            </View>
          ))}
        </View>
      </Panel>
      <Panel title="Resumen de lo que guardas">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {stats.map(([k, v]) => (
            <View key={k} style={{ width: "48.5%", borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: 10, gap: 2 }}>
              <PText v="small">{k}</PText>
              <Text style={{ fontFamily: FONT.heading, fontSize: 20, color: C.text }} maxFontSizeMultiplier={1.3}>{v.toLocaleString("es-ES")}</Text>
            </View>
          ))}
        </View>
      </Panel>
    </>
  );
}
