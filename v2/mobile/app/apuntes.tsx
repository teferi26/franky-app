// ─── Apuntes: comparte y descarga por asignatura, carrera y curso ─────────
// Pensado para ser más directo que Studocu: 2 toques para descargar,
// 1 formulario corto para subir. Tabla notes + bucket 'notes' (migración 107).
//
// Diseño: la lista va virtualizada (variante FlatList de Screen) con la fila
// memoizada, porque el catálogo crece y cada tecleo en el buscador rehace el
// filtrado. Las hojas (previsualización y subida) siguen el patrón del kit:
// overlay del tema, radio R.xl, asa y campos con la etiqueta encima en F.label.
import React, { memo, useCallback, useState } from 'react';
import { View, Text, TextInput, Modal, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { FileText, Star, Plus, X, FileUp, Database, ChevronRight, Download, CheckCircle2 } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { SearchBar, Chip, Pill, Tap, SkeletonList, EmptyState, Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { useServerPages, useDebouncedValue } from '@/lib/useServerPages';
import { timeAgo } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

type Note = {
  id: string; title: string; subject: string; career_name: string | null;
  year: number | null; kind: string; description: string | null;
  file_url: string; file_size_kb: number | null; downloads: number;
  rating_sum: number; rating_count: number; created_at: string;
};

// Metadatos del archivo a partir de la extension de file_url (quitando query).
function fileMeta(url: string): { ext: string; isImage: boolean; isPdf: boolean; label: string } {
  const clean = (url ?? '').split('?')[0].split('#')[0];
  const ext = (clean.includes('.') ? clean.split('.').pop() ?? '' : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext);
  const isPdf = ext === 'pdf';
  return { ext, isImage, isPdf, label: isPdf ? 'PDF' : ext ? ext.toUpperCase() : 'Archivo' };
}

// Tamaño legible: file_size_kb → KB o MB.
function sizeLabel(kb: number | null): string | null {
  if (kb == null || kb <= 0) return null;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

function ratingOf(n: Note): string | null {
  return n.rating_count > 0 ? (n.rating_sum / n.rating_count).toFixed(1) : null;
}

// Fuente única de tipos y cursos: los filtros añaden 'todos' delante;
// el formulario de subida reutiliza las mismas listas sin esa opción.
const KIND_VALUES = ['apuntes', 'resumen', 'ejercicios', 'examen', 'formulario'];
const YEAR_VALUES = ['1', '2', '3', '4', '5', '6'];
const KINDS = ['todos', ...KIND_VALUES];
const YEARS = ['todos', ...YEAR_VALUES];

// Columnas que pinta la lista y la vista previa: nada de select('*').
const NOTE_COLUMNS = 'id, title, subject, career_name, year, kind, description, file_url, file_size_kb, downloads, rating_sum, rating_count, created_at';
const NOTES_PAGE_SIZE = 25;
// Texto seguro para un patrón ILIKE dentro de un filtro .or() de PostgREST.
const likeTerm = (v: string) => v.replace(/[%_,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Fila memoizada: sin memo, cada tecleo del buscador repinta todas las filas
// visibles (con sus miniaturas) y la lista se siente pegajosa.
const NoteRow = memo(function NoteRow({ note, onOpen }: { note: Note; onOpen: (n: Note) => void }) {
  const meta = fileMeta(note.file_url);
  const size = sizeLabel(note.file_size_kb);
  const stars = ratingOf(note);
  return (
    <Tap onPress={() => onOpen(note)} accessibilityLabel={`${note.title}. ${note.subject}. ${note.downloads} descargas`}
      accessibilityHint="Abre la vista previa del apunte">
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 72, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
        {/* Miniatura: la imagen real si es foto, o el icono según el tipo de archivo. */}
        {meta.isImage ? (
          <Image source={{ uri: note.file_url }} recyclingKey={note.id} cachePolicy="memory-disk" transition={120}
            style={{ width: 46, height: 46, borderRadius: R.md, backgroundColor: C.input }} contentFit="cover" />
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={20} color={C.blue} strokeWidth={1.75} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={2}>{note.title}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
            {note.subject}{note.career_name ? ` · ${note.career_name}` : ''}{note.year ? ` · ${note.year}º` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <Pill label={cap(note.kind)} tone="blue" />
            <Pill label={meta.label} />
            {stars ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Star size={13} color={C.accent3} fill={C.accent3} strokeWidth={1.6} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.text }}>{stars}</Text>
              </View>
            ) : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{note.downloads} descargas{size ? ` · ${size}` : ''}</Text>
          </View>
        </View>
        <ChevronRight size={18} color={C.muted} style={{ alignSelf: 'center' }} />
      </View>
    </Tap>
  );
});

export default function Apuntes() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('todos');
  const [year, setYear] = useState('todos');
  const [moduleOff, setModuleOff] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [preview, setPreview] = useState<Note | null>(null);

  // Filtros y búsqueda en el servidor, por páginas: el catálogo crece con
  // cada subida y antes se traían 120 filas enteras para filtrar en el móvil
  // (y lo que quedaba fuera de esas 120 no aparecía nunca en la búsqueda).
  const search = useDebouncedValue(q.trim(), 300);
  const fetchPage = useCallback(async (offset: number, limit: number): Promise<Note[]> => {
    let query = supabase.from('notes').select(NOTE_COLUMNS);
    if (kind !== 'todos') query = query.eq('kind', kind);
    if (year !== 'todos') query = query.eq('year', Number(year));
    const term = likeTerm(search);
    if (term) query = query.or(`title.ilike.%${term}%,subject.ilike.%${term}%,career_name.ilike.%${term}%`);
    const { data, error } = await query
      .order('created_at', { ascending: false }).order('id')
      .range(offset, offset + limit - 1);
    if (error) {
      // 42P01: la tabla aún no existe → módulo pendiente de activar (migración 107).
      // Cualquier otro error (red, RLS) es un fallo de verdad y se enseña como tal.
      if (error.message?.includes('does not exist') || error.code === '42P01') { setModuleOff(true); return []; }
      throw error;
    }
    return (data ?? []) as Note[];
  }, [kind, year, search]);
  const { rows, error, refreshing, loadMore, loadingMore, refresh, reload } =
    useServerPages<Note>(fetchPage, `${kind}|${year}|${search}`, NOTES_PAGE_SIZE);
  const loadErr = !!error && !moduleOff;

  const download = useCallback(async (n: Note) => {
    // Abrimos primero y solo contamos la descarga si el archivo llegó a abrirse:
    // así el contador no se infla cuando la apertura falla.
    try {
      await WebBrowser.openBrowserAsync(n.file_url);
      supabase.rpc('register_note_download', { p_note_id: n.id }).then(() => {});
    } catch {
      toastError('No se pudo abrir', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  }, []);

  const openPreview = useCallback((n: Note) => setPreview(n), []);

  // Filtros y buscador en la cabecera de la lista (no fuera): así todo hace
  // scroll junto y no hay un FlatList dentro de un ScrollView.
  const listHeader = (
    <View>
      <View style={{ paddingTop: S.md }}>
        <SearchBar value={q} onChange={setQ} placeholder="Asignatura, título, carrera…" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 4 }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
        {KINDS.map(k => <Chip key={k} accessibilityRole="tab" label={k === 'todos' ? 'Todo' : cap(k)} active={kind === k} onPress={() => setKind(k)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: S.sm }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
        {YEARS.map(y => <Chip key={y} accessibilityRole="tab" label={y === 'todos' ? 'Todos los cursos' : `${y}º`} active={year === y} onPress={() => setYear(y)} />)}
      </ScrollView>
    </View>
  );

  const empty = moduleOff ? (
    <EmptyState icon={Database} title="Los apuntes llegan muy pronto"
      subtitle="Estamos terminando de prepararlos. Vuelve en unos días y estrena los de tu grado." />
  ) : loadErr ? (
    <EmptyState icon={Database} title="No se pudo cargar"
      subtitle="No pudimos traer los apuntes. Revisa tu conexión e inténtalo de nuevo."
      cta="Reintentar" onCta={() => { void reload(); }} />
  ) : rows === null ? (
    <SkeletonList count={4} height={72} />
  ) : (
    <EmptyState icon={FileText} title="Aún no hay apuntes así"
      subtitle="Sé quien estrene esta asignatura: sube los tuyos y gana reputación."
      cta="Subir mis apuntes" onCta={() => setUpOpen(true)} />
  );

  // Las hojas van FUERA del Screen: la variante de lista no admite children
  // (es FlatList o ScrollView, nunca los dos) y un Modal se pinta por encima
  // igual desde cualquier punto del árbol.
  return (
    <>
      <Screen<Note>
        title="Apuntes" back
        data={rows ?? []}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => (
          <FadeIn index={index}><NoteRow note={item} onOpen={openPreview} /></FadeIn>
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={() => { void refresh(); }} refreshing={refreshing}
        ListFooterComponent={loadingMore ? <SkeletonList count={1} height={72} /> : null}
        right={<Btn small icon={Plus} label="Subir" onPress={() => setUpOpen(true)} accessibilityHint="Abre el formulario para publicar apuntes" />}
      />
      {/* Previsualización antes de descargar: info + preview (imagen/PDF) + abrir. */}
      <PreviewModal note={preview} onClose={() => setPreview(null)} onDownload={download} />
      <UploadModal open={upOpen} onClose={() => setUpOpen(false)} onDone={() => { setUpOpen(false); void refresh(); }} goLogin={() => router.push('/welcome')} />
    </>
  );
}

// Cabecera común de las dos hojas: asa, título y cerrar.
function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8, marginBottom: 2 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.display, { flex: 1, fontSize: 21, letterSpacing: -0.7 }]} numberOfLines={1}>{title}</Text>
        <Tap onPress={onClose} accessibilityLabel="Cerrar" hitSlop={14}
          style={{ width: 32, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
          <X size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
      </View>
    </>
  );
}

// ─── Previsualización de un apunte ────────────────────────────────────────
// Muestra la info (título, asignatura, tipo, tamaño) y, si es imagen, la propia
// imagen con expo-image; si es PDF, el icono grande y el botón para abrirlo. La
// descarga real (contar + abrir) sigue en download() del padre.
function PreviewModal({ note, onClose, onDownload }: {
  note: Note | null; onClose: () => void; onDownload: (n: Note) => void;
}) {
  if (!note) return null;
  const meta = fileMeta(note.file_url);
  const size = sizeLabel(note.file_size_kb);
  const stars = ratingOf(note);
  return (
    <Modal visible={note !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
      <View accessibilityViewIsModal style={{ backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%', paddingBottom: 26 }}>
        <SheetHead title={note.title} onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: 14 }}>
          {meta.isImage ? (
            <Image source={{ uri: note.file_url }} style={{ width: '100%', height: 300, borderRadius: R.lg, backgroundColor: C.input }}
              contentFit="contain" cachePolicy="memory-disk" recyclingKey={note.id} transition={150} />
          ) : (
            <View style={{ width: '100%', height: 180, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <FileText size={38} color={C.blue} strokeWidth={1.5} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.text }]}>
                {meta.isPdf ? 'Documento PDF' : `Archivo ${meta.label}`}
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Se abre en tu navegador para leerlo o guardarlo</Text>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Pill label={cap(note.kind)} tone="blue" />
              <Pill label={meta.label} />
              {size ? <Pill label={size} /> : null}
              {stars ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Star size={13} color={C.accent3} fill={C.accent3} strokeWidth={1.6} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.semibold, color: C.text }}>{stars}</Text>
                </View>
              ) : null}
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
              {note.subject}{note.career_name ? ` · ${note.career_name}` : ''}{note.year ? ` · ${note.year}º` : ''}
            </Text>
            {note.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{note.description}</Text> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{note.downloads} descargas · {timeAgo(note.created_at)}</Text>
          </View>

          <Btn full icon={Download} label={meta.isImage ? 'Abrir imagen' : meta.isPdf ? 'Abrir PDF' : 'Abrir archivo'}
            onPress={() => { onClose(); onDownload(note); }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Subida: formulario corto + PDF ───────────────────────────────────────
function UploadModal({ open, onClose, onDone, goLogin }: {
  open: boolean; onClose: () => void; onDone: () => void; goLogin: () => void;
}) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [careerName, setCareerName] = useState('');
  const [year, setYear] = useState<string>('1');
  const [kind, setKind] = useState('apuntes');
  const [file, setFile] = useState<{ uri: string; name: string; size?: number; mime?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Errores inline debajo del campo: un Alert para decir "falta el título"
  // saca al usuario del formulario y le hace perder el sitio.
  const [errors, setErrors] = useState<{ title?: string; subject?: string; file?: string }>({});

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'], copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      if ((a.size ?? 0) > 25 * 1024 * 1024) { setErrors(e => ({ ...e, file: 'El archivo pasa de 25 MB. Prueba a comprimirlo.' })); return; }
      setFile({ uri: a.uri, name: a.name ?? 'apuntes.pdf', size: a.size ?? undefined, mime: a.mimeType ?? undefined });
      setErrors(e => ({ ...e, file: undefined }));
    }
  };

  const submit = async () => {
    const next: typeof errors = {};
    if (title.trim().length < 3) next.title = 'Ponle un título de al menos 3 letras.';
    if (subject.trim().length < 2) next.subject = 'Dinos de qué asignatura son.';
    if (!file) next.file = 'Elige el PDF o la foto que quieres compartir.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Este sí es un Alert: ofrece dos caminos (seguir aquí o ir a entrar).
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para subir apuntes.', [
        { text: 'Cancelar', style: 'cancel' }, { text: 'Entrar', onPress: goLogin },
      ]);
      return;
    }
    setBusy(true);
    try {
      // Saneamos la extensión con una lista blanca: un nombre raro (por ejemplo
      // con una barra tras el último punto) no debe crear subcarpetas en storage.
      const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
      const rawExt = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : '';
      const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = ALLOWED_EXT.includes(cleanExt) ? cleanExt : 'pdf';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const resp = await fetch(file.uri);
      const blob = await resp.arrayBuffer();
      const { error: upErr } = await supabase.storage.from('notes').upload(path, blob, {
        contentType: file.mime ?? (ext === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('notes').getPublicUrl(path);
      const { error: insErr } = await supabase.from('notes').insert({
        uploader_id: user.id, title: title.trim(), subject: subject.trim(),
        career_name: careerName.trim() || null, year: Number(year), kind,
        file_url: pub.publicUrl, file_size_kb: file.size ? Math.round(file.size / 1024) : null,
      });
      if (insErr) throw insErr;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Apuntes publicados', 'Gracias por aportar. Ya están disponibles para todos.');
      setTitle(''); setSubject(''); setCareerName(''); setFile(null); setErrors({});
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toastError('No se pudo subir', msg.includes('does not exist') || msg.includes('Bucket not found')
        ? 'Los apuntes aún no están activados. Prueba de nuevo en unos días.'
        : 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  // Campo estándar de la app: superficie con hairline y borde rojo si hay error.
  const input = (bad?: boolean) => ({
    backgroundColor: C.surface, borderWidth: bad ? 1 : 0.5, borderColor: bad ? C.error : C.border,
    borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12,
    fontSize: 15, color: C.text,
  } as const);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
      <View accessibilityViewIsModal style={{ backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%', paddingBottom: 26 }}>
        <SheetHead title="Subir apuntes" onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Título</Text>
            <TextInput placeholder="Resúmenes completos de Anatomía I" placeholderTextColor={C.muted}
              value={title} onChangeText={(t) => { setTitle(t); if (errors.title) setErrors(e => ({ ...e, title: undefined })); }}
              style={input(!!errors.title)} maxLength={200} accessibilityLabel="Título de los apuntes"
              maxFontSizeMultiplier={MAX_FONT_SCALE} returnKeyType="next" />
            {errors.title ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.error, marginTop: 5 }]}>{errors.title}</Text> : null}
          </View>

          <View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Asignatura</Text>
            <TextInput placeholder="Anatomía I" placeholderTextColor={C.muted}
              value={subject} onChangeText={(t) => { setSubject(t); if (errors.subject) setErrors(e => ({ ...e, subject: undefined })); }}
              style={input(!!errors.subject)} maxLength={120} accessibilityLabel="Asignatura"
              maxFontSizeMultiplier={MAX_FONT_SCALE} returnKeyType="next" />
            {errors.subject ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.error, marginTop: 5 }]}>{errors.subject}</Text> : null}
          </View>

          <View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Carrera (opcional)</Text>
            <TextInput placeholder="Medicina" placeholderTextColor={C.muted}
              value={careerName} onChangeText={setCareerName} style={input()} maxLength={120}
              accessibilityLabel="Carrera" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Curso</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
              {YEAR_VALUES.map(y => (
                <Chip key={y} label={`${y}º`} active={year === y} onPress={() => setYear(y)} />
              ))}
            </View>
          </View>

          <View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Tipo</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
              {KIND_VALUES.map(k => (
                <Chip key={k} label={cap(k)} active={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
          </View>

          {/* Dropzone: solo el trazo discontinuo, sin relleno tintado. El
              color del borde y del icono cuenta el estado (elegido / error). */}
          <View>
            <Tap onPress={pick} accessibilityLabel={file ? `Archivo elegido: ${file.name}. Tocar para cambiarlo` : 'Elegir un PDF o una foto'}>
              <View style={{
                borderWidth: 1.5, borderStyle: 'dashed', borderColor: file ? C.success : errors.file ? C.error : C.border,
                borderRadius: R.lg, padding: 24, alignItems: 'center', gap: 10,
                backgroundColor: 'transparent',
              }}>
                {file
                  ? <CheckCircle2 size={26} color={C.success} strokeWidth={1.75} />
                  : <FileUp size={26} color={C.blue} strokeWidth={1.75} />}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
                  style={{ fontSize: 14, fontFamily: FONT.semibold, color: file ? C.success : C.text }}>
                  {file ? file.name : 'Elegir PDF o foto'}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                  {file?.size ? `${Math.round(file.size / 1024)} KB · toca para cambiarlo` : 'Máx. 25 MB'}
                </Text>
              </View>
            </Tap>
            {errors.file ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.error, marginTop: 5 }]}>{errors.file}</Text> : null}
          </View>

          <Btn full busy={busy} label="Publicar apuntes" onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}
