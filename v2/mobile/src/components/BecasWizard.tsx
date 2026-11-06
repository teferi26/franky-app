// ─── Asistente de elegibilidad de becas (móvil) ──────────────────────────
// Las MISMAS seis preguntas que la web (web/src/components/BecasEligibilityForm
// .tsx). En la app solo había chips de tipo y nivel: nada de renta, nota,
// comunidad, tipo de ayuda ni condiciones especiales, así que el listado no
// filtraba por la situación real de cada estudiante.
//
// Es un Modal dentro de la pantalla de Becas, no una ruta nueva: así se
// reutilizan tal cual el useFetch, los chips, la paginación y las becas
// guardadas, sin tocar la navegación.
//
// OJO: no se usa OptionsSheet, que se cierra tras cada selección (ui.tsx) y
// haría imposible un asistente de varios pasos.
//
// Diseño: paso numerado ("Paso 2 de 6") con la ProgressBar del kit, opciones
// como tarjetas con check y haptic al elegir, y el cambio de paso animado con
// LayoutAnimation para que no "salte".
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TextInput, Switch, KeyboardAvoidingView, Platform, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, Check } from 'lucide-react-native';
import { Btn, Tap } from './ui';
import { FadeIn } from './motion';
import {
  NIVELES, COMUNIDADES, TRAMOS_RENTA, TIPOS_AYUDA, PERFIL_VACIO,
  type PerfilBecas, type NivelValue, type AyudaFiltro,
} from '@/lib/becas';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, R, S, FONT } from '@/theme';
import { MecQuestions } from './MecQuestions';
import { mecInputError, mecReviewRows } from '@/lib/mec-requirements';

const PASOS = [
  { titulo: '¿Qué vas a estudiar?', sub: 'Tu nivel de estudios ahora mismo' },
  { titulo: '¿Dónde vives?', sub: 'Algunas ayudas exigen residir o estudiar en una comunidad concreta' },
  { titulo: 'Renta familiar', sub: 'Tramo de renta anual de tu unidad familiar' },
  { titulo: 'Tu nota media', sub: 'Del último curso, sobre 10. Puedes dejarlo en blanco' },
  { titulo: '¿Qué tipo de ayuda buscas?', sub: 'Hay becas que son dinero y otras que son un contrato' },
  { titulo: 'Información adicional', sub: 'Puede darte acceso a becas específicas' },
  { titulo: 'Revisa tus respuestas', sub: 'Puedes volver atrás antes de consultar los resultados' },
];

// Opción seleccionable: tarjeta con borde de acento y check cuando está activa.
function Option({ label, hint, active, onPress }: { label: string; hint?: string; active: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} haptic accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ checked: active }}
      style={{
        borderWidth: active ? 1.5 : 1, borderColor: active ? C.blue : C.border,
        backgroundColor: active ? C.accentSoft : C.surface, borderRadius: R.lg,
        paddingVertical: 12, paddingHorizontal: 14, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10,
      }}>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15, fontFamily: active ? FONT.semibold : FONT.medium, color: active ? C.blueDeep : C.text }}>{label}</Text>
        {hint ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>{hint}</Text> : null}
      </View>
      {active ? <Check size={18} color={C.blue} strokeWidth={2.6} /> : null}
    </Tap>
  );
}

export function BecasWizard({ visible, inicial, onClose, onDone }: {
  visible: boolean;
  inicial: PerfilBecas;
  onClose: () => void;
  onDone: (p: PerfilBecas) => void;
}) {
  const insets = useSafeAreaInsets();
  const [paso, setPasoRaw] = useState(0);
  const [p, setP] = useState<PerfilBecas>(inicial);
  const [notaTxt, setNotaTxt] = useState(inicial.nota != null ? String(inicial.nota) : '');

  // Cambio de paso animado (el contenido cambia de alto entre preguntas).
  const setPaso = (n: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPasoRaw(n);
  };

  // Al reabrirlo se parte del perfil vigente, no del que hubiera la vez anterior.
  useEffect(() => {
    if (!visible) return;
    setP(inicial);
    setNotaTxt(inicial.nota != null ? String(inicial.nota) : '');
    setPasoRaw(0);
  }, [visible, inicial]);

  const notaValida = notaTxt.trim() === '' || (Number(notaTxt.replace(',', '.')) >= 0 && Number(notaTxt.replace(',', '.')) <= 10);
  const puedeSeguir = paso === 0 ? p.nivel !== 'todos'
    : paso === 1 ? p.comunidad !== null
    : paso === 2 ? !mecInputError(p.mec??{},'economia')
    : paso === 3 ? notaValida && !mecInputError(p.mec??{},'academico')
    : true;

  const siguiente = () => {
    if (paso === 3) {
      const n = Number(notaTxt.replace(',', '.'));
      setP((prev) => ({ ...prev, nota: notaTxt.trim() === '' || Number.isNaN(n) ? null : n }));
    }
    if (paso < PASOS.length - 1) { setPaso(paso + 1); return; }
    const n = Number(notaTxt.replace(',', '.'));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone({ ...p, nota: notaTxt.trim() === '' || Number.isNaN(n) ? null : n });
  };

  const switchRow = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ borderWidth: 1, borderColor: value ? C.blue : C.border, backgroundColor: value ? C.accentSoft : C.surface, borderRadius: R.lg, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{label}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label}
        trackColor={{ false: C.border, true: C.blue }} thumbColor={C.white} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 8, gap: 12 }}>
          <Tap onPress={onClose} accessibilityLabel="Cerrar" hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={C.text} strokeWidth={2.2} />
          </Tap>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { textAlign: 'center' }]}>Buscar mis becas</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>Paso {paso + 1} de {PASOS.length}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Progreso: filete de 2 px en el acento, sin degradado ni relleno. */}
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: PASOS.length, now: paso + 1 }}
          style={{ height: 2, marginHorizontal: S.lg, backgroundColor: C.borderLight, borderRadius: 1, overflow: 'hidden' }}>
          <View style={{ width: `${((paso + 1) / PASOS.length) * 100}%`, height: '100%', backgroundColor: C.blue }} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.lg, gap: 10 }}>
            {/* El key es el paso: al avanzar, el contenido entra de nuevo. */}
            <FadeIn key={paso} style={{ gap: 10 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 24, letterSpacing: -0.6 }]}>{PASOS[paso].titulo}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginBottom: 6 }]}>{PASOS[paso].sub}</Text>

            {paso === 0 && NIVELES.map((n) => (
              <Option key={n.value} label={n.label} active={p.nivel === n.value} onPress={() => setP({ ...p, nivel: n.value as NivelValue })} />
            ))}

            {paso === 1 && COMUNIDADES.map((c) => (
              <Option key={c} label={c} active={p.comunidad === c} onPress={() => setP({ ...p, comunidad: c })} />
            ))}

            {paso === 2 && ['grado','master'].includes(p.nivel) && <MecQuestions part="economia" value={p.mec??{}} level={p.nivel} onChange={mec=>setP({...p,mec})}/>}
            {paso === 2 && !['grado','master'].includes(p.nivel) && <Option label="No lo sé / prefiero no indicarlo" active={p.renta === null} onPress={() => setP({ ...p, renta: null })} />}
            {paso === 2 && !['grado','master'].includes(p.nivel) && TRAMOS_RENTA.map((r) => (
              <Option key={r.value} label={r.label} active={p.renta === r.value} onPress={() => setP({ ...p, renta: r.value })} />
            ))}

            {paso === 3 && (
              <View style={{ gap: 8 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{p.mec?.curso==='primero'?'Nota de acceso (sobre 10)':'Nota media (sobre 10)'}</Text>
                <TextInput
                  value={notaTxt}
                  onChangeText={setNotaTxt}
                  keyboardType="decimal-pad"
                  placeholder="Ej: 7,50"
                  placeholderTextColor={C.muted}
                  accessibilityLabel="Nota media, sobre 10"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={{
                    backgroundColor: C.input, borderWidth: 1, borderColor: notaValida ? C.input : C.error,
                    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 14, fontSize: 22,
                    fontFamily: FONT.heading, color: C.text, textAlign: 'center',
                  }}
                />
                {!notaValida ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.error }]}>La nota va de 0 a 10.</Text> : null}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                  Opcional. La nota de acceso, la media y los créditos aprobados son requisitos distintos según curso. Revisa siempre las bases de la convocatoria.
                </Text>
                {['grado','master'].includes(p.nivel)&&<MecQuestions part="academico" value={p.mec??{}} level={p.nivel} onChange={mec=>setP({...p,mec})}/>}
              </View>
            )}

            {paso === 4 && TIPOS_AYUDA.map((t) => (
              <Option key={t.value} label={t.label} hint={t.hint} active={p.ayuda === t.value} onPress={() => setP({ ...p, ayuda: t.value as AyudaFiltro })} />
            ))}

            {paso === 5 && (
              <View style={{ gap: 10 }}>
                {switchRow('Consultar ayudas por discapacidad reconocida', 'Cada convocatoria fija el grado y la acreditación necesarios', p.discapacidad, (v) => setP({ ...p, discapacidad: v }))}
                {switchRow('Familia numerosa', 'Algunas becas priorizan o reservan plazas', p.familia_numerosa, (v) => setP({ ...p, familia_numerosa: v }))}
              </View>
            )}
            {paso===6&&<View style={{gap:14}}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{resumenPerfil({...p,nota:notaTxt.trim()?Number(notaTxt.replace(',','.')):null})}</Text>{['grado','master'].includes(p.nivel)&&mecReviewRows(p.mec??{},p.nivel).map(([label,value])=><View key={label} style={{gap:4,paddingBottom:9,borderBottomWidth:0.5,borderBottomColor:C.border}}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{value}</Text></View>)}<Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Esta selección orienta tu búsqueda. Revisa las bases, el plazo, patrimonio, residencia y compatibilidades antes de solicitar.</Text></View>}
            </FadeIn>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={{
          flexDirection: 'row', gap: 10, paddingHorizontal: S.lg,
          paddingTop: 10, paddingBottom: insets.bottom + 12,
          borderTopWidth: 0.5, borderTopColor: C.border, backgroundColor: C.bg,
        }}>
          {paso > 0 ? (
            <View style={{ flex: 1 }}>
              <Btn full variant="secondary" label="Anterior" onPress={() => setPaso(paso - 1)} />
            </View>
          ) : null}
          <View style={{ flex: 2 }}>
            <Btn full label={paso === PASOS.length - 1 ? 'Ver mis becas' : 'Siguiente'}
              onPress={siguiente} disabled={!puedeSeguir} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Resumen corto del perfil, para la cabecera del listado. */
export function resumenPerfil(p: PerfilBecas): string {
  const trozos: string[] = [];
  if (p.nivel !== 'todos') trozos.push(NIVELES.find((n) => n.value === p.nivel)?.label ?? p.nivel);
  if (p.comunidad) trozos.push(p.comunidad);
  if (p.renta != null && !['grado','master'].includes(p.nivel)) trozos.push(TRAMOS_RENTA.find(r=>r.value===p.renta)?.label??'Renta por confirmar');
  if (p.nota != null) trozos.push(`nota ${p.nota}`);
  if (p.ayuda !== 'cualquiera') trozos.push(TIPOS_AYUDA.find((t) => t.value === p.ayuda)?.label ?? p.ayuda);
  if (p.discapacidad) trozos.push('discapacidad');
  if (p.familia_numerosa) trozos.push('familia numerosa');
  return trozos.length ? trozos.join(' · ') : 'Sin filtros';
}

export { PERFIL_VACIO };
