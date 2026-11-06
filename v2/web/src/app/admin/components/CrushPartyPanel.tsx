"use client";
import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, Heart, Monitor, Pause, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { ALICANTE_PARTY_SLUG, partyPath } from '@/lib/crush-party-route';
import type { CrushParty } from '@/app/crush/fiesta/model';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAdminAction, useAdminData } from './useAdminManagement';
import { Panel, PanelHead, PanelContent, SectionTitle, Notice, Quiet } from './panel-ui';

type ModerationPost = { id: string; body: string; display_name: string | null; is_anonymous: boolean; created_at: string; hidden: boolean; deleted: boolean };
type PartyControl = { party: CrushParty; posts: ModerationPost[] };
const slug = ALICANTE_PARTY_SLUG;
const entryUrl = `https://franky.es${partyPath(slug)}`;
const screenUrl = `${entryUrl}/pantalla`;

export default function CrushPartyPanel() {
  const confirm = useConfirm();
  const { act, saving, error: actionError, isCurrent } = useAdminAction();
  const [notice, setNotice] = useState('');
  const { data, loading, error, reload } = useAdminData<PartyControl>(async request => {
    const result = await request.query(createClient().rpc('admin_get_crush_party', { p_slug: slug }));
    if (result.error || !result.data?.party || !Array.isArray(result.data?.posts)) throw new Error('No se ha podido comprobar el estado de la fiesta. Reintenta antes de cambiar las pantallas.');
    return result.data as PartyControl;
  }, slug);
  async function control(kind: 'pause' | 'active', value: boolean) {
    if (kind === 'active' && !value && !await confirm({ title: '¿Cerrar el acceso a la fiesta?', description: 'Se detendrá el registro y el envío de mensajes de esta fiesta. Podrás volver a abrirlo antes de que termine.', confirmText: 'Cerrar acceso' })) return;
    if (!isCurrent()) return;
    await act(async request => {
      const { data: updated, error } = await request.query(createClient().rpc('admin_set_crush_party', { p_slug: slug, p_active: kind === 'active' ? value : null, p_screen_paused: kind === 'pause' ? value : null }));
      const field = kind === 'active' ? 'active' : 'screen_paused';
      if (error || updated?.slug !== slug || updated[field] !== value) throw new Error('No se ha confirmado el cambio. Actualiza el estado antes de repetirlo.');
    }, async () => { setNotice('Cambio guardado. Las pantallas lo recogerán en su próxima actualización.'); await reload(); });
  }
  async function hide(post: ModerationPost) {
    if (!await confirm({ title: '¿Retirar este mensaje de las pantallas?', description: 'También quedará oculto en el muro de Crush. Esta acción quedará registrada en la auditoría.', confirmText: 'Ocultar mensaje' }) || !isCurrent()) return;
    await act(async request => {
      const result = await request.query(createClient().rpc('admin_hide_crush_party_post', { p_slug: slug, p_post_id: post.id }));
      if (result.error || result.data?.id !== post.id || result.data.hidden !== true) throw new Error('No se ha confirmado la retirada. Actualiza antes de repetirla.');
    }, async () => { setNotice('Mensaje ocultado en Crush y en la próxima actualización de las pantallas.'); await reload(); });
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); if (isCurrent()) setNotice('Enlace copiado.'); }
    catch { if (isCurrent()) setNotice('No se pudo copiar automáticamente. Selecciona el enlace que aparece en la tarjeta.'); }
  }
  return <div className="space-y-6">
    <SectionTitle
      eyebrow="Franky Event · Alicante"
      title={<span className="inline-flex items-center gap-2"><Heart className="h-5 w-5 text-violet" strokeWidth={1.75} /> La fiesta, en directo.</span>}
      description="Un QR para entrar con Google y escribir en el Crush de la Universidad de Alicante. Desde aquí puedes preparar OBS, pausar las pantallas y revisar los mensajes compartidos para la fiesta."
    />
    {notice && <Notice tone="success" role="status">{notice}</Notice>}
    {actionError && <Notice tone="error" role="alert">{actionError}</Notice>}
    <Panel>
      <PanelHead>
        <SectionTitle
          as="h3"
          title={<span className="inline-flex items-center gap-2"><Monitor className="h-5 w-5 text-violet" strokeWidth={1.75} /> Control de las pantallas</span>}
          aside={<Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading || saving}><RefreshCw className="mr-2 h-4 w-4" strokeWidth={1.75} /> Actualizar</Button>}
        />
      </PanelHead>
      <PanelContent>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : loading ? <Quiet role="status">Comprobando la fiesta…</Quiet> : data && <>
        <div className="mb-4 flex flex-wrap gap-2"><Badge variant={data.party.active ? 'success' : 'outline'}>{data.party.active ? 'Acceso activado' : 'Acceso cerrado'}</Badge><Badge variant="outline">{data.party.screen_paused ? 'Pantallas en pausa' : 'Pantallas activas'}</Badge></div>
        <p className="mb-4 text-sm leading-relaxed text-text-secondary">Apertura para pruebas: 6 de septiembre. Fiesta: viernes 11, hora provisional 00:00 de la noche del viernes al sábado. Cierre automático: sábado 12 a las 08:00, hora de Alicante.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={saving || !data.party.active} onClick={() => void control('pause', !data.party.screen_paused)}>{data.party.screen_paused ? <Play className="mr-2 h-4 w-4" strokeWidth={1.75} /> : <Pause className="mr-2 h-4 w-4" strokeWidth={1.75} />}{data.party.screen_paused ? 'Reanudar pantallas' : 'Pausar pantallas'}</Button><Button variant="outline" disabled={saving} onClick={() => void control('active', !data.party.active)}>{data.party.active ? 'Cerrar acceso a la fiesta' : 'Abrir acceso a la fiesta'}</Button></div><p className="mt-3 text-xs leading-relaxed text-text-muted">Pausar las pantallas permite seguir escribiendo. Cerrar el acceso detiene el registro y las publicaciones de la fiesta. Los mensajes ya publicados permanecen en Crush hasta que se retiren.</p>
      </>}
      </PanelContent>
    </Panel>
    <section className="grid gap-4 md:grid-cols-2">{[
      { label:'Entrada del QR', url:entryUrl, detail:'El enlace que abrirán los móviles.' },
      { label:'OBS · Composición completa', url:screenUrl, detail:'QR a la izquierda y mensajes a la derecha. 1920 × 1080.' },
      { label:'OBS · Solo QR', url:`${screenUrl}?modo=qr`, detail:'Para colocarlo a un lado de tu propia escena. 720 × 1080.' },
      { label:'OBS · Solo mensajes', url:`${screenUrl}?modo=muro`, detail:'Muro independiente para el otro lado. 1280 × 1080.' },
    ].map((item, i) => <Panel key={item.label} style={{ '--i': i } as CSSProperties} className="animate-list-in min-w-0 p-5"><h3 className="font-heading font-bold text-text-primary">{item.label}</h3><p className="my-2 text-xs leading-relaxed text-text-muted">{item.detail}</p><a href={item.url} target="_blank" rel="noopener noreferrer" className="link-underline block break-all text-sm text-violet">{item.url}</a><div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => void copy(item.url)}><Copy className="mr-2 h-4 w-4" strokeWidth={1.75} /> Copiar</Button><Button variant="ghost" size="sm" asChild><a href={item.url} target="_blank" rel="noopener noreferrer">Abrir <ExternalLink className="ml-2 h-4 w-4" strokeWidth={1.75} /></a></Button></div></Panel>)}</section>
    <Panel className="p-5"><h3 className="mb-2 font-heading font-bold text-text-primary">Ensayo de las pantallas</h3><p className="text-sm leading-relaxed text-text-secondary">En OBS añade una fuente «Navegador», pega el enlace de la composición y usa 1920 × 1080. Puedes ensayar con mensajes ficticios, sin iniciar sesión ni publicar nada.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" asChild><a href={`${screenUrl}?demo=1`} target="_blank" rel="noopener noreferrer">Abrir ensayo <ExternalLink className="ml-2 h-4 w-4" strokeWidth={1.75} /></a></Button><Button variant="outline" size="sm" asChild><a href={`/api/crush/fiesta/${slug}/qr`} target="_blank" rel="noopener noreferrer">Descargar QR</a></Button></div></Panel>
    <Panel>
      <PanelHead>
        <SectionTitle
          as="h3"
          title={<span className="inline-flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet" strokeWidth={1.75} /> Mensajes para revisar</span>}
          description="Últimos 100 mensajes de esta fiesta, incluidos los ocultos y retirados. Actualiza para recibir los más recientes. Cada retirada requiere confirmación."
          aside={<Button variant="ghost" size="sm" asChild><Link href="/admin/crush">Moderación de Crush</Link></Button>}
        />
      </PanelHead>
      <PanelContent>
        {!loading && !error && data?.posts.length === 0 && <Quiet>Todavía no hay mensajes de esta fiesta.</Quiet>}
        <div className="space-y-3">{data?.posts.map((post, i) => <article key={post.id} style={{ '--i': i } as CSSProperties} className="animate-list-in rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-text-muted"><span>{post.is_anonymous ? 'Mensaje anónimo' : post.display_name || 'Participante'}</span><span>{post.deleted ? 'Retirado por su autor' : post.hidden ? 'Oculto por moderación' : 'Disponible para las pantallas'}</span></div><p className="my-3 whitespace-pre-line break-words text-sm leading-relaxed text-text-primary [overflow-wrap:anywhere]">{post.body}</p>{!post.hidden && !post.deleted && <Button variant="outline" size="sm" disabled={saving} onClick={() => void hide(post)}><Trash2 className="mr-2 h-4 w-4" strokeWidth={1.75} /> Ocultar mensaje</Button>}</article>)}</div>
      </PanelContent>
    </Panel>
  </div>;
}
