import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Chip, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { captureSessionIdentity } from '@/lib/session';
import { errorForWorkspace, hasWorkspacePermission, workspaceStorage, type WorkspaceResource } from '@/lib/workspaces';
import { ACADEMIC_FIELDS, academicChanges, academicDraftFromResource, academicProposalPayload, newAcademicDraft, restoreAcademicDraft, validateAcademicDraft, type AcademicDraft, type AcademicTarget, type AcademicTargetType } from '@/lib/workspace-academic-form';
import { C, F } from '@/theme';

export default function AcademicEditorRoute() {
  const { active, ready, revision } = useWorkspace(); const { id } = useLocalSearchParams<{ id?: string }>();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  if (active.kind !== 'university' || !hasWorkspacePermission(active, 'content.manage')) return <Screen title="Información institucional" back><Text style={F.small}>Este editor está disponible para el equipo autorizado de tu universidad.</Text></Screen>;
  return <AcademicEditor key={`${active.id}:${revision}:${id ?? 'new'}`} resourceId={id} />;
}

function AcademicEditor({ resourceId }: { resourceId?: string }) {
  const { active, run, isCurrent, signal } = useWorkspace(); const router = useRouter(); const orgId = active!.id;
  const owner = useRef(captureSessionIdentity()).current; const alive = useRef(true); const done = useRef(false); const lock = useRef(false);
  const storageKey = `franky.workspace.academic-draft.v1:${orgId}:${resourceId ?? 'new'}`;
  const [draft, setDraft] = useState<AcademicDraft>(() => newAcademicDraft()); const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('draft'); const [reviewReason, setReviewReason] = useState('');
  const [busy, setBusy] = useState(false); const [loadFailed, setLoadFailed] = useState(false); const [retry, setRetry] = useState(0);
  const [ignoreLocal, setIgnoreLocal] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}); const [preview, setPreview] = useState(false); const [searching, setSearching] = useState(true);
  const [query, setQuery] = useState(''); const [appliedQuery, setAppliedQuery] = useState(''); const [targets, setTargets] = useState<AcademicTarget[]>([]);
  const [targetCursor, setTargetCursor] = useState<string | null>(null); const [loadingTargets, setLoadingTargets] = useState(false); const [targetError, setTargetError] = useState('');
  const targetSequence = useRef(0); const editable = ['draft', 'rejected'].includes(status);
  const current = useCallback(() => alive.current && isCurrent(orgId) && !signal.aborted, [isCurrent, orgId, signal]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++targetSequence.current; }; }, []);

  useEffect(() => {
    setReady(false); setLoadFailed(false); setError('');
    void (async () => {
      try {
        // Check server status first: a local draft cannot reopen a submitted proposal.
        let serverDraft: AcademicDraft | null = null; let canRestore = true;
        if (resourceId) {
          const resource = await run<WorkspaceResource>('get_workspace_resource', { p_resource_type: 'academic', p_resource_id: resourceId });
          if (!current()) return;
          serverDraft = academicDraftFromResource(resource); setStatus(resource.status); canRestore = ['draft', 'rejected'].includes(resource.status);
          setReviewReason(String(resource.data.review_resolution ?? resource.data.review_reason ?? resource.data.resolution ?? ''));
        }
        const stored = !ignoreLocal && canRestore ? await workspaceStorage.get(owner, storageKey) : null;
        if (!current()) return;
        if (stored) {
          const restored = restoreAcademicDraft(JSON.parse(stored));
          if (!restored || (resourceId && restored.resourceId !== resourceId)) throw new Error('invalid_local_draft');
          setDraft(restored); setSearching(!restored.target); setNotice('Hemos recuperado tu borrador en este dispositivo.');
        } else if (serverDraft) { setDraft(serverDraft); setSearching(!serverDraft.target); }
        else { setDraft(newAcademicDraft()); setSearching(true); }
      } catch (err) { if (current()) { setLoadFailed(true); setError(academicError(err)); } }
      finally { if (current()) setReady(true); }
    })();
  }, [retry, ignoreLocal]);

  useEffect(() => {
    if (!ready || loadFailed || !editable || done.current) return;
    const timer = setTimeout(() => {
      void workspaceStorage.mutate(owner, async () => { if (current() && !done.current) await workspaceStorage.set(owner, storageKey, JSON.stringify(draft)); }).catch(() => { if (current()) setNotice('No se ha guardado en este dispositivo. Guarda el borrador antes de salir.'); });
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, ready, loadFailed, editable, current]);

  const loadTargets = useCallback(async (cursor?: string) => {
    if (!ready || !current() || !editable) return; const sequence = ++targetSequence.current; setLoadingTargets(true); setTargetError('');
    try {
      const result = await run<{ items: AcademicTarget[]; next_cursor?: string | null }>('get_workspace_academic_targets', { p_target_type: draft.targetType, p_query: appliedQuery, p_cursor: cursor ?? null, p_limit: 30 });
      if (!current() || sequence !== targetSequence.current) return;
      setTargets(previous => cursor ? [...previous, ...result.items.filter(item => !previous.some(existing => existing.id === item.id))] : result.items); setTargetCursor(result.next_cursor ?? null);
    } catch (err) { if (current() && sequence === targetSequence.current) setTargetError(academicError(err)); }
    finally { if (current() && sequence === targetSequence.current) setLoadingTargets(false); }
  }, [ready, editable, current, run, draft.targetType, appliedQuery]);
  useEffect(() => { if (searching) { setTargets([]); setTargetCursor(null); void loadTargets(); } return () => { ++targetSequence.current; }; }, [loadTargets, searching]);

  const chooseTarget = (target: AcademicTarget) => {
    if (busy || !editable || !current()) return;
    const apply = () => {
      if (!current()) return;
      const values: Record<string, string> = {};
      for (const field of ACADEMIC_FIELDS[draft.targetType]) values[field.key] = target.data[field.key] == null ? '' : String(target.data[field.key]);
      setDraft(previous => ({ ...previous, target, selected: [], values })); setSearching(false); setErrors({}); setError('');
    };
    if (draft.target?.id !== target.id && draft.selected.length) Alert.alert('Cambiar la ficha de la propuesta', 'Se conservarán la fuente y la explicación. Los campos propuestos se sustituirán por los de la nueva ficha.', [{ text: 'Volver', style: 'cancel' }, { text: 'Cambiar ficha', onPress: apply }]); else apply();
  };
  const changeType = (type: AcademicTargetType) => {
    if (busy || !editable || type === draft.targetType) return;
    const apply = () => { if (!current()) return; setDraft(previous => ({ ...previous, targetType: type, target: null, selected: [], values: {} })); setQuery(''); setAppliedQuery(''); setErrors({}); setSearching(true); };
    if (draft.selected.length) Alert.alert('Cambiar el tipo de ficha', 'Se borrará la selección de campos de este borrador. La fuente y la explicación se conservarán.', [{ text: 'Volver', style: 'cancel' }, { text: 'Cambiar', onPress: apply }]); else apply();
  };
  const toggleField = (key: string) => {
    if (busy || !editable) return;
    const cutoff = ['cut_off_score', 'cut_off_year', 'cut_off_round'];
    const keys = cutoff.includes(key) ? ['cut_off_score', 'cut_off_year', ...(key === 'cut_off_round' ? ['cut_off_round'] : [])] : [key];
    setDraft(previous => ({ ...previous, selected: previous.selected.includes(key) ? previous.selected.filter(field => !(key === 'cut_off_round' ? [key] : cutoff.includes(key) ? cutoff : keys).includes(field)) : [...new Set([...previous.selected, ...keys])] })); setErrors({});
  };
  const save = async (submit: boolean) => {
    if (lock.current || !current() || !editable) return;
    const validation = validateAcademicDraft(draft, submit); setErrors(validation);
    if (Object.keys(validation).length) { setPreview(false); setError('Revisa los campos marcados antes de continuar.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await workspaceStorage.mutate(owner, () => workspaceStorage.set(owner, storageKey, JSON.stringify(draft)));
      if (!current()) return;
      const result = await run<WorkspaceResource>('save_workspace_academic_proposal', academicProposalPayload(draft, submit));
      if (!current()) return; done.current = true;
      await workspaceStorage.mutate(owner, () => workspaceStorage.remove(owner, storageKey));
      if (!current()) return;
      if (submit) router.replace({ pathname: '/espacio-recurso', params: { type: 'academic', id: result.id } });
      else if (resourceId === result.id) { setDraft(academicDraftFromResource(result)); setStatus(result.status); done.current = false; setNotice('Borrador guardado. El catálogo publicado sigue igual hasta que Franky revise y apruebe la propuesta.'); }
      else router.replace({ pathname: '/espacio-academico', params: { id: result.id } });
    } catch (err) { if (current()) setError(academicError(err)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };

  if (!ready) return <Screen title="Preparando la propuesta" back><ActivityIndicator color={C.blue} /></Screen>;
  if (loadFailed) return <Screen title="No se pudo cargar la propuesta" back><Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 16 }}>{error}</Text><Btn label="Reintentar" onPress={() => setRetry(value => value + 1)} /><View style={{ marginTop: 12 }}><Btn label="Cargar sin el borrador local" variant="secondary" onPress={() => Alert.alert('Cargar la versión guardada', 'Se descartarán los cambios locales que no hayas guardado en Franky.', [{ text: 'Volver', style: 'cancel' }, { text: 'Cargar', onPress: () => { setIgnoreLocal(true); setRetry(value => value + 1); } }])} /></View></Screen>;
  const changes = academicChanges(draft); const fields = ACADEMIC_FIELDS[draft.targetType];
  return <Screen title={preview ? 'Revisar propuesta' : resourceId ? 'Propuesta académica' : 'Actualizar información'} subtitle={active!.name} back>
    <Card style={{ gap: 8, marginBottom: 20 }}><Text style={F.h3}>Información fiable para futuros estudiantes</Text><Text style={F.small}>Propón cambios respaldados por una fuente oficial. Franky los revisará antes de modificar el catálogo.</Text>{!editable ? <Pill label={status === 'pending_review' ? 'En revisión' : ['approved', 'published'].includes(status) ? 'Aprobada' : 'Propuesta cerrada'} /> : null}{reviewReason ? <Text style={F.small}>{reviewReason}</Text> : null}</Card>
    {notice ? <Text accessibilityRole="alert" style={[F.small, { color: C.blue, marginBottom: 16 }]}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 16 }}>{error}</Text> : null}
    {!preview && editable ? <>
      <Text style={[F.h3, { marginBottom: 10 }]}>1. Elige la ficha que quieres actualizar</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}><Chip label="Universidad" active={draft.targetType === 'university'} onPress={() => changeType('university')} /><Chip label="Titulación" active={draft.targetType === 'career'} onPress={() => changeType('career')} /></View>
      {draft.target ? <Card style={{ gap: 10, marginBottom: 14 }}><Text style={F.h3}>{draft.target.title}</Text>{draft.target.current_updated_at ? <Text style={F.small}>Última actualización de referencia: {new Date(draft.target.current_updated_at).toLocaleDateString('es-ES')}</Text> : null}<Btn label={searching ? 'Ocultar buscador' : 'Cambiar ficha'} variant="secondary" disabled={busy} onPress={() => setSearching(value => !value)} /></Card> : null}
      {searching ? <View style={{ gap: 10, marginBottom: 20 }}><Text style={F.small}>Solo aparecen las universidades y titulaciones del ámbito autorizado de tu espacio.</Text><TextInput value={query} onChangeText={setQuery} editable={!busy} accessibilityLabel="Buscar ficha académica" placeholder="Busca por el nombre de la ficha" placeholderTextColor={C.muted} maxLength={160} returnKeyType="search" onSubmitEditing={() => { if (query.trim() === appliedQuery) void loadTargets(); else setAppliedQuery(query.trim()); }} style={inputStyle()} /><Btn label="Buscar" variant="secondary" disabled={busy || loadingTargets} onPress={() => { if (query.trim() === appliedQuery) void loadTargets(); else setAppliedQuery(query.trim()); }} />{targetError ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{targetError}</Text> : null}{targets.map(target => <Card key={target.id} onPress={() => chooseTarget(target)}><Text style={F.h3}>{target.title}</Text>{typeof target.data.campus === 'string' ? <Text style={F.small}>{target.data.campus}</Text> : null}</Card>)}{loadingTargets ? <ActivityIndicator color={C.blue} /> : !targets.length && !targetError ? <Text style={F.small}>No hay fichas para esa búsqueda dentro de tu ámbito.</Text> : null}{targetCursor ? <Btn label="Ver más fichas" variant="secondary" disabled={loadingTargets || busy} onPress={() => void loadTargets(targetCursor)} /> : null}</View> : null}
      {errors.target ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 14 }}>{errors.target}</Text> : null}
      {draft.target ? <><Text style={[F.h3, { marginBottom: 10 }]}>2. Selecciona los campos que cambian</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>{fields.map(field => <Chip key={field.key} label={field.label} active={draft.selected.includes(field.key)} onPress={() => toggleField(field.key)} />)}</View>{errors.selected ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 14 }}>{errors.selected}</Text> : null}{fields.filter(field => draft.selected.includes(field.key)).map(field => <View key={field.key} style={{ gap: 7, marginBottom: 18 }}><Text style={F.h3}>{field.label}</Text><Text style={F.small}>Valor de referencia: {formatValue(draft.target?.data[field.key])}</Text><TextInput accessibilityLabel={field.label} value={draft.values[field.key] ?? ''} onChangeText={value => { setDraft(previous => ({ ...previous, values: { ...previous.values, [field.key]: value } })); setErrors(previous => ({ ...previous, [field.key]: '' })); }} editable={!busy} multiline={field.multiline} textAlignVertical={field.multiline ? 'top' : 'center'} maxLength={field.maxLength} keyboardType={field.kind === 'number' ? field.integer ? 'number-pad' : 'decimal-pad' : field.kind === 'url' ? 'url' : field.kind === 'email' ? 'email-address' : field.kind === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={['url', 'email'].includes(field.kind ?? '') ? 'none' : 'sentences'} style={inputStyle(!!errors[field.key], field.multiline)} />{!draft.values[field.key]?.trim() && !field.required ? <Text style={F.small}>Se propondrá eliminar este dato.</Text> : null}{errors[field.key] ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{errors[field.key]}</Text> : null}</View>)}</> : null}
      <Text style={[F.h3, { marginBottom: 14 }]}>3. Aporta la fuente y el contexto</Text>
      {([{ key: 'sourceUrl', label: 'Fuente oficial (HTTPS)', placeholder: 'https://universidad.es/informacion', max: 2000 }, { key: 'academicYear', label: 'Curso académico', placeholder: '2026-2027', max: 9 }, { key: 'reason', label: 'Explicación del cambio', placeholder: 'Explica qué dato cambia y cómo lo respalda la fuente.', max: 2000 }] as const).map(field => <View key={field.key} style={{ gap: 7, marginBottom: 18 }}><Text style={F.h3}>{field.label}</Text><TextInput accessibilityLabel={field.label} placeholder={field.placeholder} placeholderTextColor={C.muted} value={draft[field.key]} onChangeText={value => { setDraft(previous => ({ ...previous, [field.key]: value })); setErrors(previous => ({ ...previous, [field.key]: '' })); }} maxLength={field.max} editable={!busy} multiline={field.key === 'reason'} textAlignVertical={field.key === 'reason' ? 'top' : 'center'} keyboardType={field.key === 'sourceUrl' ? 'url' : 'default'} autoCapitalize={field.key === 'sourceUrl' ? 'none' : 'sentences'} style={inputStyle(!!errors[field.key], field.key === 'reason')} />{errors[field.key] ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{errors[field.key]}</Text> : null}</View>)}
    </> : <Card style={{ gap: 14, marginBottom: 20 }}><Text style={F.h2}>{draft.target?.title ?? 'Ficha pendiente de elegir'}</Text>{fields.filter(field => Object.hasOwn(changes, field.key)).map(field => <View key={field.key} style={{ gap: 4 }}><Text style={F.h3}>{field.label}</Text><Text style={F.small}>Referencia: {formatValue(draft.target?.data[field.key])}</Text><Text style={F.body}>Propuesta: {changes[field.key] === null ? 'Eliminar este dato' : String(changes[field.key])}</Text></View>)}<Text style={F.small}>Curso: {draft.academicYear || 'Pendiente'}</Text><Text style={F.small}>Fuente: {draft.sourceUrl || 'Pendiente'}</Text><Text style={F.body}>{draft.reason || 'Explicación pendiente'}</Text><Text style={F.small}>La revisión comparará los cambios con el catálogo vigente antes de aplicarlos.</Text></Card>}
    {editable ? <View style={{ gap: 12 }}><Btn label={preview ? 'Volver a editar' : 'Revisar los cambios'} variant="ghost" disabled={busy} onPress={() => setPreview(value => !value)} /><Btn label="Guardar borrador" variant="secondary" busy={busy} onPress={() => void save(false)} /><Btn label="Enviar a revisión" busy={busy} onPress={() => void save(true)} /></View> : <Btn label="Volver a Información" variant="secondary" onPress={() => router.replace('/(workspace)/recursos')} />}
  </Screen>;
}
function formatValue(value: unknown): string { return value == null || value === '' ? 'Sin dato' : String(value); }
function inputStyle(invalid = false, multiline = false) { return { borderWidth: 1, borderColor: invalid ? C.red : C.border, borderRadius: 14, padding: 14, minHeight: multiline ? 120 : 48, color: C.text, backgroundColor: C.surface }; }
function academicError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/academic_target|target_not_found/.test(message)) return 'La ficha ya no está disponible dentro del ámbito autorizado de tu universidad.';
  if (/academic_source|academic_year|academic_reason/.test(message)) return 'Comprueba la fuente oficial, el curso y la explicación de la propuesta.';
  if (/academic_proposal_locked|academic_proposal_submitted/.test(message)) return 'Esta propuesta ya está en revisión. Consulta su estado antes de modificarla.';
  if (/invalid_local_draft/.test(message)) return 'No se pudo recuperar el borrador de este dispositivo. Puedes cargar la versión guardada en Franky.';
  return errorForWorkspace(error);
}
