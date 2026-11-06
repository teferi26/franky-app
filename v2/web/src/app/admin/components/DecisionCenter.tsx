"use client";
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, RefreshCw, Activity, Building2, BellRing, GraduationCap } from 'lucide-react';
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import { Button } from '@/components/ui/button';
import {
  SectionTitle, Metric, Notice, Quiet, controlClass,
  tableWrapClass, tableClass, thClass, thRightClass, tdClass, trClass,
} from './panel-ui';

type Counts = { status: string; jobs: number; kind?: string; inbox_created?: number; oldest?: string };
type Metrics = {
 period_days: number; generated_at: string;
 audience: { registered: number; new_users: number; career_missing: number; student_verified: number; tracked_users: number; first_recorded_event: string | null };
 careers: { career: string; users: number }[];
 screens: { screen: string; platform: string; views: number; users: number }[];
 actions: { name: string; events: number; users: number }[];
 housing: { province: string; seekers: number; listings: number; median_budget: number | null; with_budget: number; up_to_400: number; from_401_to_700: number; above_700: number }[];
 alerts: { publications: Counts[]; push: Counts[]; staff: Counts[] };
 quality: { housing_without_photo: number; leisure_without_coordinates: number; recent_searches: number };
};
const screenLabels: Record<string, string> = { inicio: 'Inicio', fomo: 'FOMO', fomo_hilo: 'Conversaciones FOMO', crush: 'Crush', crush_live: 'Crush Live', roomie: 'RoomieMatch', roomie_conexiones: 'Likes y matches Roomie', universidades: 'Universidades', carreras: 'Carreras', notas_corte: 'Notas de corte', becas: 'Becas', carrera_ideal: 'Carrera ideal', alojamiento: 'Pisos', novedades: 'Novedades', ocio: 'Ocio', chats: 'Chats', perfil: 'Perfil' };
const actionLabels: Record<string, string> = { signup_completed: 'Registro completado', onboarding_completed: 'Bienvenida completada', fomo_thread_created: 'Publicación en FOMO', vocational_started: 'Test de carrera iniciado', vocational_completed: 'Test de carrera terminado', crush_live_event_opt_in: 'Participación en Crush Live', crush_live_swipe: 'Decisión en Crush Live', crush_live_match_created: 'Match Live creado', checkout_started: 'Pago iniciado', checkout_completed: 'Pago completado', career_viewed: 'Carrera consultada', scholarship_viewed: 'Beca consultada' };
const states: Record<string, string> = { pending: 'Pendiente', sending: 'En proceso', processing: 'Preparando', provider_sending: 'Esperando proveedor', accepted: 'Aceptado por proveedor', skipped: 'Silenciado o sin dispositivo', failed: 'Requiere revisión', done: 'Buzones actualizados' };
const panel = 'rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-6';
const n = (value: number) => value.toLocaleString('es-ES');

function DecisionCenter() {
  const { isCurrent } = useAccountGuard();
  const [days, setDays] = useState(30);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    fetch(`/api/admin/analytics/decisions?days=${days}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const value = await r.json(); if (!r.ok) throw new Error(value.error || 'No se pudieron cargar los datos.');
      if (!controller.signal.aborted && isCurrent()) setData(value);
    }).catch(e => { if (!controller.signal.aborted && isCurrent()) setError(e instanceof Error ? e.message : 'Error al cargar'); });
    return () => controller.abort();
  }, [days, retry, isCurrent]);
  const download = () => {
    if (!data || !isCurrent()) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `franky-indicadores-${days}d-${data.generated_at.slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-5 mb-8" aria-label="Centro de decisiones">
    <SectionTitle
      eyebrow="Centro de decisiones"
      title="Qué está pasando. Dónde actuar."
      description="Audiencia, uso de la app, demanda de pisos y estado de los avisos. Los datos de actividad incluyen a quienes han aceptado la analítica."
      aside={<>
        <select aria-label="Periodo de actividad" value={days} onChange={e => setDays(Number(e.target.value))} className={`${controlClass} w-auto`}>{[7, 30, 90].map(d => <option key={d} value={d}>{d} días</option>)}</select>
        <Button variant="ghost" size="icon" aria-label="Actualizar indicadores" onClick={() => setRetry(n => n + 1)}><RefreshCw className="h-4 w-4" strokeWidth={1.75} /></Button>
        <Button variant="outline" disabled={!data} onClick={download}><Download className="mr-2 h-4 w-4" strokeWidth={1.75} />Exportar datos</Button>
      </>}
    />
    {error ? <Notice tone="error" role="alert"><span className="mr-3">{error}</span><Button variant="outline" size="sm" onClick={() => setRetry(n => n + 1)}>Reintentar</Button></Notice> : !data ? <Quiet role="status">Cargando indicadores…</Quiet> : <>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">{([
        ['Personas registradas', data.audience.registered, `${n(data.audience.new_users)} altas en ${days} días`],
        ['Usuarios con actividad medida', data.audience.tracked_users, `Periodo de ${days} días · con consentimiento`],
        ['Búsquedas de piso guardadas', data.quality.recent_searches, 'Vigentes durante 30 días'],
        ['Perfiles sin carrera', data.audience.career_missing, 'Completar este dato mejora la segmentación'],
      ] as [string, number, string][]).map(([title, count, note], i) => <Metric key={title} index={i} label={title} value={count} caption={note} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><div className={panel}><SectionTitle as="h3" title={<span className="inline-flex items-center gap-2"><Building2 className="h-5 w-5 text-violet" strokeWidth={1.75} />Dónde buscan piso</span>} description="Situación actual: búsquedas vigentes y perfiles que indican que buscan vivienda. El presupuesto es orientativo; no presupone una reserva." /><div className={`${tableWrapClass} mt-5`}><table className={`${tableClass} min-w-[520px]`}><thead><tr><th className={thClass}>Provincia</th><th className={thRightClass}>Personas</th><th className={thRightClass}>Anuncios</th><th className={thRightClass}>Presupuesto mediano</th></tr></thead><tbody>{data.housing.map(h => <tr key={h.province} className={trClass}><th scope="row" className={`${tdClass} text-left text-sm font-medium text-text-primary`}>{h.province}</th><td className={`${tdClass} tabular text-right`}>{n(h.seekers)}</td><td className={`${tdClass} tabular text-right`}>{n(h.listings)}</td><td className={`${tdClass} tabular text-right`}>{h.median_budget == null ? 'Sin dato' : `${n(h.median_budget)} €`}<span className="block text-xs text-text-muted">{h.with_budget} con presupuesto</span></td></tr>)}</tbody></table>{!data.housing.length && <Quiet>Aún no hay demanda registrada.</Quiet>}</div><Link href="/admin/analytics" className="group mt-5 inline-flex items-center gap-1 text-sm font-semibold text-violet link-underline">Analizar vivienda y audiencia <ArrowUpRight className="arrow-nudge h-4 w-4" strokeWidth={1.75} /></Link></div>
        <div className={panel}><SectionTitle as="h3" title={<span className="inline-flex items-center gap-2"><Activity className="h-5 w-5 text-violet" strokeWidth={1.75} />Pantallas más utilizadas</span>} description={`${days} días · visitas y usuarios únicos por plataforma.`} /><div className="mt-5 space-y-4">{data.screens.slice(0, 10).map((s, i) => <div key={`${s.screen}-${s.platform}`} style={{ '--i': i } as CSSProperties} className="animate-list-in"><div className="flex justify-between gap-3 text-sm"><span className="text-text-primary">{screenLabels[s.screen] || s.screen} <span className="text-xs text-text-muted">{s.platform}</span></span><span className="tabular font-semibold text-text-primary">{n(s.views)} · {n(s.users)} usuarios</span></div><div className="mt-2 h-1.5 rounded-full bg-bg-secondary"><div className="h-full rounded-full bg-violet" style={{ width: `${Math.max(2, s.views / Math.max(1, data.screens[0]?.views ?? 1) * 100)}%` }} /></div></div>)}</div>{!data.screens.length && <Quiet>Aún no hay actividad consentida en este periodo. Eso no significa que las pantallas no se utilicen.</Quiet>}</div></div>
      <div className="grid gap-5 lg:grid-cols-3"><div className={panel}><SectionTitle as="h3" title={<span className="inline-flex items-center gap-2"><GraduationCap className="h-5 w-5 text-violet" strokeWidth={1.75} />Qué estudian</span>} description="Carrera indicada en los perfiles actuales." /><ul className="mt-5 space-y-3">{data.careers.slice(0, 10).map(c => <li key={c.career} className="flex justify-between gap-3 border-b border-border-light pb-2 text-sm last:border-0"><span className="text-text-secondary">{c.career}</span><strong className="tabular text-text-primary">{n(c.users)}</strong></li>)}</ul></div><div className={panel}><SectionTitle as="h3" title="Acciones de producto" description={`Usuarios únicos por acción durante ${days} días. Estas cifras no son un embudo de la misma cohorte.`} /><ul className="mt-5 space-y-3">{data.actions.map(a => <li key={a.name} className="flex justify-between gap-3 border-b border-border-light pb-2 text-sm last:border-0"><span className="text-text-secondary">{actionLabels[a.name] || a.name}</span><strong className="tabular text-text-primary">{n(a.users)}</strong></li>)}</ul>{!data.actions.length && <Quiet>Sin acciones medidas en este periodo.</Quiet>}</div><div className={panel}><SectionTitle as="h3" title={<span className="inline-flex items-center gap-2"><BellRing className="h-5 w-5 text-violet" strokeWidth={1.75} />Salud de los avisos</span>} />{([['Buzones de usuarios', data.alerts.publications], ['Avisos al móvil', data.alerts.push], ['Sugerencias y avisos al equipo', data.alerts.staff]] as [string, Counts[]][]).map(([title, rows]) => <div key={title} className="mt-5"><p className="eyebrow mb-2">{title}</p>{rows.length ? rows.map((r, i) => <p key={`${r.status}-${i}`} className={`mt-2 flex justify-between gap-3 text-sm ${r.status === 'failed' ? 'font-semibold text-error' : 'text-text-secondary'}`}><span>{r.kind === 'housing' ? 'Pisos · ' : r.kind === 'news' ? 'Novedades · ' : ''}{states[r.status] || r.status}</span><strong className="tabular">{n(r.jobs)}</strong></p>) : <p className="text-sm text-text-muted">Sin trabajos registrados.</p>}</div>)}<p className="mt-5 text-xs text-text-muted">Aceptado por el proveedor no acredita que haya llegado al teléfono o a la bandeja de correo.</p></div></div>
      <div className={`${panel} flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-text-secondary`}><span className="eyebrow">Datos que completar</span><span><strong className="tabular text-text-primary">{n(data.quality.housing_without_photo)}</strong> pisos publicados sin fotos</span><span><strong className="tabular text-text-primary">{n(data.quality.leisure_without_coordinates)}</strong> sitios de ocio sin ubicación en mapa</span><span><strong className="tabular text-text-primary">{n(data.audience.student_verified)}</strong> estudiantes con correo universitario verificado</span></div>
      <p className="text-xs text-text-muted">Actualizado {new Date(data.generated_at).toLocaleString('es-ES')}. Exportación agregada, sin nombres, correos ni preferencias románticas.</p>
    </>}
  </section>;
}

export default withAccountScope(DecisionCenter);
