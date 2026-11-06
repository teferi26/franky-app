// Panel de administración en la app.
//
// Tres estados, en este orden:
//   1. No eres staff              -> no existe para ti (mensaje neutro).
//   2. Eres staff con sesión aal1 -> pedimos el código del autenticador.
//   3. Sesión aal2                -> los datos.
//
// El paso 2 no es adorno: desde la migración 152 las RPC del panel exigen AAL2
// en la propia base de datos, así que sin código no hay datos aunque alguien
// manipulase esta pantalla.
//
// Los nombres de los campos salen del SQL de las migraciones 044/044b, no de
// suposiciones: la primera versión de esta pantalla los adivinó y pintaba un
// guion en absolutamente todo.
//
// OJO con la lección de aquello: el arreglo fue corregir los NOMBRES, no tapar
// los huecos con ceros. Un dato que no llega se pinta '—' (ver SIN_DATO), nunca
// 0, porque si no un panel roto se confunde con una comunidad vacía. Y las once
// RPC se piden con allSettled, para que el fallo de una no borre las ocho
// secciones.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Alert, Clipboard, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import {
  ShieldCheck, Users, MessageCircle, CalendarDays, Flag, TrendingUp, Lock,
  GraduationCap, Euro, Boxes, ShieldAlert, Activity, UserPlus, Heart,
  FileText, CheckCircle, Trash2,
} from 'lucide-react-native';
import { Screen, Header } from '@/components/Screen';
import { Btn, Tap, EmptyState, SkeletonList } from '@/components/ui';
import { C, S, F, R, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { Kpi, Titulo, Aviso, n, eur, pct, sumKnown } from '@/components/admin-ui';
import { AdminGestion, type SeccionGestion } from '@/components/AdminGestion';
import {
  getStaffRole, getAal, listVerifiedFactors, elevateWithTotp, MfaRequiredError,
  empezarAltaTotp, confirmarAltaTotp, cancelarAltaTotp, type FactorNuevo,
  getKpis, getEngagement, getDemografia, getContenido, getCrecimiento, getSeguridad,
  getTopUniversidades, getTopCiudades, getTopCarreras, getMonetizacion, getAltasDiarias,
  getProductAnalytics, type ProductAnalytics,
  type StaffRole, type Kpis, type Engagement, type Demografia, type Contenido,
  type Crecimiento, type Seguridad, type TopUni, type Carrera, type Monetizacion,
  type PuntoAltas,
} from '@/lib/admin';

// El panel tiene DOS mitades, igual que en la web:
//
//   GESTIÓN   — lo que en la web es /admin: usuarios, reportes, auditoría,
//               sugerencias y papelera. Es el trabajo de verdad y hasta ahora
//               no existía en la app: la pantalla se llamaba "Panel admin"
//               pero solo enseñaba gráficas, o sea el panel del analista.
//   ANALÍTICA — las ocho secciones de /admin/analytics, replicadas una a una
//               con las mismas métricas.
type SeccionAnalitica =
  | 'resumen' | 'demografia' | 'academico' | 'engagement'
  | 'monetizacion' | 'contenido' | 'seguridad' | 'crecimiento';
type Seccion = SeccionAnalitica | SeccionGestion;

type Entrada = { key: Seccion; label: string; icon: typeof Users };

const GESTION: Entrada[] = [
  { key: 'gestion', label: 'Resumen', icon: Boxes },
  { key: 'usuarios', label: 'Usuarios', icon: Users },
  { key: 'reportes', label: 'Reportes', icon: Flag },
  { key: 'auditoria', label: 'Auditoría', icon: FileText },
  { key: 'sugerencias', label: 'Sugerencias', icon: CheckCircle },
  { key: 'papelera', label: 'Papelera', icon: Trash2 },
];

const SECCIONES: Entrada[] = [
  { key: 'resumen', label: 'Resumen', icon: TrendingUp },
  { key: 'demografia', label: 'Demografía', icon: Users },
  { key: 'academico', label: 'Académico', icon: GraduationCap },
  { key: 'engagement', label: 'Uso y actividad', icon: Activity },
  { key: 'monetizacion', label: 'Monetización', icon: Euro },
  { key: 'contenido', label: 'Contenido', icon: Boxes },
  { key: 'seguridad', label: 'Seguridad', icon: ShieldAlert },
  { key: 'crecimiento', label: 'Crecimiento', icon: UserPlus },
];

const CLAVES_GESTION = GESTION.map((g) => g.key);
const esGestion = (s: Seccion): s is SeccionGestion => CLAVES_GESTION.includes(s);

/** Rejilla de pestañas de un grupo. Envuelve: nada de scroll horizontal. */
function Pestanas({ titulo, entradas, activa, onElegir }: {
  titulo: string; entradas: Entrada[]; activa: Seccion; onElegir: (s: Seccion) => void;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ gap: 8 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>
        {titulo}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {entradas.map((s) => {
          const act = s.key === activa;
          return (
            <Tap key={s.key} onPress={() => onElegir(s.key)}
                 accessibilityRole="tab" accessibilityLabel={s.label}
                 accessibilityState={{ selected: act }}
                 style={{
                   flexGrow: 1, flexBasis: width < 360 ? '45%' : '30%', minHeight: 44, paddingVertical: 9, paddingHorizontal: 8,
                   borderRadius: R.md, backgroundColor: act ? C.blue : 'transparent',
                   borderWidth: act ? 0 : 0.5, borderColor: C.border,
                   flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                 }}>
              <s.icon size={14} color={act ? C.onAccent : C.muted} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: act ? FONT.semibold : FONT.medium, color: act ? C.onAccent : C.text }}>
                {s.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

const RANGOS = [7, 30, 90] as const;

const ANALYTICS_NOTES: Record<SeccionAnalitica, string> = {
  resumen: 'Totales actuales de Franky. Las altas usan el periodo seleccionado; incidentes mantiene 24 horas. El ingreso mensual es una estimación de suscripciones, no cobros liquidados.',
  demografia: 'Perfiles actuales no descartados de toda la plataforma. Este reparto no cambia con el periodo seleccionado.',
  academico: 'Carrera actual: personas registradas en el periodo. Carreras deseadas, universidades y ciudades: perfiles actuales de toda la plataforma.',
  engagement: 'Las visitas usan el periodo seleccionado y solo incluyen medición activada. El resto mantiene las ventanas indicadas en cada tarjeta; no representa toda la navegación.',
  monetizacion: 'Estimación actual según suscripciones y precios de catálogo. Las altas y bajas usan 30 días. El periodo seleccionado no modifica estas cifras; no equivalen a cobros liquidados.',
  contenido: 'Inventario actual, incluidos registros sin publicar. La vigencia se calcula hoy. El periodo seleccionado no modifica este catálogo.',
  seguridad: 'Incidentes del periodo seleccionado. Los bloqueos de recursos mantienen 24 horas y las acciones administrativas 7 días.',
  crecimiento: 'Registros y QR del periodo seleccionado. La activación posterior puede haber ocurrido fuera de ese periodo.',
};


/** Barras para una lista de pares. Acepta las claves que use cada RPC. */
function Reparto({ titulo, datos, claveEtiqueta = 'label', claveValor = 'count', max = 8 }: {
  titulo: string;
  datos: Record<string, unknown>[] | undefined;
  claveEtiqueta?: string;
  claveValor?: string;
  max?: number;
}) {
  const filas = (datos ?? [])
    .map((d) => ({ label: String(d[claveEtiqueta] ?? '—'), count: Number(d[claveValor] ?? 0) }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, max);

  if (!filas.length) {
    return (
      <View style={{ gap: 6 }}>
        <Titulo>{titulo}</Titulo>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{datos ? 'No hay registros para este análisis.' : 'Datos no disponibles.'}</Text>
      </View>
    );
  }
  const top = filas[0].count || 1;
  return (
    <View style={{ gap: 10 }}>
      <Titulo>{titulo}</Titulo>
      {filas.map((f, i) => (
        <View key={`${f.label}-${i}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 13, color: C.text }}>{f.label}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text, fontVariant: ['tabular-nums'] }}>{n(f.count)}</Text>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: C.borderLight, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(4, (f.count / top) * 100)}%`, height: '100%', backgroundColor: C.blue, borderRadius: 2 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Gráfica de barras verticales de la serie diaria de altas.
 *
 * Sin librería de gráficos a propósito: son Views escaladas. La web usa
 * recharts (unos 100 KB), que en la app habría que arrastrar en el bundle para
 * pintar una sola serie.
 */
function GraficaAltas({ datos }: { datos: PuntoAltas[] | null }) {
  if (!datos?.length) {
    return (
      <View style={{ gap: 6 }}>
        <Titulo>Altas por día</Titulo>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{datos ? 'Sin altas en este periodo.' : 'La serie de altas no está disponible.'}</Text>
      </View>
    );
  }
  const max = Math.max(...datos.map((d) => d.count), 0);
  const total = datos.reduce((a, d) => a + d.count, 0);
  const acumulado = datos[datos.length - 1]?.cumulative ?? 0;
  // Con 90 días no caben 90 barras legibles: se muestran las últimas 30.
  const visibles = datos.slice(-30);

  return (
    <View style={{ gap: 10 }}>
      <Titulo>Altas por día</Titulo>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 2 }}>
        {visibles.map((d, i) => (
          <View key={`${d.date}-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View style={{
              width: '100%',
              height: `${d.count > 0 ? Math.max(2, (d.count / Math.max(max, 1)) * 100) : 0}%`,
              backgroundColor: d.count === max ? C.green : C.blue,
              borderTopLeftRadius: 2, borderTopRightRadius: 2,
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{visibles[0]?.date?.slice(5) ?? ''}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>máx {n(max)}/día</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{visibles[visibles.length - 1]?.date?.slice(5) ?? ''}</Text>
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
        {n(total)} altas en el periodo · {n(acumulado)} acumuladas{datos.length > 30 ? ' · Gráfica: últimos 30 días del periodo' : ''}
      </Text>
    </View>
  );
}

export default function AdminScreen() {
  const owner = useSessionOwner();
  if (!owner) return <View style={{ flex: 1, backgroundColor: C.bg }}><Header title="Panel" back /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>Inicia sesión para consultar tu acceso al panel.</Text></View>;
  return <OwnedAdminScreen key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedAdminScreen({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const isCurrent = useOwnerGuard(owner);
  const bootRevision = useRef(0);
  const loadRevision = useRef(0);
  const mfaBusy = useRef(false);
  useEffect(() => () => { bootRevision.current++; loadRevision.current++; }, []);

  const [booting, setBooting] = useState(true);
  // Fallo al arrancar (getStaffRole/getAal sin red): antes el spinner inicial
  // se quedaba para siempre porque nada ponía booting a false.
  const [bootError, setBootError] = useState(false);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [mfaError, setMfaError] = useState('');
  // Alta de un TOTP nuevo en curso (QR + secreto). null = no se está dando de alta.
  const [alta, setAlta] = useState<FactorNuevo | null>(null);

  // Un admin entra por la GESTIÓN (usuarios, reportes): es a lo que se abre el
  // panel desde el móvil. Un analista entra por la analítica, que es lo suyo.
  const [seccion, setSeccion] = useState<Seccion>('gestion');
  const [rango, setRango] = useState<number>(30);
  /** Sube al tirar para refrescar en gestión: remonta la sección y recarga. */
  const [recargaGestion, setRecargaGestion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Error por sección: una RPC caída ya no deja el panel entero en blanco. */
  const [fallos, setFallos] = useState<Partial<Record<Seccion, string>>>({});
  // El spinner de carga inicial NO puede depender de que kpis exista: si esa
  // RPC concreta falla, el panel se quedaba girando para siempre.
  const [loadedRange, setLoadedRange] = useState<number | null>(null);

  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [eng, setEng] = useState<Engagement | null>(null);
  const [demo, setDemo] = useState<Demografia | null>(null);
  const [cont, setCont] = useState<Contenido | null>(null);
  const [crec, setCrec] = useState<Crecimiento | null>(null);
  const [seg, setSeg] = useState<Seguridad | null>(null);
  const [mon, setMon] = useState<Monetizacion | null>(null);
  const [unis, setUnis] = useState<TopUni[]>([]);
  const [ciudades, setCiudades] = useState<{ city: string; user_count: number }[]>([]);
  const [carreras, setCarreras] = useState<Carrera[]>([]);
  const [altas, setAltas] = useState<PuntoAltas[] | null>(null);
  const [product, setProduct] = useState<ProductAnalytics | null>(null);
  const [productError, setProductError] = useState<string>();

  const boot = useCallback(async () => {
    if (!isCurrent()) return;
    const revision = ++bootRevision.current;
    const current = () => isCurrent() && revision === bootRevision.current;
    setBooting(true);
    setBootError(false);
    try {
      const r = await getStaffRole();
      if (!current()) return;
      setRole(r);
      if (r === 'analyst') setSeccion('resumen');
      if (r) {
        const aal = await getAal();
        if (!current()) return;
        setNeedsMfa(aal !== 'aal2');
        if (aal !== 'aal2') {
          const f = await listVerifiedFactors();
          if (!current()) return;
          setFactorId(f[0]?.id ?? null);
          setNeedsMfa(true);
        }
      }
    } catch {
      if (current()) setBootError(true);
    } finally {
      if (current()) setBooting(false);
    }
  }, [isCurrent]);
  useEffect(() => { void boot(); }, [boot]);

  const requestMfa = useCallback(async () => {
    if (!isCurrent()) return;
    setNeedsMfa(true); setBooting(true); setBootError(false);
    try {
      const factors = await listVerifiedFactors();
      if (isCurrent()) setFactorId(factors[0]?.id ?? null);
    } catch {
      if (isCurrent()) setBootError(true);
    } finally {
      if (isCurrent()) setBooting(false);
    }
  }, [isCurrent]);

  const cargar = useCallback(async (dias: number) => {
    if (!isCurrent()) return;
    const revision = ++loadRevision.current;
    const current = () => isCurrent() && revision === loadRevision.current;
    setLoading(true);
    setError('');
    try {
      // Se piden todas de golpe: son agregados baratos y así cambiar de
      // sección es instantáneo en vez de recargar cada vez.
      //
      // allSettled, NO all: con Promise.all bastaba que fallase UNA de las once
      // RPC para que no se asignase ninguna y las ocho secciones se quedasen
      // vacías. Ahora cada métrica que llega se pinta, y la que falla enseña su
      // propio aviso.
      const r = await Promise.allSettled([
        getKpis(dias), getEngagement(dias), getDemografia(), getContenido(),
        getCrecimiento(dias), getSeguridad(dias), getMonetizacion(),
        getTopUniversidades(15), getTopCiudades(15), getTopCarreras(15), getAltasDiarias(dias),
        getProductAnalytics(dias),
      ]);
      if (!current()) return;

      // La falta de segundo factor no es un problema de una métrica concreta:
      // es la sesión entera, así que se manda a verificar y no se pinta nada.
      if (r.some((x) => x.status === 'rejected' && x.reason instanceof MfaRequiredError)) {
        rangoCargado.current = null;
        setLoadedRange(null);
        await requestMfa();
        return;
      }

      const val = <T,>(x: PromiseSettledResult<T>): T | null =>
        x.status === 'fulfilled' ? x.value : null;
      const err = (x: PromiseSettledResult<unknown>): string | undefined =>
        x.status === 'rejected'
          ? (x.reason instanceof Error ? x.reason.message : 'Error desconocido.')
          : undefined;

      setKpis(val(r[0])); setEng(val(r[1])); setDemo(val(r[2])); setCont(val(r[3]));
      setCrec(val(r[4])); setSeg(val(r[5])); setMon(val(r[6]));
      setUnis(val(r[7]) ?? []); setCiudades(val(r[8]) ?? []);
      setCarreras(val(r[9]) ?? []); setAltas(val(r[10]));
      setProduct(val(r[11])); setProductError(err(r[11]));

      setFallos({
        resumen: err(r[0]) ?? err(r[10]),
        demografia: err(r[2]),
        academico: err(r[7]) ?? err(r[9]) ?? err(r[8]),
        engagement: err(r[1]),
        monetizacion: err(r[6]),
        contenido: err(r[3]),
        seguridad: err(r[5]),
        crecimiento: err(r[4]) ?? err(r[10]),
      });

      // El aviso global se reserva para cuando NO llega absolutamente nada
      // (sesión caída, sin red): con un fallo suelto ya avisa su sección.
      const fallidas = r.filter((x) => x.status === 'rejected').length;
      setError(fallidas === r.length ? 'No se pudo cargar el panel. Comprueba tu conexión.' : '');
    } catch (err) {
      if (!current()) return;
      if (err instanceof MfaRequiredError) { rangoCargado.current = null; setLoadedRange(null); await requestMfa(); return; }
      setError(err instanceof Error ? err.message : 'No se pudo cargar el panel.');
    } finally {
      if (current()) { setLoading(false); setLoadedRange(dias); }
    }
  }, [isCurrent, requestMfa]);

  // Las once RPC de analítica se piden la PRIMERA vez que se mira analítica (y
  // otra vez si se cambia el rango), no al entrar en el panel: abrir el móvil
  // para despachar un reporte no tiene por qué costar once agregados. El ref
  // evita además que cambiar de pestaña dentro de la analítica lo recargue
  // todo: eso ya era instantáneo y tiene que seguir siéndolo.
  const rangoCargado = useRef<number | null>(null);
  useEffect(() => {
    if (booting || !role || needsMfa) return;
    if (esGestion(seccion)) return;
    if (rangoCargado.current === rango) return;
    rangoCargado.current = rango;
    void cargar(rango);
  }, [booting, role, needsMfa, rango, seccion, cargar]);

  const enviarCodigo = async () => {
    if (!isCurrent() || mfaBusy.current || !factorId || code.length !== 6) return;
    mfaBusy.current = true;
    setVerifying(true); setMfaError('');
    try {
      await elevateWithTotp(factorId, code, isCurrent);
      if (!isCurrent()) return;
      setCode(''); setNeedsMfa(false);
    } catch {
      if (isCurrent()) setMfaError('Código incorrecto o caducado. Mira la app y prueba con el actual.');
    } finally { mfaBusy.current = false; if (isCurrent()) setVerifying(false); }
  };

  // ── Alta del segundo factor desde el propio móvil ─────────────────────────
  const empezarAlta = async () => {
    if (!isCurrent() || mfaBusy.current) return;
    mfaBusy.current = true; setVerifying(true);
    setMfaError('');
    try {
      const factor = await empezarAltaTotp('Franky móvil', isCurrent);
      if (isCurrent()) setAlta(factor);
    } catch (e) {
      if (isCurrent()) setMfaError(e instanceof Error ? e.message : 'No se pudo empezar el alta.');
    } finally { mfaBusy.current = false; if (isCurrent()) setVerifying(false); }
  };

  const confirmarAlta = async () => {
    if (!isCurrent() || mfaBusy.current || !alta || code.length !== 6) return;
    mfaBusy.current = true;
    setVerifying(true); setMfaError('');
    try {
      await confirmarAltaTotp(alta.factorId, code, isCurrent);
      if (!isCurrent()) return;
      // Al verificar, la sesión YA queda en aal2: se entra directo al panel.
      setCode(''); setAlta(null); setFactorId(alta.factorId); setNeedsMfa(false);
    } catch {
      if (isCurrent()) setMfaError('Ese código no vale. Espera al siguiente y vuelve a probar.');
    } finally { mfaBusy.current = false; if (isCurrent()) setVerifying(false); }
  };

  const cancelarAlta = async () => {
    if (!isCurrent() || mfaBusy.current || !alta) return;
    const f = alta;
    setAlta(null); setCode(''); setMfaError('');
    await cancelarAltaTotp(f.factorId, isCurrent);
  };

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Panel" back />
        <View style={{ paddingTop: S.lg }}>
          <SkeletonList count={5} height={72} radius={R.md} />
        </View>
      </View>
    );
  }

  if (bootError) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Panel" back />
        <EmptyState icon={ShieldAlert} title="No se pudo cargar"
          subtitle="No pudimos comprobar tu acceso al panel. Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={() => { void boot(); }} />
      </View>
    );
  }

  if (!role) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Panel" back />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.xl, gap: 12 }}>
          <Lock size={40} color={C.muted} strokeWidth={1.5} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', color: C.muted }]}>
            Esta sección no está disponible para tu cuenta.
          </Text>
          <Btn label="Volver" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (needsMfa) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Verificación" back />
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: S.lg }}>
            <ShieldCheck size={40} color={C.blue} strokeWidth={1.7} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { textAlign: 'center' }]}>
              {alta ? 'Activa tu segundo factor' : factorId ? 'Introduce tu código' : 'Te falta el segundo factor'}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', maxWidth: 300 }]}>
              {alta
                ? 'Escanea el código con Google Authenticator, Authy o el llavero del iPhone, y escribe el número de 6 cifras que te dé.'
                : factorId
                  ? 'El panel maneja datos de toda la comunidad, así que pide el segundo factor cada vez que inicias sesión. Abre tu app de autenticación.'
                  : 'El panel maneja datos de toda la comunidad y exige un segundo factor. Puedes darlo de alta aquí mismo, sin pasar por el ordenador.'}
            </Text>
          </View>

          {/* ── Alta del factor (QR + secreto) ── */}
          {alta ? (
            <>
              {/* Blanco y negro fijos: un QR solo se lee con contraste maximo,
                  asi que no sigue el tema (en oscuro seria ilegible). */}
              <View style={{ alignItems: 'center', backgroundColor: '#fff', borderRadius: R.lg, padding: S.lg }}>
                {/* Fondo blanco fijo: un QR sobre fondo oscuro no lo lee ningún lector. */}
                <QRCode value={alta.uri} size={200} backgroundColor="#fff" color="#000" />
              </View>
              <View style={{ gap: 6 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                  ¿No puedes escanear? Escribe esta clave a mano en tu app:
                </Text>
                <Tap onPress={() => { Clipboard.setString(alta.secret); Alert.alert('Clave copiada'); }}
                  accessibilityLabel="Copiar la clave">
                  <View style={{ backgroundColor: C.input, borderRadius: R.md, padding: 12 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} selectable style={{ textAlign: 'center', fontSize: 14, letterSpacing: 1.5, color: C.text }}>
                      {alta.secret}
                    </Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 4 }]}>Tocar para copiar</Text>
                  </View>
                </Tap>
              </View>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad" textContentType="oneTimeCode"
                autoComplete="one-time-code" placeholder="123456"
                placeholderTextColor={C.muted} maxLength={6}
                style={{
                  backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingVertical: 16,
                  fontSize: 28, fontFamily: FONT.heading, letterSpacing: 9, textAlign: 'center', color: C.text,
                }}
              />
              {mfaError ? <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.errorText, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
              <Btn label={verifying ? 'Comprobando…' : 'Activar'} onPress={confirmarAlta}
                   busy={verifying} disabled={verifying || code.length !== 6} full />
              <Btn variant="link" label="Cancelar" onPress={cancelarAlta} disabled={verifying} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                Guarda la clave en un sitio seguro: si pierdes el móvil es la única
                forma de volver a entrar sin tocar la base de datos.
              </Text>
            </>
          ) : factorId ? (
            <>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad" textContentType="oneTimeCode"
                autoComplete="one-time-code" placeholder="123456"
                placeholderTextColor={C.muted} maxLength={6}
                style={{
                  backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingVertical: 16,
                  fontSize: 28, fontFamily: FONT.heading, letterSpacing: 9, textAlign: 'center', color: C.text,
                }}
              />
              {mfaError ? <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.errorText, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
              <Btn label={verifying ? 'Verificando…' : 'Entrar'} onPress={enviarCodigo}
                   busy={verifying} disabled={verifying || code.length !== 6} full />
            </>
          ) : (
            <>
              {mfaError ? <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.errorText, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
              <Btn full label="Activar segundo factor aquí" onPress={empezarAlta} busy={verifying} disabled={verifying} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                Necesitas una app de autenticación instalada (Google Authenticator,
                Authy, 1Password o el propio llavero del iPhone).
              </Text>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  const f = eng?.engagement_funnel;

  return (
    <Screen
      title={role === 'admin' ? 'Panel admin' : 'Panel analista'}
      back
      refreshing={loading}
      onRefresh={() => {
        // En gestión cada sección tiene su propia carga: se remonta con la key.
        if (esGestion(seccion)) setRecargaGestion((k) => k + 1);
        else cargar(rango);
      }}
    >
      <View style={{ padding: S.lg, gap: 18 }}>
        {/* Las dos mitades del panel, cada una con su rejilla. Agrupadas como
            en la web: se ve de un vistazo qué es moderar y qué es mirar. */}
        <View style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border }}>
          {([{ management: true, label: 'Gestionar', icon: Boxes }, { management: false, label: 'Analizar', icon: Activity }] as const).map(item => {
            const selected = item.management === esGestion(seccion);
            return <Tap key={item.label} accessibilityLabel={item.label} accessibilityState={{ selected }}
              onPress={() => { if (!selected) setSeccion(item.management ? 'gestion' : 'resumen'); }}
              style={{ flex: 1, minHeight: 44, borderRadius: R.md, backgroundColor: selected ? C.blue : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <item.icon size={17} color={selected ? C.onAccent : C.muted} strokeWidth={1.9} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: selected ? C.onAccent : C.muted, fontFamily: selected ? FONT.semibold : FONT.medium }}>{item.label}</Text>
            </Tap>;
          })}
        </View>
        <Pestanas titulo={esGestion(seccion) ? 'Gestión de la comunidad' : 'Análisis de Franky'} entradas={esGestion(seccion) ? GESTION : SECCIONES} activa={seccion} onElegir={setSeccion} />

        {esGestion(seccion) ? (
          <AdminGestion key={`${seccion}-${recargaGestion}`} seccion={seccion} esAdmin={role === 'admin'} onMfaRequired={requestMfa} />
        ) : (
        <>
        {/* Rango temporal */}
        <View style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: C.border, borderRadius: 999, padding: 3 }}>
          {RANGOS.map((d) => {
            const act = d === rango;
            return (
              <Tap key={d} onPress={() => { if (d !== rango) { loadRevision.current++; setError(''); setRango(d); } }} accessibilityLabel={`Últimos ${d} días`} accessibilityState={{ selected: act }}
                   style={{ flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderRadius: 999, backgroundColor: act ? C.blue : 'transparent' }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ textAlign: 'center', fontSize: 13, fontFamily: act ? FONT.semibold : FONT.medium, color: act ? C.onAccent : C.muted }}>
                  {d} días
                </Text>
              </Tap>
            );
          })}
        </View>

        <Btn variant="link" label={loading ? 'Actualizando indicadores…' : 'Actualizar indicadores'} onPress={() => cargar(rango)} busy={loading} disabled={loading} />

        <View style={{ borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: S.md, gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontFamily: FONT.semibold, fontSize: 13 }}>Qué representan estos datos</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{ANALYTICS_NOTES[seccion]}</Text>
        </View>

        {error ? (
          <View style={{ borderWidth: 0.5, borderColor: C.error, borderRadius: R.lg, padding: S.md, gap: 10 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.errorText, fontSize: 13 }}>{error}</Text>
            <Btn label="Reintentar" onPress={() => cargar(rango)} />
          </View>
        ) : null}

        {loadedRange !== rango ? (
          <SkeletonList count={4} height={86} radius={R.lg} style={{ marginHorizontal: 0 }} />
        ) : (
          <>
            {/* ── Resumen: mismas tarjetas que OverviewTab de la web ── */}
            {seccion === 'resumen' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.resumen} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={Users} label="Usuarios totales" tint={C.blue} value={n(kpis?.total_users)} />
                  <Kpi icon={Euro} label="MRR estimado" tint={C.green} value={eur(kpis?.mrr_estimate)} />
                  <Kpi icon={Heart} label="Premium activos" value={n(kpis?.total_premium)} />
                  <Kpi icon={GraduationCap} label="Estudiantes verificados" value={n(kpis?.verified_students)} />
                  <Kpi icon={Users} label="Propietarios" value={n(kpis?.total_propietarios)} />
                  <Kpi icon={Flag} label="Reportes pendientes" tint={C.red} value={n(kpis?.pending_reports)} />
                  <Kpi icon={ShieldAlert} label="Incidentes 24h" tint={C.red} value={n(kpis?.security_incidents_24h)} />
                  <Kpi icon={TrendingUp} label={`Registros (${rango} d)`} tint={C.green} value={n(kpis?.new_signups_period)} />
                </View>
                <GraficaAltas datos={altas} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                  Hoy: {n(kpis?.new_signups_today)} altas · periodo anterior: {n(kpis?.new_signups_prev_period)}
                </Text>
              </View>
            )}

            {/* ── Demografía: mismas tarjetas y repartos que DemographicsTab ── */}
            {seccion === 'demografia' && (
              <View style={{ gap: 18 }}>
                <Aviso texto={fallos.demografia} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={Users} label="Buscan piso" tint={C.blue} value={n(demo?.by_intent?.looking_housing)} />
                  <Kpi icon={Users} label="Buscan roomie" value={n(demo?.by_intent?.looking_roommate)} />
                  <Kpi icon={Users} label="Propietarios" value={n(demo?.by_intent?.is_propietario)} />
                  <Kpi icon={GraduationCap} label="Email univ. verificado" value={n(demo?.by_intent?.student_verified)} />
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{n(demo?.total)} perfiles en total</Text>
                <Reparto titulo="Por género" datos={demo?.by_gender as unknown as Record<string, unknown>[]} max={4} />
                <Reparto titulo="Por edad" datos={demo?.by_age_bucket as unknown as Record<string, unknown>[]} max={6} />
                <Reparto titulo="Por comunidad autónoma" datos={demo?.by_comunidad as unknown as Record<string, unknown>[]} max={19} />
                <Reparto titulo="Por tipo de estudiante" datos={demo?.by_student_type as unknown as Record<string, unknown>[]} />
                <Reparto titulo="Por curso" datos={demo?.by_year as unknown as Record<string, unknown>[]} claveEtiqueta="year" max={6} />
              </View>
            )}

            {/* ── Académico: las tres listas de AcademicTab ── */}
            {seccion === 'academico' && (
              <View style={{ gap: 18 }}>
                <Aviso texto={fallos.academico} />
                <Aviso texto={productError} />
                <Reparto titulo="Qué estudian las personas registradas" datos={product?.current_careers} claveEtiqueta="name" claveValor="user_count" max={50} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Carrera actual declarada en el perfil, por fecha de registro. No incluye recomendaciones del test ni carreras deseadas.</Text>
                {carreras.length > 0 ? (
                  <View style={{ gap: 10 }}>
                    <Titulo>Carreras deseadas</Titulo>
                    {carreras.map((c, i) => (
                      <View key={`${c.career_id}-${i}`} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
                      }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ width: 22, fontSize: 13, color: C.muted }}>{i + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 14, color: C.text }}>{c.name}</Text>
                          {c.branch ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{c.branch}</Text> : null}
                        </View>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, fontFamily: FONT.semibold, color: C.text, fontVariant: ['tabular-nums'] }}>{n(c.desired_count)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 6 }}>
                    <Titulo>Carreras deseadas</Titulo>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Sin datos todavía.</Text>
                  </View>
                )}

                {unis.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Titulo>Top universidades</Titulo>
                    {unis.map((u, i) => (
                      <View key={`${u.name}-${i}`} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
                      }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ width: 22, fontSize: 13, color: C.muted }}>{i + 1}</Text>
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 14, color: C.text }}>{u.name}</Text>
                          {u.city ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{u.city}</Text> : null}
                        </View>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, fontFamily: FONT.semibold, color: C.text, fontVariant: ['tabular-nums'] }}>{n(u.user_count)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <Reparto titulo="Top ciudades" datos={ciudades as unknown as Record<string, unknown>[]}
                         claveEtiqueta="city" claveValor="user_count" max={15} />
              </View>
            )}

            {/* ── Engagement: mismas tarjetas que EngagementTab ── */}
            {seccion === 'engagement' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.engagement} />
                <Aviso texto={productError} />
                <Reparto titulo="Qué pantallas se utilizan" datos={product?.screens.map(row => ({ label: `${row.screen.replaceAll('_', ' ')} · ${row.platform}`, count: row.views }))} max={30} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{n(product?.coverage?.users)} personas medidas · {n(product?.coverage?.views)} visitas. Solo navegación con medición activada; una pantalla sin datos no demuestra falta de uso.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={Activity} label="Con actividad hoy" tint={C.blue} value={n(eng?.dau)} />
                  <Kpi icon={Activity} label="Con actividad en 7 días" value={n(eng?.wau)} />
                  <Kpi icon={Activity} label="Con actividad en 30 días" value={n(eng?.mau)} />
                  <Kpi icon={TrendingUp} label="Actividad hoy / 30 días" value={pct(eng?.dau_mau_ratio)} />
                  <Kpi icon={MessageCircle} label="Mensajes 7d" value={n(eng?.messages_sent_7d)} />
                  <Kpi icon={GraduationCap} label="Tests vocacionales 30d" value={n(eng?.vocational_tests_completed_30d)} />
                  <Kpi icon={Users} label="Matches Roomie actuales" value={n(eng?.roommate_connections_current)} pie="Parejas con interés mutuo, sin duplicar" />
                  <Kpi icon={CalendarDays} label="Inscripciones a eventos 30d" value={n(eng?.events_joined_30d)} />
                </View>
                <Reparto
                  titulo="Hitos de uso acumulados"
                  datos={f ? [
                    { label: 'Se registran', count: f.signup },
                    { label: 'Verifican email', count: f.verified_email },
                    { label: 'Hacen el test', count: f.completed_vocational },
                    { label: 'Con match actual', count: f.first_match },
                    { label: 'Primer mensaje', count: f.first_message },
                  ] : []}
                />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Personas por hito, sin orden obligatorio ni una cohorte común. No permite calcular abandono entre pasos. La actividad general mide mensajes, Roomie y test vocacional.</Text>
              </View>
            )}

            {/* ── Monetización: mismas tarjetas que MonetizationTab ── */}
            {seccion === 'monetizacion' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.monetizacion} />
                {/* Un MRR al que le falta un plan entero no se enseña callando. */}
                <Aviso tono="info" texto={mon?.incompleto} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={Euro} label="MRR estimado" tint={C.green} value={eur(mon?.mrr_normalized)} />
                  <Kpi icon={Euro} label="ARR estimado" tint={C.green} value={eur(mon?.arr_estimate)} />
                  <Kpi icon={Users} label="Suscripciones activas" value={n(mon?.active_subscriptions?.total_paying)} />
                  <Kpi icon={Euro} label="Media mensual por suscripción" value={eur(mon?.avg_revenue_per_paying_user)} />
                  <Kpi icon={TrendingUp} label="Altas de suscripción 30d" tint={C.green} value={n(mon?.new_subscriptions_30d)} pie="Incluye pruebas gratuitas" />
                  <Kpi icon={TrendingUp} label="Canceladas actualizadas en 30d" tint={C.red} value={n(mon?.churn_30d)} />
                  <Kpi icon={Heart} label="Pro (mes+año)"
                       value={n(sumKnown(mon?.active_subscriptions?.pro_monthly, mon?.active_subscriptions?.pro_yearly))} />
                  <Kpi icon={Boxes} label="Business"
                       value={n(sumKnown(mon?.active_subscriptions?.business_leisure, mon?.active_subscriptions?.business_housing))} />
                  {/* El Plan Inmobiliarias es HOY la única fuente de ingresos
                      recurrentes reales, así que tiene tarjeta propia. */}
                  <Kpi icon={Boxes} label="Plan Inmobiliarias" tint={C.green}
                       value={n(sumKnown(mon?.active_subscriptions?.owner_plan_monthly, mon?.active_subscriptions?.owner_plan_quarterly))}
                       pie={`Mensual y trimestral · en prueba: ${n(mon?.owner_plan_trialing)}`} />
                </View>
                <Reparto
                  titulo="Suscripciones por plan"
                  datos={mon ? [
                    { label: 'Pro mensual', count: mon.active_subscriptions.pro_monthly },
                    { label: 'Pro anual', count: mon.active_subscriptions.pro_yearly },
                    { label: 'Premium mensual', count: mon.active_subscriptions.premium_monthly },
                    { label: 'Premium anual', count: mon.active_subscriptions.premium_yearly },
                    { label: 'Ocio', count: mon.active_subscriptions.business_leisure },
                    { label: 'Alojamiento', count: mon.active_subscriptions.business_housing },
                    { label: 'Inmobiliarias (mensual)', count: mon.active_subscriptions.owner_plan_monthly ?? 0 },
                    { label: 'Inmobiliarias (trimestral)', count: mon.active_subscriptions.owner_plan_quarterly ?? 0 },
                  ] : []}
                  max={8}
                />
              </View>
            )}

            {/* ── Contenido: mismas tarjetas que ContentTab ── */}
            {seccion === 'contenido' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.contenido} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={GraduationCap} label="Universidades" value={n(cont?.universities)} />
                  <Kpi icon={Boxes} label="Carreras" value={n(cont?.careers)} />
                  <Kpi icon={Boxes} label="Becas activas" value={n(cont?.scholarships?.active)} />
                  <Kpi icon={Boxes} label="Alojamientos" value={n(cont?.accommodations?.total)} />
                  <Kpi icon={Boxes} label="Zonas de ocio" value={n(cont?.leisure_spots?.total)} />
                  <Kpi icon={CalendarDays} label="Eventos próximos" tint={C.green} value={n(cont?.events?.upcoming)} />
                  <Kpi icon={Boxes} label="Noticias" value={n(cont?.news)} />
                  <Kpi icon={Boxes} label="Inventario total" tint={C.blue}
                       value={n(sumKnown(cont?.universities, cont?.careers, cont?.scholarships?.total,
                                cont?.accommodations?.total, cont?.leisure_spots?.total,
                                cont?.news, cont?.events?.upcoming, cont?.events?.past))} />
                </View>
                <Reparto titulo="Alojamientos por tipo"
                         datos={cont?.accommodations?.by_type as unknown as Record<string, unknown>[]} />
                <Reparto titulo="Ocio por tipo"
                         datos={cont?.leisure_spots?.by_type as unknown as Record<string, unknown>[]} />
              </View>
            )}

            {/* ── Seguridad: mismas tarjetas que SecurityTab ── */}
            {seccion === 'seguridad' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.seguridad} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={ShieldAlert} label="CSP violations 24h" tint={C.red} value={n(seg?.csp_violations_24h)} />
                  <Kpi icon={ShieldAlert} label="IPs únicas atacantes" tint={C.red} value={n(seg?.unique_attacker_ips)} />
                  <Kpi icon={ShieldCheck} label="Acciones admin 7d" value={n(seg?.admin_actions_7d)} />
                </View>
                <Reparto titulo="Incidentes por tipo" datos={seg?.incidents_by_kind as unknown as Record<string, unknown>[]}
                         claveEtiqueta="kind" />
                <Reparto titulo="Incidentes por gravedad" datos={seg?.incidents_by_severity as unknown as Record<string, unknown>[]}
                         claveEtiqueta="severity" />
                <Reparto titulo="Recursos más bloqueados por CSP" datos={seg?.csp_top_blocked as unknown as Record<string, unknown>[]}
                         claveEtiqueta="blocked_uri" max={6} />
              </View>
            )}

            {/* ── Crecimiento: mismas tarjetas que GrowthTab ── */}
            {seccion === 'crecimiento' && (
              <View style={{ gap: 16 }}>
                <Aviso texto={fallos.crecimiento} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Kpi icon={TrendingUp} label="Nuevos usuarios" tint={C.green} value={n(crec?.signups_period)} />
                  <Kpi icon={Activity} label="Activados" value={n(crec?.active_after_signup)} />
                  <Kpi icon={TrendingUp} label="Conversión" value={pct(crec?.conversion_pct)} />
                  <Kpi icon={Users} label="Escaneos de QR" value={n(crec?.qr_scans_period)} />
                </View>
                <GraficaAltas datos={altas} />
                <Reparto titulo="Por fuente (UTM)" datos={crec?.by_utm_source as unknown as Record<string, unknown>[]}
                         claveEtiqueta="source" max={12} />
                <Reparto titulo="Por campaña (UTM)" datos={crec?.by_utm_campaign as unknown as Record<string, unknown>[]}
                         claveEtiqueta="campaign" max={12} />
              </View>
            )}

            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', paddingTop: 8 }]}>
              {role === 'analyst'
                ? 'Vista de analista: solo lectura.'
                : 'La edición del catálogo (carreras, becas, noticias) sigue en el panel web.'}
            </Text>
          </>
        )}
        </>
        )}
      </View>
    </Screen>
  );
}
