// ─── La mitad de GESTIÓN del panel, en la app ────────────────────────────
//
// Hasta ahora la pantalla /admin de la app enseñaba solo analítica: las mismas
// ocho secciones que ve un analista. El panel de verdad (usuarios, reportes,
// auditoría, sugerencias, papelera) existía únicamente en el ordenador, así que
// desde el móvil no se podía moderar nada: solo mirar gráficas.
//
// Cada sección hace LAS MISMAS consultas que su panel equivalente de la web
// (web/src/app/admin/dashboard.tsx). Las acciones que escriben pasan por los
// mismos sitios: log_admin_action deja rastro en auditoría, y el cambio de rol
// va por la API de la web, que lo re-valida en servidor.
//
// Cada sección carga cuando se abre, no todas de golpe: son listas, no
// agregados baratos, y el panel se abre casi siempre para mirar UNA cosa.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type DependencyList } from 'react';
import { View, Text, ActivityIndicator, TextInput, Alert } from 'react-native';
import {
  Users, AlertTriangle, FileText, Trash2, Home, Building2, BookOpen, Trophy,
  Newspaper, CalendarDays, Eye, GraduationCap, ShieldAlert,
} from 'lucide-react-native';
import { Btn, Chip, Pill, SearchBar } from '@/components/ui';
import { C, S, F, R, FONT } from '@/theme';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { restorationHint } from '@/lib/admin-operation-result';
import { Kpi, Titulo, Aviso, n, fecha, fechaHora, SIN_DATO } from '@/components/admin-ui';
import {
  getResumenGestion, listUsuarios, ponerStrike, alternarDescartado, cambiarRol,
  listReportes, resolverReporte, strikeDesdeReporte, listAuditoria,
  listSugerenciasOcio, aprobarSugerenciaOcio, rechazarSugerenciaOcio,
  listPapelera, restaurarDePapelera,
  MfaRequiredError,
  type ResumenGestion, type UsuarioAdmin, type FiltroUsuarios,
  type ReporteAdmin, type EstadoReporte, type AccionAuditoria,
  type SugerenciaOcio, type ElementoPapelera,
} from '@/lib/admin';
import { MAX_FONT_SCALE } from '@/lib/a11y';

export type SeccionGestion =
  | 'gestion' | 'usuarios' | 'reportes' | 'auditoria' | 'sugerencias' | 'papelera';

const AdminOwner = createContext<SessionIdentity | null>(null);
const RequireMfa = createContext<(() => void) | undefined>(undefined);
function useManagementData<T>(loader: (owner: SessionIdentity) => Promise<T>, deps: DependencyList = [], delay = 0) {
  const owner = useContext(AdminOwner)!;
  const isCurrent = useOwnerGuard(owner);
  const requireMfa = useContext(RequireMfa);
  const revision = useRef(0);
  const queryKey = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; value: T | null; loading: boolean; error: string }>({ key: queryKey, value: null, loading: true, error: '' });
  const cargar = useCallback(async () => {
    if (!isCurrent()) return;
    const request = ++revision.current;
    const current = () => isCurrent() && request === revision.current;
    setState({ key: queryKey, value: null, loading: true, error: '' });
    try {
      const value = await loader(owner);
      if (current()) setState({ key: queryKey, value, loading: false, error: '' });
    } catch (error) {
      if (current() && error instanceof MfaRequiredError) requireMfa?.();
      if (current()) setState({ key: queryKey, value: null, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar. Vuelve a intentarlo.' });
    }
  }, [owner, isCurrent, queryKey, requireMfa]);
  useEffect(() => {
    const timer = setTimeout(() => { void cargar(); }, delay);
    return () => { clearTimeout(timer); revision.current++; };
  }, [cargar, delay]);
  return { datos: state.key === queryKey ? state.value : null, cargando: state.key !== queryKey || state.loading, error: state.key === queryKey ? state.error : '', cargar };
}

function useManagementAction() {
  const owner = useContext(AdminOwner)!;
  const isCurrent = useOwnerGuard(owner);
  const requireMfa = useContext(RequireMfa);
  const busy = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const hacer = async (action: (owner: SessionIdentity) => Promise<void>, refresh: () => Promise<void>) => {
    if (!isCurrent() || busy.current) return;
    busy.current = true; setGuardando(true);
    try { await action(owner); if (isCurrent()) await refresh(); }
    catch (error) {
      if (isCurrent()) {
        if (error instanceof MfaRequiredError && requireMfa) requireMfa();
        else Alert.alert('No se pudo', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
      }
    }
    finally { busy.current = false; if (isCurrent()) setGuardando(false); }
  };
  return { hacer, guardando };
}

/** Envoltorio común: carga, error y vacío, para no repetirlo seis veces. */
function Lista<T>({ cargando, error, datos, vacio, children, onRetry }: {
  cargando: boolean; error: string; datos: T[]; vacio: string;
  children: (filas: T[]) => React.ReactNode;
  onRetry?: () => void;
}) {
  if (cargando) {
    return (
      <View style={{ paddingVertical: S.xl, alignItems: 'center' }}>
        <ActivityIndicator color={C.muted} />
      </View>
    );
  }
  if (error) return <View style={{ gap: 10 }}><Aviso texto={error} />{onRetry ? <Btn label="Reintentar" variant="ghost" onPress={onRetry} /> : null}</View>;
  if (!datos.length) {
    return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', paddingVertical: S.xl }]}>{vacio}</Text>;
  }
  return <>{children(datos)}</>;
}

/** Ficha con hairline, la unidad visual de todas las listas de esta pantalla. */
function Ficha({ children, resaltada }: { children: React.ReactNode; resaltada?: boolean }) {
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: R.lg, padding: S.md, gap: 8,
      borderWidth: resaltada ? 1 : 0.5, borderColor: resaltada ? C.error : C.border,
    }}>
      {children}
    </View>
  );
}

/**
 * Lo que la base de datos reserva a un admin y punto. A un analista no se le
 * enseña la caja vacía: una lista vacía dice "no hay nada" y aquí lo cierto es
 * "no puedes verlo". Es la misma regla que el resto de la pantalla (un dato que
 * no llega se pinta como raya, nunca como cero), aplicada a listas.
 */
function SoloAdmin({ que }: { que: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: S.xl }}>
      <ShieldAlert size={30} color={C.muted} strokeWidth={1.6} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', maxWidth: 280 }]}>
        {que} solo lo puede ver un administrador.
      </Text>
    </View>
  );
}

/** Solo lectura: el analista ve el panel entero, pero no toca nada. */
function SoloLectura() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Eye size={13} color={C.muted} strokeWidth={2} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Tu cuenta ve el panel, pero no puede modificar nada.</Text>
    </View>
  );
}

// ─── Resumen de gestión ──────────────────────────────────────────────────
// Los mismos doce contadores que la web pinta al entrar en /admin. Un
// contador que no llega sale como raya: aquí es donde más se nota la
// diferencia entre "no hay nadie" y "no me lo han contado".
function ResumenVista({ esAdmin }: { esAdmin: boolean }) {
  const { datos, cargando, error, cargar } = useManagementData<ResumenGestion>(getResumenGestion);

  if (cargando) {
    return (
      <View style={{ paddingVertical: S.xl, alignItems: 'center' }}>
        <ActivityIndicator color={C.muted} />
      </View>
    );
  }

  const falla = datos ? Object.values(datos).some((v) => v === null) : true;

  return (
    <View style={{ gap: 16 }}>
      {error ? <View style={{ gap: 10 }}><Aviso texto={error} /><Btn label="Reintentar" onPress={cargar} /></View> : null}
      {falla ? (
        <Aviso
          tono="info"
          texto="Alguna cifra sale como raya: no ha llegado de la base de datos. Es un dato que falta, no un cero."
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Kpi icon={Users} label="Usuarios" value={n(datos?.usuarios)} tint={C.blue} />
        <Kpi icon={AlertTriangle} label="Reportes pendientes" tint={C.red}
             value={n(datos?.reportesPendientes)} />
        <Kpi icon={Home} label="Buscan piso" value={n(datos?.buscanPiso)} />
        <Kpi icon={Users} label="Buscan roomie" value={n(datos?.buscanRoomie)} />
        <Kpi icon={Building2} label="Propietarios" value={n(datos?.propietarios)} />
        {/* La papelera la filtra la RLS por admin: a un analista le daría 0
            siempre, y un 0 falso es justo lo que no puede pasar aquí. */}
        {esAdmin ? <Kpi icon={Trash2} label="Cuentas descartadas" value={n(datos?.papelera)} /> : null}
        <Kpi icon={CalendarDays} label="Eventos" value={n(datos?.eventos)} />
        <Kpi icon={Home} label="Alojamientos" value={n(datos?.alojamientos)} />
        <Kpi icon={BookOpen} label="Carreras" value={n(datos?.carreras)} />
        <Kpi icon={GraduationCap} label="Universidades" value={n(datos?.universidades)} />
        <Kpi icon={Trophy} label="Becas" value={n(datos?.becas)} />
        <Kpi icon={Newspaper} label="Noticias" value={n(datos?.noticias)} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
        El catálogo (carreras, universidades, becas, noticias) se edita en la web:
        aquí se ve el inventario y se modera la comunidad.
      </Text>
    </View>
  );
}

// ─── Usuarios ────────────────────────────────────────────────────────────
const FILTROS: { key: FiltroUsuarios; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'piso', label: 'Buscan piso' },
  { key: 'roomie', label: 'Buscan roomie' },
  { key: 'propietarios', label: 'Propietarios' },
  { key: 'analistas', label: 'Analistas' },
  { key: 'eliminados', label: 'Eliminados' },
];

function UsuariosVista({ esAdmin }: { esAdmin: boolean }) {
  const [filtro, setFiltro] = useState<FiltroUsuarios>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const { datos: rows, cargando, error, cargar } = useManagementData(owner => listUsuarios(filtro, busqueda, pagina, owner), [filtro, busqueda, pagina], 250);
  const datos = rows ?? [];
  // Strike en curso: hace falta el motivo, no se pone a ciegas.
  const [strikeA, setStrikeA] = useState<UsuarioAdmin | null>(null);
  const [motivo, setMotivo] = useState('');
  const { hacer, guardando } = useManagementAction();

  const confirmarStrike = async () => {
    if (!strikeA || !motivo.trim()) return;
    await hacer(async owner => {
      await ponerStrike(strikeA.id, motivo, owner);
      setStrikeA(null); setMotivo('');
    }, cargar);
  };

  const alternar = (u: UsuarioAdmin) => {
    const eliminado = !!u.is_discarded;
    Alert.alert(
      eliminado ? '¿Restaurar la cuenta?' : '¿Eliminar la cuenta?',
      eliminado
        ? `${u.full_name ?? u.email ?? 'Esta persona'} volverá a poder usar Franky.`
        : `${u.full_name ?? u.email ?? 'Esta persona'} deja de aparecer y no puede usar la app. Se puede deshacer desde la papelera.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: eliminado ? 'Restaurar' : 'Eliminar',
          style: eliminado ? 'default' : 'destructive',
          onPress: async () => {
            await hacer(owner => alternarDescartado(u.id, eliminado, owner), cargar);
          },
        },
      ],
    );
  };

  const rol = (u: UsuarioAdmin) => {
    const esAnalista = u.role === 'analyst';
    Alert.alert(
      esAnalista ? '¿Quitar el rol de analista?' : '¿Hacer analista?',
      esAnalista
        ? 'Volverá a ser un usuario normal, sin acceso al panel.'
        : 'Podrá ver todo el panel (usuarios, analítica, moderación) pero no podrá crear, editar ni borrar nada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: esAnalista ? 'Quitar' : 'Hacer analista',
          onPress: async () => {
            await hacer(owner => cambiarRol(u.id, esAnalista ? 'user' : 'analyst', owner), cargar);
          },
        },
      ],
    );
  };

  return (
    <View style={{ gap: 12 }}>
      {!esAdmin ? <SoloLectura /> : null}
      <SearchBar value={busqueda} placeholder="Nombre o correo…"
                 onChange={(v) => { setBusqueda(v); setPagina(0); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {FILTROS.map((f) => (
          <Chip key={f.key} label={f.label} active={filtro === f.key} accessibilityRole="tab"
                onPress={() => { setFiltro(f.key); setPagina(0); }} />
        ))}
      </View>

      <Lista cargando={cargando} error={error} datos={datos} onRetry={cargar}
             vacio={busqueda ? 'Nadie coincide con esa búsqueda.' : 'No hay usuarios en este filtro.'}>
        {(filas) => (
          <View style={{ gap: 10 }}>
            {filas.map((u) => (
              <Ficha key={u.id} resaltada={(u.strikes_count ?? 0) > 0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontFamily: FONT.semibold, color: C.text }}>
                    {u.full_name ?? 'Sin nombre'}
                  </Text>
                  {u.role && u.role !== 'user' ? <Pill label={u.role} tone="blue" /> : null}
                  {u.is_discarded ? <Pill label="Eliminado" tone="red" /> : null}
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{u.email ?? SIN_DATO}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                  {`Alta ${fecha(u.created_at)}`}
                  {u.city ? ` · ${u.city}` : ''}
                  {(u.strikes_count ?? 0) > 0 ? ` · ${u.strikes_count} strike(s)` : ''}
                  {u.looking_for_housing ? ' · busca piso' : ''}
                  {u.looking_for_roommate ? ' · busca roomie' : ''}
                </Text>
                {esAdmin ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Btn small variant="ghost" label="Strike" disabled={guardando}
                         onPress={() => { setStrikeA(u); setMotivo(''); }} />
                    <Btn small variant={u.is_discarded ? 'secondary' : 'danger'} disabled={guardando}
                         label={u.is_discarded ? 'Restaurar' : 'Eliminar'}
                         onPress={() => alternar(u)} />
                    {u.role === 'user' || u.role === 'analyst' ? (
                      <Btn small variant="ghost" disabled={guardando}
                           label={u.role === 'analyst' ? 'Quitar analista' : 'Hacer analista'}
                           onPress={() => rol(u)} />
                    ) : null}
                  </View>
                ) : null}
              </Ficha>
            ))}
          </View>
        )}
      </Lista>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Btn small variant="ghost" label="Anteriores" disabled={pagina === 0 || cargando || guardando}
             onPress={() => setPagina((p) => Math.max(0, p - 1))} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{`Página ${pagina + 1}`}</Text>
        <Btn small variant="ghost" label="Siguientes" disabled={datos.length < 20 || cargando || guardando}
             onPress={() => setPagina((p) => p + 1)} />
      </View>

      {/* Motivo del strike: sin motivo no se emite, igual que en la web. */}
      {strikeA ? (
        <View style={{ borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: S.md, gap: 10 }}>
          <Titulo>{`Strike a ${strikeA.full_name ?? strikeA.email ?? 'esta cuenta'}`}</Titulo>
          <TextInput
            value={motivo} onChangeText={setMotivo} multiline maxLength={2000}
            placeholder="Motivo (queda registrado en la auditoría)"
            placeholderTextColor={C.muted}
            style={{ backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, padding: 12, minHeight: 70, color: C.text, fontSize: 14 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small label={guardando ? 'Guardando…' : 'Emitir strike'} busy={guardando}
                 disabled={guardando || !motivo.trim()} onPress={confirmarStrike} />
            <Btn small variant="link" label="Cancelar" onPress={() => { setStrikeA(null); setMotivo(''); }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Reportes ────────────────────────────────────────────────────────────
const ESTADOS: { key: EstadoReporte; label: string }[] = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'reviewed', label: 'Revisados' },
  { key: 'dismissed', label: 'Descartados' },
  { key: 'all', label: 'Todos' },
];

const CONTEXTOS: Record<string, string> = {
  profile: 'Perfil', chat: 'Chat', comment: 'Comentario',
  accommodation: 'Alojamiento', other: 'Otro',
};

const MOTIVOS: Record<string, string> = {
  comportamiento_inapropiado: 'Comportamiento inapropiado',
  spam: 'Spam',
  acoso: 'Acoso',
  contenido_ofensivo: 'Contenido ofensivo',
  suplantacion: 'Suplantación',
  otro: 'Otro',
};

function ReportesVista({ esAdmin }: { esAdmin: boolean }) {
  const [estado, setEstado] = useState<EstadoReporte>('pending');
  const { datos, cargando, error, cargar } = useManagementData(owner => listReportes(estado, owner), [estado]);
  const { hacer, guardando } = useManagementAction();

  return (
    <View style={{ gap: 12 }}>
      {!esAdmin ? <SoloLectura /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ESTADOS.map((e) => (
          <Chip key={e.key} label={e.label} active={estado === e.key} accessibilityRole="tab"
                onPress={() => setEstado(e.key)} />
        ))}
      </View>

      <Lista cargando={cargando} error={error} datos={datos ?? []} onRetry={cargar}
             vacio={estado === 'pending' ? 'No hay reportes pendientes. Buena señal.' : 'No hay reportes aquí.'}>
        {(filas) => (
          <View style={{ gap: 10 }}>
            {filas.map((r) => (
              <Ficha key={r.id} resaltada={r.status === 'pending'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Pill label={CONTEXTOS[r.context] ?? r.context} tone="gray" />
                  <Pill
                    label={r.status === 'pending' ? 'Pendiente' : r.status === 'reviewed' ? 'Revisado' : 'Descartado'}
                    tone={r.status === 'pending' ? 'red' : 'green'} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginLeft: 'auto' }]}>{fechaHora(r.created_at)}</Text>
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, color: C.text }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold }}>{r.reporter?.full_name ?? 'Alguien'}</Text>
                  {' reportó a '}
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold }}>{r.reported?.full_name ?? 'un usuario'}</Text>
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{MOTIVOS[r.reason] ?? r.reason}</Text>
                {r.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.text }}>{r.description}</Text> : null}
                {r.admin_notes ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{`Nota: ${r.admin_notes}`}</Text> : null}
                {esAdmin && r.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Btn small variant="danger" label="Strike" disabled={guardando}
                         onPress={() => hacer(owner => strikeDesdeReporte(r.id, owner), cargar)} />
                    <Btn small label="Revisado" disabled={guardando}
                         onPress={() => hacer(owner => resolverReporte(r.id, 'reviewed', undefined, owner), cargar)} />
                    <Btn small variant="ghost" label="Descartar" disabled={guardando}
                         onPress={() => hacer(owner => resolverReporte(r.id, 'dismissed', undefined, owner), cargar)} />
                  </View>
                ) : null}
              </Ficha>
            ))}
          </View>
        )}
      </Lista>
    </View>
  );
}

// ─── Auditoría ───────────────────────────────────────────────────────────
const ACCIONES: Record<string, string> = {
  issue_strike: 'Strike emitido',
  discard_user: 'Usuario descartado',
  restore_user: 'Usuario restaurado',
  report_reviewed: 'Reporte revisado',
  report_dismissed: 'Reporte descartado',
  create_propietario: 'Propietario creado',
  create_analyst: 'Analista creado',
  grant_analyst: 'Rol analista concedido',
  revoke_analyst: 'Rol analista retirado',
  hard_delete_user: 'Borrado permanente',
  // Filas del trigger automático _log_admin_change (042)
  insert: 'Creación',
  update: 'Edición',
  delete: 'Borrado',
};

function AuditoriaVista() {
  const { datos, cargando, error, cargar } = useManagementData(owner => listAuditoria(50, owner));

  return (
    <Lista cargando={cargando} error={error} datos={datos ?? []} onRetry={cargar}
           vacio="No hay nada registrado todavía.">
      {(filas) => (
        <View style={{ gap: 8 }}>
          {filas.map((l) => (
            <View key={l.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: S.md, borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
            }}>
              <FileText size={15} color={C.muted} strokeWidth={1.75} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, color: C.text }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold }}>{l.actor_email ?? 'Admin'}</Text>
                  {` · ${ACCIONES[l.action] ?? l.action}`}
                  {l.target_table ? ` · ${l.target_table}` : ''}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{fechaHora(l.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Lista>
  );
}

// ─── Sugerencias de zonas de ocio ────────────────────────────────────────
function SugerenciasVista({ esAdmin }: { esAdmin: boolean }) {
  const { datos, cargando, error, cargar } = useManagementData(listSugerenciasOcio);
  const { hacer, guardando } = useManagementAction();

  return (
    <View style={{ gap: 12 }}>
      {!esAdmin ? <SoloLectura /> : null}
      <Lista cargando={cargando} error={error} datos={datos ?? []} onRetry={cargar}
             vacio="Nadie ha propuesto ningún sitio todavía.">
        {(filas) => (
          <View style={{ gap: 10 }}>
            {filas.map((s) => (
              <Ficha key={s.id} resaltada={s.status === 'pending'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontFamily: FONT.semibold, color: C.text }}>
                    {s.name}
                  </Text>
                  <Pill
                    label={s.status === 'approved' ? 'Aprobada' : s.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                    tone={s.status === 'approved' ? 'green' : s.status === 'rejected' ? 'gray' : 'red'} />
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{`${s.category} · ${s.city}${s.address ? ` · ${s.address}` : ''}`}</Text>
                {s.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.text }}>{s.description}</Text> : null}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{fecha(s.created_at)}</Text>
                {esAdmin && s.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn small label="Aprobar" disabled={guardando} onPress={() => hacer(owner => aprobarSugerenciaOcio(s.id, owner), cargar)} />
                    <Btn small variant="ghost" label="Rechazar" disabled={guardando}
                         onPress={() => hacer(owner => rechazarSugerenciaOcio(s.id, owner), cargar)} />
                  </View>
                ) : null}
              </Ficha>
            ))}
          </View>
        )}
      </Lista>
    </View>
  );
}

// ─── Papelera ────────────────────────────────────────────────────────────
// Solo admin: la RLS de discarded_records es is_admin() (015), así que a un
// analista le saldría siempre vacía. Enseñarle una caja vacía sería contarle
// que no hay nada, y no es verdad: es que no puede verlo.
function PapeleraVista() {
  const { datos, cargando, error, cargar } = useManagementData(listPapelera);
  const { hacer, guardando } = useManagementAction();

  const restaurar = (item: ElementoPapelera) => {
    Alert.alert('¿Restaurar?', item.tipo === 'registro'
      ? `Se recuperará la ficha de ${item.etiqueta}. Esto no recupera relaciones u otros contenidos eliminados junto a ella.`
      : `${item.etiqueta} volverá a estar activo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        onPress: async () => {
          await hacer(owner => restaurarDePapelera(item, owner), cargar);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: 12 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
        Recupera fichas del catálogo y cuentas descartadas. Las cuentas eliminadas
        por su titular y los registros que necesitan revisar pagos o publicaciones tienen otro proceso de recuperación.
      </Text>
      <Lista cargando={cargando} error={error} datos={datos ?? []} onRetry={cargar} vacio="La papelera está vacía.">
        {(filas) => (
          <View style={{ gap: 10 }}>
            {filas.map((item) => (
              <Ficha key={`${item.tipo}-${item.id}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 14.5, fontFamily: FONT.semibold, color: C.text }}>
                    {item.etiqueta}
                  </Text>
                  <Pill label={item.insignia} tone="gray" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>{`Borrado ${fecha(item.fecha)}`}</Text>
                  {item.tipo === 'usuario' && item.bruto.self_deleted === true
                    ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Eliminada por su titular</Text>
                    : item.tipo === 'registro' && restorationHint(item.bruto.original_table, item.bruto.data)
                    ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>{restorationHint(item.bruto.original_table, item.bruto.data)}</Text>
                    : <Btn small variant="ghost" label="Restaurar" disabled={guardando} onPress={() => restaurar(item)} />}
                </View>
              </Ficha>
            ))}
          </View>
        )}
      </Lista>
    </View>
  );
}

/** Punto de entrada: la pantalla decide la sección y esto la pinta. */
export function AdminGestion({ seccion, esAdmin, onMfaRequired }: {
  seccion: SeccionGestion; esAdmin: boolean; onMfaRequired?: () => void;
}) {
  const owner = useSessionOwner();
  if (!owner) return null;
  return <AdminOwner.Provider value={owner}><RequireMfa.Provider value={onMfaRequired}><OwnedAdminGestion key={`${owner.userId}:${owner.generation}:${seccion}`} seccion={seccion} esAdmin={esAdmin} /></RequireMfa.Provider></AdminOwner.Provider>;
}

function OwnedAdminGestion({ seccion, esAdmin }: { seccion: SeccionGestion; esAdmin: boolean }) {
  if (seccion === 'usuarios') return <UsuariosVista esAdmin={esAdmin} />;
  if (seccion === 'reportes') return <ReportesVista esAdmin={esAdmin} />;
  if (seccion === 'auditoria') return <AuditoriaVista />;
  // Sugerencias y papelera: la RLS (015) las reserva a is_admin(), así que a un
  // analista le saldrían vacías siempre. Mejor decirlo que mentir con un cero.
  if (seccion === 'sugerencias') {
    return esAdmin ? <SugerenciasVista esAdmin /> : <SoloAdmin que="Las sugerencias de ocio" />;
  }
  if (seccion === 'papelera') {
    return esAdmin ? <PapeleraVista /> : <SoloAdmin que="La papelera" />;
  }
  return <ResumenVista esAdmin={esAdmin} />;
}
