import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, Eye, Save, X } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Card, Chip, Tap } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { WorkspaceEventAudience } from '@/components/WorkspaceEventAudience';
import { captureSessionIdentity } from '@/lib/session';
import { WEB_URL } from '@/lib/supabase';
import { errorForWorkspace, hasWorkspacePermission, RESOURCE_LABELS, uploadWorkspaceImage, workspaceImageUrls, workspaceStorage, type WorkspaceResource } from '@/lib/workspaces';
import { isEditableWorkspaceType, workspaceFormFields, validateWorkspaceDraft, workspaceDraftPayload, type EditableWorkspaceType, type WorkspaceDraft, type WorkspaceField } from '@/lib/workspace-form';
import { WorkspaceVenueHours } from '@/components/WorkspaceVenueHours';
import { VENUE_CATEGORIES, type VenueHours } from '../../shared/venue-hours';
import { C, F } from '@/theme';

export default function EditorScreen() {
  const { active, ready, revision } = useWorkspace(); const params = useLocalSearchParams<{ type?: string; id?: string }>();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  const type = params.type ?? '';
  if (type === 'academic') return <Redirect href={{ pathname: '/espacio-academico', params: params.id ? { id: params.id } : {} }} />;
  if (!isEditableWorkspaceType(type) || !hasWorkspacePermission(active, 'content.manage')) return <Screen title="Editar contenido" back><Text style={F.small}>No tienes acceso para editar este contenido.</Text></Screen>;
  return <WorkspaceEditor key={`${active.id}:${revision}:${type}:${params.id ?? 'new'}`} type={type} resourceId={params.id} />;
}

function WorkspaceEditor({ type, resourceId }: { type: EditableWorkspaceType; resourceId?: string }) {
  const { active, run, isCurrent, signal } = useWorkspace(); const router = useRouter();
  const organizationId = active!.id;
  const formFields = workspaceFormFields(type, active?.kind);
  const owner = useRef(captureSessionIdentity()).current;
  const storageKey = `franky.workspace.draft.v1:${organizationId}:${type}:${resourceId ?? 'new'}`;
  const [draft, setDraft] = useState<WorkspaceDraft>({ values: { city: active?.city ?? '', price_euros: '0', visibility: 'public', join_policy: 'open' }, images: [], clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`, resourceId });
  const [ready, setReady] = useState(false); const [preview, setPreview] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false); const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({}); const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [conflict, setConflict] = useState<WorkspaceResource | null>(null);
  const alive = useRef(true);
  const current = () => alive.current && isCurrent(organizationId) && !signal.aborted;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    setReady(false); setLoadFailed(false); setError(null);
    void (async () => {
      try {
        const stored = await workspaceStorage.get(owner, storageKey);
        if (!current()) return;
        if (stored) {
          const restored = JSON.parse(stored) as WorkspaceDraft;
          if (restored.values && Array.isArray(restored.images) && restored.clientRequestId) { setDraft(restored); setNotice('Hemos recuperado tu borrador.'); return; }
        }
        if (resourceId) {
          const resource = await run<WorkspaceResource>('get_workspace_resource', { p_resource_type: type, p_resource_id: resourceId });
          if (!current()) return;
          const values: Record<string, string> = {};
          for (const [key, value] of Object.entries(resource.data ?? {})) if (typeof value === 'string' || typeof value === 'number') values[key] = String(value);
          values.title = resource.title;
          if (type === 'post' && active?.kind !== 'university') values.city ??= active?.city ?? '';
          if (type === 'event') values.price_euros = String(Number(resource.data.price_cents ?? 0) / 100);
          setDraft(previous => ({ ...previous, weeklyHours: Array.isArray(resource.data.weekly_hours) ? resource.data.weekly_hours as VenueHours[] : undefined }));
          setDraft(previous => ({ ...previous, values, images: Array.isArray(resource.data.images) ? resource.data.images.filter((value): value is string => typeof value === 'string') : [], legacyImages: Array.isArray(resource.data.legacy_images) ? resource.data.legacy_images.filter((value): value is string => typeof value === 'string') : [], resourceId, expectedSourceRevision: resource.source_changed_since_draft ? resource.draft_source_revision ?? 0 : resource.source_revision }));
          if (resource.source_changed_since_draft) setConflict(resource);
        }
      } catch (err) { if (current()) { setLoadFailed(true); setError(errorForWorkspace(err)); } }
      finally { if (current()) setReady(true); }
    })();
  }, [loadAttempt]);
  useEffect(() => {
    if (!ready || loadFailed) return;
    const timeout = setTimeout(() => { if (current()) void workspaceStorage.set(owner, storageKey, JSON.stringify(draft)).catch(() => { if (current()) setNotice('No se pudo guardar en este dispositivo. Guarda el borrador antes de salir.'); }); }, 450);
    return () => clearTimeout(timeout);
  }, [draft, ready, loadFailed]);
  useEffect(() => {
    let cancelled = false;
    void workspaceImageUrls(draft.images, owner, signal).then(urls => { if (!cancelled && current()) setImageUrls(urls); }).catch(() => {});
    return () => { cancelled = true; };
  }, [draft.images]);

  const change = (key: string, value: string) => { setDraft(previous => ({ ...previous, values: { ...previous.values, [key]: value } })); setErrors(previous => ({ ...previous, [key]: '' })); };
  const photo = async () => {
    if (lock.current || draft.images.length >= 12) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!current()) return;
      if (!permission.granted) { setError('Permite el acceso a tus fotos para añadir imágenes.'); return; }
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.min(4, 12 - draft.images.length), quality: 0.85 });
      if (!current() || selection.canceled) return;
      for (const asset of selection.assets.slice(0, 12 - draft.images.length)) {
        const path = await uploadWorkspaceImage(organizationId, asset, owner, signal);
        if (!current()) return;
        setDraft(previous => ({ ...previous, images: [...previous.images, path] }));
      }
    } catch (err) { if (current()) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  const save = async (publish: boolean) => {
    if (lock.current || !current() || conflict) return;
    const validation = validateWorkspaceDraft(type, draft, publish, active?.kind); setErrors(validation);
    if (Object.keys(validation).length) { setPreview(false); setError('Revisa los campos marcados.'); return; }
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      // Persist the idempotency key before sending: a lost response is safe to retry.
      await workspaceStorage.set(owner, storageKey, JSON.stringify(draft));
      if (!current()) return;
      const result = await run<WorkspaceResource>('save_workspace_resource', { p_resource_type: type, p_resource_id: draft.resourceId ?? null, p_data: workspaceDraftPayload(type, draft, active?.kind), p_publish: publish });
      if (!current()) return;
      setDraft(previous => ({ ...previous, resourceId: result.id, expectedSourceRevision: result.source_revision }));
      await workspaceStorage.remove(owner, storageKey);
      if (!current()) return;
      if (publish) router.replace({ pathname: '/espacio-recurso', params: { type, id: result.id } });
      else setNotice('Cambios guardados. Publica para actualizar la ficha.');
    } catch (err) {
      if (current()) {
        setError(errorForWorkspace(err));
        if (draft.resourceId && /workspace_source_changed/.test(String((err as { message?: unknown })?.message))) {
          try { const latest = await run<WorkspaceResource>('get_workspace_resource', { p_resource_type: type, p_resource_id: draft.resourceId }); if (current()) setConflict(latest); }
          catch { /* Keep the local draft intact; a later retry can fetch again. */ }
        }
      }
    }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  if (!ready) return <Screen title="Preparando tu borrador" back><ActivityIndicator color={C.blue} /></Screen>;
  if (loadFailed) return <Screen title="No pudimos cargar el borrador" back><Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 16 }}>{error}</Text><Btn label="Reintentar" onPress={() => setLoadAttempt(value => value + 1)} /></Screen>;
  return <Screen title={preview ? 'Vista previa' : resourceId ? 'Editar contenido' : 'Nuevo contenido'} subtitle={RESOURCE_LABELS[type]} back>
    {notice ? <Text accessibilityRole="alert" style={{ color: C.blue, marginBottom: 16 }}>{notice}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginBottom: 16 }}>{error}</Text> : null}
    {conflict ? <Card style={{ gap: 12, marginBottom: 18 }}><Text style={F.h3}>La ficha publicada ha cambiado</Text><Text style={F.small}>Tu borrador se conserva. Comprueba la versión publicada y elige qué contenido quieres seguir editando.</Text>{Object.entries(conflict.published_data ?? {}).filter(([key, value]) => !['images', 'legacy_images'].includes(key) && value != null && typeof value !== 'object').map(([key, value]) => <Text key={key} style={F.small}>{formFields.find(field => field.key === key)?.label ?? key}: {String(value)}</Text>)}<Btn label="Mantener mi borrador tras revisar" variant="secondary" onPress={() => Alert.alert('Conservar tus cambios', 'Al publicar, tu borrador sustituirá los campos de la ficha que acabas de revisar.', [{ text: 'Volver', style: 'cancel' }, { text: 'Seguir con mi borrador', onPress: () => { setDraft(previous => ({ ...previous, expectedSourceRevision: conflict.source_revision })); setConflict(null); setError(null); } }])} /><Btn label="Cargar la ficha publicada" variant="ghost" onPress={() => Alert.alert('Cargar la ficha publicada', 'Sustituirá los campos y fotos de este borrador local. La ficha pública no cambiará.', [{ text: 'Volver', style: 'cancel' }, { text: 'Cargar ficha', onPress: () => {
      const data = conflict.published_data ?? {}; const values: Record<string, string> = {};
      for (const [key, value] of Object.entries(data)) if (typeof value === 'string' || typeof value === 'number') values[key] = String(value);
      if (type === 'event') values.price_euros = String(Number(data.price_cents ?? 0) / 100);
      setDraft(previous => ({ ...previous, weeklyHours: Array.isArray(data.weekly_hours) ? data.weekly_hours as VenueHours[] : undefined }));
      setDraft(previous => ({ ...previous, values, images: Array.isArray(data.images) ? data.images as string[] : [], legacyImages: Array.isArray(data.legacy_images) ? data.legacy_images as string[] : [], expectedSourceRevision: conflict.source_revision })); setConflict(null); setError(null);
    } }])} /></Card> : null}
    {preview ? <Card style={{ gap: 12, marginBottom: 18 }}><Text style={F.h1}>{draft.values.title || 'Sin título'}</Text><Text style={F.body}>{draft.values.body || draft.values.description}</Text>{formFields.filter(field => !['title', 'body', 'description'].includes(field.key)).map(field => draft.values[field.key] ? <Text key={field.key} style={F.small}>{field.label}: {field.date ? new Date(draft.values[field.key]).toLocaleString('es-ES', field.dateOnly ? { dateStyle: 'long' } : undefined) : draft.values[field.key]}</Text> : null)}{type === 'academic' ? <Text style={F.small}>Esta propuesta será revisada antes de modificar el catálogo académico.</Text> : null}</Card> : <>
      {formFields.map(field => <View key={field.key} style={{ marginBottom: 18 }}><Text style={[F.h3, { fontSize: 15, marginBottom: 8 }]}>{field.label}{field.required ? ' *' : ''}</Text>{field.date ? <DateField field={field} value={draft.values[field.key]} onChange={value => change(field.key, value)} /> : <TextInput accessibilityLabel={field.label} value={draft.values[field.key] ?? ''} onChangeText={value => change(field.key, value)} placeholder={field.label} placeholderTextColor={C.muted} editable={!busy} multiline={field.multiline} textAlignVertical={field.multiline ? 'top' : 'center'} keyboardType={field.numeric ? 'decimal-pad' : field.key === 'source_url' ? 'url' : 'default'} autoCapitalize={field.key === 'source_url' ? 'none' : 'sentences'} maxLength={field.maxLength ?? 30} style={{ minHeight: field.multiline ? 128 : 48, borderWidth: 1, borderColor: errors[field.key] ? C.red : C.border, backgroundColor: C.surface, borderRadius: 14, color: C.text, padding: 14 }} />}{errors[field.key] ? <Text accessibilityRole="alert" style={{ color: C.errorText, marginTop: 5 }}>{errors[field.key]}</Text> : null}</View>)}
      {type === 'event' ? <WorkspaceEventAudience values={draft.values} errors={errors} disabled={busy} onChange={change} /> : null}
      {type === 'community' ? <Card style={{ gap: 12, marginBottom: 18 }}><Text style={F.h3}>Visibilidad</Text><View style={{ flexDirection: 'row', gap: 8 }}><Chip label="Pública" active={draft.values.visibility !== 'private'} onPress={() => change('visibility', 'public')} /><Chip label="Privada" active={draft.values.visibility === 'private'} onPress={() => change('visibility', 'private')} /></View><Text style={F.h3}>Cómo se une la gente</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['open', 'Libre'], ['request', 'Por solicitud'], ['invite', 'Por invitación']].map(([key, label]) => <Chip key={key} label={label} active={draft.values.join_policy === key} onPress={() => change('join_policy', key)} />)}</View></Card> : null}
      {type === 'post' && active?.kind !== 'university' ? <Card style={{ gap: 12, marginBottom: 18 }}><Text style={F.h3}>Público de la publicación</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Chip label="Todos los públicos" active={draft.values.minimum_age !== '18'} onPress={() => { if (!busy) change('minimum_age', '0'); }} /><Chip label="Mayores de 18 años" active={draft.values.minimum_age === '18'} onPress={() => { if (!busy) change('minimum_age', '18'); }} /></View>{errors.minimum_age ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{errors.minimum_age}</Text> : null}<Text style={F.small}>Al publicar, Franky revisa el contenido antes de mostrarlo en la ciudad.</Text></Card> : null}
    </>}
    {type === 'venue' ? <Card style={{ gap: 12, marginBottom: 18 }}><Text style={F.h3}>Tipo de local</Text>{preview ? <Text style={F.body}>{VENUE_CATEGORIES.find(([key]) => key === (draft.values.category || 'bar'))?.[1] ?? 'Elige una categoría'}</Text> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{VENUE_CATEGORIES.map(([key, label]) => <Chip key={key} label={label} active={(draft.values.category || 'bar') === key} onPress={() => { if (!busy) change('category', key); }} />)}</View>}{errors.category ? <Text style={{ color: C.errorText }}>{errors.category}</Text> : null}</Card> : null}
    {type === 'venue' ? <WorkspaceVenueHours value={draft.weeklyHours} preview={preview} disabled={busy} error={errors.weekly_hours} onChange={weeklyHours => { setDraft(previous => ({ ...previous, weeklyHours })); setErrors(previous => ({ ...previous, weekly_hours: '' })); }} /> : null}
    {type !== 'academic' && type !== 'post' ? <View style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Fotos · {draft.images.length}/12</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{draft.images.map((path, index) => <View key={path}><Image source={{ uri: imageUrls[index] }} accessibilityLabel={`Foto ${index + 1}`} style={{ width: 150, height: 125, borderRadius: 14, backgroundColor: C.input }} contentFit="cover" />{!preview ? <Tap accessibilityLabel={`Quitar foto ${index + 1}`} onPress={() => setDraft(previous => ({ ...previous, images: previous.images.filter(value => value !== path) }))} style={{ position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text} /></Tap> : null}</View>)}</ScrollView>{!preview ? <Btn label="Añadir fotos" variant="secondary" icon={Camera} busy={busy} disabled={draft.images.length >= 12} onPress={() => void photo()} /> : null}</View> : null}
    {type !== 'post' && draft.legacyImages?.length ? <View style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Fotos de la ficha actual</Text><ScrollView horizontal contentContainerStyle={{ gap: 10 }}>{draft.legacyImages.map((url, index) => <View key={`${url}:${index}`}><Image source={{ uri: new URL(url, WEB_URL).href }} accessibilityLabel={`Foto existente ${index + 1}`} style={{ width: 150, height: 125, borderRadius: 14 }} contentFit="cover" />{!preview ? <Tap accessibilityLabel={`Quitar foto existente ${index + 1}`} onPress={() => setDraft(previous => ({ ...previous, legacyImages: previous.legacyImages?.filter((_, i) => i !== index) }))} style={{ position: 'absolute', top: 6, right: 6, backgroundColor: C.surface, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}><X color={C.text} size={18} /></Tap> : null}</View>)}</ScrollView></View> : null}
    <View style={{ gap: 12 }}><Btn label={preview ? 'Volver a editar' : 'Vista previa'} icon={Eye} variant="ghost" disabled={busy} onPress={() => setPreview(value => !value)} /><Btn label="Guardar borrador" icon={Save} variant="secondary" busy={busy} onPress={() => void save(false)} /><Btn label={type === 'academic' ? 'Enviar propuesta a revisión' : 'Publicar'} busy={busy} onPress={() => void save(true)} /><Text style={[F.small, { marginTop: 4 }]}>Solo las personas con permiso de edición de este espacio pueden modificar este contenido.</Text></View>
  </Screen>;
}

function DateField({ field, value, onChange }: { field: WorkspaceField; value?: string; onChange(value: string): void }) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const date = value && Number.isFinite(Date.parse(value)) ? new Date(value) : new Date(Date.now() + 86_400_000);
  if (Platform.OS === 'web') return <TextInput accessibilityLabel={field.label} value={value ?? ''} onChangeText={onChange} placeholder="2026-10-15T18:00:00+02:00" style={{ padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 14, color: C.text }} />;
  return <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Btn label={value ? date.toLocaleDateString('es-ES') : 'Elegir fecha'} variant="secondary" small onPress={() => setMode('date')} />{!field.dateOnly ? <Btn label={value ? date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Elegir hora'} variant="secondary" small onPress={() => setMode('time')} /> : null}</View>{mode ? <><DateTimePicker value={date} mode={mode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, selected) => { if (Platform.OS !== 'ios') setMode(null); if (event.type === 'set' && selected) onChange(field.dateOnly ? `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}` : selected.toISOString()); }} />{Platform.OS === 'ios' ? <Btn label="Listo" variant="secondary" small onPress={() => { if (!value) onChange(field.dateOnly ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : date.toISOString()); setMode(null); }} /> : null}</> : null}</View>;
}
