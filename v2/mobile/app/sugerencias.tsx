// ─── Sugerir una mejora (feedback in-app) ────────────────────────────────
// Formulario simple: tipo (idea, fallo, otro) + texto libre.
//
// ANTES esto se guardaba SOLO como evento de analítica (analytics_events con
// name='feedback_submitted') mientras le decía al usuario "las leemos todas".
// Nadie las leía: quedaban sepultadas entre miles de eventos de uso, sin
// pantalla que las mostrara y sin avisar a nadie. Ahora van al buzón de la
// plataforma (platform_messages, migración 167), cuyo trigger manda un correo
// al equipo (admin y analistas) en cuanto entra una.
//
// Se sigue mandando el evento de analítica además, que para medir el embudo
// (cuánta gente abre la pantalla y cuánta envía) sirve; lo que no puede ser es
// que sea el ÚNICO sitio donde acaba.
//
// Fail-soft: si algo falla no se borra lo escrito.
import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Lightbulb, Bug, MessageCircleQuestion, Send } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Chip, Btn } from '@/components/ui';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R } from '@/theme';

type Tipo = 'idea' | 'fallo' | 'otro';

const TIPOS: { value: Tipo; label: string; icon: typeof Lightbulb }[] = [
  { value: 'idea', label: 'Una idea', icon: Lightbulb },
  { value: 'fallo', label: 'Un fallo', icon: Bug },
  { value: 'otro', label: 'Otro', icon: MessageCircleQuestion },
];

// Campo estándar de la app: superficie con hairline, R.md y 15 px de texto.
const input = {
  backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
  borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text,
} as const;

export default function Sugerencias() {
  const [tipo, setTipo] = useState<Tipo>('idea');
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toastError('Inicia sesión', 'Necesitas tener sesión iniciada para enviar sugerencias. No hemos borrado lo que escribiste.');
        return;
      }
      const { error } = await supabase.rpc('submit_platform_suggestion', {
        p_kind: tipo === 'fallo' ? 'fallo' : tipo === 'idea' ? 'sugerencia' : 'otro',
        p_body: cuerpo, p_source: 'movil',
      });
      if (error) {
        toastError('No se pudo enviar', 'Inténtalo de nuevo en un momento. No hemos borrado lo que escribiste.');
        return;
      }

      // Analítica aparte, solo para medir el embudo (best-effort).
      await track('feedback_submitted', {
        tipo,
        length: cuerpo.length,
        app_version: Constants.expoConfig?.version ?? null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('¡Gracias!', 'Tu sugerencia está guardada en el buzón del equipo.');
      setTexto('');
      setTipo('idea');
    } catch {
      // track() ya es best-effort y no lanza, pero por si acaso algo más falla
      // (p. ej. al leer la sesión), avisamos sin tirar lo escrito.
      toastError('No se pudo enviar', 'Comprueba tu conexión e inténtalo de nuevo. No hemos borrado lo que escribiste.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen title="Sugerir una mejora" back>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.lg }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
          ¿Se te ocurre algo que mejoraría Franky? ¿Has visto algo que no funciona bien?
          Cuéntanoslo, nos ayuda muchísimo a decidir qué construir después.
        </Text>

        <View style={{ gap: 8 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>¿Qué tipo de sugerencia es?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
            {TIPOS.map((t) => (
              <Chip key={t.value} label={t.label} icon={t.icon} active={tipo === t.value} onPress={() => setTipo(t.value)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Cuéntanos con tus palabras</Text>
          <TextInput
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe aquí tu idea, el fallo que has visto o lo que quieras contarnos…"
            placeholderTextColor={C.muted}
            maxLength={2000}
            multiline
            accessibilityLabel="Tu sugerencia"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[input, { minHeight: 140, textAlignVertical: 'top' }]}
          />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'right' }]}>{texto.length}/2000</Text>
        </View>

        <Btn
          full
          label="Enviar sugerencia"
          busy={sending}
          disabled={!texto.trim() || sending}
          onPress={submit}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 }}>
          <Send size={14} color={C.muted} strokeWidth={2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Tu sugerencia se guarda con tu cuenta, no es anónima.</Text>
        </View>
      </View>
    </Screen>
  );
}
