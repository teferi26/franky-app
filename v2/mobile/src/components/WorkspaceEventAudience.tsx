import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useWorkspace } from './WorkspaceProvider';
import { Btn, Card, Chip } from './ui';
import { errorForWorkspace, type WorkspaceResource } from '@/lib/workspaces';
import { C, F } from '@/theme';

const OPTIONS = [['public', 'Abierto'], ['member', 'Miembros de una comunidad'], ['invited', 'Por invitación'], ['verified_university', 'Afiliación universitaria verificada']] as const;
export function WorkspaceEventAudience({ values, errors, disabled, onChange }: { values: Record<string, string>; errors: Record<string, string>; disabled: boolean; onChange(key: string, value: string): void }) {
  const { active, run, isCurrent } = useWorkspace();
  const [communities, setCommunities] = useState<WorkspaceResource[]>([]); const [campuses, setCampuses] = useState<{ id: string; name: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(''); const [search, setSearch] = useState('');
  const sequence = useRef(0); const audience = values.audience || 'public';
  const load = useCallback(async (next?: string) => {
    if (!active || !['member', 'verified_university'].includes(audience)) return;
    const request = ++sequence.current; setLoading(true); setError(null);
    try {
      if (audience === 'member') {
        const data = await run<{ items: WorkspaceResource[]; next_cursor: string | null }>('get_workspace_resources', { p_resource_type: 'community', p_cursor: next ?? null, p_limit: 30 });
        if (!isCurrent(active.id) || request !== sequence.current) return;
        const published = data.items.filter(item => item.status === 'published');
        setCommunities(previous => next ? [...previous, ...published.filter(item => !previous.some(existing => existing.id === item.id))] : published); setCursor(data.next_cursor);
      } else {
        const data = await run<{ items: { id: string; name: string }[]; next_cursor: string | null }>('get_workspace_event_audience_universities', { p_query: search, p_cursor: next ?? null, p_limit: 30 });
        if (isCurrent(active.id) && request === sequence.current) { setCampuses(previous => next ? [...previous, ...data.items.filter(item => !previous.some(old => old.id === item.id))] : data.items); setCursor(data.next_cursor); }
      }
    } catch (err) { if (isCurrent(active.id) && request === sequence.current) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id) && request === sequence.current) setLoading(false); }
  }, [active?.id, audience, search, run, isCurrent]);
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, [load]);
  const choose = (key: string, value: string) => { if (!disabled) onChange(key, value); };
  return <Card style={{ gap: 12, marginBottom: 18 }}>
    <Text style={F.h3}>Quién puede asistir</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{OPTIONS.map(([key, label]) => <Chip key={key} label={label} active={audience === key} onPress={() => choose('audience', key)} />)}</View>
    <Text style={F.small}>El acceso se comprueba al reservar y al entrar. Una vez haya inscripciones, estas condiciones no se podrán cambiar sin revisar la actividad.</Text>
    {audience === 'invited' ? <Text style={F.small}>Publica la actividad y añade las cuentas invitadas desde Asistentes y accesos. La invitación no reserva una plaza.</Text> : null}
    {audience === 'member' ? <><Text style={F.body}>Comunidad de este espacio</Text>{communities.map(item => <Chip key={item.id} label={item.title} active={values.community_resource_id === item.id} onPress={() => choose('community_resource_id', item.id)} />)}{!loading && !communities.length && !error ? <Text style={F.small}>Necesitas una comunidad publicada y aprobada en este espacio.</Text> : null}{values.community_resource_id && !communities.some(item => item.id === values.community_resource_id) ? <Text style={F.small}>Hay una comunidad guardada. Carga el resto para consultarla; su acceso se volverá a validar al publicar.</Text> : null}{cursor ? <Btn small variant="secondary" label="Más comunidades" disabled={disabled || loading} onPress={() => void load(cursor)} /> : null}</> : null}
    {audience === 'verified_university' ? <><Text style={F.body}>Universidad de las personas asistentes</Text><TextInput accessibilityLabel="Buscar universidad" value={query} onChangeText={setQuery} placeholder="Buscar universidad" placeholderTextColor={C.muted} editable={!disabled} maxLength={100} style={{ color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12 }} /><Btn label="Buscar" small variant="secondary" disabled={disabled || loading} onPress={() => { setSearch(query.trim()); }} />{campuses.map(item => <Chip key={item.id} label={item.name} active={values.audience_university_id === item.id} onPress={() => choose('audience_university_id', item.id)} />)}{!loading && !campuses.length && !error ? <Text style={F.small}>No hay universidades disponibles con esa búsqueda. Los espacios institucionales solo pueden usar sus campus concedidos.</Text> : null}<Text style={F.small}>Se exige una acreditación vigente revisada por Franky o un correo universitario confirmado de un dominio vinculado. Elegir una universidad en el perfil no acredita pertenencia.</Text>{cursor ? <Btn label="Más universidades" small variant="secondary" disabled={disabled || loading} onPress={() => void load(cursor)} /> : null}</> : null}
    {['audience', 'community_resource_id', 'audience_university_id'].map(key => errors[key] ? <Text key={key} accessibilityRole="alert" style={{ color: C.errorText }}>{errors[key]}</Text> : null)}
    {error ? <><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Reintentar" variant="secondary" disabled={disabled || loading} onPress={() => void load()} /></> : null}{loading ? <ActivityIndicator color={C.blue} /> : null}
  </Card>;
}
