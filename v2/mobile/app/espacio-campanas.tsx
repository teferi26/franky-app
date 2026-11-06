import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Redirect, useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Chip, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { hasWorkspacePermission } from '@/lib/workspaces';
import { cityContentError } from '@/lib/city-content';
import { newTapKey } from '@/lib/tap';
import { C, F } from '@/theme';
import { CAMPAIGN_STATUS, campaignCents, campaignAttempt, type CampaignAttempt, type CampaignSnapshot } from '../../shared/city-content';

const euro = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;
const fieldStyle = { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, color: C.text };
export default function CampaignPage() {
  const { active, ready, revision } = useWorkspace();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  if (!['community', 'leisure'].includes(active.kind) || !hasWorkspacePermission(active, 'finance.read')) return <Screen title="Campañas" back><Text style={F.small}>Tu rol no tiene acceso a campañas.</Text></Screen>;
  return <Campaigns key={`${active.id}:${revision}`} />;
}
function Campaigns() {
  const { active, run, isCurrent } = useWorkspace();
  const [data, setData] = useState<CampaignSnapshot | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [title, setTitle] = useState(''), [budget, setBudget] = useState('50,00'), [postId, setPostId] = useState('');
  const [starts, setStarts] = useState(() => new Date(Date.now() + 86400000)), [ends, setEnds] = useState(() => new Date(Date.now() + 8 * 86400000));
  const [picker, setPicker] = useState<{ field: 'start' | 'end'; mode: 'date' | 'time' } | null>(null);
  const lock = useRef(false), attempt = useRef<CampaignAttempt | null>(null);
  const load = useCallback(async () => {
    if (!active) return; setLoading(true); setError('');
    try { const result = await run<CampaignSnapshot>('get_workspace_campaigns'); if (isCurrent(active.id)) setData(result); }
    catch (err) { if (isCurrent(active.id)) setError(cityContentError(err)); }
    finally { if (isCurrent(active.id)) setLoading(false); }
  }, [active?.id, run, isCurrent]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!active) return null;
  const canManage = hasWorkspacePermission(active, 'finance.manage');
  const request = async () => {
    if (lock.current) return;
    const post = data?.posts.find(p => p.id === postId), cents = campaignCents(budget);
    if (!post || !title.trim() || cents === null || ends <= starts || ends.getTime() - starts.getTime() > 90 * 86400000 || ends.getTime() <= Date.now()) { setError('Elige una publicación, un nombre y un presupuesto válido. La campaña debe durar entre un minuto y 90 días.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const payload = { p_resource_id: post.id, p_title: title.trim(), p_city: post.city, p_starts_at: starts.toISOString(), p_ends_at: ends.toISOString(), p_budget_cents: cents, p_minimum_age: post.minimum_age ?? 0 };
      attempt.current = campaignAttempt(attempt.current, payload, await newTapKey());
      await run('request_workspace_campaign', { ...payload, p_request_key: attempt.current.key });
      if (isCurrent(active.id)) { attempt.current = null; setNotice('Solicitud registrada. No se ha realizado ningún cobro.'); setTitle(''); await load(); }
    } catch (err) { if (isCurrent(active.id)) setError(cityContentError(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const pause = async (id: string) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await run('pause_workspace_campaign', { p_campaign_id: id }); if (isCurrent(active.id)) { setNotice('Campaña pausada.'); await load(); } }
    catch (err) { if (isCurrent(active.id)) setError(cityContentError(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  return <Screen title="Promoción por ciudad" subtitle={active.name} back refreshing={loading} onRefresh={() => void load()} pad>
    <Text style={[F.small, { marginBottom: 18 }]}>Solicita la promoción de una publicación revisada. Franky confirma las condiciones y activa cada campaña contigo.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 16 }}>{error}</Text>}{!!notice && <Text accessibilityRole="alert" style={{ color: C.green, marginBottom: 16 }}>{notice}</Text>}
    {loading && !data ? <ActivityIndicator color={C.blue} /> : data && <>
      {data.demo && <Card style={{ marginBottom: 16 }}><Text style={F.small}>Demostración privada. Estas solicitudes no se activan ni generan gastos reales.</Text></Card>}
      <Card style={{ gap: 8, marginBottom: 20 }}><Text style={F.h3}>Interés en tus publicaciones</Text><Text style={F.body}>Lecturas consentidas: {data.metrics.views ?? 'Grupo protegido'}</Text><Text style={F.body}>Aperturas consentidas: {data.metrics.opens ?? 'Grupo protegido'}</Text><Text style={F.small}>{data.metrics.period}. Los grupos de menos de diez personas se ocultan. Estas acciones no calculan cobros.</Text></Card>
      {canManage && <Card style={{ gap: 14, marginBottom: 24 }}><Text style={F.h2}>Solicitar campaña</Text><Text style={F.small}>Nombre de la campaña</Text><TextInput accessibilityLabel="Nombre de la campaña" value={title} onChangeText={setTitle} maxLength={140} style={fieldStyle} /><Text style={F.small}>Publicación</Text><View style={{ gap: 8 }}>{data.posts.filter(p => data.demo || p.status === 'approved').map(post => <Chip key={post.id} label={`${post.title} · ${post.city}${post.minimum_age === 18 ? ' · +18' : ''}`} active={postId === post.id} onPress={() => setPostId(post.id)} />)}</View>{!data.posts.some(p => data.demo || p.status === 'approved') && <Text style={F.small}>Crea una publicación y envíala a revisión desde Contenido y actividades para poder promocionarla.</Text>}
        <Text style={F.small}>La ciudad y la edad mínima son las revisadas en la publicación.</Text>
        {(['start', 'end'] as const).map(which => { const date = which === 'start' ? starts : ends; return <View key={which} style={{ gap: 8 }}><Text style={F.small}>{which === 'start' ? 'Inicio' : 'Final'} · hora local de tu dispositivo</Text><Btn label={date.toLocaleDateString('es-ES')} variant="secondary" onPress={() => setPicker({ field: which, mode: 'date' })} /><Btn label={date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} variant="secondary" onPress={() => setPicker({ field: which, mode: 'time' })} /></View>; })}
        {picker && <><DateTimePicker value={picker.field === 'start' ? starts : ends} mode={picker.mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_, value) => { const currentPicker = picker; if (Platform.OS !== 'ios') setPicker(null); if (value) (currentPicker.field === 'start' ? setStarts : setEnds)(value); }} />{Platform.OS === 'ios' && <Btn label="Listo" variant="secondary" onPress={() => setPicker(null)} />}</>}
        <Text style={F.small}>Presupuesto máximo (€)</Text><TextInput accessibilityLabel="Presupuesto máximo en euros" value={budget} onChangeText={setBudget} maxLength={10} keyboardType="decimal-pad" style={fieldStyle} /><Text style={F.small}>Enviar la solicitud no realiza un pago. La activación y las condiciones económicas se confirman por separado.</Text><Btn label="Enviar solicitud" busy={busy} disabled={!postId || title.trim().length < 3} onPress={() => void request()} />
      </Card>}
      <Text style={[F.h2, { marginBottom: 16 }]}>Tus campañas</Text>{data.items.map(campaign => <Card key={campaign.id} style={{ gap: 12, marginBottom: 16 }}><Text style={F.h3}>{campaign.title}</Text><Pill label={CAMPAIGN_STATUS[campaign.status]} /><Text style={F.small}>{campaign.city} · {new Date(campaign.starts_at).toLocaleDateString('es-ES')} — {new Date(campaign.ends_at).toLocaleDateString('es-ES')}</Text><Text style={F.body}>Máximo: {euro(campaign.budget_cents)}</Text><Text style={F.body}>Gasto registrado: {euro(campaign.spent_cents)}</Text>{campaign.review_note && <Text style={F.small}>{campaign.review_note}</Text>}{canManage && ['requested', 'active'].includes(campaign.status) && <Btn label="Pausar" variant="secondary" busy={busy} onPress={() => void pause(campaign.id)} />}</Card>)}{!data.items.length && <Text style={F.small}>Todavía no has solicitado campañas.</Text>}
    </>}
  </Screen>;
}
