import React from "react";
import { Linking, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Award, BadgeCheck, CalendarDays, Camera, Check, Eye, GraduationCap, MapPin, Plus, QrCode, ScanLine, Sparkles, Users, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { addDays, atLocal, dayLabel, localDate, money, pct, time } from "../../../../../shared/pro/format";
import { activityAttendees, checkedInSet, type Attendee, type CommunityActivity, type CommunityMember } from "../../../../../shared/pro/demo/community";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  DayChips,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  Meter,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Pill,
  SearchInput,
  Segmented,
  Sheet,
  Stepper,
  TimeStepper,
  Tip,
} from "../../kit";
import { Card, DashedNote, DateBadge, StatRow, StatTile } from "./ui";

type Tab = "proximas" | "pasadas" | "borradores";

const PAGE = 40;

export default function CommunityActividades() {
  const { data, now } = usePro();
  const params = useLocalSearchParams<{ a?: string; nueva?: string }>();
  const [tab, setTab] = React.useState<Tab>("proximas");
  const [open, setOpen] = React.useState<string | null>(typeof params.a === "string" ? params.a : null);
  const [creating, setCreating] = React.useState(params.nueva === "1");
  const [limit, setLimit] = React.useState(PAGE);

  // Si se llega desde Hoy con la pantalla ya montada, los parámetros cambian sin remontar.
  React.useEffect(() => {
    if (typeof params.a === "string" && params.a) setOpen(params.a);
  }, [params.a]);
  React.useEffect(() => {
    if (params.nueva === "1") setCreating(true);
  }, [params.nueva]);

  const activities = data.activities as CommunityActivity[];
  const today = localDate(now);
  const upcoming = activities.filter((a) => a.status === "published" && localDate(a.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = activities.filter((a) => a.status === "done" || (a.status === "published" && localDate(a.date) < today)).sort((a, b) => b.date.localeCompare(a.date));
  const drafts = activities.filter((a) => a.status === "draft");
  const list = tab === "proximas" ? upcoming : tab === "pasadas" ? past : drafts;

  const registeredAhead = upcoming.reduce((acc, a) => acc + a.registered, 0);
  const verifiedAttendance = past.reduce((acc, a) => acc + a.checkedIn, 0);
  const ectsHours = past.filter((a) => a.ectsHours).reduce((acc, a) => acc + (a.ectsHours ?? 0) * a.checkedIn, 0);
  const avgShow = past.length ? Math.round(past.reduce((acc, a) => acc + pct(a.checkedIn, a.registered), 0) / past.length) : 0;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Actividades"
        title="Actividades"
        description={
          upcoming.length
            ? `${upcoming.length} próximas con ${registeredAhead} inscritos. Este curso llevas ${verifiedAttendance} asistencias verificadas con check-in.`
            : "Publica tu próxima actividad: gratis o con entrada, y con check-in en la puerta."
        }
        actions={<PButton label="Nueva actividad" icon={Plus} onPress={() => setCreating(true)} />}
      >
        <Segmented<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "proximas", label: "Próximas", count: upcoming.length },
            { value: "pasadas", label: "Pasadas", count: past.length },
            { value: "borradores", label: "Borradores", count: drafts.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Users} label="Inscritos por delante" value={registeredAhead} hint={`${upcoming.length} actividades publicadas`} />
        <Kpi icon={BadgeCheck} label="Asistencias verificadas" value={verifiedAttendance} hint="Con QR y cuenta universitaria" />
        <Kpi icon={GraduationCap} label="Horas para créditos" value={ectsHours} hint="Certificables este curso" emphasis />
        <Kpi icon={Check} label="Vienen de verdad" value={`${avgShow} %`} hint="De inscritos que hacen check-in" />
      </KpiRow>

      {list.length ? (
        <View>
          {list.slice(0, limit).map((a) => (
            <ActivityCard key={a.id} activity={a} onOpen={() => setOpen(a.id)} />
          ))}
          {list.length > limit ? (
            <PButton
              label={`Ver ${Math.min(PAGE, list.length - limit)} más de ${list.length - limit}`}
              variant="ghost"
              small
              onPress={() => setLimit((l) => l + PAGE)}
              style={{ alignSelf: "center", marginBottom: S.md }}
            />
          ) : null}
        </View>
      ) : (
        <Card>
          <Empty
            icon={CalendarDays}
            title={tab === "borradores" ? "No tienes borradores" : tab === "pasadas" ? "Aún no hay actividades pasadas" : "No hay actividades a la vista"}
            body={
              tab === "proximas"
                ? "Crea la próxima. Aparece en Franky para los estudiantes de toda la universidad, no solo para tus seguidores."
                : "Aquí verás las actividades con su asistencia verificada."
            }
            action={<PButton label="Nueva actividad" onPress={() => setCreating(true)} />}
          />
        </Card>
      )}

      <Tip title="Créditos sin hojas de firmas">
        Las universidades reconocen créditos por actividades culturales, deportivas y solidarias. Si tu actividad tiene horas para créditos, el check-in con cuenta universitaria deja la asistencia verificada y el certificado sale solo.
      </Tip>

      <ActivitySheet activityId={open} onClose={() => setOpen(null)} />
      <NewActivitySheet open={creating} onClose={() => setCreating(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */

function ActivityCard({ activity: a, onOpen }: { activity: CommunityActivity; onOpen: () => void }) {
  const { data } = usePro();
  const sponsor = data.sponsors.find((s) => s.id === a.sponsorId);
  const done = a.status === "done";
  const free = a.capacity - a.registered;
  return (
    <Card onPress={onOpen} accessibilityLabel={`${a.title}, ${dayLabel(a.date)}`}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <DateBadge iso={a.date} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: FONT.heading, fontSize: 16, lineHeight: 21, color: C.text }} maxFontSizeMultiplier={1.3}>
            {a.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPin size={12} color={C.muted} />
            <PText v="tiny" numberOfLines={1} style={{ flex: 1 }}>{`${time(a.date)} · ${a.place}`}</PText>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill label={a.priceCents ? money(a.priceCents) : "Gratis"} tone={a.priceCents ? "neutral" : "success"} />
        {a.ectsHours ? <Pill label={`${a.ectsHours} h créditos`} tone="info" icon={GraduationCap} /> : null}
        {sponsor ? <Pill label={`Con ${sponsor.business}`} tone="violet" /> : null}
        {a.status === "draft" ? <Pill label="Borrador" tone="warning" /> : null}
        {done && a.certificates ? <Pill label="Certificados enviados" tone="success" /> : null}
      </View>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
          <PText v="tiny" style={{ flex: 1 }}>{done ? `${a.checkedIn} vinieron de ${a.registered} inscritos` : `${a.registered} inscritos de ${a.capacity}`}</PText>
          <PText v="tiny">{done ? `${pct(a.checkedIn, a.registered)} %` : free > 0 ? `${free} libres` : "Completa"}</PText>
        </View>
        <Meter value={done ? a.checkedIn : a.registered} max={done ? a.registered || 1 : a.capacity} tone={done ? "success" : free <= 3 ? "warning" : "violet"} />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

/** El QR de una entrada puede traer el id tal cual o dentro de un enlace de Franky. */
function matchTicket(raw: string, attendees: Attendee[]): Attendee | undefined {
  const value = raw.trim();
  return attendees.find((p) => value === p.id || value.endsWith(`/${p.id}`) || value.endsWith(`=${p.id}`));
}

function ActivitySheet({ activityId, onClose }: { activityId: string | null; onClose: () => void }) {
  const { data, update } = usePro();
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<"todos" | "pendientes" | "dentro">("todos");
  const [scanning, setScanning] = React.useState(false);
  const activity = (data.activities as CommunityActivity[]).find((a) => a.id === activityId);

  React.useEffect(() => {
    setQuery("");
    setOnly("todos");
    setScanning(false);
  }, [activityId]);

  if (!activity) return null;
  const a = activity;
  const members = data.communityMembers as CommunityMember[];
  const attendees = activityAttendees(a, members);
  const inside = checkedInSet(a, attendees);
  const sponsor = data.sponsors.find((s) => s.id === a.sponsorId);
  const isDraft = a.status === "draft";
  const done = a.status === "done";
  const canCheckIn = !isDraft;
  const q = query.toLowerCase();
  const shown = attendees.filter((p) => {
    if (only === "pendientes" && inside.has(p.id)) return false;
    if (only === "dentro" && !inside.has(p.id)) return false;
    return !query || p.name.toLowerCase().includes(q) || p.studies.toLowerCase().includes(q);
  });
  const viaFranky = attendees.filter((p) => !p.member).length;

  const toggle = async (id: string, name: string) => {
    const next = new Set(inside);
    const adding = !next.has(id);
    if (adding) next.add(id);
    else next.delete(id);
    const ok = await update("activity.checkin", (d) => ({
      ...d,
      activities: d.activities.map((x) => (x.id === a.id ? { ...x, checkedIn: next.size, checkedInIds: [...next] } : x)),
    }));
    if (ok && adding) toast(`${name.split(" ")[0]} está dentro`, { kind: "success", body: `${next.size} de ${a.registered} con check-in.` });
  };

  const onScan = (raw: string) => {
    const person = matchTicket(raw, attendees);
    if (!person) {
      toast("Esta entrada no es de esta actividad", { kind: "error" });
      return;
    }
    if (inside.has(person.id)) {
      toast(`${person.name.split(" ")[0]} ya estaba dentro`, { kind: "info" });
      return;
    }
    void toggle(person.id, person.name);
  };

  const certificates = async () => {
    const ok = await update("activity.certificates", (d) => ({
      ...d,
      activities: d.activities.map((x) => (x.id === a.id ? { ...x, certificates: true } : x)),
    }));
    if (!ok) return;
    toast("Certificados de asistencia generados", {
      kind: "success",
      body: `${inside.size} certificados con asistencia verificada${a.ectsHours ? ` y ${a.ectsHours} h para créditos` : ""}. Les llegan a su Franky.`,
    });
  };

  const publish = async () => {
    const ok = await update("activity.publish", (d) => ({
      ...d,
      activities: d.activities.map((x) => (x.id === a.id ? { ...x, status: "published" } : x)),
    }));
    if (!ok) return;
    toast("Actividad publicada", { kind: "success", body: "Ya la ven los estudiantes de tu universidad en Franky." });
    onClose();
  };

  const close = async () => {
    const ok = await update("activity.close", (d) => ({
      ...d,
      activities: d.activities.map((x) => (x.id === a.id ? { ...x, status: "done" } : x)),
    }));
    if (!ok) return;
    toast("Actividad cerrada", { kind: "success", body: `${inside.size} asistencias verificadas quedan guardadas para la memoria.` });
  };

  return (
    <Sheet
      open={Boolean(activityId)}
      onClose={onClose}
      title={a.title}
      description={`${dayLabel(a.date)} a las ${time(a.date)} · ${a.place}`}
      footer={
        isDraft ? (
          <PButton label="Publicar actividad" onPress={() => void publish()} />
        ) : done ? (
          <PButton
            label={a.certificates ? "Volver a generar certificados" : "Generar certificados"}
            icon={Award}
            onPress={() => void certificates()}
            disabled={!inside.size}
          />
        ) : (
          <>
            <PButton label="Cerrar actividad" variant="outline" onPress={() => void close()} />
            <PButton label="Generar certificados" icon={Award} onPress={() => void certificates()} disabled={!inside.size} />
          </>
        )
      }
    >
      {a.description ? <PText v="body" color={C.muted}>{a.description}</PText> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill label={a.priceCents ? `${money(a.priceCents)} la entrada` : "Gratis"} tone={a.priceCents ? "neutral" : "success"} />
        {a.ectsHours ? <Pill label={`${a.ectsHours} h para créditos`} tone="info" /> : null}
        {sponsor ? <Pill label={`Patrocina ${sponsor.business}`} tone="violet" /> : null}
      </View>

      <StatRow>
        <StatTile label="Inscritos" value={a.registered} />
        <StatTile label="Check-in" value={inside.size} />
        <StatTile
          label={a.priceCents ? "Cobrado" : "Plazas libres"}
          value={a.priceCents ? money(a.priceCents * a.registered, { round: true }) : Math.max(0, a.capacity - a.registered)}
        />
      </StatRow>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <PText v="tiny">Asistencia</PText>
          <PText v="tiny">{`${inside.size} de ${a.registered}`}</PText>
        </View>
        <Meter value={inside.size} max={a.registered || 1} tone="success" />
      </View>

      {!isDraft ? (
        <View style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <QrCode size={34} color={C.text} strokeWidth={1.5} />
            <PText v="small" style={{ flex: 1 }}>
              En la puerta, escanea la entrada de cada persona desde la app. También puedes marcarla a mano aquí.
            </PText>
          </View>
          {scanning ? (
            <DoorScanner onScan={onScan} onClose={() => setScanning(false)} />
          ) : (
            <PButton label="Escanear entradas" icon={ScanLine} variant="secondary" full onPress={() => setScanning(true)} />
          )}
        </View>
      ) : (
        <DashedNote>Aún es un borrador. Cuando la publiques, los estudiantes podrán inscribirse y aquí verás la lista.</DashedNote>
      )}

      {!isDraft && attendees.length ? (
        <View style={{ gap: S.sm }}>
          <View style={{ gap: 4 }}>
            <PText v="h2">Inscritos</PText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Sparkles size={13} color={C.blue} />
              <PText v="tiny">{`${viaFranky} no son socios y llegaron por Franky`}</PText>
            </View>
          </View>
          <View>
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o estudios" />
            <Segmented
              value={only}
              onChange={setOnly}
              options={[
                { value: "todos", label: "Todos" },
                { value: "pendientes", label: "Faltan", count: attendees.length - inside.size },
                { value: "dentro", label: "Dentro", count: inside.size },
              ]}
            />
          </View>
          <View>
            {shown.slice(0, 60).map((p, i, list) => {
              const isIn = inside.has(p.id);
              return (
                <View
                  key={p.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 10, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                >
                  <PAvatar name={p.name} toneKey={p.member ? "violet" : "sky"} size={34} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</PText>
                      {p.verified ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Verificado" /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>{`${p.studies} · ${p.member ? "Socio" : "Vino por Franky"}`}</PText>
                  </View>
                  {canCheckIn ? (
                    <Tap
                      onPress={() => void toggle(p.id, p.name)}
                      haptic
                      accessibilityRole="button"
                      accessibilityState={{ selected: isIn }}
                      accessibilityLabel={isIn ? `Deshacer el check-in de ${p.name}` : `Marcar la asistencia de ${p.name}`}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: S.md,
                        borderRadius: R.md,
                        borderWidth: 1,
                        borderColor: isIn ? `${C.success}55` : C.border,
                        backgroundColor: isIn ? `${C.success}1F` : "transparent",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {isIn ? <Check size={14} color={C.success} strokeWidth={2.4} /> : null}
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: isIn ? C.success : C.muted }} maxFontSizeMultiplier={1.3}>
                        {isIn ? "Dentro" : "Marcar"}
                      </Text>
                    </Tap>
                  ) : null}
                </View>
              );
            })}
          </View>
          {shown.length > 60 ? <PText v="tiny">{`Y ${shown.length - 60} más. Busca por nombre para encontrarles.`}</PText> : null}
          {!shown.length ? <PText v="small" style={{ paddingVertical: S.md }}>Nadie coincide con la búsqueda.</PText> : null}
        </View>
      ) : null}

      {a.reachOutside ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          <Eye size={16} color={C.muted} />
          <PText v="small" style={{ flex: 1 }}>{`La vieron ${a.reachOutside.toLocaleString("es-ES")} estudiantes que no seguían a la asociación.`}</PText>
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * Lector de entradas en la puerta. Va dentro de la hoja (no en otro modal) y
 * espera un par de segundos entre lecturas para no marcar dos veces.
 */
function DoorScanner({ onScan, onClose }: { onScan: (raw: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = React.useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const handle = ({ data }: BarcodeScanningResult) => {
    const at = Date.now();
    if (data === last.current.value && at - last.current.at < 2500) return;
    last.current = { value: data, at };
    onScan(data);
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={{ alignItems: "center", gap: S.sm, paddingVertical: S.md }}>
        <Camera size={24} color={C.muted} strokeWidth={1.6} />
        <PText v="small" style={{ textAlign: "center" }}>Para escanear las entradas, Franky necesita usar la cámara.</PText>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          <PButton label="Ahora no" variant="ghost" small onPress={onClose} />
          <PButton
            label={permission.canAskAgain ? "Permitir cámara" : "Abrir ajustes"}
            small
            onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: S.sm }}>
      <View style={{ height: 260, borderRadius: R.lg, overflow: "hidden", backgroundColor: "#121019" }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handle} />
        <View pointerEvents="none" style={{ position: "absolute", top: 40, bottom: 40, left: "20%", right: "20%", borderRadius: R.lg, borderWidth: 2, borderColor: "rgba(255,255,255,0.8)" }} />
      </View>
      <PButton label="Dejar de escanear" icon={X} variant="ghost" small onPress={onClose} style={{ alignSelf: "center" }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function NewActivitySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(addDays(today, 7));
  const [hour, setHour] = React.useState(19 * 60);
  const [place, setPlace] = React.useState("");
  const [capacity, setCapacity] = React.useState(50);
  const [paid, setPaid] = React.useState<"gratis" | "entrada">("gratis");
  const [price, setPrice] = React.useState("5");
  const [ects, setEcts] = React.useState(0);
  const [sponsorId, setSponsorId] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(addDays(localDate(now), 7));
    setHour(19 * 60);
    setPlace("");
    setCapacity(50);
    setPaid("gratis");
    setPrice("5");
    setEcts(0);
    setSponsorId("");
    setDescription("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sponsors = data.sponsors.filter((s) => s.status === "active");
  const priceCents = paid === "entrada" ? Math.round(Number(price.replace(",", ".")) * 100) || 0 : 0;
  const cap = Math.max(1, capacity);
  const valid = title.trim().length > 2 && place.trim().length > 2 && Boolean(date) && (paid === "gratis" || priceCents > 0);

  const save = async (status: "published" | "draft") => {
    const activity: CommunityActivity = {
      id: localId("a"),
      title: title.trim(),
      date: atLocal(date, hour),
      place: place.trim(),
      capacity: cap,
      registered: 0,
      checkedIn: 0,
      priceCents,
      ectsHours: ects > 0 ? ects : undefined,
      status,
      sponsorId: sponsorId || undefined,
      description: description.trim() || undefined,
      councilLogo: true,
      reachOutside: 0,
    };
    if (!(await update("activity.create", (d) => ({ ...d, activities: [activity, ...d.activities] })))) return;
    toast(status === "published" ? "Actividad publicada" : "Borrador guardado", {
      kind: "success",
      body: status === "published" ? "La verán los estudiantes de toda tu universidad en Franky." : "Publícala cuando la tengas lista.",
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva actividad"
      description="Con inscripción, entrada si quieres y check-in en la puerta."
      footer={
        <>
          <PButton label="Guardar borrador" variant="outline" onPress={() => void save("draft")} disabled={!title.trim()} />
          <PButton label="Publicar" onPress={() => void save("published")} disabled={!valid} />
        </>
      }
    >
      <Field label="Título">
        <Input value={title} onChangeText={setTitle} placeholder="Cinefórum: Robot Dreams" label="Título" />
      </Field>
      <Field label="Fecha">
        <DayChips value={date} onChange={setDate} today={today} days={60} />
      </Field>
      <Field label="Hora">
        <TimeStepper value={hour} onChange={setHour} label="hora" />
      </Field>
      <Field label="Lugar">
        <Input value={place} onChangeText={setPlace} placeholder="Salón de actos, Filosofía y Letras" label="Lugar" />
      </Field>
      <Field label="Plazas">
        <Stepper value={capacity} onChange={setCapacity} min={1} max={2000} step={5} label="plazas" />
      </Field>
      <Field
        label="Precio"
        hint={paid === "entrada" ? `Se cobra al inscribirse. Te llegan ${money(Math.round(priceCents * 0.95))} por entrada.` : "Inscripción gratis con plaza asegurada."}
      >
        <ChoiceGrid
          value={paid}
          onChange={setPaid}
          options={[
            { value: "gratis", label: "Gratis" },
            { value: "entrada", label: "Con entrada" },
          ]}
        />
        {paid === "entrada" ? (
          <View style={{ justifyContent: "center", marginTop: S.xs }}>
            <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" label="Precio de la entrada en euros" style={{ paddingRight: 32 }} />
            <Text style={{ position: "absolute", right: S.md, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>€</Text>
          </View>
        ) : null}
      </Field>
      <Field label="Horas para créditos" hint="Déjalo en cero si no da créditos. Con check-in verificado, el certificado sale solo.">
        <Stepper value={ects} onChange={setEcts} min={0} max={60} label="horas para créditos" format={(v) => (v ? `${v} h` : "Ninguna")} />
      </Field>
      <Field label="Patrocinador">
        <ChoiceGrid
          value={sponsorId}
          onChange={setSponsorId}
          options={[{ value: "", label: "Sin patrocinador" }, ...sponsors.map((s) => ({ value: s.id, label: s.business }))]}
        />
      </Field>
      <Field label="Descripción">
        <Input
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Qué vais a hacer, qué incluye y a quién va dirigida."
          label="Descripción"
        />
      </Field>
    </Sheet>
  );
}
