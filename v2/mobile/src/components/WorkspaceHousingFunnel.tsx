import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Btn, Card } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { errorForWorkspace } from '@/lib/workspaces';
import type { HousingFunnel } from '../../../shared/housing-funnel';
import { C, F } from '@/theme';
export function WorkspaceHousingFunnel({ resourceId }: { resourceId: string }) {
  const { active, run, isCurrent } = useWorkspace(); const [data, setData] = useState<HousingFunnel | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!active) return; setLoading(true); setError(null); try { const result = await run<HousingFunnel>('get_workspace_housing_funnel', { p_resource_id: resourceId }); if (isCurrent(active.id)) setData(result); } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); } finally { if (isCurrent(active.id)) setLoading(false); } }, [active?.id, run, isCurrent, resourceId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Card style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Resultados del piso</Text>{loading && !data ? <ActivityIndicator color={C.blue} /> : null}{error ? <><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Actualizar resultados" variant="secondary" onPress={() => void load()} /></> : null}{data ? <><Text style={F.small}>{data.demo ? 'Datos simulados · ' : ''}{data.period} · mes cerrado</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{([['Consultas a la ficha', data.views], ['Interesados', data.contacts], ['Visitas solicitadas', data.visits_requested], ['Confirmadas', data.visits_confirmed], ['Realizadas', data.visits_completed], ['Alquileres acordados', data.won], ['No continúan', data.lost], ['Conversión', data.conversion_percent === null ? 'Sin base suficiente' : `${data.conversion_percent}%`], ['Respuesta media', data.response_minutes === null ? 'Sin respuestas medidas' : `${Math.round(data.response_minutes)} min`], ['Conversaciones sin respuesta', data.awaiting_response]] as const).map(([label, value]) => <View key={label} style={{ width: '46%', gap: 4 }}><Text style={F.small}>{label}</Text><Text style={F.h3}>{value}</Text></View>)}</View><Text style={F.small}>{data.definition}</Text></> : null}</Card>;
}
