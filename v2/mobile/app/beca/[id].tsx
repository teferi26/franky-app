// ─── Detalle de beca: requisitos, documentación y cómo solicitarla ────────
// scholarships con los campos verificados de la migración 118 (requirements,
// application_process, deadline_note, sources). Si aún no están en prod, las
// secciones se ocultan y queda la ficha básica con el enlace oficial.
//
// Diseño: la cuantía va en display y el plazo en una píldora semántica (la
// misma que en el listado), colores solo del tema (el azul claro fijo del
// botón "guardar" era invisible en oscuro) y confirmaciones con toast en
// vez de Alert, salvo cuando hay una decisión que tomar (iniciar sesión).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Linking, Alert, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Clock, CheckCircle2, FileText, ListOrdered, Wallet, GraduationCap, ChevronDown, ChevronUp, BadgeCheck, Bookmark, BellRing, Share2, Bell, BellOff, ExternalLink } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, Skeleton, SkeletonList, Pill, Btn, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { SCHOLARSHIP_ALIASES } from '@/lib/scholarship-aliases';
import { typeLabel } from '@/lib/format';
import { plazoInfo, mesAnyo } from '@/lib/becas';
import { hasScholarshipAlert, setScholarshipAlert } from '@/lib/becas-alerts';
import { shareCard } from '@/lib/share-card';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { PlazoPill, cuantiaLabel } from '../becas';
import { C, S, F, R, FONT } from '@/theme';

// ── Guardar beca (favorites.target_type 'scholarship', 129) ──
// Insert/delete directo por RLS. El cron de la 130 avisa 3 días antes del cierre
// de las becas guardadas. Fail-soft: sin sesión devuelve reason 'auth'.
async function isScholarshipSaved(id: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('favorites').select('target_id')
    .match({ user_id: user.id, target_type: 'scholarship', target_id: id }).maybeSingle();
  return !!data;
}
async function setScholarshipSaved(id: string, save: boolean): Promise<{ ok: boolean; reason?: 'auth' | 'db' }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'auth' };
  const q = save
    ? supabase.from('favorites').upsert(
        { user_id: user.id, target_type: 'scholarship', target_id: id },
        { onConflict: 'user_id,target_type,target_id' })
    : supabase.from('favorites').delete().match({ user_id: user.id, target_type: 'scholarship', target_id: id });
  const { error } = await q;
  return error ? { ok: false, reason: 'db' } : { ok: true };
}

type Beca = {
  id: string; name: string; provider: string | null; type: string;
  description: string | null; amount_min: number | null; amount_max: number | null;
  opens_at?: string | null; closes_at?: string | null;
  deadline: string | null; url: string | null; comunidad_autonoma: string | null;
  income_threshold: number | null; gpa_requirement: number | null;
  documents_required: string[] | null; coverage: string[] | null;
  target_audience: string[] | null;
  requirements?: unknown; application_process?: string[] | null;
  deadline_note?: string | null; convocatoria?: string | null;
  url_verified_at?: string | null;
  sources?: { titulo?: string | null; url: string }[] | null;
};

// requirements: {academicos, economicos, otros} (118), objeto arbitrario o array
function normalizeRequirements(req: unknown): { label: string; items: string[] }[] {
  if (!req) return [];
  if (Array.isArray(req)) {
    const items = req.map(String).filter(Boolean);
    return items.length ? [{ label: 'Requisitos', items }] : [];
  }
  if (typeof req === 'object') {
    const labels: Record<string, string> = { academicos: 'Académicos', economicos: 'Económicos', otros: 'Otros' };
    const out: { label: string; items: string[] }[] = [];
    for (const [k, v] of Object.entries(req as Record<string, unknown>)) {
      const items = Array.isArray(v) ? v.map(String).filter(Boolean) : (typeof v === 'string' && v ? [v] : []);
      if (items.length) out.push({ label: labels[k] ?? k, items });
    }
    return out;
  }
  return [];
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{children}</Text>;
}

// Sección de la ficha: el icono va suelto y de trazo fino, sin cuadrado tintado.
function Section({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <View style={{ padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <Icon size={18} color={C.blue} strokeWidth={1.8} />
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1, fontSize: 18, letterSpacing: -0.3 }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function BecaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Beca | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [saved, setSaved] = useState(false);
  // Alerta de beca (scholarship_alerts, 146): null mientras se comprueba.
  const [alerta, setAlerta] = useState<boolean | null>(null);
  const [alertaBusy, setAlertaBusy] = useState(false);

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para reintentar
  // y para el pull-to-refresh.
  const alive = useRef(true);
  const load = useCallback(async () => {
    // try/catch/finally: si la promesa rechaza (sin red, timeout), antes se
    // quedaba en el skeleton para siempre. Ahora cae al estado de error con
    // "Reintentar". El finally deja el sitio para limpiar estados de carga.
    try {
      if (SCHOLARSHIP_ALIASES[String(id)]) {
        router.replace(`/beca/${SCHOLARSHIP_ALIASES[String(id)]}`);
        return;
      }
      const { data, error } = await supabase.from('scholarships').select('*').eq('id', String(id)).maybeSingle();
      if (!alive.current) return;
      if (error) throw error;
      setB((data as Beca) ?? null);
    } catch {
      if (alive.current) setB(null);
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [id, router]);
  // Reintentar desde el estado de error: vuelve al skeleton mientras carga.
  const retry = useCallback(() => { setB(undefined); void load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);
  useEffect(() => { isScholarshipSaved(String(id)).then((v) => { if (alive.current) setSaved(v); }); }, [id]);
  useEffect(() => { hasScholarshipAlert(String(id)).then((v) => { if (alive.current) setAlerta(v); }); }, [id]);

  const askLogin = (body: string) => Alert.alert('Inicia sesión', body, [
    { text: 'Ahora no', style: 'cancel' }, { text: 'Entrar', onPress: () => router.push('/welcome') },
  ]);

  // Activar o quitar la alerta. Optimista, con vuelta atrás si el servidor falla.
  const toggleAlerta = useCallback(async () => {
    if (alertaBusy || alerta === null) return;
    const was = alerta;
    setAlerta(!was);
    setAlertaBusy(true);
    const res = await setScholarshipAlert(String(id), !was);
    setAlertaBusy(false);
    if (!res.ok) {
      setAlerta(was);
      if (res.reason === 'auth') askLogin('Necesitas una cuenta para que te avisemos de esta beca.');
      else toastError('No se pudo guardar el aviso', 'Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!was) toast('Aviso activado', 'Te escribiremos al correo cuando abra o esté a punto de cerrar.');
    else toast('Aviso quitado');
  }, [alerta, alertaBusy, id, router]);

  const toggleSave = useCallback(async () => {
    const wasSaved = saved;
    setSaved(!wasSaved); // optimista
    const res = await setScholarshipSaved(String(id), !wasSaved);
    if (!res.ok) {
      setSaved(wasSaved); // revertir
      if (res.reason === 'auth') askLogin('Necesitas una cuenta para guardar esta beca y recibir el aviso de cierre.');
      else toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!wasSaved) toast('Beca guardada', 'Te avisaremos 3 días antes del cierre del plazo.');
    else toast('Quitada de guardadas');
  }, [saved, id, router]);

  if (b === undefined) {
    return (
      <Screen title="Beca" back>
        {/* Esqueleto con la forma de la ficha: píldoras, título, cuantía y bloques. */}
        <View style={{ paddingTop: S.lg }}>
          <Skeleton height={22} radius={R.full} style={{ width: 140 }} />
          <Skeleton height={30} radius={R.sm} />
          <Skeleton height={64} radius={R.lg} />
          <SkeletonList count={2} height={48} radius={R.md} />
        </View>
      </Screen>
    );
  }
  if (b === null) {
    return (
      <Screen title="Beca" back>
        <EmptyState icon={Wallet} title="No se pudo cargar"
          subtitle="No encontramos esta beca o falla tu conexión. Inténtalo de nuevo."
          cta="Reintentar" onCta={retry} />
      </Screen>
    );
  }

  const plazo = plazoInfo(b.deadline, Date.now(), b);
  const requirements = normalizeRequirements(b.requirements);
  const process = Array.isArray(b.application_process) ? b.application_process.map(String).filter(Boolean) : [];
  const documents = Array.isArray(b.documents_required) ? b.documents_required : [];
  const sources = Array.isArray(b.sources) ? b.sources : [];
  const hasAmount = b.amount_min != null && b.amount_max != null;
  const amount = hasAmount ? cuantiaLabel(b) : null;

  // Compartir a stories/redes (60): nombre + importe o plazo + enlace. Ver
  // src/lib/share-card.ts (no hay react-native-view-shot en el proyecto, así
  // que se comparte texto con la hoja nativa, no una imagen).
  const shareBeca = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const subtitle = amount
      ? `Hasta ${amount}`
      : (plazo.fecha
        ? (plazo.estimada ? `Último plazo cerrado: ${plazo.fecha.toLocaleDateString("es-ES")}` : `Plazo hasta el ${plazo.fecha.toLocaleDateString('es-ES')}`)
        : null);
    // shareCard ya es fail-soft por dentro (usuario cancela la hoja, etc.): no hace falta más manejo aquí.
    void shareCard({ title: b.name, subtitle, footer: 'Descúbrela en Franky', url: 'https://franky.es/becas' });
  };

  const openOficial = () => { if (b.url) Linking.openURL(b.url).catch(() => toastError('No se pudo abrir el enlace')); };

  return (
    <Screen title="Beca" back refreshing={refreshing} onRefresh={onRefresh} right={
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Tap onPress={shareBeca} accessibilityLabel="Compartir esta beca" hitSlop={6}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Share2 size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
        <Tap onPress={toggleSave} haptic accessibilityLabel={saved ? 'Quitar de guardadas' : 'Guardar beca'} accessibilityState={{ checked: saved }} hitSlop={6}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Bookmark size={24} color={saved ? C.blue : C.text} fill={saved ? C.blue : 'transparent'} strokeWidth={1.9} />
        </Tap>
      </View>
    }>
      {/* cabecera */}
      <FadeIn>
      <View style={{ padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
        {/* Rótulo (quién la convoca), titular grande y después las etiquetas. */}
        {b.provider ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label} numberOfLines={2}>{b.provider}</Text> : null}
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, lineHeight: 33, letterSpacing: -0.7 }]}>{b.name}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill label={typeLabel[b.type] ?? b.type} tone="blue" />
          <PlazoPill deadline={b.deadline} opens_at={b.opens_at} closes_at={b.closes_at} />
          {b.comunidad_autonoma ? <Pill label={b.comunidad_autonoma} tone="gray" /> : null}
          {b.convocatoria ? <Pill label={`Convocatoria ${b.convocatoria}`} /> : null}
          {b.url_verified_at ? <Pill label="Fuentes consultadas" tone="green" icon={BadgeCheck} /> : null}
        </View>

        {/* Cuantía destacada: la pregunta número uno de quien abre una beca.
            Cifra grande sobre el fondo de la página, sin tarjeta ni icono. */}
        <View style={{ marginTop: 6, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
          <Label>Cuantía</Label>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} adjustsFontSizeToFit numberOfLines={1}
            style={hasAmount
              ? [F.display, { fontSize: 40, lineHeight: 46, letterSpacing: -1.4, color: C.blue, fontVariant: ['tabular-nums'] }]
              : [F.h2, { fontSize: 22, color: C.muted }]}>
            {amount ?? 'Cuantía variable'}
          </Text>
          {plazo.fecha ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 4 }, plazo.estado === 'proxima' ? { color: C.warning, fontFamily: FONT.semibold } : null]}>
              {plazo.estimada
                ? `Último plazo cerrado: ${plazo.fecha.toLocaleDateString("es-ES")}`
                : `Hasta el ${plazo.fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}${plazo.dias != null ? ` · ${plazo.dias} días` : ''}`}
            </Text>
          ) : null}
        </View>

        {plazo.estado === 'pendiente_apertura' && plazo.apertura ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blue }]}>La solicitud abre el {plazo.apertura.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}.</Text> : null}
        {b.closes_at ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Cierre oficial: {new Date(b.closes_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} (hora peninsular española).</Text> : null}
        {b.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{b.description}</Text> : null}

        <View style={{ gap: 6 }}>
          {plazo.estimada ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
              {b.deadline_note
                ? b.deadline_note
                : `El plazo anterior ya cerró${plazo.ultimaConvocatoria ? ` (${plazo.ultimaConvocatoria.toLocaleDateString('es-ES')})` : ''}. No consta un nuevo plazo confirmado. Consulta la sede oficial.`}
            </Text>
          ) : b.deadline_note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{b.deadline_note}</Text> : null}
          {b.gpa_requirement != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <GraduationCap size={16} color={C.muted} strokeWidth={1.8} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Nota mínima: {Number(b.gpa_requirement).toLocaleString('es-ES')}</Text>
            </View>
          ) : null}
          {b.income_threshold != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Wallet size={16} color={C.muted} strokeWidth={1.8} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Umbral indicado (revisar unidad familiar): {Number(b.income_threshold).toLocaleString('es-ES')} €</Text>
            </View>
          ) : null}
        </View>

        {b.url ? (
          <Btn full icon={ExternalLink} label="Ir a la convocatoria oficial" onPress={openOficial} />
        ) : null}

        {/* Guardar + recordatorio: el cron de la 130 avisa 3 días antes del cierre. */}
        <Tap onPress={toggleSave} haptic accessibilityLabel={saved ? 'Quitar de guardadas' : 'Guardar y recibir aviso'} accessibilityState={{ checked: saved }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            borderWidth: 1, borderColor: saved ? C.blue : C.border, borderRadius: R.lg,
            paddingVertical: 11, paddingHorizontal: 14, minHeight: 56, backgroundColor: saved ? C.accentSoft : C.surface,
          }}>
            <Bookmark size={20} color={saved ? C.blue : C.text} fill={saved ? C.blue : 'transparent'} strokeWidth={1.9} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, saved ? { color: C.blue } : null]}>
                {saved ? 'Beca guardada' : 'Guardar esta beca'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <BellRing size={12} color={C.muted} strokeWidth={1.9} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Te avisaremos 3 días antes del cierre</Text>
              </View>
            </View>
          </View>
        </Tap>

        {/* Alerta por correo (scholarship_alerts, 146): un toque activa, otro quita. */}
        <Btn full small
          variant={alerta ? 'secondary' : 'ghost'}
          icon={alerta ? BellOff : Bell}
          busy={alertaBusy || alerta === null}
          label={alerta ? 'Aviso activado · quitar' : 'Avisarme cuando abra'}
          accessibilityState={{ checked: !!alerta }}
          onPress={toggleAlerta} />
      </View>
      </FadeIn>

      {/* requisitos */}
      {requirements.length > 0 ? (
        <Section icon={CheckCircle2} title="Requisitos">
          {requirements.map((g, i) => (
            <View key={i} style={{ gap: 4 }}>
              {requirements.length > 1 ? <Label>{g.label}</Label> : null}
              {g.items.map((item, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                  <CheckCircle2 size={14} color={C.success} strokeWidth={2} style={{ marginTop: 3 }} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </Section>
      ) : null}

      {/* cómo solicitarla */}
      {process.length > 0 ? (
        <Section icon={ListOrdered} title="Cómo solicitarla, paso a paso">
          {process.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: R.full, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11.5, fontFamily: FONT.heading, color: C.blue }}>{i + 1}</Text>
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{p.replace(/^paso \d+:?\s*/i, '')}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {/* documentación */}
      {documents.length > 0 ? (
        <Section icon={FileText} title="Documentación necesaria">
          {documents.map((doc, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <FileText size={14} color={C.muted} strokeWidth={1.9} style={{ marginTop: 3 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{doc}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {/* fuentes */}
      {sources.length > 0 ? (
        <View style={{ padding: S.lg, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
          <Tap onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowSources(!showSources); }}
            accessibilityLabel={`Fuentes de los datos, ${sources.length}`} accessibilityHint={showSources ? 'Oculta las fuentes' : 'Muestra las fuentes'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <FileText size={16} color={C.muted} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>Fuentes de los datos ({sources.length})</Text>
              {showSources ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
            </View>
          </Tap>
          {showSources ? (
            <View style={{ gap: 6, marginTop: 8 }}>
              {sources.map((src, i) => (
                <Tap key={i} onPress={() => Linking.openURL(src.url).catch(() => {})} accessibilityRole="link" accessibilityLabel={src.titulo || src.url}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blueDeep, paddingVertical: 4 }]} numberOfLines={2}>• {src.titulo || src.url}</Text>
                </Tap>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* aviso */}
      <View style={{ padding: S.lg, gap: 10 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
          La solicitud se hace siempre en la web del organismo convocante, nunca a través de Franky.
          Revisa la convocatoria oficial antes de solicitar: los plazos y requisitos pueden cambiar.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {b.url ? (
            <View style={{ flex: 1 }}>
              <Btn variant="secondary" small full icon={ExternalLink} label="Web oficial" onPress={openOficial} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Btn variant="ghost" small full icon={Share2} label="Compartir" onPress={shareBeca} />
          </View>
        </View>
      </View>
    </Screen>
  );
}
